import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Send, User } from "lucide-react-native";
import { LinenScreen, LinenSpacer } from "../../components/LinenScreen";
import { Topbar, Btn, Bold } from "../../components/linen";
import {
  Card,
  AmountBox,
  Field,
  Segmented,
  InlineErr,
  Empty,
  Lead,
} from "../../components/linen/extras";
import { SuccessView } from "../../components/linen/more";
import { useAuth } from "../../lib/auth";
import { fetchAccounts } from "../../lib/accounts";
import { createMoneyRequest } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { useT, type Locale } from "../../lib/i18n";
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

export default function RetailerRequest() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sentAmount, setSentAmount] = useState("");
  const [fosName, setFosName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.distributor_id) return;
    const list = await fetchAccounts(profile.distributor_id);
    setAccounts(list);
    if (!accountId && list.length) setAccountId(list[0].id);
    if (profile.fos_id) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", profile.fos_id)
        .maybeSingle();
      setFosName(data?.full_name ?? null);
    }
  }, [profile, accountId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile) return null;

  // No-FOS case — empty card per design
  if (!profile.fos_id || !profile.distributor_id) {
    return (
      <LinenScreen topbar={<Topbar title={t("request.title")} locale={locale} />}>
        <Card>
          <Empty
            icon={<User size={28} color={TH.ink3} />}
            title={t("request.no_fos.title")}
            sub={t("request.no_fos.sub")}
            locale={locale}
          />
        </Card>
      </LinenScreen>
    );
  }

  async function submit() {
    if (!profile?.fos_id || !profile?.distributor_id) return;
    if (!accountId) {
      setError(t("request.err.account"));
      return;
    }
    const n = Number(amount);
    if (!n || n <= 0) {
      setError(t("request.err.amount"));
      return;
    }
    setError(null);
    setPending(true);
    const r = await createMoneyRequest({
      retailerId: profile.id,
      fosId: profile.fos_id,
      distributorId: profile.distributor_id,
      accountId,
      amount: n,
      notes: notes || undefined,
    });
    setPending(false);
    if ("error" in r) setError(r.error);
    else {
      setSentAmount(amount);
      setDone(true);
      setAmount("");
      setNotes("");
    }
  }

  if (done) {
    return (
      <LinenScreen topbar={<></>}>
        <SuccessView
          title={t("request.success")}
          amount={formatINR(Number(sentAmount))}
          sub={richFmt(
            t("request.success.sub"),
            { fos: fosName ?? "FOS" },
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
    <LinenScreen topbar={<Topbar title={t("request.title")} locale={locale} />}>
      <Lead locale={locale}>
        {richFmt(t("request.lead"), { fos: fosName ?? "FOS" }, locale)}
      </Lead>
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
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          value={accountId ?? ""}
          onChange={setAccountId}
          locale={locale}
        />
        <AmountBox value={amount} onChangeText={setAmount} autoFocus />
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
        title={t("request.send")}
        busyLabel={t("request.sending")}
        loading={pending}
        disabled={!Number(amount)}
        icon={<Send size={19} color={TH.onAccent} />}
        onPress={submit}
        locale={locale}
      />
    </LinenScreen>
  );
}
