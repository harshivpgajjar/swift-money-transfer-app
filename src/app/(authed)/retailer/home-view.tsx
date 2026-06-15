"use client";

import { useRouter } from "next/navigation";
import { useT, fmt } from "@/lib/i18n";
import { Btn, Icon, SectionLabel, Tile, WhatsAppIcon } from "@/lib/ui";
import { phoneLinks } from "@/lib/format";

type AccountStat = { id: string; slug: string; name: string; outstanding: number };

export default function RetailerHomeView({
  accounts,
  pendingRequests,
  pendingCash,
  fosName,
  fosPhone,
}: {
  accounts: AccountStat[];
  pendingRequests: number;
  pendingCash: number;
  fosName: string | null;
  fosPhone: string | null;
}) {
  const { t } = useT();
  const router = useRouter();
  const links = phoneLinks(fosPhone);

  return (
    <div>
      <div className="tiles">
        {accounts.map((a, i) => (
          <Tile
            key={a.id}
            feature
            icon="wallet"
            label={fmt(t("retailer.tile.outstanding"), { account: a.name })}
            value={a.outstanding}
            currency
            chip={i === 0 ? t("retailer.tap_to_view") : undefined}
            delay={`${0.04 + i * 0.06}s`}
            onClick={() => router.push(`/retailer/history?account=${a.slug}`)}
          />
        ))}
        <Tile
          icon="send"
          label={t("retailer.tile.pending_requests")}
          value={pendingRequests}
          delay="0.16s"
          onClick={() => router.push("/retailer/history")}
        />
        <Tile
          icon="cash"
          label={t("retailer.tile.pending_cash")}
          value={pendingCash}
          delay="0.2s"
          onClick={() => router.push("/retailer/history")}
        />
      </div>

      <SectionLabel>{t("retailer.quick_actions")}</SectionLabel>
      <div className="action-row rise" style={{ animationDelay: ".26s" }}>
        <Btn variant="primary" onClick={() => router.push("/retailer/request")}>
          <Icon name="send" size={19} /> {t("retailer.btn.request")}
        </Btn>
        <Btn variant="ghost" onClick={() => router.push("/retailer/cash")}>
          <Icon name="cash" size={19} /> {t("retailer.btn.cash")}
        </Btn>
      </div>

      {fosName ? (
        <div className="who rise" style={{ animationDelay: ".32s" }}>
          <span className="tile-ic" style={{ width: 34, height: 34 }}>
            <Icon name="user" size={18} />
          </span>
          <div>
            <div className="who-line">
              <b>{fosName}</b>
            </div>
            <div className="who-sub">
              {t("retailer.fos_who")} · {t("retailer.fos_sub")}
            </div>
          </div>
          {links && (
            <div className="who-actions">
              <a className="who-btn call" href={`tel:${links.tel}`} aria-label={t("retailer.call")}>
                <Icon name="phone" size={18} />
              </a>
              <a
                className="who-btn wa"
                href={`https://wa.me/${links.wa}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("retailer.whatsapp")}
              >
                <WhatsAppIcon size={20} />
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="who rise" style={{ animationDelay: ".32s" }}>
          <span className="tile-ic" style={{ width: 34, height: 34 }}>
            <Icon name="user" size={18} />
          </span>
          <div>
            <div className="who-sub">{t("retailer.no_fos")}</div>
          </div>
        </div>
      )}
    </div>
  );
}
