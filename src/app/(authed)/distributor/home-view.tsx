"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { formatINR } from "@/lib/utils";
import { Icon, Tile, useCountUp } from "@/lib/ui";

export default function DistributorHomeView({
  totalOutstanding,
  personalOutstanding = 0,
  pendingRequests,
  pendingCash,
  retailers,
  fos,
  needsAssignment,
  analytics,
}: {
  totalOutstanding: number;
  personalOutstanding?: number;
  pendingRequests: number;
  pendingCash: number;
  retailers: number;
  fos: number;
  needsAssignment: number;
  analytics?: React.ReactNode;
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
          <button
            type="button"
            className="tile-chip"
            onClick={() => router.push("/distributor/outstanding")}
            style={{ cursor: "pointer" }}
          >
            {t("dist.view_outstanding")}
          </button>
        </div>
        <div className="tile-label">{t("dist.tile.outstanding")}</div>
        <div className="tile-val">{formatINR(out)}</div>
        {personalOutstanding !== 0 && (
          <div className="tile-sub" style={{ marginTop: 4, fontSize: 12.5, opacity: 0.75 }}>
            {t("out.personal")}: {formatINR(personalOutstanding)}
          </div>
        )}
      </div>

      <div className="dist-tiles">
        <Tile
          icon="send"
          label={t("dist.tile.req")}
          value={pendingRequests}
          delay="0.1s"
          onClick={() => router.push("/distributor/approvals")}
        />
        <Tile
          icon="cash"
          label={t("dist.tile.cash")}
          value={pendingCash}
          delay="0.14s"
          onClick={() => router.push("/distributor/approvals")}
        />
        <Tile
          icon="people"
          label={t("dist.tile.retailers")}
          value={retailers}
          delay="0.18s"
          onClick={() => router.push("/distributor/users")}
        />
        <Tile
          icon="user"
          label={t("dist.tile.fos")}
          value={fos}
          delay="0.22s"
          onClick={() => router.push("/distributor/users")}
        />
        <Tile
          icon="bell"
          label={t("dist.tile.assign")}
          value={needsAssignment}
          delay="0.26s"
          chip={needsAssignment > 0 ? t("dist.tile.action") : undefined}
          onClick={() => router.push("/distributor/users")}
        />
      </div>
      {analytics}
    </div>
  );
}
