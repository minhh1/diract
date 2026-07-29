"use client";

import { useCallback, useRef, useState } from "react";
import { checkNameQuality, type NameSuggestion } from "@/lib/smartValidation/nameQuality";

// Wraps the pure checkNameQuality() in React state for a single field --
// check() is meant to be called explicitly on blur/before-save (not on
// every keystroke), so a name mid-typing (e.g. "John" on the way to "John
// Smith") never gets flagged while the user is still typing it.
export function useNameQualityCheck() {
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([]);
  // Dismissed ids are scoped to whatever value produced them -- resets the
  // moment the checked value actually changes, so a suggestion dismissed
  // for one piece of text doesn't stay silently suppressed forever once
  // the field holds something completely different.
  const dismissedRef = useRef<Set<string>>(new Set());
  const lastValueRef = useRef<string | null>(null);

  const check = useCallback((value: string) => {
    if (value !== lastValueRef.current) {
      dismissedRef.current = new Set();
      lastValueRef.current = value;
    }
    setSuggestions(checkNameQuality(value).filter(s => !dismissedRef.current.has(s.id)));
  }, []);

  const dismiss = useCallback((id: string) => {
    dismissedRef.current.add(id);
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }, []);

  const reset = useCallback(() => {
    dismissedRef.current = new Set();
    lastValueRef.current = null;
    setSuggestions([]);
  }, []);

  return { suggestions, check, dismiss, reset };
}
