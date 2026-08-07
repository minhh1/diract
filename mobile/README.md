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

## Design system

A vivid, gradient-accented look (dark-mode-first, drawing on Canva's mobile
app) replaced the earlier flat corporate palette -- see
`src/constants/theme.ts` (`Colors`, `Gradients`, `IconBadgeColors`, `Radii`)
and `src/hooks/use-theme.ts` (`useTheme`, `useGradients`,
`useThemedStackScreenOptions` -- the last one is required on every nested
`Stack`'s `screenOptions`, or its header reverts to the system's white
default regardless of app theme). Shared pieces live in `src/components/ui/`:
`GradientButton` (primary CTAs), `GradientText` (hero headings, via
`@react-native-masked-view/masked-view` + `expo-linear-gradient`),
`IconBadge` (colorful circular icon backgrounds for quick-action rows,
cycling through `IconBadgeColors` by index), `HeroBackground` (the soft
gradient wash across a screen's top, fading into the flat theme
background). New screens/components should reach for these instead of a
one-off flat color or square icon. Not yet carried through: dashboards'
own widget cards and the AI chat thread's own message bubbles (its
conversation list and the More screen's new "Ask AI" entry point are
themed) -- still on the old flat style pending a follow-up pass.

Light/dark isn't purely system-driven -- `src/lib/themeMode.tsx`
(`ThemeModeProvider`/`useThemeMode`) adds an explicit Auto/Light/Dark
override, persisted to `@react-native-async-storage/async-storage` and
exposed via the More screen's "Appearance" row (a `GradientButton`-styled
segmented control). `useTheme`/`useGradients` read the *resolved* scheme
from this context, not `useColorScheme()` directly -- anything needing the
current scheme should go through those two hooks, not react-native's own
`useColorScheme`, so it stays consistent with the override.

The More screen also has a top "Ask AI anything..." bar (admin-gated, same
as the AI assistant itself) that starts a new conversation with the typed
text sent immediately -- see `AiChatThread`'s `initialQuery` prop and
`ai/[id].tsx`'s `q` search param, which is how that shortcut gets there.

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
- **Dashboards** (Dashboards tab, `src/app/(app)/dashboards/`) -- a first,
  intentionally partial native port of the web app's dashboard-widget
  engine (`../lib/dashboardWidgets/`), viewing `company_dashboards`
  ("boards") sourced from one of the 3 system tables the builder itself
  allows as a board source (Matters/Properties/Leads & Contacts, not
  Tasks -- see `../lib/hooks/useSystemTableAsCustomTable.ts`). Renders
  `heading`/`text`/`summary_tile`/`grid`/`chart`/`quick_add_form` widgets;
  everything else (the trust-accounting widgets, document export/import,
  filter bars) shows an "open on web" card instead of a blank gap, so a
  dashboard mixing supported and unsupported widgets still mostly works.
  A team-restricted dashboard (`restricted_to_team_id` set) is only listed
  for `company_admin` or that team's leader, mirroring
  `../lib/hooks/useCustomDashboards.ts`'s `isVisibleRestrictedDashboard`
  exactly. `chart` (`src/components/dashboard/DashboardActivityChart.tsx`)
  is a simplified native port of its web counterpart: bar/line/area,
  multi-series with a tap-to-toggle legend, always the last 12 buckets
  regardless of granularity -- it drops the web version's day-granularity
  month pager, hover tooltips (tap a bar/point instead), and the axis-tag
  toggle-group selector for a chart like Billable/Non-billable x
  Hours/Amount (falls back to the flat legend every other multi-series
  chart already uses). `quick_add_form` (`src/components/dashboard/QuickAddFormWidget.tsx`)
  creates a record via `src/lib/recordsWrite.ts`'s `createRecord` (mirrors
  `lib/services/systemTableRecordService.ts`'s own native/custom field
  split); it drops the web version's formula-field live preview,
  drag-to-reorder, and prefill/fixedValues (the last two only matter for a
  record-scoped sub-dashboard, which mobile doesn't have yet). A board
  sourced from a genuine custom table (not a system table) falls back to
  "open on web" entirely, since there's no mobile port yet of
  `../lib/hooks/useCustomTable.ts`'s schema resolution.
  `src/lib/dashboardWidgets/{types,compute,relativeDates}.ts` are verbatim
  copies of their web counterparts (pure logic, zero React/Next.js deps)
  kept byte-for-byte identical for easy re-syncing; `src/lib/companyDashboards.ts`
  adapts `src/lib/records.ts`'s existing field/record fetching into the
  shape that logic expects, reusing rather than re-deriving mobile's own
  schema plumbing. Building/editing a dashboard is still web-only (see
  "Custom tables & boards" above).
- **Shared pages** (More -> Shared pages, `src/app/(app)/more/public/`) --
  native staff-side views of the three "public page" features that are
  actually used in production (see `src/lib/publicTaskPages.ts`,
  `documentFillPages.ts`, `clientUpdatePages.ts` for the full API-shape
  notes; `finance_model_pages`/`residual_land_solver_pages` have zero rows
  in production and aren't ported). Despite the shared "public" naming
  these are three independent, differently-gated features, not one:
  - **Task pages** (`public/tasks/[pageId].tsx`) -- genuinely requires a
    signed-in session server-side (no PIN/anonymous path exists), scoped
    by the page's `scope` (self/team/company/my_and_unassigned); per-
    assignee tabs, tap to toggle a task complete. Editing/creating a task,
    follow-ups, and checklist-template bulk-apply are still web-only.
  - **Document pages** (`public/documents/[pageId].tsx`) -- genuinely
    anonymous/PIN-gated even for a logged-in staff member (matching
    `components/dashboard/DocumentPublicPageWidget.tsx`'s embed on web,
    which hits the exact same code-gated endpoint); renders the template's
    fields (respecting conditional trigger-field visibility and N/A), and
    downloads the generated .docx/.zip via a signed URL opened in the
    system browser.
  - **Client update pages** (`public/updates/[slug].tsx`) -- the staff
    ("by-slug") board, not the anonymous client one: every group/field
    regardless of `client_visible`, not just what a client would see.
    Groups nest one level (parent_group_id), shown as "Parent / Child"
    section headers. Supports viewing field values (respecting the page's
    `date_format` via `src/lib/dateFormat.ts`, a port of
    `components/clientUpdatePages/dateFormat.ts`), the AI summary, adding
    notes, and "ask AI about this matter" (`ai_ask_enabled`). Editing
    values, groups, fields, and format rules is still web-only.

## What's not built yet (backlog)

- **The rest of the dashboard-widget engine** -- the ~10 trust-accounting
  report widgets, document export/import, embedding a shared page as a
  dashboard-canvas widget (the standalone screens themselves are built,
  see "Shared pages" below -- just not the `public_task_page`/
  `public_document_page`/`public_client_update_page` widget types that
  embed one inline on a board), filter bars, and any board sourced from a
  genuine custom table rather than a system table. See the Dashboards
  entry above for exactly what's covered today and
  where the seams are; porting the rest is incremental from
  here, not a rewrite.
- **Outlook/Gmail, SMS, billing, marketplace screens** -- the Bearer-auth
  plumbing (`src/lib/api.ts`) and the Core CRM screens above prove the
  pattern works; these four still just open the web dashboard.
- **App Store / Play Store submission** -- needs your own Apple Developer
  Program and Google Play Console accounts/credentials; `eas.json` is set
  up for `eas submit` once you have them.
