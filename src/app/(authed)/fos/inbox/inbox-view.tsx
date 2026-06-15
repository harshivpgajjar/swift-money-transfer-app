"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fosReviewRequest } from "@/lib/actions/requests";
import { fosDecideCash } from "@/lib/actions/cash";
import { useT, fmt } from "@/lib/i18n";
import { formatShortDate, formatShortDateTime } from "@/lib/format";
import { formatINR } from "@/lib/utils";
import { Btn, Empty, Field, Icon, SectionLabel, Segmented, Toast, type ToastMsg } from "@/lib/ui";
import type { RequestFosStatus, ApprovalStatus } from "@/lib/types";

type PendingItem = {
  id: string;
  retailerName: string;
  retailerCode: string;
  account: string;
  accountId: string;
  requested: number;
  submitted: string;
};
type AccountOpt = { id: string; name: string };
type RecentItem = {
  id: string;
  retailerName: string;
  retailerCode: string;
  requested: number;
  approved: number;
  fosStatus: RequestFosStatus;
  distStatus: ApprovalStatus;
  when: string;
};

function InboxCard({
  item,
  accounts,
  onResolve,
}: {
  item: PendingItem;
  accounts: AccountOpt[];
  onResolve: (id: string, kind: "decline" | "edited" | "accept", amount: number, notes: string, accountId: string) => Promise<string | null>;
}) {
  const { t } = useT();
  const [amt, setAmt] = useState(String(item.requested));
  const [account, setAccount] = useState(item.accountId);
  const [notes, setNotes] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const amountEdited = Number(amt) !== item.requested;
  const accountEdited = account !== item.accountId;
  const edited = amountEdited || accountEdited;

  const act = async (kind: "decline" | "edited" | "accept") => {
    setErr("");
    setBusy(kind);
    const error = await onResolve(item.id, kind, Number(amt), notes, account);
    if (error) {
      setErr(error);
      setBusy(null);
      return;
    }
    setLeaving(true);
  };

  return (
    <div className={"card appr" + (leaving ? " leaving" : "")}>
      <div className="appr-head">
        <div>
          <div className="appr-name">{item.retailerName}</div>
          <div className="appr-code">{item.retailerCode}</div>
        </div>
        <span className="appr-acct">{item.account}</span>
      </div>
      <div className="appr-amtrow">
        <span className="appr-amt">{formatINR(item.requested)}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {t("inbox.requested")} · {formatShortDateTime(item.submitted)}
        </span>
      </div>
      <div className="appr-edit">
        {accounts.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <div className="field-label" style={{ marginLeft: 3 }}>
              {t("request.account")}
            </div>
            <Segmented
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={account}
              onChange={setAccount}
            />
          </div>
        )}
        <Field
          label={t("inbox.edit_amount")}
          value={amt}
          onChange={(v) => setAmt(v.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          prefix="₹"
        />
        <Field
          label={t("appr.notes")}
          value={notes}
          onChange={setNotes}
          placeholder={t("inbox.notes.ph")}
        />
      </div>
      {err && (
        <div className="inline-err">
          <Icon name="bell" size={15} w={2.2} />
          {err}
        </div>
      )}
      {/* Two actions only: Decline, and a primary button that flips to
          "Send edited" the moment the amount or account is changed. */}
      <div className="appr-actions two">
        <Btn
          variant="danger"
          onClick={() => act("decline")}
          busy={busy === "decline"}
          busyLabel="…"
        >
          {t("inbox.decline")}
        </Btn>
        {edited ? (
          <Btn
            variant="primary"
            onClick={() => act("edited")}
            busy={busy === "edited"}
            busyLabel="…"
            disabled={!Number(amt)}
          >
            <Icon name="check" size={18} w={2.4} /> {t("inbox.send_edited")}
          </Btn>
        ) : (
          <Btn
            variant="primary"
            onClick={() => act("accept")}
            busy={busy === "accept"}
            busyLabel="…"
          >
            <Icon name="check" size={18} w={2.4} /> {t("inbox.accept")}{" "}
            {formatINR(item.requested)}
          </Btn>
        )}
      </div>
    </div>
  );
}

type CashItem = {
  id: string;
  retailerName: string;
  retailerCode: string;
  account: string;
  by: string;
  submitted: string;
  txn: string;
  amount: number;
  note: string | null;
};

function FosCashCard({
  item,
  onResolve,
}: {
  item: CashItem;
  onResolve: (id: string, kind: "approve" | "decline", amount: number, notes: string) => Promise<string | null>;
}) {
  const { t } = useT();
  const [approveAs, setApproveAs] = useState(String(item.amount));
  const [notes, setNotes] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const edited = Number(approveAs) !== item.amount;

  const act = async (kind: "approve" | "decline") => {
    setErr("");
    setBusy(kind);
    const error = await onResolve(item.id, kind, Number(approveAs), notes);
    if (error) {
      setErr(error);
      setBusy(null);
      return;
    }
    setLeaving(true);
  };

  return (
    <div className={"card appr" + (leaving ? " leaving" : "")}>
      <div className="appr-head">
        <div>
          <div className="appr-name">{item.retailerName}</div>
          <div className="appr-code">{item.retailerCode}</div>
        </div>
        <span className="appr-acct">{item.account}</span>
      </div>
      <div className="appr-meta">
        {fmt(t("appr.submitted_by"), { name: item.by })} ·{" "}
        {formatShortDateTime(item.submitted)} · {t("appr.txn")} {formatShortDate(item.txn)}
      </div>
      <div className="appr-amtrow">
        <span className="appr-amt">{formatINR(item.amount)}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {t("appr.reported")}
        </span>
      </div>
      {item.note && (
        <div className="appr-note">
          <b>{t("appr.note")}:</b> {item.note}
        </div>
      )}
      <div className="appr-edit">
        <Field
          label={t("appr.approve_as")}
          value={approveAs}
          onChange={(v) => setApproveAs(v.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          prefix="₹"
        />
        <Field
          label={t("appr.notes")}
          value={notes}
          onChange={setNotes}
          placeholder={t("appr.notes.ph")}
        />
      </div>
      {err && (
        <div className="inline-err">
          <Icon name="bell" size={15} w={2.2} />
          {err}
        </div>
      )}
      <div className="appr-actions two">
        <Btn
          variant="danger"
          onClick={() => act("decline")}
          busy={busy === "decline"}
          busyLabel="…"
        >
          {t("appr.decline")}
        </Btn>
        <Btn
          variant="primary"
          onClick={() => act("approve")}
          busy={busy === "approve"}
          busyLabel="…"
          disabled={!Number(approveAs)}
        >
          {edited ? t("appr.approve_edited") : t("appr.approve")}
        </Btn>
      </div>
    </div>
  );
}

export default function InboxView({
  autoApprove,
  accounts,
  pending,
  pendingCash,
  recent,
}: {
  autoApprove: boolean;
  accounts: AccountOpt[];
  pending: PendingItem[];
  pendingCash: CashItem[];
  recent: RecentItem[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastMsg>(null);
  const [, start] = useTransition();

  const resolve = async (
    id: string,
    kind: "decline" | "edited" | "accept",
    amount: number,
    notes: string,
    accountId: string,
  ): Promise<string | null> => {
    const fd = new FormData();
    fd.set("request_id", id);
    fd.set("decision", kind === "edited" ? "edit" : kind);
    if (kind === "edited") fd.set("amount", String(amount));
    if (notes) fd.set("notes", notes);
    if (accountId) fd.set("account_id", accountId);
    const r = await fosReviewRequest(fd);
    if ("error" in r) return r.error;
    setTimeout(() => {
      setResolved((s) => new Set(s).add(id));
      setToast({
        msg:
          kind === "decline"
            ? t("inbox.decline")
            : kind === "edited"
              ? t("inbox.send_edited")
              : t("inbox.accept"),
        kind: kind === "decline" ? "neg" : "ok",
      });
      start(() => router.refresh());
    }, 350);
    return null;
  };

  const resolveCash = async (
    id: string,
    kind: "approve" | "decline",
    amount: number,
    notes: string,
  ): Promise<string | null> => {
    const fd = new FormData();
    fd.set("cash_id", id);
    fd.set("decision", kind);
    if (kind === "approve") fd.set("amount", String(amount));
    if (notes) fd.set("notes", notes);
    const r = await fosDecideCash(fd);
    if ("error" in r) return r.error;
    setTimeout(() => {
      setResolved((s) => new Set(s).add(id));
      setToast({
        msg: kind === "decline" ? t("badge.declined") : t("badge.approved"),
        kind: kind === "decline" ? "neg" : "ok",
      });
      start(() => router.refresh());
    }, 350);
    return null;
  };

  const visible = pending.filter((p) => !resolved.has(p.id));
  const visibleCash = pendingCash.filter((c) => !resolved.has(c.id));

  const fosBadge = (s: RequestFosStatus) =>
    s === "accepted"
      ? { k: "ok", t: t("badge.accepted") }
      : s === "edited"
        ? { k: "ok", t: t("badge.edited") }
        : s === "declined"
          ? { k: "neg", t: t("badge.declined") }
          : { k: "warn", t: t("badge.pending") };
  const distBadge = (fos: RequestFosStatus, dist: ApprovalStatus) => {
    if (fos === "declined") return { k: "mute", t: "—" };
    if (dist === "approved") return { k: "ok", t: t("badge.approved") };
    if (dist === "declined") return { k: "neg", t: t("badge.declined") };
    return { k: "warn", t: t("badge.pending") };
  };

  return (
    <div>
      {autoApprove && (
        <div className="helper-note" style={{ marginBottom: 16 }}>
          <b>{t("fos.aa_title")}</b> {t("fos.aa_body")}
        </div>
      )}
      <SectionLabel style={{ marginTop: 4 }}>
        {fmt(t("inbox.pending"), { n: visible.length })}
      </SectionLabel>
      <div className="web-appr-grid">
        {visible.map((it) => (
          <InboxCard key={it.id} item={it} accounts={accounts} onResolve={resolve} />
        ))}
      </div>
      {visible.length === 0 && (
        <Empty icon="check" title={t("inbox.empty.title")} sub={t("inbox.empty.sub")} />
      )}

      <SectionLabel>{fmt(t("appr.cash"), { n: visibleCash.length })}</SectionLabel>
      <div className="web-appr-grid">
        {visibleCash.map((it) => (
          <FosCashCard key={it.id} item={it} onResolve={resolveCash} />
        ))}
      </div>
      {visibleCash.length === 0 && (
        <Empty
          icon="check"
          title={t("appr.empty.cash.title")}
          sub={t("appr.empty.cash.sub")}
        />
      )}

      <SectionLabel>{fmt(t("inbox.recent"), { n: recent.length })}</SectionLabel>
      {recent.length ? (
        recent.map((r) => {
          const fb = fosBadge(r.fosStatus);
          const db = distBadge(r.fosStatus, r.distStatus);
          return (
            <div className="row" key={r.id}>
              <div className="row-main">
                <div className="row-title">
                  {r.retailerCode} · {r.retailerName}
                </div>
                <div className="row-sub">
                  {r.approved !== r.requested && r.approved > 0 ? (
                    <>
                      req {formatINR(r.requested)} → {formatINR(r.approved)} ·{" "}
                      {formatShortDate(r.when)}
                    </>
                  ) : (
                    <>
                      {formatINR(r.requested)} · {formatShortDate(r.when)}
                    </>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  alignItems: "flex-end",
                }}
              >
                <span className={"badge " + fb.k}>{fb.t}</span>
                <span className={"badge " + db.k}>{db.t}</span>
              </div>
            </div>
          );
        })
      ) : (
        <Empty icon="clock" title={t("history.empty.req")} />
      )}

      <Toast msg={toast?.msg} kind={toast?.kind} onDone={() => setToast(null)} />
    </div>
  );
}
