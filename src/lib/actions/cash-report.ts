"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  processCashReportUpload,
  type CashReportResult,
} from "@/lib/uploads/cash-report-core";
import { fetchDriveFiles } from "@/lib/drive";


export async function uploadCashReport(formData: FormData): Promise<CashReportResult> {
  const distributor = await requireRole("distributor");
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const driveLinks = String(formData.get("drive_links") ?? "").trim();
  if (driveLinks) {
    const fetched = await fetchDriveFiles(driveLinks);
    if (!Array.isArray(fetched)) return { ok: false, error: fetched.error };
    files.push(...fetched);
  }
  if (files.length === 0) {
    return { ok: false, error: "Please choose a file" };
  }

  let result: CashReportResult;
  try {
    result = await processCashReportUpload(distributor.id, files);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Import failed — could not read the file",
    };
  }
  if (result.ok) {
    revalidatePath("/distributor");
    revalidatePath("/distributor/reports");
    revalidatePath("/distributor/outstanding");
  }
  return result;
}
