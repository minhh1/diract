<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes -- APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# No em dashes

Never use the em dash character (Unicode U+2014) anywhere in this codebase -- not in UI copy, not in code comments, not in commit messages. Use a plain hyphen, a colon, a period, or an ASCII double-hyphen ("--") instead, whichever reads best in context.

In anything user-facing (UI copy, AI-generated chat/document/email output, toast/error messages) -- not code comments or commit messages -- also avoid the ASCII double-hyphen ("--") and a spaced hyphen (" - ") as dash-style separators. Use a comma, colon, period, or just restructure the sentence instead.

# Keep the mobile app in sync

`mobile/` (Expo/React Native, see `mobile/README.md`) mirrors a subset of this app against the same Supabase project: auth (`app/login/page.tsx`'s RPCs and `company_memberships`/`registration_tokens` writes), Matters/Leads/Contacts/Tasks/Properties CRUD via `get_schema_metadata` and the custom-fields tables, and the AI assistant chat -- all through the same Next.js API routes, reached over Bearer-token auth (`lib/supabaseServer.ts` accepts `Authorization: Bearer <token>` alongside the web app's cookie session).

Whenever you touch something mobile depends on in the same change -- an API route mobile calls, a Supabase table/RPC/schema mobile reads or writes, auth or session logic, or a feature listed under "What's built" in `mobile/README.md` -- update the mobile counterpart too, don't leave it for a follow-up. Check `mobile/README.md`'s "What's built" vs "What's not built yet" lists to see whether a given feature has a native mobile counterpart at all before skipping it (e.g. the dashboard-widget builder is explicitly web-only; mobile just deep-links to it, so no action is needed there).
