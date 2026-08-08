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

## iPad layout

Above ~700pt window width on iPad specifically (`Platform.isPad` + live
`useWindowDimensions()`, see `src/hooks/use-tablet-layout.ts`'s
`useIsTabletLayout`/`useIsWideTabletLayout` -- gated to iOS+isPad, so
Android tablets and iPhone's own Slide Over/Split View width changes never
trigger it), the app switches from the phone's bottom tab bar + full-screen
detail pushes to:

- A permanent sidebar (`(app)/_layout.tsx` swaps `<Tabs>` for
  `expo-router/drawer`'s `<Drawer drawerType="permanent">`, custom content
  in `src/components/navigation/SidebarContent.tsx`) -- a fixed-width icon
  rail at every width, matching the web app's own rail
  (`components/Sidebar.tsx`) rather than growing into a labeled panel at
  any breakpoint; each icon keeps a small label underneath since a touch
  rail has no hover state to reveal one otherwise. Deliberately not Expo
  Router's own `unstable-split-view` (`UISplitViewController` wrapper) --
  its docs call it alpha/"not ready for production usage yet" as of SDK
  57, iOS-only, can't be nested.
- Master-detail split for Matters/Leads/Properties (the shared
  `RecordListView`/`RecordDetailView` pattern) via
  `src/components/records/MasterDetailLayout.tsx`, selection driven by a
  `?selected=<id>` query param on the same route rather than pushing to
  `[id].tsx` (untouched, still the phone-only code path).
  `RecordListView`'s `selectedId`/`onSelect` props default to `undefined`,
  so phone behavior is provably unchanged. First row auto-selects when
  nothing's picked yet, matching Mail/Notes/Files convention. The list
  pane can be collapsed so the detail pane fills the screen via a handle
  on the divider (shared state with the sidebar rail, see
  `src/lib/masterDetailPanel.tsx` -- tapping the already-active rail item
  toggles it too) -- Tasks is deliberately not in this set, see below.
- A multi-column dashboard grid (`dashboards/[slug].tsx`) restoring the
  web builder's 12-column `layout.w` (discarded on phone, which flattens
  to one column) via a `flexWrap` row -- best-effort left-to-right wrap of
  the sorted widget array, not true `(x,y)` cell placement, so a web
  author's precise multi-row gaps may not be pixel-perfect. Capped at
  `MaxContentWidth` (`src/constants/theme.ts`, previously unused) on very
  wide iPads. Each widget also has its own expand/collapse toggle to fill
  the grid at full width temporarily.

Landscape is unlocked on iPad only (`src/hooks/use-orientation-lock.ts`,
`expo-screen-orientation` -- iPhone stays portrait-locked via the same
hook). `app.json`'s `orientation` is `"default"`, not `"portrait"`, for
this reason -- the runtime lock is what actually constrains iPhone now.

## What's built

- **Auth** (`src/app/sign-in.tsx`) -- email/password, Google OAuth, invite
  codes (paste a token or open a `diract://join?token=...` link),
  forgot-password handoff to the web app. Mirrors `app/login/page.tsx`'s
  logic exactly (same RPCs, same `company_memberships`/`registration_tokens`
  writes) so an account created on one platform behaves identically on the
  other.
- **Core CRM** -- Matters (`projects`), Leads & Contacts (`entities`),
  and Properties (under More) as list + detail screens, reading/writing
  the same `get_schema_metadata` RPC and
  `company_custom_fields`/`company_custom_field_values` tables the web
  dashboard uses (`src/lib/records.ts`, `src/lib/recordsWrite.ts`).
  Relation fields open a search-and-select sheet
  (`src/components/records/RelationPickerSheet.tsx`); date fields use the
  native date picker. The Tasks tab is deliberately not part of this raw
  list + detail pattern -- the underlying `tasks` system table carries a
  lot of columns not meant for direct viewing (raw relation ids, a JSON
  reminder-settings column, etc.), so it instead resolves to the
  company's own `scope: 'company'` `public_task_pages` row and renders it
  through `src/components/tasks/TaskPageContent.tsx` (shared with the
  Shared Pages destination at `more/public/tasks/[pageId].tsx`), with a
  message asking for one to be created on web if none exists yet.
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
- **Kiosk mode** (`src/lib/session.tsx`'s `role`, `src/components/kiosk/`)
  -- a `company_memberships.role = 'kiosk'` session (an admin-created,
  non-human login for a shared device, see `components/KioskAppShell.tsx`
  on web) gets no tab bar/drawer at all: `(app)/_layout.tsx` renders
  `KioskScreen` in place of the normal navigator the moment `role` resolves
  to `'kiosk'`, so there's no route to escape to in the first place (web
  has to redirect away from a typed-in URL; native has no address bar).
  `KioskScreen` mirrors the web kiosk branch of
  `app/(app)/dashboard/calendar/page.tsx`: a Today/Weekly/Monthly toggle
  over `KioskCheckInList` (tap-to-check-in/out via `/api/kiosk/checkins`),
  `KioskRosterWeek`/`KioskRosterMonth` (read-only ports of
  `components/calendar/RosterWeekView.tsx` and the web month grid), and
  `KioskHoursSummary` (`/api/kiosk/checkins/summary`, hours worked per
  staff over the visible range).
