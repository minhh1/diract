// components/TopProgressBar.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface ProgressBarContextValue {
  // Reference-counted so overlapping loads (e.g. a route change plus a
  // table's own data fetch) only hide the bar once everything is done.
  start: () => void;
  done: () => void;
  // For navigation specifically — call before router.push/Link click.
  // The bar resolves itself automatically once the URL actually changes,
  // so callers don't need to know when the destination is "ready".
  startNavigation: () => void;
}

const ProgressBarContext = createContext<ProgressBarContextValue>({
  start: () => {},
  done: () => {},
  startNavigation: () => {},
});

export function useProgressBar() {
  return useContext(ProgressBarContext);
}

// useSearchParams() needs a Suspense boundary in this Next.js version —
// isolate it in its own leaf component (same pattern already used for
// GenericMasterTable/Sidebar elsewhere in this app).
function RouteChangeWatcher({
  pendingRef, done,
}: { pendingRef: React.MutableRefObject<boolean>; done: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams.toString()}`;
  const prevKey = useRef(key);

  useEffect(() => {
    if (key === prevKey.current) return;
    prevKey.current = key;
    if (!pendingRef.current) return;
    pendingRef.current = false;
    // Small settle delay so the destination has a moment to paint before
    // we call it "done" — avoids the bar flickering off mid-transition.
    const t = setTimeout(() => done(), 200);
    return () => clearTimeout(t);
  }, [key, done]);

  return null;
}

export function ProgressBarProvider({ children }: { children: ReactNode }) {
  const activeCount = useRef(0);
  const pendingNavRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const growTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable identities are load-bearing here: these are consumed in other
  // components' effect dependency arrays (e.g. "call done() on unmount if
  // still loading"). An unstable reference would make those effects re-fire
  // on every width-animation tick instead of only on real state changes,
  // eventually desyncing the start()/done() reference count.
  const start = useCallback(() => {
    activeCount.current += 1;
    if (activeCount.current > 1) return; // already running — just keep it alive

    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    setVisible(true);
    setWidth(15);
    // Decelerating growth toward ~85% — never claims "done" on its own,
    // only done() pushes it the rest of the way to 100.
    growTimerRef.current = setInterval(() => {
      setWidth(w => (w >= 85 ? w : w + (85 - w) * 0.1));
    }, 200);
  }, []);

  const done = useCallback(() => {
    activeCount.current = Math.max(0, activeCount.current - 1);
    if (activeCount.current > 0) return;

    if (growTimerRef.current) { clearInterval(growTimerRef.current); growTimerRef.current = null; }
    setWidth(100);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 300);
  }, []);

  const startNavigation = useCallback(() => {
    pendingNavRef.current = true;
    start();
  }, [start]);

  useEffect(() => () => {
    if (growTimerRef.current) clearInterval(growTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const contextValue = useMemo(
    () => ({ start, done, startNavigation }),
    [start, done, startNavigation]
  );

  return (
    <ProgressBarContext.Provider value={contextValue}>
      <Suspense fallback={null}>
        <RouteChangeWatcher pendingRef={pendingNavRef} done={done} />
      </Suspense>
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 250ms ease' }}
      >
        <div
          className="h-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.6)]"
          style={{ width: `${width}%`, transition: 'width 200ms ease-out' }}
        />
      </div>
      {children}
    </ProgressBarContext.Provider>
  );
}
