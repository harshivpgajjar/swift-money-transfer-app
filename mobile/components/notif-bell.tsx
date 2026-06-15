import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Bell, X } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { T, font } from "../lib/theme";
import { formatDateTime } from "../lib/format";
import { renderNotif, type NotifRow } from "../lib/notif";

/* Bell + unread badge for the mobile Topbar; opens a modal feed. Reads the
   signed-in user's own notifications and subscribes to realtime. */
export function NotifBell() {
  const { t, locale } = useT();
  const [items, setItems] = useState<NotifRow[]>([]);
  const [open, setOpen] = useState(false);

  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, data, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    setItems((data as NotifRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    // Unique channel per mount — the Topbar (and thus this bell) remounts on
    // every screen change, and duplicate channel names break the subscription.
    const channel = supabase
      .channel(`notif-bell-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const markAllRead = useCallback(async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  }, [items]);

  const openFeed = () => {
    setOpen(true);
    if (unread > 0) void markAllRead();
  };

  return (
    <>
      <Pressable
        onPress={openFeed}
        hitSlop={10}
        style={{
          width: 42,
          height: 42,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: T.border,
          backgroundColor: T.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Bell size={20} color={T.ink2} strokeWidth={2} />
        {unread > 0 ? (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              paddingHorizontal: 4,
              borderRadius: 999,
              backgroundColor: T.neg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 10.5, fontFamily: font(800, locale) }}>
              {unread > 99 ? "99+" : unread}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(20,24,22,0.35)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: T.bg,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              maxHeight: "82%",
              paddingBottom: 28,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingTop: 18,
                paddingBottom: 12,
              }}
            >
              <Text style={{ fontSize: 18, fontFamily: font(800, locale), color: T.ink }}>
                {t("ntf.title")}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <X size={22} color={T.ink2} strokeWidth={2.2} />
              </Pressable>
            </View>
            <ScrollView>
              {items.length === 0 ? (
                <Text
                  style={{
                    textAlign: "center",
                    color: T.ink3,
                    fontFamily: font(500, locale),
                    paddingVertical: 36,
                  }}
                >
                  {t("ntf.empty")}
                </Text>
              ) : (
                items.map((n) => {
                  const { title, body } = renderNotif(n, t);
                  return (
                    <View
                      key={n.id}
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        paddingHorizontal: 20,
                        paddingVertical: 13,
                        borderBottomWidth: 1,
                        borderBottomColor: T.border,
                        backgroundColor: n.read_at ? "transparent" : "rgba(14,123,87,0.08)",
                      }}
                    >
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 999,
                          marginTop: 6,
                          backgroundColor: n.read_at ? "transparent" : T.accent,
                        }}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontFamily: font(700, locale), color: T.ink }}>
                          {title}
                        </Text>
                        <Text style={{ fontSize: 12.5, fontFamily: font(500, locale), color: T.ink2, marginTop: 1 }}>
                          {body}
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: font(500, locale), color: T.ink3, marginTop: 3 }}>
                          {formatDateTime(n.created_at)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
