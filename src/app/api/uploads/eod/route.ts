import { NextResponse, type NextRequest } from "next/server";
import { distributorFromBearer } from "@/lib/api-auth";
import { processEodUploads } from "@/lib/uploads/eod-core";
import { fetchDriveFiles } from "@/lib/drive";

export async function POST(req: NextRequest) {
  const distributor = await distributorFromBearer(req);
  if (!distributor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fd = await req.formData();
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const accountId = fd.get("account_id");
  const driveLinks = String(fd.get("drive_links") ?? "").trim();
  if (driveLinks) {
    const fetched = await fetchDriveFiles(driveLinks);
    if (!Array.isArray(fetched)) {
      return NextResponse.json(
        { ok: false, errors: [{ row: 0, message: fetched.error }] },
        { status: 422 },
      );
    }
    files.push(...fetched);
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "Please choose a file" }, { status: 400 });
  }
  if (typeof accountId !== "string" || !accountId) {
    return NextResponse.json({ error: "Pick an account for this upload" }, { status: 400 });
  }

  let result;
  try {
    result = await processEodUploads(distributor.id, accountId, files);
  } catch (e) {
    return NextResponse.json(
      { ok: false, errors: [{ row: 0, message: e instanceof Error ? e.message : "Import failed" }] },
      { status: 422 },
    );
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
