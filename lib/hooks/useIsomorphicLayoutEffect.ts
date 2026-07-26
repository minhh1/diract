"use client";

import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect flushes synchronously before the browser paints -- used
// where a cache-hydration setState needs to land before first paint (no
// blank/stale-content flash) instead of after it, which plain useEffect
// would allow. Falls back to useEffect during SSR, where useLayoutEffect
// prints a warning and does nothing anyway.
export const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
