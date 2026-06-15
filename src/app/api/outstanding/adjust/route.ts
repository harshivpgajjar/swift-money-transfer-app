import { NextResponse, type NextRequest } from "next/server";
import { distributorFromBearer } from "@/lib/api-auth";
import { adjustOutstandingCore } from "@/lib/outstanding-core";

export async function POST(req: NextRequest) {
  const distributor = await distributorFromBearer(req);
  if (!distributor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const res = await adjustOutstandingCore({
    distributorId: distributor.id,
    retailerId: String(body.retailer_id ?? ""),
    accountId: String(body.account_id ?? ""),
    target: Number(body.target),
    note: typeof body.notes === "string" ? body.notes : "",
  });
  if ("error" in res) {
    return NextResponse.json(res, { status: res.error === "no_change" ? 422 : 400 });
  }
  return NextResponse.json(res);
}
