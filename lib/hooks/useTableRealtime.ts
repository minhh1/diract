"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type RowAction = "INSERT" | "UPDATE" | "DELETE";

interface RealtimeEvent {
  action: RowAction;
  new: Record<string, any> | null;
  old: Record<string, any> | null;
}

interface UseTableRealtimeOptions {
  tableName: string;
  companyId: string | null;
  // Called with the minimal patch needed — the page applies it to its
  // local items array without re-fetching anything from the database.
  onInsert: (row: Record<string, any>) => void;
  onUpdate: (row: Record<string, any>) => void;
  onDelete: (id: string) => void;
}

/**
 * Subscribes to Supabase Realtime events for a single table, scoped to
 * the current company. Patches the local items array in-place for each
 * event rather than triggering a full re-fetch — so edits appear
 * instantly without a loading state or network round trip.
 *
 * The subscription is automatically cleaned up when the component
 * unmounts or when tableName/companyId changes.
 */
export function useTableRealtime({
  tableName,
  companyId,
  onInsert,
  onUpdate,
  onDelete,
}: UseTableRealtimeOptions) {
  // Keep callbacks in refs so the subscription closure always calls the
  // latest version without needing to re-subscribe when they change.
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`realtime:${tableName}:${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          // Filter to only this company's rows — prevents receiving
          // events for other companies' data even if RLS somehow passes.
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          if (eventType === 'INSERT' && newRow) {
            onInsertRef.current(newRow);
          } else if (eventType === 'UPDATE' && newRow) {
            onUpdateRef.current(newRow);
          } else if (eventType === 'DELETE' && oldRow?.id) {
            onDeleteRef.current(oldRow.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, companyId]);
}