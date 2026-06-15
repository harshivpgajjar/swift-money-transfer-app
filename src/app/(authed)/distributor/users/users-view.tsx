"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignRetailerToFos,
  createFos,
  createRetailer,
  setActive,
  setAllFosAutoApprove,
  setFosAutoApprove,
} from "@/lib/actions/users";
import { useT, fmt } from "@/lib/i18n";
import { formatShortDate } from "@/lib/format";
import {
  AccCard,
  Btn,
  Field,
  InlineErr,
  SectionLabel,
  Selectt,
  Switch,
  Toast,
  type ToastMsg,
} from "@/lib/ui";

type FosItem = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  autoApprove: boolean;
  joined: string;
};
type RetailerItem = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  active: boolean;
  needsAssignment: boolean;
  fosId: string | null;
  joined: string;
};

function CreateFosForm({ onDone }: { onDone: (msg: string) => void }) {
  const { t } = useT();
  const [f, setF] = useState({ name: "", email: "", phone: "", pwd: "" });
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const up = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const submit = () => {
    if (!f.name || !f.email) return;
    setErr("");
    start(async () => {
      const fd = new FormData();
      fd.set("full_name", f.name);
      fd.set("email", f.email);
      fd.set("phone", f.phone);
      fd.set("password", f.pwd);
      const r = await createFos(fd);
      if ("error" in r) setErr(r.error);
      else {
        setF({ name: "", email: "", phone: "", pwd: "" });
        onDone(t("users.toast.fos_created"));
      }
    });
  };

  return (
    <div>
      <Field label={t("users.name")} value={f.name} onChange={up("name")} placeholder="e.g. Sita Verma" />
      <Field label={t("users.email")} value={f.email} onChange={up("email")} placeholder="name@swift.in" inputMode="email" />
      <Field label={t("users.phone_optional")} value={f.phone} onChange={up("phone")} placeholder="+91 …" inputMode="tel" />
      <Field label={t("users.password")} value={f.pwd} onChange={up("pwd")} type="password" placeholder={t("users.pwd_hint")} />
      {err && <InlineErr>{err}</InlineErr>}
      <Btn onClick={submit} busy={busy} busyLabel={t("users.creating")} disabled={!f.name || !f.email || f.pwd.length < 8}>
        {t("users.create_fos")}
      </Btn>
    </div>
  );
}

function CreateRetailerForm({
  fosOptions,
  onDone,
}: {
  fosOptions: { value: string; label: string }[];
  onDone: (msg: string) => void;
}) {
  const { t } = useT();
  const [f, setF] = useState({ code: "", name: "", email: "", phone: "", pwd: "", fos: "" });
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const up = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const submit = () => {
    if (!f.code || !f.name) return;
    setErr("");
    start(async () => {
      const fd = new FormData();
      fd.set("retailer_code", f.code);
      fd.set("full_name", f.name);
      fd.set("email", f.email);
      fd.set("phone", f.phone);
      fd.set("password", f.pwd);
      if (f.fos) fd.set("fos_id", f.fos);
      const r = await createRetailer(fd);
      if ("error" in r) setErr(r.error);
      else {
        setF({ code: "", name: "", email: "", phone: "", pwd: "", fos: "" });
        onDone(t("users.toast.retailer_created"));
      }
    });
  };

  return (
    <div>
      <Field label={t("users.retailer_code")} value={f.code} onChange={up("code")} placeholder="e.g. RT-2101" />
      <Field label={t("users.name")} value={f.name} onChange={up("name")} placeholder="Shop / owner name" />
      <Field label={t("users.email")} value={f.email} onChange={up("email")} placeholder="name@shop.in" inputMode="email" />
      <Field label={t("users.phone")} value={f.phone} onChange={up("phone")} placeholder="+91 …" inputMode="tel" />
      <Field label={t("users.password")} value={f.pwd} onChange={up("pwd")} type="password" placeholder={t("users.pwd_hint")} />
      <Selectt
        label={t("users.fos_assign")}
        value={f.fos}
        onChange={up("fos")}
        options={[{ value: "", label: t("users.unassigned") }, ...fosOptions]}
      />
      {err && <InlineErr>{err}</InlineErr>}
      <Btn onClick={submit} busy={busy} busyLabel={t("users.creating")} disabled={!f.code || !f.name || !f.email || f.pwd.length < 8}>
        {t("users.create_retailer")}
      </Btn>
    </div>
  );
}

