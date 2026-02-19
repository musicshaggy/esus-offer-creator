import { computeTotals } from "../calc/totals.js";
import { money, moneyCcy, toNumber } from "../utils/format.js";
import { store } from "../state/store.js";
import { getRateToPLN } from "../utils/exchangeRates.js";
import { itemNetAfterDiscount } from "../calc/pricing.js";
import { getVatRateFromUI, getVatFromUI } from "../utils/vat.js";

let totals = {
  revenueNet: 0,
  costNet: 0,
  profitNet: 0,
  marginPct: 0,
  sumVat: 0,
  sumGross: 0,
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function buyNetPLN(it) {
  const buyNet = Math.max(0, toNumber(it.buyNet));
  const buyCcy = String(it.buyCcy || "PLN").toUpperCase();
  const rate = getRateToPLN(buyCcy, store.exchange?.rates);
  return rate ? buyNet * rate : buyNet; // brak kursu -> traktuj jak PLN
}

export function recalcTotalsUI() {
  const vatRate = getVatRateFromUI();
  const vat = getVatFromUI();
  setText("sumVatLabel", `Suma VAT ${vat.label}`);

  const t = computeTotals(store.items, vatRate);

  // 2) Wewnętrzne: koszt / zysk / marża z walutą zakupu
  let revenueNet = 0;
  let costNet = 0;

  for (const it of store.items) {
    const qty = Math.max(1, parseInt(it?.qty || 1, 10));
    revenueNet += itemNetAfterDiscount(it) * qty;
    costNet += buyNetPLN(it) * qty;
  }

  const profitNet = revenueNet - costNet;
  const marginPct = revenueNet > 0 ? (profitNet / revenueNet) * 100 : 0;

  totals = {
    ...t,
    revenueNet,
    costNet,
    profitNet,
    marginPct,
  };

  setText("sumNet", moneyCcy(totals.revenueNet));
  setText("sumVat", moneyCcy(totals.sumVat));
  setText("sumGross", moneyCcy(totals.sumGross));

  setText("sumCostNet", moneyCcy(totals.costNet));
  setText("sumProfitNet", moneyCcy(totals.profitNet));
  setText(
    "sumMargin",
    totals.marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%"
  );
}

export function getTotalsUI() {
  return totals;
}
