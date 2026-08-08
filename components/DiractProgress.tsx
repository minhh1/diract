"use client";

/**
 * DiractProgress — wave-packet progress bar for Diract (niksen-flow).
 *
 * A quantum wave packet rides the leading edge of the bar; the track fills
 * with the periwinkle->mint gradient behind it. Matches DiractLoader's
 * palette and pacing.
 *
 * Determinate:    <DiractProgress value={62} />          // 0–100
 * Indeterminate:  <DiractProgress />                     // endless calm sweep
 * Sizing:         width defaults to 100% of the container; height prop in px.
 *
 * The packet oscillates in place while value is static (still "alive"),
 * and the leading edge glides smoothly when value jumps.
 * Respects prefers-reduced-motion (flat fill, no wave).
 */

import { useEffect, useId, useRef } from "react";

const VW = 512, VH = 128;           // viewBox
const MARGIN = 36;
const BASE = VH / 2;
const SIGMA = 26;
const AMP = 30;
const K = (2 * Math.PI) / 36;       // carrier wavelength
const STROKE = 7;
const SWEEP_MS = 4400;              // indeterminate sweep duration
const SETTLE_MS = 800;              // fade-out before next sweep
const GRAD_A = "#7C8CFF";
const GRAD_B = "#59E3C2";

function wavePath(head: number, phase: number, flat: boolean): string {
  const x0 = MARGIN;
  const x1 = Math.max(x0, Math.min(head, VW - MARGIN));
  if (x1 - x0 < 1) return `M${x0} ${BASE}L${x0 + 1} ${BASE}`;
  const center = x1 - 3 * SIGMA;
  let d = "";
  for (let x = x0; x <= x1; x += 3) {
    const env = flat ? 0 : AMP * Math.exp(-((x - center) ** 2) / (2 * SIGMA * SIGMA));
    const y = BASE - env * Math.cos(K * (x - center) + phase);
    d += (d ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d;
}

export default function DiractProgress({
  value,
  height = 32,
  label,
  trackColor = "rgba(127, 140, 170, 0.22)",
  className,
}: {
  /** 0–100. Omit for an indeterminate sweep. */
  value?: number;
  /** rendered height in px; width fills the container */
  height?: number;
  label?: string;
  trackColor?: string;
  className?: string;
}) {
  const gradId = useId();
  const fillRef = useRef<SVGPathElement>(null);
  const indeterminate = value === undefined;
  const target = useRef(0);
  target.current = indeterminate ? 0 : Math.max(0, Math.min(100, value));

  useEffect(() => {
    const path = fillRef.current;
    if (!path) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const head = indeterminate
        ? VW - MARGIN
        : MARGIN + ((VW - 2 * MARGIN) * target.current) / 100;
      path.setAttribute("d", wavePath(head, 0, true));
      path.setAttribute("opacity", indeterminate ? "0.4" : "1");
      return;
    }

    let raf = 0;
    let disp = MARGIN;                       // displayed head, glides toward target
    const t0 = performance.now();
    const tick = (t: number) => {
      const dt = t - t0;
      const phase = (dt / 1000) * 2 * Math.PI * 1.1;   // carrier drift
      if (indeterminate) {
        const cycle = dt % (SWEEP_MS + SETTLE_MS);
        if (cycle < SWEEP_MS) {
          const u = cycle / SWEEP_MS;
          const head = MARGIN + (VW - 2 * MARGIN + 6 * SIGMA) * u;
          path.setAttribute("d", wavePath(head, phase, false));
          path.setAttribute("opacity", "1");
        } else {
          const f = (cycle - SWEEP_MS) / SETTLE_MS;
          path.setAttribute("d", wavePath(VW - MARGIN, 0, true));
          path.setAttribute("opacity", String(1 - f));
        }
      } else {
        const head = MARGIN + ((VW - 2 * MARGIN) * target.current) / 100;
        disp += (head - disp) * 0.07;                   // smooth glide on jumps
        const done = target.current >= 100 && head - disp < 1;
        path.setAttribute("d", wavePath(disp, phase, done));
        path.setAttribute("opacity", "1");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [indeterminate]);

  return (
    <div
      className={className}
      role="progressbar"
      aria-label={label ?? "Loading"}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(target.current)}
      style={{ width: "100%" }}
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={gradId}
            x1={MARGIN}
            y1="0"
            x2={VW - MARGIN}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor={GRAD_A} />
            <stop offset="1" stopColor={GRAD_B} />
          </linearGradient>
        </defs>
        <path
          d={`M${MARGIN} ${BASE}L${VW - MARGIN} ${BASE}`}
          stroke={trackColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />
        <path
          ref={fillRef}
          d={`M${MARGIN} ${BASE}L${MARGIN + 1} ${BASE}`}
          stroke={`url(#${gradId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
