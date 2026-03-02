import { toNumber } from "../utils/format.js";
import { store } from "../state/store.js";
import { toPLN, fromPLN } from "../utils/currency.js"; // możesz importować z currency.js

export function itemNetAfterDiscount(it) {
  const disc = Math.min(100, Math.max(0, toNumber(it.discount)));
  const net = Math.max(0, toNumber(it.net));
  return net * (1 - disc / 100);
}

export function calcRowProfitAndMargin(it) {
  const qty = Math.max(1, parseInt(it.qty || 1, 10));

  const offerCcy = String(store.offer?.ccy || "PLN").toUpperCase();

  // sprzedaż (waluta oferty)
  const sellNetAfter = itemNetAfterDiscount(it);           // w walucie oferty
  const revenueOffer = sellNetAfter * qty;                 // offer ccy
  const revenuePLN = toPLN(revenueOffer, offerCcy);

  // zakup (waluta pozycji)
  const buyNet = Math.max(0, toNumber(it.buyNet));         // w buyCcy
  const buyCcy = String(it.buyCcy || "PLN").toUpperCase();
  const costPLN = toPLN(buyNet * qty, buyCcy);

  const profitPLN = revenuePLN - costPLN;

  // profit pokazujemy w walucie oferty
  const profitLine = fromPLN(profitPLN, offerCcy);

  // marża % liczona logicznie od sprzedaży (niezależna od waluty)
  const marginPct = revenuePLN > 0 ? (profitPLN / revenuePLN) * 100 : 0;

  return { profitLine, marginPct };
}
