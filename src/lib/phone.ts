/** Caller-number helpers. Full numbers are never stored — only a mask and a keyed hash. */

const ANONYMOUS = /^(anonymous|withheld|private|unknown|unavailable|restricted|no caller id|n\/?a)$/i;

export function isAnonymousCaller(v: string | null | undefined): boolean {
  return !!v && ANONYMOUS.test(v.trim());
}

/** Normalise a UK number to national format digits (07700900123). Returns null if it isn't a phone number. */
export function normalizeUkPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  let d = v.replace(/[\s\-().]/g, "");
  if (d.startsWith("+44")) d = "0" + d.slice(3);
  else if (d.startsWith("0044")) d = "0" + d.slice(4);
  else if (/^44\d{10}$/.test(d)) d = "0" + d.slice(2);
  if (!/^\d+$/.test(d)) return null;
  if (d.length < 7 || d.length > 13) return null;
  return d;
}

/** "07700900123" → "077•• •••123". Anything not recognisable as a number is fully hidden. */
export function maskPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  if (isAnonymousCaller(v)) return "Withheld";
  const d = normalizeUkPhone(v);
  if (!d) return "•••";
  return `${d.slice(0, 3)}•• •••${d.slice(-3)}`;
}
