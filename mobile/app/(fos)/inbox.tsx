import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { Check, Clock } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar, SectionLabel, Btn, Bold } from "../../components/linen";
import {
  Card,
  Field,
  InlineErr,
  Empty,
  Badge,
  Row,
  Segmented,
  HelperNote,
  type BadgeTone,
} from "../../components/linen/extras";
import { Toast, type ToastState } from "../../components/linen/more";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { fetchAccounts } from "../../lib/accounts";
import type { Account } from "../../lib/types";
import { getFosInbox, type RequestRow } from "../../lib/queries";
import { fosDecideCash, fosReviewRequest } from "../../lib/api";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt, type Locale } from "../../lib/i18n";
import { formatINR, formatDateTime } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";

type Decision = "decline" | "edit" | "accept";
type CashDecision = "approve" | "decline";

type FosCashRow = {
  id: string;
  amount: string;
  txn_date: string;
  notes: string | null;
  created_at: string;
  retailer: { full_name: string; retailer_code: string | null; fos_id: string | null } | null;
  submitter: { full_name: string; role: string } | null;
  account: { name: string } | null;
};

async function getFosPendingCash(fosId: string): Promise<FosCashRow[]> {
  const { data, error } = await supabase
    .from("cash_submissions")
    .select(
      `id, amount, txn_date, notes, created_at,
       retailer:retailer_id!inner(full_name, retailer_code, fos_id),
       submitter:submitted_by(full_name, role),
       account:account_id(name)`,
    )
    .eq("status", "pending")
    .eq("retailer.fos_id", fosId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as FosCashRow[];
}

export default function FosInbox() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<RequestRow[]>([]);
  const [pendingCash, setPendingCash] = useState<FosCashRow[]>([]);
  const [recent, setRecent] = useState<RequestRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [p, c, r, a] = await Promise.all([
      getFosInbox(profile.id, ["pending"]),
      getFosPendingCash(profile.id),
      getFosInbox(profile.id, ["accepted", "edited", "declined"]),
      profile.distributor_id
        ? fetchAccounts(profile.distributor_id)
        : Promise.resolve([] as Account[]),
    ]);
    setPending(p);
    setPendingCash(c);
    setRecent(r);
    setAccounts(a);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "money_requests", filter: `fos_id=eq.${profile.id}` },
          { table: "cash_submissions" },
        ]
      : [],
    load,
  );

  const resolve = useCallback(
    (id: string, kind: Decision) => {
      // Remove locally (card already animated out), toast, then sync Recent.
      setPending((prev) => prev.filter((p) => p.id !== id));
      setToast({
        msg:
          kind === "decline"
            ? t("inbox.toast.declined")
            : kind === "edit"
              ? t("inbox.toast.edited")
              : t("inbox.toast.accepted"),
        kind: kind === "decline" ? "neg" : "ok",
      });
      load();
    },
    [load, t],
  );

  const resolveCash = useCallback(
    (id: string, kind: CashDecision) => {
      // Remove locally (card already animated out), toast, then reload.
      setPendingCash((prev) => prev.filter((c) => c.id !== id));
      setToast({
        msg: kind === "decline" ? t("status.declined") : t("status.approved"),
        kind: kind === "decline" ? "neg" : "ok",
      });
      load();
    },
    [load, t],
  );

  if (!profile) return null;

  return (
    <View style={{ flex: 1 }}>
      <LinenScreen
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        topbar={<Topbar title={t("inbox.title")} locale={locale} />}
      >
        {profile.fos_auto_approve && (
          <View style={{ marginBottom: 16 }}>
            <HelperNote locale={locale}>
              <AutoApproveNote text={t("fos.auto_approve_on")} locale={locale} />
            </HelperNote>
          </View>
        )}

        <SectionLabel locale={locale} style={{ marginTop: 4 }}>
          {fmt(t("inbox.pending"), { n: pending.length })}
        </SectionLabel>
        {pending.length === 0 ? (
          <Empty
            icon={<Check size={26} color={TH.accentInk} />}
            title={t("inbox.empty.title")}
            sub={t("inbox.empty.sub")}
            locale={locale}
          />
        ) : (
          pending.map((r) => (
            <InboxCard
              key={r.id}
              request={r}
              accounts={accounts}
              autoApprove={profile.fos_auto_approve}
              onResolved={(kind) => resolve(r.id, kind)}
              locale={locale}
            />
          ))
        )}

        <SectionLabel locale={locale}>
          {fmt(t("appr.cash"), { n: pendingCash.length })}
        </SectionLabel>
        {pendingCash.length === 0 ? (
          <Empty
            icon={<Check size={26} color={TH.accentInk} />}
            title={t("appr.empty.cash.title")}
            sub={t("appr.empty.cash.sub")}
            locale={locale}
          />
        ) : (
          pendingCash.map((c) => (
            <FosCashCard
              key={c.id}
              cash={c}
              fosId={profile.id}
              onResolved={(kind) => resolveCash(c.id, kind)}
              locale={locale}
            />
          ))
        )}

        <SectionLabel locale={locale}>
          {fmt(t("inbox.recent"), { n: recent.length })}
        </SectionLabel>
        {recent.length === 0 ? (
          <Empty
            icon={<Clock size={26} color={TH.ink3} />}
            title={t("history.empty.requests")}
            locale={locale}
          />
        ) : (
          recent.map((r) => {
            const when = formatDateTime(r.fos_acted_at ?? r.created_at);
            const edited =
              r.fos_amount != null &&
              Number(r.fos_amount) > 0 &&
              Number(r.fos_amount) !== Number(r.requested_amount);
            return (
              <Row
                key={r.id}
                title={`${r.retailer?.retailer_code ?? ""} · ${r.retailer?.full_name ?? ""}`}
                sub={
                  edited
                    ? `${fmt(t("history.req_to"), {
                        req: formatINR(r.requested_amount),
                        final: formatINR(r.fos_amount ?? 0),
                      })} · ${when}`
                    : `${formatINR(r.requested_amount)} · ${when}`
                }
                right={
                  <View style={{ alignItems: "flex-end", gap: 5 }}>
                    <Badge tone={badgeTone(r.fos_status)} locale={locale}>
                      {statusLabel(r.fos_status, t)}
                    </Badge>
                    <Badge tone={badgeTone(r.distributor_status)} locale={locale}>
                      {r.fos_status === "declined"
                        ? "—"
                        : statusLabel(r.distributor_status, t)}
                    </Badge>
                  </View>
                }
                locale={locale}
              />
            );
          })
        )}
      </LinenScreen>
      <Toast toast={toast} onDone={() => setToast(null)} locale={locale} />
    </View>
  );
}

