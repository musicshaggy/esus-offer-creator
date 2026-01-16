import { toNumber } from "../utils/format.js";
import { itemNetAfterDiscount } from "./pricing.js";

export function computeTotals(items, vatRate) {
  const revenueNet = items.reduce((acc, it) => {
    const qty = Math.max(1, parseInt(it.qty || 1, 10));
    return acc + itemNetAfterDiscount(it) * qty;
  }, 0);

  const costNet = items.reduce((acc, it) => {
    const qty = Math.max(1, parseInt(it.qty || 1, 10));
    return acc + Math.max(0, toNumber(it.buyNet)) * qty;
  }, 0);

  const profitNet = revenueNet - costNet;
  const marginPct = revenueNet > 0 ? (profitNet / revenueNet) * 100 : 0;

  const sumVat = revenueNet * vatRate;
  const sumGross = revenueNet + sumVat;

  return { revenueNet, costNet, profitNet, marginPct, sumVat, sumGross };
}
