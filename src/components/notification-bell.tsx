"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/ui";
import { renderNotif, type NotifRow } from "@/lib/notif";
import { formatShortDateTime } from "@/lib/format";

/* Notification bell for the web topbar: live unread badge + dropdown feed.
   Self-contained — reads the signed-in user's own notifications via the
   browser client and subscribes to realtime inserts/updates. */
export default function NotificationBell() {
  const { t } = useT();
  const [items, setItems] = useState<NotifRow[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, data, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    setItems((data as NotifRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("notif-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAllRead = useCallback(async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  }, [items]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) void markAllRead();
  };

  return (
    <div className="notif-wrap" ref={ref}>
      <button type="button" className="notif-btn" onClick={toggle} aria-label={t("ntf.title")}>
        <Icon name="bell" size={20} w={2} />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <span>{t("ntf.title")}</span>
            {items.some((n) => !n.read_at) && (
              <button type="button" className="notif-mark" onClick={markAllRead}>
                {t("ntf.mark_all")}
              </button>
            )}
          </div>
          <div className="notif-list">
            {items.length === 0 && <div className="notif-empty">{t("ntf.empty")}</div>}
            {items.map((n) => {
              const { title, body } = renderNotif(n, t);
              return (
                <div key={n.id} className={"notif-item" + (n.read_at ? "" : " unread")}>
                  <div className="notif-dot" aria-hidden />
                  <div className="notif-text">
                    <div className="notif-item-title">{title}</div>
                    <div className="notif-item-body">{body}</div>
                    <div className="notif-item-time">{formatShortDateTime(n.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
