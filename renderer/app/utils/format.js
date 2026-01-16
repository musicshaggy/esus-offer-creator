// Formatting helpers shared across the renderer.

export const el = (id) => document.getElementById(id);
export const q = (sel, root = document) => root.querySelector(sel);

export function escapeHtml(input) {
  const s = String(input ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function toNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function money(value, currency = "PLN") {
  const n = toNumber(value);
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} zł`;
  }
}

export function todayYMD() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ymdToPL(ymd) {
  const s = String(ymd || "").trim();
  const m = s.match(/^\s*(\d{4})-(\d{2})-(\d{2})\s*$/);
  if (!m) return s;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
