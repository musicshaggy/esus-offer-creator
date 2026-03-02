import { store, setOffer } from "../state/store.js";
import { convert } from "../utils/currency.js";
import { toNumber } from "../utils/format.js";

export function changeOfferCurrency(nextCcy) {
  const prev = String(store.offer?.ccy || "PLN").toUpperCase();
  const next = String(nextCcy || "PLN").toUpperCase();
  if (prev === next) return;

  // 1) przelicz ceny sprzedaży na pozycjach (netto)
  store.items.forEach((it) => {
    const net = toNumber(it.net);
    it.net = convert(net, prev, next);
  });

  // 2) przelicz wysyłkę (shippingNet) – to jest pole oferty
  const shipEl = document.getElementById("shippingNet");
  if (shipEl) {
    const ship = toNumber(shipEl.value);
    shipEl.value = convert(ship, prev, next).toFixed(2);
  }

  // 3) ustaw walutę oferty w store
  setOffer({ ccy: next });
}
