import "server-only";

/* Fetch files from Google Drive share links — no OAuth needed for files
   shared as "Anyone with the link". Google Sheets are exported as XLSX. */

type DriveRef = { id: string; kind: "file" | "spreadsheet" };

export function parseDriveLink(link: string): DriveRef | null {
  const url = link.trim();
  let m = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (m) return { id: m[1], kind: "spreadsheet" };
  m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (m) return { id: m[1], kind: "file" };
  m = url.match(/drive\.google\.com\/(?:open|uc)\?[^#]*\bid=([\w-]+)/);
  if (m) return { id: m[1], kind: "file" };
  return null;
}

export async function fetchDriveFile(link: string): Promise<File | { error: string }> {
  const ref = parseDriveLink(link);
  if (!ref) {
    return { error: `Not a Google Drive link: "${link.slice(0, 80)}"` };
  }

  const url =
    ref.kind === "spreadsheet"
      ? `https://docs.google.com/spreadsheets/d/${ref.id}/export?format=xlsx`
      : `https://drive.google.com/uc?export=download&id=${ref.id}`;

  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch {
    return { error: "Could not reach Google Drive" };
  }
  if (!res.ok) {
    return {
      error:
        res.status === 404
          ? "Drive file not found — check the link"
          : `Drive returned ${res.status} — is the file shared as "Anyone with the link"?`,
    };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    // Login page or virus-scan interstitial: the file isn't openly shared.
    return {
      error:
        'This Drive file is private. In Drive: Share → General access → "Anyone with the link", then try again.',
    };
  }

  // Filename from Content-Disposition (drives account inference for split books)
  let name = ref.kind === "spreadsheet" ? "sheet.xlsx" : "drive-file";
  const cd = res.headers.get("content-disposition") ?? "";
  const fnStar = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const fn = cd.match(/filename="([^"]+)"/i);
  if (fnStar) name = decodeURIComponent(fnStar[1]);
  else if (fn) name = fn[1];

  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) return { error: "Drive returned an empty file" };
  if (buf.byteLength > 15 * 1024 * 1024) return { error: "Drive file is too large (15 MB max)" };
  return new File([buf], name, { type: contentType });
}

/* Resolve a newline/whitespace-separated bundle of links into Files.
   Fails fast with the first error so the user can fix that link. */
export async function fetchDriveFiles(raw: string): Promise<File[] | { error: string }> {
  const links = raw
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const files: File[] = [];
  for (const link of links) {
    const f = await fetchDriveFile(link);
    if (!(f instanceof File)) return f;
    files.push(f);
  }
  return files;
}
