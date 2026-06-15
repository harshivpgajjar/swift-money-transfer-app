const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatINR(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  return inrFormatter.format(n);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* Normalise a stored phone into call + WhatsApp targets. Assumes India:
   a bare 10-digit number gets the 91 country code. Returns null if there
   aren't enough digits to dial. */
export function phoneLinks(
  phone: string | null | undefined,
): { tel: string; wa: string } | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  digits = digits.replace(/^0+/, "");
  if (digits.length < 10) return null;
  return { tel: "+" + digits, wa: digits };
}
