import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export type RealtimeSpec = {
  table: string;
  filter?: string; // e.g. "retailer_id=eq.<uuid>"
};

/**
 * Subscribe to Postgres changes on the listed tables. Calls `onChange` (debounced
 * 250ms) whenever any subscribed row changes. RLS applies — users only receive
 * events for rows they're allowed to read.
 */
export function useRealtimeRefresh(specs: RealtimeSpec[], onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  // Build a stable deps key from the specs so the effect re-subscribes only
  // when the filter actually changes.
  const key = specs.map((s) => `${s.table}|${s.filter ?? ""}`).join(";");

  useEffect(() => {
    if (specs.length === 0) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => cb.current(), 250);
    };

    const channel = supabase.channel(
      `rt:${key}:${Math.random().toString(36).slice(2, 8)}`,
    );
    for (const s of specs) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: s.table,
          ...(s.filter ? { filter: s.filter } : {}),
        },
        debounced,
      );
    }
    channel.subscribe();

    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
