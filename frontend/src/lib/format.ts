import { clsx, type ClassValue } from "clsx";
import type { Lang } from "./types";

export const cn = (...v: ClassValue[]) => clsx(v);

const locale = (lang: Lang) => (lang === "hi" ? "hi-IN" : "en-IN");

export function fmtDate(iso: string | null | undefined, lang: Lang = "en", opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString(locale(lang), opts ?? { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined, lang: Lang = "en") {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale(lang), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso: string, lang: Lang = "en") {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  if (s < 60) return rtf.format(-s, "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

export const fmtKg = (kg: number | null | undefined, digits = 1) =>
  `${(kg ?? 0).toLocaleString("en-IN", { maximumFractionDigits: digits })} kg`;

export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");

export const fmtMoney = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const pick = (lang: Lang, en: string, hi?: string | null) => (lang === "hi" && hi ? hi : en);

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const SLOT_LABELS: Record<string, string> = {
  "08-10": "8–10 AM",
  "10-12": "10 AM–12 PM",
  "12-14": "12–2 PM",
  "14-16": "2–4 PM",
  "16-18": "4–6 PM",
};
export const slotLabel = (slot: string) => SLOT_LABELS[slot] ?? slot;