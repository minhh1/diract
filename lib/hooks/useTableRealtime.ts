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
  // Used as the filter value when filterColumn is left at its default
  // ("company_id") -- every call site before the notification bell only
  // ever needed company-scoped filtering. Ignored (but still fine to pass)
  // once filterValue is provided explicitly.
  companyId: string | null;
  // Realtime's postgres_changes filter only supports one column=eq.value
  // clause, so a caller that needs to scope by something other than
  // company_id (e.g. the notification bell's recipient_user_id=eq.<me>)
  // overrides both of these instead of company_id/companyId.
  filterColumn?: string;
  filterValue?: string | null;
  // Called with the minimal patch needed -- the page applies it to its
  // local items array without re-fetching anything from the database.
  onInsert: (row: Record<string, any>) => void;
  onUpdate: (row: Record<string, any>) => void;
  onDelete: (id: string) => void;
}

/**
 * Subscribes to Supabase Realtime events for a single table, scoped by
 * filterColumn=eq.filterValue (company_id=eq.companyId by default). Patches
 * the local items array in-place for each event rather than triggering a
 * full re-fetch -- so edits appear instantly without a loading state or
 * network round trip.
 *
 * The subscription is automatically cleaned up when the component
 * unmounts or when tableName/filterColumn/filterValue changes.
 */
export function useTableRealtime({
  tableName,
  companyId,
  filterColumn = "company_id",
  filterValue,
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

  const effectiveFilterValue = filterValue ?? companyId;

  useEffect(() => {
    if (!effectiveFilterValue) return;

    const channel = supabase
      .channel(`realtime:${tableName}:${filterColumn}:${effectiveFilterValue}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          // Prevents receiving events outside this filter even if RLS
          // somehow passes.
          filter: `${filterColumn}=eq.${effectiveFilterValue}`,
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
  }, [tableName, filterColumn, effectiveFilterValue]);
}