- **Dashboards** (Dashboards tab, `src/app/(app)/dashboards/`) -- a native
  port of the web app's dashboard-widget engine (`../lib/dashboardWidgets/`),
  viewing `company_dashboards` ("boards") sourced from one of the 3 system
  tables the builder allows as a board source (Matters/Properties/Leads &
  Contacts, not Tasks -- see `../lib/hooks/useSystemTableAsCustomTable.ts`)
  OR a genuine custom table (`customTableDashboardData.ts`, a read/write
  port of `../lib/hooks/useCustomTable.ts`'s schema resolution -- capped at
  200 records, no `allow_multiple` field support). Every widget type
  renders natively except `finance_model_search`/`residual_land_solver`
  (deliberately not ported -- `finance_model_pages`/`residual_land_solver_pages`
  have zero rows in production, see "Shared pages" below) and, on a
  custom-table board specifically, `quick_add_form`/`my_tasks_button` for a
  ledger table or one with a `sum_related`/`max_related` field (see
  `customTableWrite.ts`'s `isSupportedForWrite` -- those still fall back to
  "open on web"). A team-restricted dashboard (`restricted_to_team_id` set)
  is only listed for `company_admin` or that team's leader, mirroring
  `../lib/hooks/useCustomDashboards.ts`'s `isVisibleRestrictedDashboard`
  exactly.
  - `filter_bar` (`DashboardFilterBar.tsx`) -- date/select/boolean/relation
    pills narrowing whatever grid/summary_tile/chart widgets share the
    dashboard. No drag-reorder, no `$team_scope`/`$current_user`
    auto-narrowing or "set as my default view" (always starts on "All"),
    no "Blank" option, no free-text/number filter control.
  - `chart` (`DashboardActivityChart.tsx`) -- bar/line/area, multi-series
    with a tap-to-toggle legend, always the last 12 buckets regardless of
    granularity. Drops the day-granularity month pager, hover tooltips (tap
    a bar/point instead), and the axis-tag toggle-group selector.
  - `quick_add_form` -- `QuickAddFormWidget.tsx` writes a system-table
    record via `src/lib/recordsWrite.ts`; `CustomTableQuickAddForm.tsx`
    writes a custom-table record via `customTableWrite.ts` (a port of
    `lib/services/customTableService.ts`'s `createRecord` +
    `computeFormulaFields` -- ledger tables, `auto_number_prefix`,
    `is_unique` enforcement, and `sum_related`/`max_related` rollup
    recomputation on the parent aren't ported, see `isSupportedForWrite`).
    Both drop the web version's drag-to-reorder; formula fields are
    excluded from the form entirely rather than shown read-only. Accepts a
    `prefill` from `my_tasks_button`'s "Convert" via `[slug].tsx`'s
    `quickAddPrefill` state, same as web's `onQuickAddPrefill`.
  - `my_tasks_button`/`auto_time_recording_button` -- open a native sheet;
    the latter drives the exact same `app/api/time-entries/auto-generate`/
    `.../submit` routes web uses (no drafting/matching logic duplicated).
    No AI description rewrite, no admin "push everyone's day" toggle.
  - `trust_reconciliation`/`trust_ledger_statement`/`trust_cash_book`/
    `trust_aged_balances`/`ledes_export`/`time_fees_report`/
    `time_aging_report` -- read-only reports, all pure client-side
    aggregation over already-fetched records ported 1:1 from their web
    counterparts (`trust_aged_balances` shares `src/lib/trust/trustBalances.ts`,
    a byte-for-byte verbatim port of the web module, rather than a second
    implementation of the balance math). No "Print"/PDF export on any of
    them.
  - `public_task_page`/`public_document_page`/`public_client_update_page`
    -- a card that navigates to the matching "Shared pages" screen below
    instead of embedding the page inline (which is how web renders these).
  - `document_export`/`ledes_export`'s per-row PDF and `invoice_import`'s
    upload both hit the same server routes web does. Export opens the PDF
    in the system browser (no in-app share sheet yet); import genuinely
    uploads a PDF via `expo-document-picker` + a raw multipart `fetch` (not
    `src/lib/api.ts`'s `callApi`, which hardcodes JSON) to
    `app/api/generic-invoice-import/parse`, then review/commit exactly like
    web's `InvoiceImportModal.tsx`.
  `src/lib/dashboardWidgets/{types,compute,relativeDates}.ts` are verbatim
  copies of their web counterparts (pure logic, zero React/Next.js deps)
  kept byte-for-byte identical for easy re-syncing; `src/lib/companyDashboards.ts`
  adapts `src/lib/records.ts`'s existing field/record fetching (system
  tables) or `customTableDashboardData.ts` (custom tables) into the shape
  that logic expects. Every relation-type field (across grids, pickers, and
  quick-add) resolves to its target's real label via
  `src/lib/dashboardWidgets/relationResolution.ts`, never a raw id or a
  "(linked record)" placeholder -- a linked Matter also gets its
  per-company matter number prepended (`src/lib/matterNumberDisplay.ts`),
  matching `RelationPicker.tsx`'s format on web. Building/editing a
  dashboard is still web-only (see "Custom tables & boards" above).
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

- **`finance_model_search`/`residual_land_solver` dashboard widgets** --
  deliberately not ported (zero production usage, see "Shared pages"
  below); still show "open on web". Every other dashboard-widget type is
  covered -- see the Dashboards entry above for exactly what each one drops
  vs its web counterpart.
- **In-app PDF download/share** -- `document_export`/`ledes_export` open
  the generated PDF in the system browser rather than an in-app share
  sheet; would need `expo-file-system` alongside the `expo-document-picker`
  `invoice_import` already added.
- **Outlook/Gmail, SMS, billing, marketplace screens** -- the Bearer-auth
  plumbing (`src/lib/api.ts`) and the Core CRM screens above prove the
  pattern works; these four still just open the web dashboard.
- **App Store / Play Store submission** -- needs your own Apple Developer
  Program and Google Play Console accounts/credentials; `eas.json` is set
  up for `eas submit` once you have them.
