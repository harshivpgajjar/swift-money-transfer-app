"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "./actions";
import type { LoginState } from "./types";
import { LOCALES, LOCALE_LABEL, useT, type Locale } from "@/lib/i18n";
import { Icon } from "@/lib/ui";

function SubmitButton({ label, busyLabel }: { label: string; busyLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary btn-full">
      {pending && <span className="spin" aria-hidden />}
      {pending ? busyLabel : label}
    </button>
  );
}

export default function LoginForm({
  next,
  initialError,
}: {
  next?: string;
  initialError?: string;
}) {
  const { locale, setLocale, t } = useT();
  const [showPw, setShowPw] = useState(false);
  const [state, action] = useActionState<LoginState, FormData>(
    login,
    initialError ? { error: t(initialError) } : undefined,
  );

  const points = [
    t("login.point.outstanding"),
    t("login.point.approvals"),
    t("login.point.eod"),
  ];

  return (
    <div className="web-login">
      {/* LEFT brand panel */}
      <div className="wl-brand">
        <div className="wl-brand-top">
          <div className="wl-mark">
            <svg
              width="30"
              height="30"
              viewBox="0 0 48 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16.5 15 L25 24 L16.5 33" />
              <path d="M25 15 L33.5 24 L25 33" />
            </svg>
          </div>
          <span className="wl-word">Swift Money</span>
        </div>
        <div className="wl-brand-mid">
          <h1 className="wl-head">{t("login.brand.head")}</h1>
          <p className="wl-sub">{t("login.brand.sub")}</p>
          <ul className="wl-points">
            {points.map((p) => (
              <li key={p}>
                <span className="wl-tick">
                  <Icon name="check" size={15} w={2.4} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="wl-secure">
          <Icon name="shield" size={15} /> {t("login.secure")}
        </div>
        <svg
          className="wl-decor"
          width={340}
          height={340}
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16.5 15 L25 24 L16.5 33" />
          <path d="M25 15 L33.5 24 L25 33" />
        </svg>
      </div>

      {/* RIGHT form */}
      <div className="wl-form-side">
        <div className="wl-langs">
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={`lang-pill ${l === locale ? "on" : ""}`}
              aria-pressed={l === locale}
            >
              {LOCALE_LABEL[l]}
            </button>
          ))}
        </div>

        <div className="wl-form">
          <h2 className="wl-form-title">{t("login.sub")}</h2>
          <p className="wl-form-sub">{t("login.form.sub")}</p>

          <form action={action}>
            {next && <input type="hidden" name="next" value={next} />}

            <div className="field">
              <label htmlFor="email" className="field-label">{t("login.email")}</label>
              <div className="field-box">
                <span className="field-icon"><Icon name="mail" size={18} /></span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@shop.in"
                  className="field-input"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password" className="field-label">{t("login.password")}</label>
              <div className="field-box">
                <span className="field-icon"><Icon name="lock" size={18} /></span>
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="field-input"
                />
                <button
                  type="button"
                  className="field-icon"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <Icon name={showPw ? "eyeOff" : "eye"} size={18} />
                </button>
              </div>
            </div>

            {state?.error && (
              <div className="inline-err">
                <Icon name="bell" size={15} w={2.2} />
                {state.error}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <SubmitButton label={t("login.signin")} busyLabel={t("login.signing_in")} />
            </div>

            <div className="login-secure">
              <Icon name="shield" size={15} /> {t("login.secure")}
            </div>

            <p className="wl-form-foot">{t("login.footer")}</p>
          </form>
        </div>
      </div>
    </div>
  );
}
