import { toNumber } from "../utils/format.js";
import { store } from "../state/store.js";
import { getRateToPLN } from "../utils/exchangeRates.js";

export function itemNetAfterDiscount(it) {
  const disc = Math.min(100, Math.max(0, toNumber(it.discount)));
  const net = Math.max(0, toNumber(it.net));
  return net * (1 - disc / 100);
}

export function calcRowProfitAndMargin(it) {
  const qty = Math.max(1, parseInt(it.qty || 1, 10));
  const sellNetAfter = itemNetAfterDiscount(it);

  const buyNet = Math.max(0, toNumber(it.buyNet));
  const buyCcy = String(it.buyCcy || "PLN").toUpperCase();

  // ✅ przeliczenie kosztu zakupu do PLN
  const rates = store.exchange?.rates;
  const rate = getRateToPLN(buyCcy, rates);

  console.log("[PRICING]", { buyNet, buyCcy, rates, rate, sellNetAfter, qty });
  
  const buyNetPLN = rate ? (buyNet * rate) : buyNet; // jeśli brak kursu -> traktuj jak PLN

  const revenueLine = sellNetAfter * qty;
  const costLine = buyNetPLN * qty;

  const profitLine = revenueLine - costLine;
  const marginPct = revenueLine > 0 ? (profitLine / revenueLine) * 100 : 0;

  return { profitLine, marginPct };
}
