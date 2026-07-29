// lib/buildId.ts
// Identifies which deployment is currently running -- Vercel automatically
// sets VERCEL_GIT_COMMIT_SHA for every build/runtime (System Environment
// Variables, on by default), so a brand new deployment always gets a new
// value here with zero extra CI/deploy-hook config.
//
// The fallback is a fixed literal, not e.g. Date.now() -- `next dev`
// compiles routes on demand, each getting its own isolated module
// evaluation, so a per-evaluation value (timestamp, random id) produces a
// DIFFERENT result in app/layout.tsx's embedded meta tag vs. app/api/version's
// live check even though nothing changed, tripping VersionCheckBanner
// falsely on every local page load (confirmed live: two curls a moment
// apart returned different fallback values). A constant means both sides
// agree by construction whenever there's no real deployment id to compare.
export const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || "local-dev";
