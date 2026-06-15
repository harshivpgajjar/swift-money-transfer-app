"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* Subscribes to postgres changes on the given tables and re-fetches the
   current server component tree (debounced) so data screens update without
   any user action. */
export default function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`refresh:${key}`);
    for (const table of key.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 250);
        },
      );
    }
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [key, router]);

  return null;
}
