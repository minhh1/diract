"use client";

// Invisible Cloudflare Turnstile bot check for the login/register forms.
// "Invisible" here means the actual Cloudflare widget config, not just
// this component hiding it -- render it with size: "invisible" and it
// never shows a box or a puzzle; it silently verifies the browser in the
// background and only ever interrupts with a visible challenge if
// Cloudflare's own risk signal genuinely can't clear it automatically.
// The resulting token is passed to supabase.auth.signInWithPassword/
// signUp's options.captchaToken -- Supabase's own GoTrue server verifies
// it against Cloudflare before the request proceeds, once CAPTCHA
// protection is turned on for this project (Authentication > Attack
// Protection). No site key configured (local dev, or before that's set
// up) means this renders nothing and callers just get an undefined
// token -- signInWithPassword/signUp both accept that fine when the
// project doesn't have CAPTCHA protection enabled yet.
import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function useTurnstileToken() {
  const [token, setToken] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = () => {
    if (!SITE_KEY || !window.turnstile || !containerRef.current || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      size: "invisible",
      retry: "auto",
      callback: (t: string) => setToken(t),
      "expired-callback": () => setToken(undefined),
      "error-callback": () => setToken(undefined),
    });
  };

  useEffect(() => {
    if (ready) renderWidget();
  }, [ready]);

  // Turnstile tokens are single-use -- call this after every submit
  // attempt (whether it succeeded or the request failed for some other
  // reason) so the next attempt has a fresh one waiting.
  const resetToken = () => {
    setToken(undefined);
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  };

  const widget = SITE_KEY ? (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={containerRef} />
    </>
  ) : null;

  return { token, resetToken, widget };
}