function InboxCard({
  request,
  accounts,
  autoApprove,
  onResolved,
  locale,
}: {
  request: RequestRow;
  accounts: Account[];
  autoApprove: boolean;
  onResolved: (kind: Decision) => void;
  locale: Locale;
}) {
  const { t } = useT();
  const initial = Number(request.requested_amount);
  const [amount, setAmount] = useState(String(Math.round(initial)));
  const [accountId, setAccountId] = useState(request.account_id);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | Decision>(null);
  const [error, setError] = useState<string | null>(null);
  const leave = useRef(new Animated.Value(0)).current;

  const edited = Math.abs(Number(amount) - initial) > 0.5;
  const accountChanged = accountId !== request.account_id;

  async function act(kind: Decision) {
    setError(null);
    setBusy(kind);
    const r = await fosReviewRequest({
      requestId: request.id,
      decision: kind,
      requestedAmount: initial,
      amount: kind === "edit" ? Number(amount) : undefined,
      notes: notes || undefined,
      autoApprove,
      accountId,
    });
    if ("error" in r) {
      setBusy(null);
      setError(r.error);
      return;
    }
    // Slide the card out (design .appr.leaving), then remove it.
    Animated.timing(leave, {
      toValue: 1,
      duration: 350,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start(() => onResolved(kind));
  }

  return (
    <Animated.View
      style={{
        opacity: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          {
            translateX: leave.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 40],
            }),
          },
          {
            scale: leave.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.96],
            }),
          },
        ],
      }}
    >
      <Card style={{ marginBottom: 13 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 16,
                fontFamily: font(800, locale),
                letterSpacing: -0.16,
                color: TH.ink,
              }}
            >
              {request.retailer?.full_name ?? "?"}
            </Text>
            <Text
              style={{
                fontSize: 12.5,
                fontFamily: font(600, locale),
                color: TH.ink2,
                marginTop: 1,
              }}
            >
              {request.retailer?.retailer_code ?? ""}
            </Text>
          </View>
          {request.account?.name ? (
            <Badge tone="ok" locale={locale}>{request.account.name}</Badge>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 10,
            marginTop: 12,
            marginBottom: 2,
          }}
        >
          <Text
            style={{
              fontFamily: font(600, "en", "num"),
              fontSize: 30,
              color: TH.ink,
              letterSpacing: -0.6,
            }}
          >
            {formatINR(initial)}
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: TH.ink2,
              fontFamily: font(500, locale),
            }}
          >
            {fmt(t("inbox.requested"), {
              time: formatDateTime(request.created_at),
            })}
          </Text>
        </View>

        <View style={{ marginTop: 14 }}>
          {accounts.length > 0 ? (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 13.5,
                  fontFamily: font(600, locale),
                  color: TH.ink2,
                  marginBottom: 7,
                  marginLeft: 3,
                }}
              >
                {t("request.account")}
              </Text>
              <Segmented
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                value={accountId}
                onChange={setAccountId}
                locale={locale}
              />
            </View>
          ) : null}
          <Field
            label={t("inbox.edit_amount")}
            value={amount}
            onChangeText={(v: string) => setAmount(v.replace(/[^\d.]/g, ""))}
            prefix="₹"
            keyboardType="numeric"
            locale={locale}
          />
          <Field
            label={t("inbox.notes")}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("inbox.notes.placeholder")}
            locale={locale}
          />
        </View>

        {error && <InlineErr locale={locale}>{error}</InlineErr>}

        {/* Two actions only: Decline, and a primary button that flips to
            "Send edited" the moment the amount or account is changed. */}
        <View style={{ flexDirection: "row", gap: 9, marginTop: 14 }}>
          <Btn
            title={t("inbox.decline")}
            onPress={() => act("decline")}
            variant="danger"
            loading={busy === "decline"}
            locale={locale}
          />
          {edited || accountChanged ? (
            <Btn
              title={t("inbox.send_edited")}
              busyLabel={t("inbox.sending")}
              icon={<Check size={18} color={TH.onAccent} strokeWidth={2.4} />}
              onPress={() => act("edit")}
              disabled={!Number(amount)}
              loading={busy === "edit"}
              locale={locale}
            />
          ) : (
            <Btn
              title={fmt(t("inbox.accept_amt"), { amt: formatINR(initial) })}
              busyLabel={t("inbox.accepting")}
              icon={<Check size={18} color={TH.onAccent} strokeWidth={2.4} />}
              onPress={() => act("accept")}
              loading={busy === "accept"}
              locale={locale}
            />
          )}
        </View>
      </Card>
    </Animated.View>
  );
}

