import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Send } from "lucide-react-native";
import { LinenScreen, LinenSpacer } from "../../components/LinenScreen";
import { Topbar, Btn } from "../../components/linen";
import { Card, AmountBox, Field, Segmented, InlineErr, Empty, Lead } from "../../components/linen/extras";
import { Selectt, SuccessView } from "../../components/linen/more";
import { useAuth } from "../../lib/auth";
import { fetchAccounts } from "../../lib/accounts";
import { getFosRetailers } from "../../lib/queries";
import { fosRequestBalance } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { useT } from "../../lib/i18n";
import { T as TH, font } from "../../lib/theme";
import type { Account } from "../../lib/types";
import { formatINR } from "../../lib/format";

export default function FosRequest() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [retailers, setRetailers] = useState<{ id: string; full_name: string; retailer_code: string | null }[]>([]);
  const [balances, setBalances] = useState<Record<string, Record<string, number>>>({});
  const [retailer, setRetailer] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sentAmount, setSentAmount] = useState("");

  const load = useCallback(async () => {
    if (!profile?.distributor_id) return;
    const [accs, rets] = await Promise.all([
      fetchAccounts(profile.distributor_id),
      getFosRetailers(profile.id),
    ]);
    setAccounts(accs);
    if (accs.length) setAccountId((cur) => cur || accs[0].id);
    setRetailers(
      rets.map((r) => ({ id: r.id, full_name: r.full_name, retailer_code: r.retailer_code })),
    );
    const ids = rets.map((r) => r.id);
    if (ids.length) {
      const { data } = await supabase
        .from("daily_balances")
        .select("retailer_id, account_id, closing, balance_date")
        .in("retailer_id", ids)
        .order("balance_date", { ascending: false });
      const map: Record<string, Record<string, number>> = {};
      for (const b of data ?? []) {
        const m = (map[b.retailer_id] ??= {});
        if (!(b.account_id in m)) m[b.account_id] = Number(b.closing);
      }
      setBalances(map);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile) return null;

  if (retailers.length === 0) {
    return (
      <LinenScreen topbar={<Topbar title={t("nav.action")} locale={locale} />}>
        <Card>
          <Empty icon={<Send size={26} color={TH.ink3} />} title={t("fosreq.none.title")} sub={t("fosreq.none.sub")} locale={locale} />
        </Card>
      </LinenScreen>
    );
  }

  const current = retailer ? balances[retailer]?.[accountId] ?? 0 : 0;
  const after = current + (Number(amount) || 0);

  async function submit() {
    if (!retailer) return setError(t("fosreq.err.retailer"));
    if (!accountId) return setError(t("request.err.account"));
    const n = Number(amount);
    if (!n || n <= 0) return setError(t("request.err.amount"));
    setError(null);
    setPending(true);
    const r = await fosRequestBalance({ retailerId: retailer, accountId, amount: n, notes: notes || undefined });
    setPending(false);
    if ("error" in r) setError(r.error);
    else {
      setSentAmount(amount);
      setDone(true);
      setAmount("");
      setNotes("");
      setRetailer("");
    }
  }

  if (done) {
    return (
      <LinenScreen topbar={<></>}>
        <SuccessView
          title={t("fosreq.success")}
          amount={formatINR(Number(sentAmount))}
          sub={t("fosreq.success.sub")}
          doneLabel={t("common.done")}
          onDone={() => {
            setDone(false);
            router.navigate("/(fos)" as never);
          }}
          locale={locale}
        />
      </LinenScreen>
    );
  }

  return (
    <LinenScreen topbar={<Topbar title={t("fosreq.title")} locale={locale} />}>
      <Lead locale={locale}>{t("fosreq.lead")}</Lead>
      <Card>
        <Selectt
          label={t("fosreq.retailer")}
          value={retailer}
          onChange={setRetailer}
          locale={locale}
          options={[
            { value: "", label: t("fosreq.pick") },
            ...retailers.map((r) => ({
              value: r.id,
              label: r.retailer_code ? `${r.full_name} · ${r.retailer_code}` : r.full_name,
            })),
          ]}
        />
        <Text style={{ fontSize: 13.5, fontFamily: font(600, locale), color: TH.ink2, marginBottom: 7, marginLeft: 3 }}>
          {t("request.account")}
        </Text>
        <Segmented
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          value={accountId}
          onChange={setAccountId}
          locale={locale}
        />
        <AmountBox value={amount} onChangeText={setAmount} />
        {retailer ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: TH.bg2, borderRadius: 10, padding: 11, marginBottom: 14 }}>
            <Text style={{ fontSize: 12.5, color: TH.ink3, fontFamily: font(500, locale) }}>{t("fosreq.after")}</Text>
            <Text style={{ fontSize: 13.5, fontFamily: font(700, "en", "num"), color: TH.ink2 }}>
              <Text style={{ color: TH.ink3, fontFamily: font(400, "en", "num") }}>{formatINR(current)} → </Text>
              {formatINR(after)}
            </Text>
          </View>
        ) : null}
        <Field
          label={t("request.notes")}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("request.notes.placeholder")}
          locale={locale}
        />
        {error && <InlineErr locale={locale}>{error}</InlineErr>}
      </Card>
      <LinenSpacer />
      <Btn
        title={t("fosreq.send")}
        busyLabel={t("request.sending")}
        loading={pending}
        disabled={!retailer || !Number(amount)}
        icon={<Send size={19} color={TH.onAccent} />}
        onPress={submit}
        locale={locale}
      />
    </LinenScreen>
  );
}
