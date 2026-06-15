"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAccount,
  changePassword,
  renameAccount,
  saveNotificationPrefs,
  setAccountActive,
  setDefaultFosAutoApprove,
  updateOwnProfile,
} from "@/lib/actions/settings";
import { signOutClient } from "@/lib/sign-out";
import { useT } from "@/lib/i18n";
import { formatShortDate } from "@/lib/format";
import {
  Btn,
  Field,
  Icon,
  KV,
  SectionLabel,
  Selectt,
  Switch,
  Toast,
  ToggleRow,
  type ToastMsg,
} from "@/lib/ui";
import type { UserRole } from "@/lib/types";

type Msg = { k: "ok" | "err"; t: string } | null;

function Inline({ m }: { m: Msg }) {
  if (!m) return null;
  return (
    <div
      className="inline-err"
      style={{ color: m.k === "ok" ? "var(--accent-ink)" : "var(--neg)" }}
    >
      <Icon name={m.k === "ok" ? "check" : "bell"} size={15} w={2.2} />
      {m.t}
    </div>
  );
}

const PW_ERRORS: Record<string, string> = {
  current_required: "settings.pw.err.current",
  wrong_password: "settings.pw.err.wrong",
  too_short: "settings.pw.err.len",
  same_password: "settings.pw.err.same",
};

