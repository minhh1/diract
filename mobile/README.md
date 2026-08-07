# Diract Mobile

Expo (React Native) app for iOS and Android, talking to the same Supabase
project as the web app at `../`. Built with Expo Router, TypeScript, and
React Query.

## Setup

```bash
cd mobile
npm install
cp .env.example .env.local   # fill in EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
npx expo start                # scan the QR code with Expo Go, or press i/a
```

You'll need Xcode (for iOS Simulator) or Android Studio (for an Android
emulator) installed locally to run `npm run ios` / `npm run android` --
neither was available in the environment this was built in. What *was*
verified here: `tsc --noEmit` (clean) and a `npx expo start --web` smoke
test against a placeholder Supabase project (auth screens render pixel-for-
pixel per the design, mode toggling and client-side validation work,
network failures fail gracefully instead of crashing). Native-only
behavior -- push registration, the Google OAuth browser round-trip, the
native date picker -- is still unverified; run it on a real device before
shipping.

To register the Google OAuth redirect and (once you're ready) push
notifications, you'll also need to:

1. Add `diract://` (or run `npx uri-scheme list` to see the exact scheme
   Expo registers) to Supabase Auth's allowed redirect URLs.
2. Run `eas init` (needs an Expo account) to set `extra.eas.projectId` --
   push notifications no-op with a clear error until this exists.

## What's built

- **Auth** (`src/app/sign-in.tsx`) -- email/password, Google OAuth, invite
  codes (paste a token or open a `diract://join?token=...` link),
  forgot-password handoff to the web app. Mirrors `app/login/page.tsx`'s
  logic exactly (same RPCs, same `company_memberships`/`registration_tokens`
  writes) so an account created on one platform behaves identically on the
  other.
- **Core CRM** -- Matters (`projects`), Leads & Contacts (`entities`),
  Tasks (`tasks`), and Properties (under More) as list + detail screens,
  reading/writing the same `get_schema_metadata` RPC and
  `company_custom_fields`/`company_custom_field_values` tables the web
  dashboard uses (`src/lib/records.ts`, `src/lib/recordsWrite.ts`).
  Relation fields open a search-and-select sheet
  (`src/components/records/RelationPickerSheet.tsx`); date fields use the
  native date picker.
- **Push notifications** -- `device_push_tokens` table
  (`supabase/migrations/20260727030000_device_push_tokens.sql`),
  registration from the More tab, and
  `supabase/functions/notify-task-assigned` sends an Expo push alongside
  its existing email.
- **Bearer-token auth on the Next.js API** -- `../lib/supabaseServer.ts`
  now accepts `Authorization: Bearer <access_token>` as well as the web
  app's cookie session, so every route built on `createSupabaseServerClient()`
  / `authorizeCompanyMember()` (~40 routes) already works from mobile
  (`src/lib/api.ts` is the client-side helper that attaches the header).
- **AI assistant** (More -> AI assistant, `src/app/(app)/more/ai/`) -- a
  native port of `components/ai/AiChatThread.tsx`'s table/dashboard-builder
  chat, calling the same admin-only, job-based `app/api/ai/chat/route.ts`.
  `src/components/ai/AiChatThread.tsx` subscribes to the `ai_chat_jobs` row
  directly via Supabase Realtime (`supabase.channel(...).on('postgres_changes', ...)`,
  no generic hook needed for just one caller) instead of a held-open stream,
  resumes an in-flight job on reopen the same way the web app does, and
  renders tool-call chips, a collapsible reasoning block, and markdown
  replies (`src/components/ai/SimpleMarkdown.tsx` walks `marked`'s token
  tree directly -- pure JS, no native dependency -- rather than pulling in
  a full markdown-rendering package for the handful of block types
  `app/api/ai/chat/route.ts`'s system prompt ever actually produces).
  `src/app/(app)/more/ai/index.tsx` is the conversation list (pin/rename/
  delete via `app/api/ai/conversations*`); tapping one or starting a new
  chat opens `src/app/(app)/more/ai/[id].tsx`. Confirm-before-building is
  purely conversational on both platforms (the assistant asks in plain
  chat and waits for the next message), so there's no separate confirm UI.
  Non-admins see an "Admin access required" message in place of the chat,
  matching the web page's own gate. This used to be a much simpler screen
  built against the AI route's previous general-Q&A behavior, which the
  web app had already moved on from by the time this was rebuilt -- see
  git history on this file if you need the old version's shape.
- **"Open in browser" fallbacks** (More tab) for the schema builder, PDF
  editor, templates, Outlook/Gmail inboxes, billing, virtual computers,
  marketplace, admin, and settings -- these open the responsive web
  dashboard in an in-app browser rather than a half-native rebuild.

## What's not built yet (backlog)

- **The dashboard-widget renderer** (data grids, summary tiles, charts,
  the trust-accounting widgets, the schema/canvas builder) -- this is a
  large, actively-evolving engine on the web side
  (`../lib/dashboardWidgets/`); porting even a subset natively is its own
  multi-day effort and wasn't attempted here beyond the plain record
  list/detail views above.
- **Outlook/Gmail, SMS, billing, marketplace screens** -- the Bearer-auth
  plumbing (`src/lib/api.ts`) and the Core CRM screens above prove the
  pattern works; these four still just open the web dashboard.
- **App Store / Play Store submission** -- needs your own Apple Developer
  Program and Google Play Console accounts/credentials; `eas.json` is set
  up for `eas submit` once you have them.