/* Pending cash submitted by an assigned retailer — the FOS approves/declines. */
function FosCashCard({
  cash,
  fosId,
  onResolved,
  locale,
}: {
  cash: FosCashRow;
  fosId: string;
  onResolved: (kind: CashDecision) => void;
  locale: Locale;
}) {
  const { t } = useT();
  const initial = Number(cash.amount);
  const [amount, setAmount] = useState(String(Math.round(initial)));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | CashDecision>(null);
  const [error, setError] = useState<string | null>(null);
  const leave = useRef(new Animated.Value(0)).current;

  const edited = Math.abs(Number(amount) - initial) > 0.5;

  async function act(kind: CashDecision) {
    setError(null);
    setBusy(kind);
    const r = await fosDecideCash({
      cashId: cash.id,
      decision: kind,
      amount: kind === "approve" ? Number(amount) : undefined,
      notes: notes || undefined,
      fosId,
    });
    if ("error" in r) {
      setBusy(null);
      setError(r.error);
      return;
    }
    // Slide the card out (design .appr.leaving), then remove it.
    Animated.timing(leave, {
      toValue: 1,
      duration: 350,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start(() => onResolved(kind));
  }

  return (
    <Animated.View
      style={{
        opacity: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          {
            translateX: leave.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 40],
            }),
          },
          {
            scale: leave.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.96],
            }),
          },
        ],
      }}
    >
      <Card style={{ marginBottom: 13 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 16,
                fontFamily: font(800, locale),
                letterSpacing: -0.16,
                color: TH.ink,
              }}
            >
              {cash.retailer?.full_name ?? "?"}
            </Text>
            <Text
              style={{
                fontSize: 12.5,
                fontFamily: font(600, locale),
                color: TH.ink2,
                marginTop: 1,
              }}
            >
              {cash.retailer?.retailer_code ?? ""}
            </Text>
          </View>
          {cash.account?.name ? (
            <Badge tone="ok" locale={locale}>{cash.account.name}</Badge>
          ) : null}
        </View>

        <Text
          style={{
            fontSize: 12.5,
            color: TH.ink2,
            marginTop: 10,
            fontFamily: font(500, locale),
          }}
        >
          {fmt(t("appr.submitted_by"), { name: cash.submitter?.full_name ?? "—" })} ·{" "}
          {formatDateTime(cash.created_at)} · {t("appr.txn")} {cash.txn_date}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 10,
            marginTop: 12,
            marginBottom: 2,
          }}
        >
          <Text
            style={{
              fontFamily: font(600, "en", "num"),
              fontSize: 30,
              color: TH.ink,
              letterSpacing: -0.6,
            }}
          >
            {formatINR(initial)}
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: TH.ink2,
              fontFamily: font(500, locale),
            }}
          >
            {t("appr.reported")}
          </Text>
        </View>

        {cash.notes ? (
          <View
            style={{
              backgroundColor: TH.surface2,
              borderRadius: TH.rSm,
              padding: 10,
              marginTop: 12,
            }}
          >
            <Text style={{ fontSize: 13, color: TH.ink, fontFamily: font(500, locale) }}>
              <Text style={{ color: TH.ink2, fontFamily: font(700, locale) }}>
                {t("appr.note")}:{" "}
              </Text>
              {cash.notes}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: 14 }}>
          <Field
            label={t("appr.approve_as")}
            value={amount}
            onChangeText={(v: string) => setAmount(v.replace(/[^\d.]/g, ""))}
            prefix="₹"
            keyboardType="numeric"
            locale={locale}
          />
          <Field
            label={t("appr.notes")}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("appr.notes.ph")}
            locale={locale}
          />
        </View>

        {error && <InlineErr locale={locale}>{error}</InlineErr>}

        <View style={{ flexDirection: "row", gap: 9, marginTop: 14 }}>
          <Btn
            title={t("appr.decline")}
            onPress={() => act("decline")}
            variant="danger"
            loading={busy === "decline"}
            locale={locale}
          />
          <Btn
            title={edited ? t("appr.approve_edited") : t("appr.approve")}
            icon={<Check size={18} color={TH.onAccent} strokeWidth={2.4} />}
            onPress={() => act("approve")}
            disabled={!Number(amount)}
            loading={busy === "approve"}
            locale={locale}
          />
        </View>
      </Card>
    </Animated.View>
  );
}

/* "<b>Auto-approve is on.</b> rest…" — bold lead-in sentence per design */
function AutoApproveNote({ text, locale }: { text: string; locale: Locale }) {
  const m = text.match(/^(.*?[.।])\s+([\s\S]*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      <Bold locale={locale}>{m[1]}</Bold> {m[2]}
    </>
  );
}

function statusLabel(status: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    pending: "status.pending",
    accepted: "status.accepted",
    edited: "status.edited",
    declined: "status.declined",
    approved: "status.approved",
  };
  return map[status] ? t(map[status]) : status;
}

function badgeTone(s: string): BadgeTone {
  if (s === "pending") return "warn";
  // design data.jsx: Accepted / Edited / Approved all read as "ok"
  if (s === "approved" || s === "accepted" || s === "edited") return "ok";
  if (s === "declined") return "neg";
  return "mute";
}
