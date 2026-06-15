"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fosSubmitCash } from "@/lib/actions/cash";
import { todayIso } from "@/lib/format";
import { useT, fmt } from "@/lib/i18n";
import { formatINR } from "@/lib/utils";
import {
  Btn,
  CashAmountEntry,
  Empty,
  Field,
  Icon,
  InlineErr,
  SectionLabel,
  Segmented,
  SuccessView,
} from "@/lib/ui";

type AccountOpt = { id: string; slug: string; name: string };
type RetailerOpt = {
  id: string;
  name: string;
  code: string;
  outstanding: Record<string, number>; // accountId → latest closing
};

export default function FosCashForm({
  accounts,
  retailers,
}: {
  accounts: AccountOpt[];
  retailers: RetailerOpt[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [picked, setPicked] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();

  const cur = accounts.find((a) => a.id === account);
  const rt = picked ? retailers.find((r) => r.id === picked) : null;
  const out = rt ? (rt.outstanding[account] ?? 0) : 0;

  const submit = () => {
    setErr("");
    if (!Number(amount)) {
      setErr(t("cash.err.amount"));
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("retailer_id", picked!);
      fd.set("account_id", account);
      fd.set("amount", amount);
      fd.set("txn_date", date);
      fd.set("notes", notes);
      const r = await fosSubmitCash(fd);
      if ("error" in r) setErr(r.error);
      else setDone(true);
    });
  };

  if (done && rt) {
    return (
      <SuccessView
        title={t("cash.success")}
        amount={amount}
        sub={fmt(t("cash.recorded_against"), { name: rt.name, account: cur?.name ?? "" })}
        onDone={() => router.push("/fos")}
        doneLabel={t("common.done")}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="field-label" style={{ marginLeft: 3 }}>
        {t("request.account")}
      </div>
      <Segmented
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={account}
        onChange={setAccount}
      />

      <SectionLabel>{t("cash.pick_retailer")}</SectionLabel>
      {retailers.length ? (
        retailers.map((r) => (
          <button
            type="button"
            className={"row" + (picked === r.id ? " picked" : "")}
            key={r.id}
            onClick={() => {
              setPicked(r.id);
              setAmount("");
            }}
          >
            <div className="row-main">
              <div className="row-title">{r.name}</div>
              <div className="row-sub">{r.code}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="row-val">{formatINR(r.outstanding[account] ?? 0)}</div>
              <div className="out-amt-lbl">{t("cash.outstanding")}</div>
            </div>
          </button>
        ))
      ) : (
        <Empty icon="people" title={t("cash.foscash.empty")} />
      )}

      {rt && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="out-line" style={{ marginTop: 0 }}>
            <span>
              {rt.name} · {cur?.name}
            </span>
            <b>{formatINR(out)}</b>
          </div>
          <CashAmountEntry
            amount={amount}
            setAmount={setAmount}
            outstanding={out}
            labels={{
              enter: t("cash.mode.enter"),
              count: t("cash.mode.count"),
              payFull: t("cash.pay_full"),
              notesCounted: (n) => fmt(t("cash.notes_counted"), { n }),
            }}
          />
          <div className="divider" />
          <Field label={t("cash.txn_date")} value={date} onChange={setDate} type="date" />
          <Field
            label={t("cash.notes")}
            value={notes}
            onChange={setNotes}
            placeholder={t("cash.notes.ph")}
          />
          {err && <InlineErr>{err}</InlineErr>}
        </div>
      )}
      {rt && (
        <>
          <div className="spacer" />
          <Btn
            onClick={submit}
            busy={busy}
            busyLabel={t("cash.submitting")}
            disabled={!Number(amount)}
          >
            <Icon name="cash" size={19} /> {t("cash.submit")}
          </Btn>
        </>
      )}
    </div>
  );
}
