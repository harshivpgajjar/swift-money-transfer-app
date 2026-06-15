import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Check, Inbox } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar, Btn, SectionLabel } from "../../components/linen";
import {
  Card,
  Field,
  InlineErr,
  Badge,
  Empty,
  Row,
  type BadgeTone,
} from "../../components/linen/extras";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import {
  getDistributorFosPendingRequests,
  getDistributorPendingRequests,
  type RequestRow,
} from "../../lib/queries";
import { distributorDecideRequest } from "../../lib/api";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt } from "../../lib/i18n";
import { formatINR, formatDateTime } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";

type CashLiveRow = {
  id: string;
  amount: string;
  approved_amount: string | null;
  txn_date: string;
  status: string;
  created_at: string;
  retailer: { full_name: string; retailer_code: string | null } | null;
  submitter: { full_name: string; role: string } | null;
  account: { name: string } | null;
};

async function getDistributorCashLive(distributorId: string): Promise<CashLiveRow[]> {
  const { data, error } = await supabase
    .from("cash_submissions")
    .select(
      `id, amount, approved_amount, txn_date, status, created_at,
       retailer:retailer_id(full_name, retailer_code),
       submitter:submitted_by(full_name, role),
       account:account_id(name)`,
    )
    .eq("distributor_id", distributorId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as CashLiveRow[];
}

function cashBadge(status: string, t: (k: string) => string): { tone: BadgeTone; label: string } {
  if (status === "approved") return { tone: "ok", label: t("status.approved") };
  if (status === "declined") return { tone: "neg", label: t("status.declined") };
  return { tone: "warn", label: t("status.pending") };
}

export default function Approvals() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [fosPending, setFosPending] = useState<RequestRow[]>([]);
  const [cashLive, setCashLive] = useState<CashLiveRow[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const [reqs, fosP, cash] = await Promise.all([
      getDistributorPendingRequests(profile.id),
      getDistributorFosPendingRequests(profile.id),
      getDistributorCashLive(profile.id),
    ]);
    setRequests(reqs);
    setFosPending(fosP);
    setCashLive(cash);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "money_requests", filter: `distributor_id=eq.${profile.id}` },
          { table: "cash_submissions", filter: `distributor_id=eq.${profile.id}` },
        ]
      : [],
    load,
  );

  if (!profile) return null;

  return (
    <LinenScreen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      topbar={<Topbar title={t("appr.title")} locale={locale} />}
    >
      <SectionLabel locale={locale}>
        {fmt(t("appr.requests"), { n: requests.length })}
      </SectionLabel>
      {requests.length === 0 ? (
        <Empty
          icon={<Inbox size={26} color={TH.ink3} />}
          title={t("appr.empty.requests.title")}
          sub={t("appr.empty.requests.sub")}
          locale={locale}
        />
      ) : (
        requests.map((r) => <ApprRequestCard key={r.id} request={r} onDone={load} locale={locale} />)
      )}

      {fosPending.length > 0 ? (
        <>
          <SectionLabel locale={locale}>
            {fmt(t("appr.fos_pending"), { n: fosPending.length })}
          </SectionLabel>
          <Text
            style={{
              fontSize: 12.5,
              color: TH.ink2,
              lineHeight: 19,
              fontFamily: font(500, locale),
              marginBottom: 12,
              marginHorizontal: 4,
            }}
          >
            {t("appr.fos_pending.note")}
          </Text>
          {fosPending.map((r) => (
            <ApprRequestCard key={r.id} request={r} onDone={load} locale={locale} awaitingFos />
          ))}
        </>
      ) : null}

      <SectionLabel locale={locale}>
        {fmt(t("dist.cash_live"), { n: cashLive.length })}
      </SectionLabel>
      <Text
        style={{
          fontSize: 12.5,
          color: TH.ink2,
          lineHeight: 19,
          fontFamily: font(500, locale),
          marginBottom: 12,
          marginHorizontal: 4,
        }}
      >
        {t("dist.cash_live.note")}
      </Text>
      {cashLive.length === 0 ? (
        <Empty
          icon={<Check size={26} color={TH.accentInk} />}
          title={t("appr.empty.cash.title")}
          locale={locale}
        />
      ) : (
        cashLive.map((c) => {
          const badge = cashBadge(c.status, t);
          return (
            <Row
              key={c.id}
              title={
                <>
                  {formatINR(c.approved_amount ?? c.amount)}
                  <Text style={{ color: TH.ink2, fontFamily: font(500, locale) }}>
                    {" "}
                    · {c.retailer?.retailer_code ?? ""} {c.retailer?.full_name ?? ""}
                  </Text>
                </>
              }
              sub={`${c.account?.name ?? "—"} · ${c.submitter?.full_name ?? "—"} · ${t("appr.txn")} ${c.txn_date} · ${formatDateTime(c.created_at)}`}
              right={
                <Badge tone={badge.tone} locale={locale}>
                  {badge.label}
                </Badge>
              }
              locale={locale}
            />
          );
        })
      )}
    </LinenScreen>
  );
}

