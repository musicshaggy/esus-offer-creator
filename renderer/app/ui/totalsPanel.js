import { VAT_RATE } from "../config/constants.js";
import { computeTotals } from "../calc/totals.js";
import { money, toNumber } from "../utils/format.js";
import { store } from "../state/store.js";
import { getRateToPLN } from "../utils/exchangeRates.js";
import { itemNetAfterDiscount } from "../calc/pricing.js";

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
  // 1) Sumy sprzedażowe (netto/VAT/brutto) zostają jak były
  const t = computeTotals(store.items, VAT_RATE);

  // 2) ✅ Wewnętrzne: koszt / zysk / marża liczymy z uwzględnieniem waluty zakupu
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

  setText("sumNet", money(totals.revenueNet));
  setText("sumVat", money(totals.sumVat));
  setText("sumGross", money(totals.sumGross));

  setText("sumCostNet", money(totals.costNet));
  setText("sumProfitNet", money(totals.profitNet));
  setText(
    "sumMargin",
    totals.marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%"
  );
}

export function getTotalsUI() {
  return totals;
}
