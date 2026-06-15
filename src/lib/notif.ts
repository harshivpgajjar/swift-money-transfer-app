/* Shared notification rendering — turns a stored (type, data) row into a
   localized title + a data-driven body. Titles are localized via i18n keys
   ("ntf.<type>"); bodies are composed from the row's data (names/amounts are
   language-neutral), so we only translate ~15 short titles, not every string. */
import { formatINR } from "@/lib/utils";

export type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

// Types whose audience is staff (FOS/distributor) — show the retailer name.
const STAFF_TYPES = new Set([
  "req_new",
  "req_new_dist",
  "req_awaiting_dist",
  "req_approved_fos",
  "req_declined_fos",
  "req_auto",
  "cash_new",
  "cash_approved_dist",
]);

export const NOTIF_TYPES = [
  "req_new",
  "req_new_dist",
  "req_fos_accepted",
  "req_fos_edited",
  "req_declined",
  "req_awaiting_dist",
  "req_approved",
  "req_approved_fos",
  "req_auto",
  "req_declined_fos",
  "cash_new",
  "cash_approved",
  "cash_approved_dist",
  "cash_declined",
  "adjustment",
] as const;

/* Build the localized {title, body}. `t` resolves "ntf.<type>"; if a type is
   unknown it falls back to the row's stored (English) title/body. */
export function renderNotif(
  n: NotifRow,
  t: (key: string) => string,
): { title: string; body: string } {
  const titleKey = `ntf.${n.type}`;
  const title = t(titleKey);
  const resolvedTitle = title === titleKey ? n.title : title;

  const d = n.data ?? {};
  const amount = typeof d.amount === "number" ? d.amount : Number(d.amount);
  const parts: string[] = [];
  if (STAFF_TYPES.has(n.type) && typeof d.retailer === "string") parts.push(d.retailer);
  if (Number.isFinite(amount) && amount > 0) parts.push(formatINR(amount));
  if (typeof d.account === "string" && d.account) parts.push(d.account);
  const body = parts.length ? parts.join(" · ") : n.body;

  return { title: resolvedTitle, body };
}
