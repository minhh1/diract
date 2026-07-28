// lib/appCacheVersion.ts
// One shared version string for every localStorage cache shape this app
// writes (AppLoader's legacy-key wipe, the persisted React Query cache's
// `buster`). Two independently-bumped version strings for the same "did the
// cache shape change" question is exactly the kind of thing that gets out
// of sync -- bump this ONE constant whenever any cached shape changes in a
// way that makes old entries unsafe to read (e.g. renamed/restructured
// fields), and both consumers invalidate together.
export const APP_CACHE_VERSION = "v4";
