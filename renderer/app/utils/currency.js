import { store } from "../state/store.js";
import { getRateToPLN } from "./exchangeRates.js";

export function toPLN(amount, ccy) {
  const a = Number(amount || 0);
  const code = String(ccy || "PLN").toUpperCase();
  if (code === "PLN") return a;
  const r = getRateToPLN(code, store.exchange?.rates);
  return r ? a * r : a; // fallback: traktuj jak PLN jeśli brak kursu
}

export function fromPLN(amountPLN, ccy) {
  const a = Number(amountPLN || 0);
  const code = String(ccy || "PLN").toUpperCase();
  if (code === "PLN") return a;
  const r = getRateToPLN(code, store.exchange?.rates);
  return r ? a / r : a;
}

// konwersja między dowolnymi walutami via PLN
export function convert(amount, fromCcy, toCcy) {
  const pln = toPLN(amount, fromCcy);
  return fromPLN(pln, toCcy);
}
