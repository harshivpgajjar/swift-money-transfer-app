"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retailerSubmitCash, retailerSubmitCashCombined } from "@/lib/actions/cash";
import { todayIso } from "@/lib/format";
import { useT, fmt } from "@/lib/i18n";
import { formatINR } from "@/lib/utils";
import {
  Btn,
  CashAmountEntry,
  Field,
  Icon,
  InlineErr,
  Segmented,
  SuccessView,
} from "@/lib/ui";

type AccountOpt = { id: string; slug: string; name: string; outstanding: number };

const COMBINED = "__combined__";

export default function RetailerCashForm({ accounts }: { accounts: AccountOpt[] }) {
  const { t } = useT();
  const router = useRouter();
  const [account, setAccount] = useState(COMBINED); // Combined is the default
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();

  const isCombined = account === COMBINED;
  const cur = accounts.find((a) => a.id === account);
  const totalDue = accounts.reduce((s, a) => s + Math.max(a.outstanding, 0), 0);
  const outstanding = isCombined ? totalDue : (cur?.outstanding ?? 0);

  const submit = () => {
    setErr("");
    if (!Number(amount)) {
      setErr(t("cash.err.amount"));
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("amount", amount);
      fd.set("txn_date", date);
      fd.set("notes", notes);
      let r;
      if (isCombined) {
        r = await retailerSubmitCashCombined(fd);
      } else {
        fd.set("account_id", account);
        r = await retailerSubmitCash(fd);
      }
      if ("error" in r) setErr(r.error);
      else setDone(true);
    });
  };

  if (done) {
    return (
      <SuccessView
        title={t("cash.success")}
        amount={amount}
        sub={fmt(t("cash.success.sub"), {
          account: isCombined ? t("cash.combined") : (cur?.name ?? ""),
        })}
        onDone={() => router.push("/retailer")}
        doneLabel={t("common.done")}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p className="lead">{t("cash.lead")}</p>
      <div className="card">
        <div>
          <div className="field-label" style={{ marginLeft: 3 }}>
            {t("request.account")}
          </div>
          <Segmented
            options={[
              { value: COMBINED, label: t("cash.combined.seg") },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ]}
            value={account}
            onChange={setAccount}
          />
          {isCombined ? (
            <>
              <div className="out-line">
                <span>{t("cash.total_due")}</span>
                <b>{formatINR(totalDue)}</b>
              </div>
              {accounts.map((a) => (
                <div className="out-line" key={a.id} style={{ marginTop: 8 }}>
                  <span className="muted">{a.name}</span>
                  <b style={{ fontSize: 14.5 }}>{formatINR(a.outstanding)}</b>
                </div>
              ))}
              <p className="fmt-list" style={{ marginTop: 10 }}>
                {t("cash.combined.note")}
              </p>
            </>
          ) : (
            cur && (
              <div className="out-line">
                <span>{fmt(t("cash.outstanding_for"), { account: cur.name })}</span>
                <b>{formatINR(cur.outstanding)}</b>
              </div>
            )
          )}
        </div>
        <div className="spacer" />
        <CashAmountEntry
          amount={amount}
          setAmount={setAmount}
          outstanding={outstanding}
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
      <div className="spacer" />
      <Btn
        onClick={submit}
        busy={busy}
        busyLabel={t("cash.submitting")}
        disabled={!Number(amount)}
      >
        <Icon name="cash" size={19} /> {t("cash.submit")}
      </Btn>
    </div>
  );
}
