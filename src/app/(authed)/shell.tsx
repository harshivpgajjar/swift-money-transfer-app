"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useT, type Locale, LOCALES, LOCALE_LABEL, fmt } from "@/lib/i18n";
import { Icon, Logo, type IconName } from "@/lib/ui";
import RealtimeRefresh from "@/components/realtime-refresh";
import NotificationBell from "@/components/notification-bell";
import { signOutClient } from "@/lib/sign-out";

type Role = "distributor" | "fos" | "retailer";

type NavItem = { key: string; labelKey: string; icon: IconName; href: string; badge?: number };

function navFor(
  role: Role,
  inboxBadge: number,
  approvalsBadge: number,
  actionBadge: number,
): NavItem[] {
  if (role === "retailer") {
    return [
      { key: "home", labelKey: "nav.overview", icon: "home", href: "/retailer" },
      { key: "request", labelKey: "nav.request", icon: "send", href: "/retailer/request" },
      { key: "cash", labelKey: "nav.cash", icon: "cash", href: "/retailer/cash" },
      { key: "history", labelKey: "nav.history", icon: "clock", href: "/retailer/history" },
    ];
  }
  if (role === "fos") {
    return [
      { key: "home", labelKey: "nav.overview", icon: "home", href: "/fos" },
      { key: "action", labelKey: "nav.action", icon: "bell", href: "/fos/action", badge: actionBadge },
      { key: "inbox", labelKey: "nav.inbox", icon: "inbox", href: "/fos/inbox", badge: inboxBadge },
      { key: "cash", labelKey: "nav.cash", icon: "cash", href: "/fos/cash" },
      { key: "retailers", labelKey: "nav.retailers", icon: "people", href: "/fos/retailers" },
      { key: "request", labelKey: "nav.request", icon: "send", href: "/fos/request" },
    ];
  }
  return [
    { key: "home", labelKey: "nav.overview", icon: "home", href: "/distributor" },
    { key: "action", labelKey: "nav.action", icon: "bell", href: "/distributor/action", badge: actionBadge },
    {
      key: "approvals",
      labelKey: "nav.approvals",
      icon: "check",
      href: "/distributor/approvals",
      badge: approvalsBadge,
    },
    { key: "outstanding", labelKey: "nav.outstanding", icon: "wallet", href: "/distributor/outstanding" },
    { key: "users", labelKey: "nav.users", icon: "people", href: "/distributor/users" },
    { key: "reports", labelKey: "nav.reports", icon: "upload", href: "/distributor/reports" },
  ];
}

const REALTIME_TABLES = [
  "money_requests",
  "cash_submissions",
  "daily_balances",
  "eod_transactions",
  "cash_report_entries",
  "profiles",
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AppShell({
  role,
  name,
  retailerCode,
  fosName,
  inboxBadge = 0,
  approvalsBadge = 0,
  actionBadge = 0,
  children,
}: {
  role: Role;
  name: string;
  retailerCode?: string | null;
  fosName?: string | null;
  inboxBadge?: number;
  approvalsBadge?: number;
  actionBadge?: number;
  children: ReactNode;
}) {
  const { t, locale, setLocale } = useT();
  const pathname = usePathname() ?? "/";
  const nav = navFor(role, inboxBadge, approvalsBadge, actionBadge);

  const roleLabel =
    role === "distributor"
      ? t("role.distributor")
      : role === "fos"
        ? t("role.fos")
        : t("role.retailer");

  const isOn = (href: string) => {
    if (href === `/${role}`) return pathname === `/${role}`;
    return pathname === href || pathname.startsWith(href + "/");
  };

  /* page heading per design (web-app.jsx homeHead / WEB_TITLES) */
  let headTitle = "";
  let headSub = "";
  if (pathname === "/settings") {
    headTitle = t("settings.title");
    headSub = t("settings.sub");
  } else if (pathname === `/${role}`) {
    if (role === "retailer") {
      headTitle = name;
      headSub = `${roleLabel}${retailerCode ? " · " + retailerCode : ""}${fosName ? " · FOS " + fosName : ""}`;
    } else {
      headTitle = roleLabel;
      headSub = fmt(t("welcome"), { name });
    }
  } else {
    const current = nav.find((n) => n.href !== `/${role}` && isOn(n.href));
    headTitle = current ? t(current.labelKey) : "";
  }

  async function doSignOut() {
    await signOutClient();
  }

  return (
    <div className="web">
      <RealtimeRefresh tables={REALTIME_TABLES} />
      <aside className="web-sidebar">
        <div className="web-brand">
          <Logo size={40} />
          <div className="web-brand-text">
            <div className="web-brand-name">Swift Money</div>
            <div className="web-brand-sub">{roleLabel}</div>
          </div>
        </div>
        <div className="web-navlabel">{t("nav.menu")}</div>
        <nav className="web-nav">
          {nav.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              className={"web-nav-item" + (isOn(n.href) ? " on" : "")}
            >
              <Icon name={n.icon} size={20} w={isOn(n.href) ? 2 : 1.7} />
              <span>{t(n.labelKey)}</span>
              {n.badge && n.badge > 0 ? (
                <span className="web-nav-badge">{n.badge}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="web-sidebar-foot">
          <Link
            href="/settings"
            className={"web-nav-item" + (pathname === "/settings" ? " on" : "")}
          >
            <Icon name="gear" size={20} />
            <span>{t("nav.settings")}</span>
          </Link>
          <button type="button" className="web-nav-item" onClick={doSignOut}>
            <Icon name="power" size={20} />
            <span>{t("nav.signout")}</span>
          </button>
        </div>
      </aside>

      <main className="web-main">
        <header className="web-topbar">
          <div>
            <div className="web-page-title">{headTitle}</div>
            {headSub && <div className="web-page-sub">{headSub}</div>}
          </div>
          <div className="web-topbar-right">
            <div className="web-langs">
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
            <NotificationBell />
            <div className="web-profile">
              <div>
                <div className="web-profile-name">{name}</div>
                <div className="web-profile-role">{roleLabel}</div>
              </div>
              <div className="web-avatar">{initials(name)}</div>
            </div>
          </div>
        </header>
        <div className="web-body">
          <div className="web-content">{children}</div>
        </div>
      </main>
    </div>
  );
}
