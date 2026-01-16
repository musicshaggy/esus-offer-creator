import { VAT_RATE } from "../config/constants.js";
import { computeTotals } from "../calc/totals.js";
import { money } from "../utils/format.js";
import { store } from "../state/store.js";

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

export function recalcTotalsUI() {
  totals = computeTotals(store.items, VAT_RATE);

  setText("sumNet", money(totals.revenueNet));
  setText("sumVat", money(totals.sumVat));
  setText("sumGross", money(totals.sumGross));

  setText("sumCostNet", money(totals.costNet));
  setText("sumProfitNet", money(totals.profitNet));
  setText("sumMargin", totals.marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%");
}

export function getTotalsUI() {
  return totals;
}
