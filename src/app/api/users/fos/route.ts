import { NextResponse, type NextRequest } from "next/server";
import { distributorFromBearer } from "@/lib/api-auth";
import { createFosUser } from "@/lib/users-core";

export async function POST(req: NextRequest) {
  const distributor = await distributorFromBearer(req);
  if (!distributor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await createFosUser(distributor, body);
  return NextResponse.json(result, { status: "ok" in result ? 200 : 422 });
}
