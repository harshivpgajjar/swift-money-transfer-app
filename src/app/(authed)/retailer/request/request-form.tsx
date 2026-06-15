"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMoneyRequest } from "@/lib/actions/requests";
import { useT, fmt } from "@/lib/i18n";
import {
  AmountBox,
  Btn,
  Empty,
  Field,
  Icon,
  InlineErr,
  Segmented,
  SuccessView,
} from "@/lib/ui";

export type AccountOpt = {
  id: string;
  slug: string;
  name: string;
  outstanding: number;
};

export default function RequestForm({
  accounts,
  fosName,
}: {
  accounts: AccountOpt[];
  fosName: string | null;
}) {
  const { t } = useT();
  const router = useRouter();
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();

  if (!fosName) {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <Empty
          icon="user"
          title={t("request.no_fos.title")}
          sub={t("request.no_fos.sub")}
        />
      </div>
    );
  }

  const submit = () => {
    setErr("");
    if (!account) {
      setErr(t("request.err.account"));
      return;
    }
    if (!Number(amount)) {
      setErr(t("request.err.amount"));
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("account_id", account);
      fd.set("amount", amount);
      fd.set("notes", notes);
      const r = await createMoneyRequest(fd);
      if ("error" in r) setErr(r.error);
      else setDone(true);
    });
  };

  if (done) {
    return (
      <SuccessView
        title={t("request.success")}
        amount={amount}
        sub={fmt(t("request.success.sub"), { fos: fosName })}
        onDone={() => router.push("/retailer")}
        doneLabel={t("common.done")}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p className="lead">
        {fmt(t("request.lead"), { fos: fosName })}
      </p>
      <div className="card">
        <div>
          <div className="field-label" style={{ marginLeft: 3 }}>
            {t("request.account")}
          </div>
          <Segmented
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            value={account}
            onChange={setAccount}
          />
        </div>
        <AmountBox value={amount} onChange={setAmount} autoFocus />
        <Field
          label={t("request.notes")}
          value={notes}
          onChange={setNotes}
          placeholder={t("request.notes.ph")}
        />
        {err && <InlineErr>{err}</InlineErr>}
      </div>
      <div className="spacer" />
      <Btn
        onClick={submit}
        busy={busy}
        busyLabel={t("request.sending")}
        disabled={!Number(amount)}
      >
        <Icon name="send" size={19} /> {t("request.send")}
      </Btn>
    </div>
  );
}
