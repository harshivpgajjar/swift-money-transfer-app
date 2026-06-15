import { NextResponse, type NextRequest } from "next/server";
import { distributorFromBearer } from "@/lib/api-auth";
import { getDistributorAnalytics } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const distributor = await distributorFromBearer(req);
  if (!distributor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await getDistributorAnalytics(distributor.id);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analytics failed" },
      { status: 500 },
    );
  }
}
