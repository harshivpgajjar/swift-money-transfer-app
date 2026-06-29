import { NextResponse, type NextRequest } from "next/server";
import { fosFromBearer } from "@/lib/api-auth";
import { postFosBalanceRequest } from "@/lib/fos-request";

export async function POST(req: NextRequest) {
  const fos = await fosFromBearer(req);
  if (!fos || !fos.distributor_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const res = await postFosBalanceRequest(
    { id: fos.id, distributor_id: fos.distributor_id },
    {
      retailer_id: body.retailer_id,
      account_id: body.account_id,
      amount: body.amount,
      notes: body.notes,
    },
  );
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
