import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRetailerDailyBalances } from "@/lib/queries";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ retailerId: string }> },
) {
  const profile = await requireProfile();
  const { retailerId } = await params;
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  // Explicit scope check per role (defense-in-depth on top of RLS).
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, fos_id, distributor_id")
    .eq("id", retailerId)
    .single();
  if (!target || target.role !== "retailer") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const allowed =
    (profile.role === "retailer" && profile.id === target.id) ||
    (profile.role === "fos" && target.fos_id === profile.id) ||
    (profile.role === "distributor" && target.distributor_id === profile.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await getRetailerDailyBalances(retailerId, accountId);
  return NextResponse.json({ rows });
}
