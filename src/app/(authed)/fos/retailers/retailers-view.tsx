"use client";

import { useT, fmt } from "@/lib/i18n";
import { formatINR } from "@/lib/utils";
import { Empty, KV } from "@/lib/ui";

type RetailerItem = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  active: boolean;
  outstanding: Record<string, number>;
};

export default function RetailersView({
  accounts,
  retailers,
}: {
  accounts: { id: string; name: string }[];
  retailers: RetailerItem[];
}) {
  const { t } = useT();
  return (
    <div style={{ maxWidth: 560 }}>
      <p className="lead" style={{ marginTop: 0 }}>
        {fmt(t("fos.assigned"), { n: retailers.length })}
      </p>
      {retailers.length ? (
        retailers.map((r) => (
          <div className="card" key={r.id} style={{ marginBottom: 11 }}>
            <div className="appr-head">
              <div>
                <div className="appr-name">{r.name}</div>
                <div className="appr-code">{r.code}</div>
              </div>
              <span className={"badge " + (r.active ? "ok" : "mute")}>
                {r.active ? t("users.status.active") : t("out.inactive")}
              </span>
            </div>
            <KV l={t("users.phone")} v={r.phone ?? "—"} mono />
            {accounts.map((a) => (
              <KV
                key={a.id}
                l={`${t("out.outstanding")} · ${a.name}`}
                v={formatINR(r.outstanding[a.id] ?? 0)}
                mono
              />
            ))}
          </div>
        ))
      ) : (
        <Empty icon="people" title={t("cash.foscash.empty")} />
      )}
    </div>
  );
}
