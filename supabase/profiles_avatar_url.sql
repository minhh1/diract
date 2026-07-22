-- Self-service user profile: avatar photo support.
--
-- STORAGE BUCKET (manual setup required):
--   Before avatar upload works you must create a PUBLIC Storage bucket named
--   `avatars` in the Supabase dashboard (Storage -> New bucket -> name
--   `avatars`, "Public bucket" CHECKED). Avatars are low-sensitivity images
--   served directly as <img src> across the app (sidebar, admin member
--   lists, etc.), so unlike `pdf-documents` this bucket is public by design.
--   All writes still go through the service-role client in
--   app/api/profile/avatar/route.ts (never a direct client upload), which
--   validates file type/size before storing.
--
-- Files live at: {userId}/{uuid}.{ext} — old files for a user are removed
-- when a new avatar is uploaded or the avatar is cleared.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