export default function SettingsView({
  role,
  profile,
  fosName,
  distributorName,
  accounts,
}: {
  role: UserRole;
  profile: {
    name: string;
    email: string;
    phone: string;
    timezone: string;
    memberSince: string;
    retailerCode: string | null;
    autoApprove: boolean;
    defaultFosAutoApprove: boolean;
    notificationPrefs: Record<string, boolean>;
  };
  fosName: string | null;
  distributorName: string | null;
  accounts: { id: string; name: string; slug: string; active: boolean }[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [toast, setToast] = useState<ToastMsg>(null);

  const roleLabel =
    role === "distributor"
      ? t("role.distributor")
      : role === "fos"
        ? t("role.fos")
        : t("role.retailer");

  return (
    <div style={{ maxWidth: 560 }}>
      <SectionLabel style={{ marginTop: 4 }}>{t("settings.account")}</SectionLabel>
      <div className="card">
        <KV l={t("settings.full_name")} v={profile.name} />
        <KV l={t("settings.email")} v={profile.email} />
        <KV l={t("settings.role")} v={roleLabel} />
        <KV l={t("settings.member_since")} v={formatShortDate(profile.memberSince)} />
        {role === "retailer" && (
          <>
            {profile.retailerCode && (
              <KV l={t("settings.retailer_code")} v={profile.retailerCode} mono />
            )}
            {fosName && <KV l={t("settings.fos")} v={fosName} />}
            {distributorName && <KV l={t("settings.distributor")} v={distributorName} />}
          </>
        )}
        {role === "fos" && (
          <KV
            l={t("settings.auto_approve")}
            v={
              <>
                {profile.autoApprove ? t("settings.on") : t("settings.off")}{" "}
                <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>
                  · {t("settings.managed_by_dist")}
                </span>
              </>
            }
          />
        )}
      </div>

      <SectionLabel>{t("settings.edit_profile")}</SectionLabel>
      <EditProfile
        initialName={profile.name}
        initialPhone={profile.phone}
        initialTz={profile.timezone}
        onSaved={() => {
          setToast({ msg: t("settings.profile_saved"), kind: "ok" });
          router.refresh();
        }}
      />

      <SectionLabel>{t("settings.change_password")}</SectionLabel>
      <ChangePassword />

      <SectionLabel>{t("settings.notifications")}</SectionLabel>
      <Notifications role={role} initial={profile.notificationPrefs} />

      {role === "distributor" && (
        <>
          <SectionLabel>{t("settings.accounts")}</SectionLabel>
          <DistAccounts
            accounts={accounts}
            notify={(msg) => {
              setToast({ msg, kind: "ok" });
              router.refresh();
            }}
          />
          <SectionLabel>{t("settings.autoappr")}</SectionLabel>
          <AutoApproveDefaults
            initial={profile.defaultFosAutoApprove}
            onManage={() => router.push("/distributor/users")}
          />
        </>
      )}

      <SectionLabel>{t("settings.devices")}</SectionLabel>
      <div className="card">
        <button type="button" className="set-link bare" onClick={() => signOutClient()}>
          <span className="set-link-l">
            <span className="set-link-ic">
              <Icon name="power" size={17} />
            </span>
            {t("settings.signout_device")}
          </span>
        </button>
        <div className="divider" />
        <button type="button" className="set-link bare" onClick={() => signOutClient("global")}>
          <span className="set-link-l">
            <span className="set-link-ic">
              <Icon name="shield" size={17} />
            </span>
            {t("settings.signout_all")}
          </span>
        </button>
      </div>

      {role === "distributor" && (
        <>
          <SectionLabel style={{ color: "var(--neg)" }}>{t("settings.danger")}</SectionLabel>
          <div className="card danger-card">
            <button
              type="button"
              className="set-link bare"
              onClick={() => router.push("/distributor/users")}
            >
              <span className="set-link-l">
                <span
                  className="set-link-ic"
                  style={{
                    background: "color-mix(in srgb, var(--neg) 14%, transparent)",
                    color: "var(--neg)",
                  }}
                >
                  <Icon name="trash" size={17} />
                </span>
                {t("settings.delete_user")}
              </span>
            </button>
            <p className="fmt-list" style={{ margin: "8px 0 0" }}>
              {t("settings.delete_note")}
            </p>
          </div>
        </>
      )}
      <div style={{ height: 8 }} />
      <Toast msg={toast?.msg} kind={toast?.kind} onDone={() => setToast(null)} />
    </div>
  );
}

function EditProfile({
  initialName,
  initialPhone,
  initialTz,
  onSaved,
}: {
  initialName: string;
  initialPhone: string;
  initialTz: string;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [tz, setTz] = useState(initialTz);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();

  const save = () => {
    setMsg(null);
    if (phone && !/^[+\d][\d ]{7,}$/.test(phone)) {
      setMsg({ k: "err", t: t("settings.err.phone") });
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("full_name", name);
      fd.set("phone", phone);
      fd.set("timezone", tz);
      const r = await updateOwnProfile(fd);
      if ("error" in r) {
        setMsg({
          k: "err",
          t: r.error === "invalid_phone" ? t("settings.err.phone") : r.error,
        });
      } else {
        setMsg({ k: "ok", t: t("settings.profile_saved") });
        onSaved();
      }
    });
  };

  return (
    <div className="card">
      <Field label={t("settings.full_name")} value={name} onChange={setName} />
      <Field
        label={t("settings.phone")}
        value={phone}
        onChange={setPhone}
        inputMode="tel"
        placeholder="+91 …"
      />
      <Selectt
        label={t("settings.timezone")}
        value={tz}
        onChange={setTz}
        options={[
          { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
          { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
          { value: "UTC", label: "UTC" },
        ]}
      />
      <Inline m={msg} />
      <div className="spacer" />
      <Btn onClick={save} busy={busy} busyLabel={t("common.saving")} disabled={!name.trim()}>
        {t("settings.save_changes")}
      </Btn>
    </div>
  );
}

function ChangePassword() {
  const { t } = useT();
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();

  const update = () => {
    setMsg(null);
    if (!cur) return setMsg({ k: "err", t: t("settings.pw.err.current") });
    if (nw.length < 8) return setMsg({ k: "err", t: t("settings.pw.err.len") });
    if (nw === cur) return setMsg({ k: "err", t: t("settings.pw.err.same") });
    if (nw !== cf) return setMsg({ k: "err", t: t("settings.pw.err.match") });
    start(async () => {
      const fd = new FormData();
      fd.set("current", cur);
      fd.set("next", nw);
      const r = await changePassword(fd);
      if ("error" in r) {
        setMsg({ k: "err", t: PW_ERRORS[r.error] ? t(PW_ERRORS[r.error]) : r.error });
      } else {
        setMsg({ k: "ok", t: t("settings.pw.updated") });
        setCur("");
        setNw("");
        setCf("");
      }
    });
  };

  return (
    <div className="card">
      <Field label={t("settings.current_password")} value={cur} onChange={setCur} type="password" />
      <Field
        label={t("settings.new_password")}
        value={nw}
        onChange={setNw}
        type="password"
        hint={t("users.pwd_hint")}
      />
      <Field label={t("settings.confirm_password")} value={cf} onChange={setCf} type="password" />
      <Inline m={msg} />
      <div className="spacer" />
      <Btn onClick={update} busy={busy} busyLabel={t("settings.updating")}>
        {t("settings.update_password")}
      </Btn>
    </div>
  );
}

function Notifications({
  role,
  initial,
}: {
  role: UserRole;
  initial: Record<string, boolean>;
}) {
  const { t } = useT();
  const [n, setN] = useState({
    approved: initial.approved !== false,
    cash: initial.cash !== false,
    incoming: initial.incoming !== false,
  });

  const save = (next: typeof n) => {
    setN(next);
    const fd = new FormData();
    fd.set("approved", String(next.approved));
    fd.set("cash", String(next.cash));
    fd.set("incoming", String(next.incoming));
    void saveNotificationPrefs(fd);
  };

  return (
    <div className="card">
      <ToggleRow
        title={t("settings.notif.approved")}
        on={n.approved}
        onChange={(v) => save({ ...n, approved: v })}
      />
      <ToggleRow
        title={t("settings.notif.cash")}
        on={n.cash}
        onChange={(v) => save({ ...n, cash: v })}
      />
      {(role === "fos" || role === "distributor") && (
        <ToggleRow
          title={t("settings.notif.incoming")}
          on={n.incoming}
          onChange={(v) => save({ ...n, incoming: v })}
        />
      )}
    </div>
  );
}

function DistAccounts({
  accounts,
  notify,
}: {
  accounts: { id: string; name: string; slug: string; active: boolean }[];
  notify: (msg: string) => void;
}) {
  const { t } = useT();
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(accounts.map((a) => [a.id, a.name])),
  );
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ name: "", slug: "" });
  const [msg, setMsg] = useState<Msg>(null);

  const rename = async (id: string) => {
    const fd = new FormData();
    fd.set("account_id", id);
    fd.set("name", names[id] ?? "");
    const r = await renameAccount(fd);
    if ("error" in r) setMsg({ k: "err", t: r.error });
    else notify(t("settings.profile_saved"));
  };

  const toggle = async (id: string, active: boolean) => {
    const fd = new FormData();
    fd.set("account_id", id);
    fd.set("active", String(active));
    const r = await setAccountActive(fd);
    if ("error" in r) setMsg({ k: "err", t: r.error });
    else notify(t("settings.profile_saved"));
  };

  const add = async () => {
    if (!nf.name || !nf.slug) return;
    const fd = new FormData();
    fd.set("name", nf.name);
    fd.set("slug", nf.slug);
    const r = await addAccount(fd);
    if ("error" in r) setMsg({ k: "err", t: r.error });
    else {
      setNf({ name: "", slug: "" });
      setAdding(false);
      notify(t("settings.accounts.added"));
    }
  };

  return (
    <div className="card">
      {accounts.map((a) => (
        <div className="toggle-row" key={a.id}>
          <div className="tr-main">
            <input
              className="field-input"
              style={{ fontWeight: 700, fontSize: 14.5, width: "100%" }}
              value={names[a.id] ?? a.name}
              onChange={(e) => setNames({ ...names, [a.id]: e.target.value })}
              onBlur={() => {
                if ((names[a.id] ?? a.name) !== a.name) void rename(a.id);
              }}
            />
            <div className="tr-sub">
              {t("settings.accounts.slug")} · {a.slug}
            </div>
          </div>
          <Switch on={a.active} onChange={(v) => toggle(a.id, v)} />
        </div>
      ))}
      <Inline m={msg} />
      {adding ? (
        <div style={{ marginTop: 12 }}>
          <Field
            label={t("settings.accounts.display")}
            value={nf.name}
            onChange={(v) => setNf({ ...nf, name: v })}
            placeholder="e.g. Acme Telecom"
          />
          <Field
            label={t("settings.accounts.slug")}
            value={nf.slug}
            onChange={(v) => setNf({ ...nf, slug: v })}
            hint={t("settings.accounts.slug_hint")}
            placeholder="acme"
          />
          <Btn onClick={add} disabled={!nf.name || !nf.slug}>
            {t("settings.accounts.save")}
          </Btn>
        </div>
      ) : (
        <button
          type="button"
          className="link-btn"
          style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}
          onClick={() => setAdding(true)}
        >
          <Icon name="plus" size={16} w={2.4} /> {t("settings.accounts.add")}
        </button>
      )}
    </div>
  );
}

function AutoApproveDefaults({
  initial,
  onManage,
}: {
  initial: boolean;
  onManage: () => void;
}) {
  const { t } = useT();
  const [on, setOn] = useState(initial);

  const save = (v: boolean) => {
    setOn(v);
    const fd = new FormData();
    fd.set("on", String(v));
    void setDefaultFosAutoApprove(fd);
  };

  return (
    <div className="card">
      <ToggleRow
        title={t("settings.autoappr.default")}
        sub={t("settings.autoappr.sub")}
        on={on}
        onChange={save}
      />
      <div className="divider" />
      <button type="button" className="link-btn" onClick={onManage}>
        {t("settings.autoappr.manage")}
      </button>
    </div>
  );
}
