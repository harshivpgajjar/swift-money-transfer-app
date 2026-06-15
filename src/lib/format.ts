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

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* Design-style short forms: "08 Jun" and "08 Jun, 10:24 AM" */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function formatShortDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const time = d
    .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    .toUpperCase();
  return `${date}, ${time}`;
}

/* Design-style thousands: 41000 → "41k", closing 48250 → "48.3k" */
export function kShort(n: number, decimals = 0): string {
  return (n / 1000).toFixed(decimals) + "k";
}

/* Normalise a stored phone into call + WhatsApp targets. Assumes India:
   a bare 10-digit number gets the 91 country code for wa.me. Returns null
   if there aren't enough digits to dial. */
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
