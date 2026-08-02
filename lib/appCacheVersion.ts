// lib/appCacheVersion.ts
// One shared version string for every localStorage cache shape this app
// writes (AppLoader's legacy-key wipe, the persisted React Query cache's
// `buster`). Bump this ONE constant whenever any cached shape changes in a
// way that makes old entries unsafe to read (e.g. renamed/restructured
// fields) -- a DELIBERATE, human-decided signal, distinct from
// AppLoader.tsx's own separate, fully automatic per-deployment wipe (see
// its BUILD_ID comparison), which now already covers "just redeployed,
// play it safe" on its own without anyone needing to remember this.
//
// Note: deliberately NOT derived from BUILD_ID (lib/buildId.ts) the way
// AppLoader's own check is -- BUILD_ID reads process.env.VERCEL_GIT_COMMIT_SHA,
// which Next.js only inlines into SERVER code; a bare (non-NEXT_PUBLIC_) env
// var referenced from this file would resolve to the "local-dev" fallback
// in every browser bundle regardless of which deployment is actually
// running, silently never changing and defeating the whole point. See
// VersionCheckBanner.tsx for the pattern that DOES work client-side
// (reading the value already embedded server-side into a <meta> tag) --
// AppLoader.tsx's own automatic check uses that same approach instead.
export const APP_CACHE_VERSION = "v4";