export default function UsersView({
  fos,
  retailers,
}: {
  fos: FosItem[];
  retailers: RetailerItem[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [toast, setToast] = useState<ToastMsg>(null);
  const [pendingAssign, setPendingAssign] = useState<{
    retailerId: string;
    retailerName: string;
    fosId: string;
    fosName: string | null;
  } | null>(null);
  const [, start] = useTransition();

  const notify = (msg: string, kind: "ok" | "neg" = "ok") => {
    setToast({ msg, kind });
    start(() => router.refresh());
  };

  const toggleAuto = async (id: string, next: boolean) => {
    const fd = new FormData();
    fd.set("fos_id", id);
    fd.set("auto_approve", String(next));
    const r = await setFosAutoApprove(fd);
    notify("error" in r ? r.error : t("users.auto_approve") + (next ? " ✓" : " ✗"), "error" in r ? "neg" : "ok");
  };

  const bulkAuto = async (on: boolean) => {
    const fd = new FormData();
    fd.set("auto_approve", String(on));
    const r = await setAllFosAutoApprove(fd);
    notify("error" in r ? r.error : on ? t("users.toast.auto_all") : t("users.toast.self_all"), "error" in r ? "neg" : "ok");
  };

  const toggleActive = async (id: string, next: boolean) => {
    const fd = new FormData();
    fd.set("user_id", id);
    fd.set("active", String(next));
    const r = await setActive(fd);
    notify("error" in r ? r.error : next ? t("users.activate") + " ✓" : t("users.deactivate") + " ✓", "error" in r ? "neg" : "ok");
  };

  const reassign = async (retailerId: string, fosId: string) => {
    const fd = new FormData();
    fd.set("retailer_id", retailerId);
    if (fosId) fd.set("fos_id", fosId);
    const r = await assignRetailerToFos(fd);
    notify("error" in r ? r.error : t("users.toast.reassigned"), "error" in r ? "neg" : "ok");
  };

  const fosOptions = fos.map((f) => ({ value: f.id, label: f.name }));

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionLabel style={{ marginTop: 4 }}>{t("users.create_section")}</SectionLabel>
      <AccCard icon="user" title={t("users.create_fos")}>
        <CreateFosForm onDone={notify} />
      </AccCard>
      <AccCard icon="people" title={t("users.create_retailer")}>
        <CreateRetailerForm fosOptions={fosOptions} onDone={notify} />
      </AccCard>

      <SectionLabel>{fmt(t("users.fos_roster"), { n: fos.length })}</SectionLabel>
      <div className="action-row" style={{ marginBottom: 12 }}>
        <Btn variant="soft" onClick={() => bulkAuto(true)} style={{ height: 46, fontSize: 13.5 }}>
          {t("users.bulk_auto_all")}
        </Btn>
        <Btn variant="ghost" onClick={() => bulkAuto(false)} style={{ height: 46, fontSize: 13.5 }}>
          {t("users.bulk_self")}
        </Btn>
      </div>
      {fos.map((f) => (
        <div className="urow" key={f.id}>
          <div className="urow-main">
            <div className="urow-name">
              {f.name}{" "}
              <span className={"badge " + (f.active ? "ok" : "mute")}>
                {f.active ? t("users.status.active") : t("users.status.disabled")}
              </span>
            </div>
            <div className="urow-sub">
              {f.phone ?? "—"} · {t("users.joined")} {formatShortDate(f.joined)}
            </div>
            <div className="toggle-row" style={{ padding: "8px 0 0", borderTop: "none" }}>
              <span className="tr-sub" style={{ marginTop: 0 }}>{t("users.auto_approve")}</span>
              <Switch on={f.autoApprove} onChange={(v) => toggleAuto(f.id, v)} />
            </div>
          </div>
          <button
            type="button"
            className={"mini-btn" + (f.active ? " danger" : "")}
            onClick={() => toggleActive(f.id, !f.active)}
          >
            {f.active ? t("users.deactivate") : t("users.activate")}
          </button>
        </div>
      ))}

      <SectionLabel>{fmt(t("users.retailers"), { n: retailers.length })}</SectionLabel>
      {retailers.map((r) => (
        <div className="urow" key={r.id}>
          <div className="urow-main">
            <div className="urow-name">
              {r.name}{" "}
              <span
                className={
                  "badge " +
                  (r.needsAssignment ? "warn" : r.active ? "ok" : "mute")
                }
              >
                {r.needsAssignment
                  ? t("users.status.needs_fos")
                  : r.active
                    ? t("users.status.active")
                    : t("users.status.disabled")}
              </span>
            </div>
            <div className="urow-sub">
              {r.code} · {r.phone ?? "—"} · {t("users.joined")} {formatShortDate(r.joined)}
            </div>
            <div style={{ marginTop: 8 }}>
              <Selectt
                compact
                value={r.fosId ?? ""}
                onChange={(v) => {
                  if (v === (r.fosId ?? "")) return;
                  setPendingAssign({
                    retailerId: r.id,
                    retailerName: r.name,
                    fosId: v,
                    fosName: fosOptions.find((o) => o.value === v)?.label ?? null,
                  });
                }}
                options={[{ value: "", label: t("users.unassigned") }, ...fosOptions]}
              />
            </div>
          </div>
          <button
            type="button"
            className={"mini-btn" + (r.active ? " danger" : "")}
            onClick={() => toggleActive(r.id, !r.active)}
          >
            {r.active ? t("users.deactivate") : t("users.activate")}
          </button>
        </div>
      ))}

      {pendingAssign && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "grid",
            placeItems: "center",
            background: "color-mix(in srgb, var(--ink) 40%, transparent)",
          }}
          onClick={() => setPendingAssign(null)}
        >
          <div
            className="card"
            style={{ width: 380, maxWidth: "90vw", padding: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>
              {t("users.confirm.title")}
            </div>
            <p className="lead" style={{ margin: "10px 0 18px" }}>
              {pendingAssign.fosName
                ? fmt(t("users.confirm.body"), {
                    retailer: pendingAssign.retailerName,
                    fos: pendingAssign.fosName,
                  })
                : fmt(t("users.confirm.unassign"), {
                    retailer: pendingAssign.retailerName,
                  })}
            </p>
            <div className="appr-actions two" style={{ marginTop: 0 }}>
              <Btn variant="ghost" onClick={() => setPendingAssign(null)}>
                {t("common.cancel")}
              </Btn>
              <Btn
                variant="primary"
                onClick={() => {
                  const p = pendingAssign;
                  setPendingAssign(null);
                  void reassign(p.retailerId, p.fosId);
                }}
              >
                {t("common.confirm")}
              </Btn>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toast?.msg} kind={toast?.kind} onDone={() => setToast(null)} />
    </div>
  );
}
