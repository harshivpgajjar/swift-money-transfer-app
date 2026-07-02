import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getLateCharges } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { todayIso, isoAddDays } from "@/lib/format";
import LateChargesView from "./late-charges-view";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function LateChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const me = await requireRole("distributor");
  const sp = await searchParams;
  const date = sp.date && DATE_RE.test(sp.date) ? sp.date : isoAddDays(todayIso(), -1);

  // Recompute a day's charges on demand (idempotent — replaces that day's rows).
  async function runDay(formData: FormData) {
    "use server";
    const inner = await requireRole("distributor");
    const d = String(formData.get("date"));
    if (!DATE_RE.test(d)) return;
    const supabase = await createClient();
    await supabase.rpc("apply_late_charges", { p_distributor: inner.id, p_date: d });
    revalidatePath("/distributor/late-charges");
  }

  const rows = await getLateCharges(me.id, date);

  return (
    <LateChargesView
      date={date}
      prev={isoAddDays(date, -1)}
      next={isoAddDays(date, 1)}
      rows={rows}
      runDay={runDay}
    />
  );
}
