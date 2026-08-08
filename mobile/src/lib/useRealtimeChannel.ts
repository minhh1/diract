import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type RowAction = 'INSERT' | 'UPDATE' | 'DELETE';

interface UseRealtimeChannelOptions {
  tableName: string;
  filterColumn: string;
  filterValue: string | null | undefined;
  onInsert: (row: Record<string, any>) => void;
  onUpdate: (row: Record<string, any>) => void;
  onDelete: (id: string) => void;
}

/**
 * Mobile's own copy of web's lib/hooks/useTableRealtime.ts -- same shape
 * (single filterColumn=eq.filterValue postgres_changes subscription,
 * patches local state in place instead of re-fetching), adapted to the
 * mobile Supabase client. This is messaging's first real de-dup of the
 * raw .channel() pattern AiChatThread.tsx hand-rolls per screen -- worth
 * factoring out now since messaging needs several concurrent
 * subscriptions (channel list unread badges + whichever thread is open).
 */
export function useRealtimeChannel({
  tableName,
  filterColumn,
  filterValue,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeChannelOptions) {
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  useEffect(() => {
    if (!filterValue) return;

    const channel = supabase
      .channel(`realtime:${tableName}:${filterColumn}:${filterValue}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `${filterColumn}=eq.${filterValue}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload as {
            eventType: RowAction;
            new: Record<string, any> | null;
            old: Record<string, any> | null;
          };

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
  }, [tableName, filterColumn, filterValue]);
}