function ApprRequestCard({
  request,
  onDone,
  locale,
  awaitingFos = false,
}: {
  request: RequestRow;
  onDone: () => void;
  locale: "en" | "hi" | "gu";
  awaitingFos?: boolean;
}) {
  const { t } = useT();
  const initial = Number(request.fos_amount ?? request.requested_amount);
  const [amount, setAmount] = useState(String(Math.round(initial)));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | "decline" | "approve">(null);
  const [error, setError] = useState<string | null>(null);
  const edited = Math.abs(Number(amount) - initial) > 0.5;

  async function decide(decision: "approve" | "decline") {
    setError(null);
    setBusy(decision);
    const r = await distributorDecideRequest({
      requestId: request.id,
      decision,
      amount:
        decision === "approve" && edited && Number(amount) > 0
          ? Number(amount)
          : undefined,
      notes: notes || undefined,
    });
    setBusy(null);
    if ("error" in r) setError(r.error);
    else onDone();
  }

  return (
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
            style={{ fontSize: 16, fontFamily: font(800, locale), color: TH.ink }}
          >
            {request.retailer?.full_name ?? "?"}
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: TH.ink2,
              marginTop: 1,
              fontFamily: font(600, locale),
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
          alignItems: "center",
          marginTop: 10,
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <Badge tone={awaitingFos || request.fos_status === "edited" ? "warn" : "ok"} locale={locale}>
          {awaitingFos
            ? t("appr.awaiting_fos")
            : request.fos_status === "edited"
              ? t("appr.fos_edited")
              : t("appr.fos_accepted")}
        </Badge>
        <Text style={{ fontSize: 12.5, color: TH.ink2, fontFamily: font(500, locale) }}>
          {request.fos?.full_name ?? ""} · {formatDateTime(request.created_at)}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 10,
          marginVertical: 12,
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
        {request.fos_amount && request.fos_amount !== request.requested_amount && (
          <Text
            style={{
              fontFamily: font(500, "en", "num"),
              fontSize: 13,
              color: TH.ink3,
              textDecorationLine: "line-through",
            }}
          >
            {formatINR(request.requested_amount)}
          </Text>
        )}
      </View>

      {request.fos_notes ? (
        <View
          style={{
            backgroundColor: TH.surface2,
            borderRadius: TH.rSm,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 13, color: TH.ink, fontFamily: font(500, locale) }}>
            <Text style={{ color: TH.ink2, fontFamily: font(700, locale) }}>{t("appr.fos_note")}: </Text>
            {request.fos_notes}
          </Text>
        </View>
      ) : null}

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
        placeholder=""
        locale={locale}
      />
      {error && <InlineErr locale={locale}>{error}</InlineErr>}

      <View style={{ flexDirection: "row", gap: 9, marginTop: 14 }}>
        <Btn
          title={t("appr.decline")}
          onPress={() => decide("decline")}
          variant="danger"
          loading={busy === "decline"}
          locale={locale}
        />
        <Btn
          title={edited ? t("appr.approve_edited") : t("appr.approve")}
          icon={<Check size={18} color={TH.onAccent} strokeWidth={2.4} />}
          onPress={() => decide("approve")}
          loading={busy === "approve"}
          locale={locale}
        />
      </View>
    </Card>
  );
}
