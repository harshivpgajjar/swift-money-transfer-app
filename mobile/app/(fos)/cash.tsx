import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Users, Wallet } from "lucide-react-native";
import { LinenScreen, LinenSpacer } from "../../components/LinenScreen";
import { Topbar, Btn, SectionLabel, Bold } from "../../components/linen";
import {
  Card,
  AmountBox,
  Field,
  Segmented,
  InlineErr,
  Empty,
  Row,
  PayFullButton,
  Divider,
  OutLine,
} from "../../components/linen/extras";
import { SuccessView } from "../../components/linen/more";
import {
  DenomCounter,
  denomTotal,
  type DenomCounts,
} from "../../components/linen/DenomCounter";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { fosSubmitCash } from "../../lib/api";
import { fetchAccounts } from "../../lib/accounts";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt } from "../../lib/i18n";
import { formatINR } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";
import type { Account } from "../../lib/types";

type Retailer = { id: string; retailer_code: string | null; full_name: string };

export default function FosCash() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [balanceMap, setBalanceMap] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    amount: number;
    retailerName: string;
    accountName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"amount" | "notes">("amount");
  const [denoms, setDenoms] = useState<DenomCounts>({});

  const load = useCallback(async () => {
    if (!profile?.distributor_id) return;
    const [acctList, retailersRes] = await Promise.all([
      fetchAccounts(profile.distributor_id),
      supabase
        .from("profiles")
        .select("id, retailer_code, full_name")
        .eq("fos_id", profile.id)
        .eq("role", "retailer")
        .eq("active", true)
        .order("retailer_code"),
    ]);
    setAccounts(acctList);
    if (!accountId && acctList.length) setAccountId(acctList[0].id);
    const list = (retailersRes.data ?? []) as Retailer[];
    setRetailers(list);

    if (list.length) {
      const ids = list.map((r) => r.id);
      const { data: balances } = await supabase
        .from("daily_balances")
        .select("retailer_id, account_id, balance_date, closing")
        .in("retailer_id", ids)
        .order("balance_date", { ascending: false });
      const map: Record<string, number> = {};
      for (const b of balances ?? []) {
        const key = `${b.retailer_id}|${b.account_id}`;
        if (!(key in map)) map[key] = Number(b.closing);
      }
      setBalanceMap(map);
    }
  }, [profile, accountId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(profile?.id ? [{ table: "daily_balances" }] : [], load);

  const selectedRetailer = retailers.find((r) => r.id === picked);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const outstanding =
    picked && accountId ? balanceMap[`${picked}|${accountId}`] ?? 0 : 0;
  const effectiveAmount = mode === "notes" ? denomTotal(denoms) : Number(amount);

  async function submit() {
    setError(null);
    if (!profile?.distributor_id || !accountId || !picked) return;
    if (!effectiveAmount || effectiveAmount <= 0) {
      setError(t("cash.err.amount"));
      return;
    }
    setBusy(true);
    const r = await fosSubmitCash({
      retailerId: picked,
      fosId: profile.id,
      distributorId: profile.distributor_id,
      accountId,
      amount: effectiveAmount,
      txnDate: date,
      notes: notes || undefined,
    });
    setBusy(false);
    if ("error" in r) setError(r.error);
    else {
      setDone({
        amount: effectiveAmount,
        retailerName: selectedRetailer?.full_name ?? "",
        accountName: selectedAccount?.name ?? "",
      });
      setAmount("");
      setNotes("");
      setDenoms({});
      setPicked(null);
      load();
    }
  }

  if (done) {
    // "Recorded against <b>{name}</b> on {account}…" — bold name per design
    const [subBefore, subAfter = ""] = t("foscash.success.sub").split("{name}");
    return (
      <LinenScreen topbar={<></>}>
        <SuccessView
          title={t("cash.success")}
          amount={formatINR(done.amount)}
          sub={
            <>
              {fmt(subBefore, { account: done.accountName })}
              <Bold locale={locale}>{done.retailerName}</Bold>
              {fmt(subAfter, { account: done.accountName })}
            </>
          }
          doneLabel={t("common.done")}
          onDone={() => {
            setDone(null);
            router.replace("/(fos)" as never);
          }}
          locale={locale}
        />
      </LinenScreen>
    );
  }

  return (
    <LinenScreen topbar={<Topbar title={t("foscash.title")} locale={locale} />}>
      <Text
        style={{
          fontSize: 13.5,
          fontFamily: font(600, locale),
          color: TH.ink2,
          marginBottom: 7,
          marginLeft: 3,
        }}
      >
        {t("foscash.account")}
      </Text>
      <Segmented
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={accountId ?? ""}
        onChange={setAccountId}
        locale={locale}
      />

      <SectionLabel locale={locale}>{t("foscash.pick_retailer")}</SectionLabel>
      {retailers.length === 0 ? (
        <Empty
          icon={<Users size={26} color={TH.ink3} />}
          title={t("foscash.empty.title")}
          sub={t("foscash.empty.sub")}
          locale={locale}
        />
      ) : (
        retailers.map((r) => {
          const out = accountId ? balanceMap[`${r.id}|${accountId}`] ?? 0 : 0;
          return (
            <Row
              key={r.id}
              title={r.full_name}
              sub={r.retailer_code ?? ""}
              selected={picked === r.id}
              onPress={() => {
                setPicked(r.id);
                setAmount("");
                setDenoms({});
              }}
              right={
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      fontFamily: font(600, "en", "num"),
                      fontSize: 16,
                      color: TH.ink,
                    }}
                  >
                    {formatINR(out)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10.5,
                      color: TH.ink3,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      fontFamily: font(700, locale),
                      marginTop: 1,
                    }}
                  >
                    {t("foscash.outstanding")}
                  </Text>
                </View>
              }
              locale={locale}
            />
          );
        })
      )}

      {selectedRetailer && selectedAccount && (
        <Card style={{ marginTop: 14 }}>
          <OutLine
            left={`${selectedRetailer.full_name} · ${selectedAccount.name}`}
            right={formatINR(outstanding)}
            locale={locale}
          />
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
      )}

      {selectedRetailer && (
        <>
          <LinenSpacer />
          <Btn
            title={t("cash.submit")}
            busyLabel={t("cash.submitting")}
            icon={<Wallet size={19} color={TH.onAccent} />}
            disabled={!effectiveAmount}
            loading={busy}
            onPress={submit}
            locale={locale}
          />
        </>
      )}
    </LinenScreen>
  );
}
