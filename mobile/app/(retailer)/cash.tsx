import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Banknote } from "lucide-react-native";
import { LinenScreen, LinenSpacer } from "../../components/LinenScreen";
import { Topbar, Btn, Bold } from "../../components/linen";
import {
  Card,
  AmountBox,
  Field,
  Segmented,
  InlineErr,
  PayFullButton,
  Divider,
  OutLine,
  Lead,
} from "../../components/linen/extras";
import { SuccessView } from "../../components/linen/more";
import {
  DenomCounter,
  denomTotal,
  type DenomCounts,
} from "../../components/linen/DenomCounter";
import { useAuth } from "../../lib/auth";
import { fetchAccounts, fetchLatestClosingPerAccount } from "../../lib/accounts";
import { retailerSubmitCash, retailerSubmitCashCombined } from "../../lib/api";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt, type Locale } from "../../lib/i18n";
import { T as TH, font } from "../../lib/theme";
import type { Account } from "../../lib/types";
import { formatINR } from "../../lib/format";

/** Render an i18n template, bolding each `{placeholder}` value (design <b>…</b>). */
function richFmt(
  template: string,
  values: Record<string, string>,
  locale: Locale,
): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m ? (
      <Bold key={i} locale={locale}>
        {values[m[1]] ?? ""}
      </Bold>
    ) : (
      part
    );
  });
}

const COMBINED = "__combined__";

export default function RetailerCash() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>(COMBINED); // Combined is the default
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sentAmount, setSentAmount] = useState(0);
  const [mode, setMode] = useState<"amount" | "notes">("amount");
  const [denoms, setDenoms] = useState<DenomCounts>({});

  const load = useCallback(async () => {
    if (!profile?.distributor_id) return;
    const [list, b] = await Promise.all([
      fetchAccounts(profile.distributor_id),
      fetchLatestClosingPerAccount(profile.id),
    ]);
    setAccounts(list);
    setBalances(b);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [{ table: "daily_balances", filter: `retailer_id=eq.${profile.id}` }]
      : [],
    load,
  );

  if (!profile) return null;

  const isCombined = accountId === COMBINED;
  const selected = accounts.find((a) => a.id === accountId);
  const totalDue = accounts.reduce(
    (s, a) => s + Math.max(balances.get(a.id) ?? 0, 0),
    0,
  );
  const outstanding = isCombined ? totalDue : balances.get(accountId) ?? 0;
  const effectiveAmount = mode === "notes" ? denomTotal(denoms) : Number(amount);

  async function submit() {
    if (!profile?.distributor_id) return;
    if (!effectiveAmount || effectiveAmount <= 0) {
      setError(t("cash.err.amount"));
      return;
    }
    setError(null);
    setPending(true);
    const r = isCombined
      ? await retailerSubmitCashCombined({
          retailerId: profile.id,
          distributorId: profile.distributor_id,
          amount: effectiveAmount,
          txnDate: date,
          notes: notes || undefined,
          accounts: accounts.map((a) => ({
            id: a.id,
            outstanding: balances.get(a.id) ?? 0,
          })),
        })
      : await retailerSubmitCash({
          retailerId: profile.id,
          distributorId: profile.distributor_id,
          accountId,
          amount: effectiveAmount,
          txnDate: date,
          notes: notes || undefined,
        });
    setPending(false);
    if ("error" in r) setError(r.error);
    else {
      setSentAmount(effectiveAmount);
      setDone(true);
      setAmount("");
      setNotes("");
      setDenoms({});
      load();
    }
  }

  if (done) {
    return (
      <LinenScreen topbar={<></>}>
        <SuccessView
          title={t("cash.success")}
          amount={formatINR(sentAmount)}
          sub={richFmt(
            t("cash.success.sub"),
            { account: isCombined ? t("cash.combined") : selected?.name ?? "" },
            locale,
          )}
          doneLabel={t("common.done")}
          onDone={() => {
            setDone(false);
            router.navigate("/(retailer)" as never);
          }}
          locale={locale}
        />
      </LinenScreen>
    );
  }

  return (
    <LinenScreen topbar={<Topbar title={t("cash.title")} locale={locale} />}>
      <Lead locale={locale}>{t("cash.lead")}</Lead>
      <Card>
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
          options={[
            { value: COMBINED, label: t("cash.combined.seg") },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
          value={accountId}
          onChange={setAccountId}
          locale={locale}
        />
        {isCombined ? (
          <>
            <OutLine
              left={t("cash.total_due")}
              right={formatINR(totalDue)}
              locale={locale}
            />
            {accounts.map((a) => (
              <View
                key={a.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 8,
                  paddingHorizontal: 15,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: TH.ink2,
                    fontFamily: font(500, locale),
                  }}
                >
                  {a.name}
                </Text>
                <Text
                  style={{
                    fontFamily: font(700, "en", "num"),
                    fontSize: 14.5,
                    color: TH.ink,
                  }}
                >
                  {formatINR(balances.get(a.id) ?? 0)}
                </Text>
              </View>
            ))}
            <Text
              style={{
                fontSize: 12.5,
                color: TH.ink2,
                fontFamily: font(500, locale),
                marginTop: 10,
                marginLeft: 3,
              }}
            >
              {t("cash.combined.note")}
            </Text>
          </>
        ) : (
          selected && (
            <OutLine
              left={fmt(t("cash.outstanding_for"), { account: selected.name })}
              right={formatINR(outstanding)}
              locale={locale}
            />
          )
        )}

        {/* CashAmountEntry — "Enter amount" / "Count notes" modes */}
        <View style={{ marginTop: 12 }}>
          <Segmented
            options={[
              { value: "amount", label: t("cash.mode.enter") },
              { value: "notes", label: t("cash.mode.count") },
            ]}
            value={mode}
            onChange={setMode}
            locale={locale}
          />
        </View>

        {mode === "amount" ? (
          <>
            <AmountBox value={amount} onChangeText={setAmount} autoFocus />
            {outstanding > 0 && (
              <PayFullButton
                amount={formatINR(outstanding)}
                label={t("cash.pay_full")}
                onPress={() => setAmount(String(Math.round(outstanding)))}
                locale={locale}
              />
            )}
          </>
        ) : (
          <DenomCounter counts={denoms} onChange={setDenoms} locale={locale} />
        )}
        <Divider />
        <Field
          label={t("cash.txn_date")}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          locale={locale}
        />
        <Field
          label={t("cash.notes")}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("cash.notes.placeholder")}
          locale={locale}
        />
        {error && <InlineErr locale={locale}>{error}</InlineErr>}
      </Card>
      <LinenSpacer />
      <Btn
        title={t("cash.submit")}
        busyLabel={t("cash.submitting")}
        loading={pending}
        disabled={!effectiveAmount}
        icon={<Banknote size={19} color={TH.onAccent} />}
        onPress={submit}
        locale={locale}
      />
    </LinenScreen>
  );
}
