"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fosRequestBalance } from "@/lib/actions/requests";
import { useT, fmt } from "@/lib/i18n";
import { formatINR } from "@/lib/utils";
import {
  AmountBox,
  Btn,
  Empty,
  Field,
  Icon,
  InlineErr,
  Segmented,
  Selectt,
  SuccessView,
} from "@/lib/ui";

type AccountOpt = { id: string; name: string };
type RetailerOpt = { id: string; name: string; code: string | null };

export default function FosRequestForm({
  accounts,
  retailers,
  balances,
}: {
  accounts: AccountOpt[];
  retailers: RetailerOpt[];
  balances: Record<string, Record<string, number>>;
}) {
  const { t } = useT();
  const router = useRouter();
  const [retailer, setRetailer] = useState("");
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();

  if (retailers.length === 0) {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <Empty icon="people" title={t("fosreq.none.title")} sub={t("fosreq.none.sub")} />
      </div>
    );
  }

  const current = retailer ? (balances[retailer]?.[account] ?? 0) : 0;
  const after = current + (Number(amount) || 0);

  const submit = () => {
    setErr("");
    if (!retailer) return setErr(t("fosreq.err.retailer"));
    if (!account) return setErr(t("request.err.account"));
    if (!Number(amount)) return setErr(t("request.err.amount"));
    start(async () => {
      const fd = new FormData();
      fd.set("retailer_id", retailer);
      fd.set("account_id", account);
      fd.set("amount", amount);
      fd.set("notes", notes);
      const r = await fosRequestBalance(fd);
      if ("error" in r) setErr(r.error);
      else setDone(true);
    });
  };

  if (done) {
    return (
      <SuccessView
        title={t("fosreq.success")}
        amount={amount}
        sub={t("fosreq.success.sub")}
        onDone={() => router.push("/fos/retailers")}
        doneLabel={t("common.done")}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p className="lead">{t("fosreq.lead")}</p>
      <div className="card">
        <Selectt
          label={t("fosreq.retailer")}
          value={retailer}
          onChange={setRetailer}
          options={[
            { value: "", label: t("fosreq.pick") },
            ...retailers.map((r) => ({
              value: r.id,
              label: r.code ? `${r.name} · ${r.code}` : r.name,
            })),
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <div className="field-label" style={{ marginLeft: 3 }}>
            {t("request.account")}
          </div>
          <Segmented
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            value={account}
            onChange={setAccount}
          />
        </div>
        <AmountBox value={amount} onChange={setAmount} />
        {retailer && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              background: "var(--surface-2)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
            }}
          >
            <span className="muted">{t("fosreq.after")}</span>
            <span>
              <span className="muted">{formatINR(current)} → </span>
              <b>{formatINR(after)}</b>
            </span>
          </div>
        )}
        <Field
          label={t("request.notes")}
          value={notes}
          onChange={setNotes}
          placeholder={t("request.notes.ph")}
        />
        {err && <InlineErr>{err}</InlineErr>}
      </div>
      <div className="spacer" />
      <Btn onClick={submit} busy={busy} busyLabel={t("request.sending")} disabled={!retailer || !Number(amount)}>
        <Icon name="send" size={19} /> {t("fosreq.send")}
      </Btn>
    </div>
  );
}
