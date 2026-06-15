"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { processEodUploads, type EodResult } from "@/lib/uploads/eod-core";
import { fetchDriveFiles } from "@/lib/drive";


export async function uploadEod(formData: FormData): Promise<EodResult> {
  const distributor = await requireRole("distributor");
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const accountId = formData.get("account_id");
  const driveLinks = String(formData.get("drive_links") ?? "").trim();
  if (driveLinks) {
    const fetched = await fetchDriveFiles(driveLinks);
    if (!Array.isArray(fetched)) {
      return { ok: false, errors: [{ row: 0, message: fetched.error }] };
    }
    files.push(...fetched);
  }
  if (files.length === 0) {
    return { ok: false, errors: [{ row: 0, message: "Please choose a file" }] };
  }
  if (typeof accountId !== "string" || !accountId) {
    return { ok: false, errors: [{ row: 0, message: "Pick an account for this upload" }] };
  }

  let result: EodResult;
  try {
    result = await processEodUploads(distributor.id, accountId, files);
  } catch (e) {
    return {
      ok: false,
      errors: [{ row: 0, message: e instanceof Error ? e.message : "Import failed — could not read the file" }],
    };
  }
  if (result.ok) {
    revalidatePath("/distributor");
    revalidatePath("/distributor/reports");
    revalidatePath("/distributor/outstanding");
    revalidatePath("/distributor/users");
  }
  return result;
}
