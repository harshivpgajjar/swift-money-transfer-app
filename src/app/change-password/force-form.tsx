"use client";

import { useState, useTransition } from "react";
import { forceChangePassword } from "@/lib/actions/settings";
import { useT } from "@/lib/i18n";
import { Btn, Field, InlineErr, Logo } from "@/lib/ui";

export default function ForceForm({ home }: { home: string }) {
  const { t } = useT();
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  const submit = () => {
    setErr("");
    if (nw.length < 8) return setErr(t("settings.pw.err.len"));
    if (nw !== cf) return setErr(t("settings.pw.err.match"));
    start(async () => {
      const fd = new FormData();
      fd.set("next", nw);
      const r = await forceChangePassword(fd);
      if ("error" in r) {
        setErr(r.error === "too_short" ? t("settings.pw.err.len")
          : r.error === "same_password" ? t("settings.pw.err.same") : r.error);
        return;
      }
      window.location.assign(home);
    });
  };

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ width: 420, maxWidth: "100%", padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <Logo size={52} />
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "14px 0 0" }}>
            {t("pwf.title")}
          </h1>
          <p className="lead" style={{ margin: "8px 0 0" }}>{t("pwf.sub")}</p>
        </div>
        <Field label={t("settings.new_password")} value={nw} onChange={setNw} type="password" hint={t("users.pwd_hint")} autoFocus />
        <Field label={t("settings.confirm_password")} value={cf} onChange={setCf} type="password" />
        {err && <InlineErr>{err}</InlineErr>}
        <div className="spacer" />
        <Btn onClick={submit} busy={busy} busyLabel={t("settings.updating")} disabled={nw.length < 8 || nw !== cf}>
          {t("settings.update_password")}
        </Btn>
      </div>
    </div>
  );
}
