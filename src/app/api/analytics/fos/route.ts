import { NextResponse, type NextRequest } from "next/server";
import { fosFromBearer } from "@/lib/api-auth";
import { getDistributorAnalytics } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const fos = await fosFromBearer(req);
  if (!fos || !fos.distributor_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Same analytics computation, scoped to this FOS's own retailers.
    const data = await getDistributorAnalytics(fos.distributor_id, fos.id);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analytics failed" },
      { status: 500 },
    );
  }
}
