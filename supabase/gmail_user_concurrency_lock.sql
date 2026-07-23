-- Caps how many Gmail API writes are ever in flight against the SAME
-- target user's mailbox at once, across BOTH dispatchers (label-sync and
-- email-sync run as separate functions/isolates, so this has to be a
-- shared, DB-backed lock, not an in-process one). Gmail's "Too many
-- concurrent requests for user" (429) is a per-ACCOUNT ceiling — a user
-- who's a member of several active matters can otherwise be the target of
-- multiple simultaneous processor calls (one per job), each individually
-- respecting its own dispatcher's pacing/concurrency but with no
-- cross-job or cross-function awareness of each other.
create table if not exists gmail_user_locks (
  user_id uuid primary key,
  locked_until timestamptz not null default now()
);

-- Atomic acquire: inserts a fresh lock, or claims an existing row only if
-- its previous lock has already expired. Returns true iff the caller now
-- holds the lock. Doesn't require pre-seeding a row per user.
create or replace function acquire_gmail_user_lock(p_user_id uuid, p_ttl_seconds int default 100)
returns boolean
language plpgsql
as $$
declare
  affected int;
begin
  insert into gmail_user_locks (user_id, locked_until)
  values (p_user_id, now() + (p_ttl_seconds || ' seconds')::interval)
  on conflict (user_id) do update
    set locked_until = excluded.locked_until
    where gmail_user_locks.locked_until <= now();
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function release_gmail_user_lock(p_user_id uuid)
returns void
language sql
as $$
  update gmail_user_locks set locked_until = now() where user_id = p_user_id;
$$;
