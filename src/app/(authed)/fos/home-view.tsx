"use client";

import { useRouter } from "next/navigation";
import { useT, fmt } from "@/lib/i18n";
import { formatINR } from "@/lib/utils";
import { Btn, Icon, SectionLabel, Tile, useCountUp } from "@/lib/ui";

export default function FosHomeView({
  totalOutstanding,
  retailerCount,
  inboxCount,
  autoApprove,
}: {
  totalOutstanding: number;
  retailerCount: number;
  inboxCount: number;
  autoApprove: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const out = useCountUp(totalOutstanding, 1100);

  return (
    <div>
      <div className="hero-stat rise" style={{ animationDelay: ".04s" }}>
        <div className="tile-top">
          <span className="tile-ic">
            <Icon name="wallet" size={20} />
          </span>
          <span className="tile-chip">
            {fmt(t("fos.retailers_chip"), { n: retailerCount })}
          </span>
        </div>
        <div className="tile-label">{t("fos.tile.outstanding")}</div>
        <div className="tile-val">{formatINR(out)}</div>
      </div>

      <div className="tiles">
        <Tile
          icon="inbox"
          label={t("fos.tile.inbox")}
          value={inboxCount}
          delay="0.1s"
          onClick={() => router.push("/fos/inbox")}
        />
        <Tile
          icon="people"
          label={t("fos.tile.retailers")}
          value={retailerCount}
          delay="0.14s"
          onClick={() => router.push("/fos/retailers")}
        />
      </div>

      <SectionLabel>{t("retailer.quick_actions")}</SectionLabel>
      <div className="action-row rise" style={{ animationDelay: ".2s" }}>
        <Btn variant="primary" onClick={() => router.push("/fos/inbox")}>
          <Icon name="inbox" size={19} /> {t("fos.review_inbox")}
        </Btn>
        <Btn variant="ghost" onClick={() => router.push("/fos/cash")}>
          <Icon name="cash" size={19} /> {t("nav.cash")}
        </Btn>
      </div>

      {autoApprove && (
        <div className="helper-note" style={{ marginTop: 20 }}>
          <b>{t("fos.aa_title")}</b> {t("fos.aa_body")}
        </div>
      )}
    </div>
  );
}
