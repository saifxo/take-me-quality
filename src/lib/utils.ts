import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pct(v: number | null | undefined, dp = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(dp)}%`;
}

export function signed(v: number | null | undefined, dp = 1, suffix = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toFixed(dp)}${suffix}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

export const CALL_TYPE_LABEL: Record<string, string> = {
  booking: "Booking",
  airport: "Airport",
  account: "Account",
  special: "Special",
  enquiry: "Enquiry",
  complaint: "Complaint",
  cancellation: "Cancellation",
  other: "Other",
};
