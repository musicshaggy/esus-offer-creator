import { store } from "../state/store.js";
import { getRateToPLN } from "./exchangeRates.js";


function roundMoney2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toPLN(amount, ccy) {
  const n = Number(amount || 0);
  const from = String(ccy || "PLN").toUpperCase();

  if (from === "PLN") return roundMoney2(n);

  const rates = store.exchange?.rates || {};
  const rate = Number(rates[from]);
  if (!Number.isFinite(rate) || rate <= 0) return roundMoney2(n); // fallback

  return roundMoney2(n * rate);
}

export function fromPLN(amountPLN, ccy) {
  const n = Number(amountPLN || 0);
  const to = String(ccy || "PLN").toUpperCase();

  if (to === "PLN") return roundMoney2(n);

  const rates = store.exchange?.rates || {};
  const rate = Number(rates[to]);
  if (!Number.isFinite(rate) || rate <= 0) return roundMoney2(n); // fallback

  return roundMoney2(n / rate);
}

export function convert(amount, fromCcy, toCcy) {
  const from = String(fromCcy || "PLN").toUpperCase();
  const to = String(toCcy || "PLN").toUpperCase();
  const n = Number(amount || 0);

  if (from === to) return roundMoney2(n);

  const pln = toPLN(n, from);
  return fromPLN(pln, to);
}
