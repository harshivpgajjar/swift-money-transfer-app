import { formatINR } from "./format";

export type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

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

/* Localized title (via "ntf.<type>") + a data-driven body. Mirror of the web
   helper so the two feeds read identically. */
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
