import { NextResponse, type NextRequest } from "next/server";
import { distributorFromBearer } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/* Mark / clear a retailer as defaulter from the mobile distributor app. */
export async function POST(req: NextRequest) {
  const distributor = await distributorFromBearer(req);
  if (!distributor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { retailer_id?: string; on?: boolean; note?: string }
    | null;
  if (!body?.retailer_id) {
    return NextResponse.json({ error: "Missing retailer" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: r } = await admin
    .from("profiles")
    .select("id, distributor_id, role")
    .eq("id", body.retailer_id)
    .maybeSingle();
  if (!r || r.role !== "retailer" || r.distributor_id !== distributor.id) {
    return NextResponse.json({ error: "Invalid retailer" }, { status: 403 });
  }

  const on = body.on === true;
  const { error } = await admin
    .from("profiles")
    .update({
      defaulted: on,
      defaulted_at: on ? new Date().toISOString() : null,
      default_note: on ? body.note?.trim() || null : null,
    })
    .eq("id", body.retailer_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
