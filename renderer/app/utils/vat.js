// renderer/app/utils/vat.js

function parseVatValue(v) {
  const s = String(v || "").trim().toLowerCase();

  if (s === "0_wdt" || s === "0_ex") {
    return { rate: 0, label: s === "0_wdt" ? "0% (WDT)" : "0% (EX)", code: s };
  }

  const n = Number(s);
  if (Number.isFinite(n) && n >= 0 && n <= 100) {
    return { rate: n / 100, label: `${n}%`, code: String(n) };
  }

  // fallback (bezpieczny)
  return { rate: 0.23, label: "23%", code: "23" };
}

export function getVatFromUI() {
  const el = document.getElementById("offerVat");
  return parseVatValue(el?.value);
}

export function getVatRateFromUI() {
  return getVatFromUI().rate;
}
