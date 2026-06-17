import { el, moneyCcy, toNumber } from "./format.js";
import { getVatRateFromUI } from "./vat.js";

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function getOfferCurrencyFromForm() {
  return String(el("offerCurrency")?.value || "PLN").toUpperCase();
}

export function getShippingInputMode() {
  return el("shippingModeGross")?.checked ? "gross" : "net";
}

export function computeShippingValues({
  amount = null,
  mode = null,
  vatRate = null,
} = {}) {
  const resolvedMode = mode || getShippingInputMode();
  const resolvedVatRate = Number.isFinite(vatRate) ? vatRate : getVatRateFromUI();
  const enteredAmount = Math.max(0, toNumber(amount ?? el("shippingAmount")?.value ?? 0));

  const net = resolvedMode === "gross"
    ? (resolvedVatRate > 0 ? enteredAmount / (1 + resolvedVatRate) : enteredAmount)
    : enteredAmount;
  const gross = resolvedMode === "gross"
    ? enteredAmount
    : enteredAmount * (1 + resolvedVatRate);

  return {
    mode: resolvedMode,
    currency: getOfferCurrencyFromForm(),
    enteredAmount: roundMoney(enteredAmount),
    net: roundMoney(net),
    gross: roundMoney(gross),
  };
}

export function syncShippingFormUi() {
  const amountInput = el("shippingAmount");
  const netInput = el("shippingNet");
  const label = el("shippingNetLabel");
  const netModeLabel = el("shippingModeNetLabel");
  const grossModeLabel = el("shippingModeGrossLabel");
  const enteredValue = el("shippingEnteredValue");
  const grossValue = el("shippingGrossValue");
  const summary = el("shippingSummary");
  const note = el("shippingNote");

  const vatRate = getVatRateFromUI();
  const mode = getShippingInputMode();

  if (amountInput) {
    const rawAmount = String(amountInput.value || "").trim();
    const rawNet = String(netInput?.value || "").trim();
    if (!rawAmount && rawNet) {
      const fallbackNet = Math.max(0, toNumber(rawNet));
      const fallbackAmount = mode === "gross"
        ? roundMoney(vatRate > 0 ? fallbackNet * (1 + vatRate) : fallbackNet)
        : fallbackNet;
      amountInput.value = fallbackAmount ? String(fallbackAmount) : "";
    }
  }

  const values = computeShippingValues();
  if (netInput) netInput.value = String(values.net);

  if (label) {
    label.textContent = `Koszt wysy\u0142ki (${values.currency})`;
  }
  queueMicrotask(() => {
    const liveLabel = el("shippingNetLabel");
    if (liveLabel) liveLabel.textContent = `Koszt wysy\u0142ki (${values.currency})`;
  });

  if (netModeLabel) netModeLabel.dataset.active = values.mode === "net" ? "true" : "false";
  if (grossModeLabel) grossModeLabel.dataset.active = values.mode === "gross" ? "true" : "false";

  if (enteredValue) {
    const suffix = values.mode === "gross" ? "brutto" : "netto";
    enteredValue.textContent = `${moneyCcy(values.enteredAmount, values.currency)} ${suffix}`;
  }

  if (grossValue) {
    grossValue.textContent = moneyCcy(values.gross, values.currency);
  }

  const hasShippingCost = values.enteredAmount > 0;
  if (summary) summary.dataset.visible = hasShippingCost ? "true" : "false";
  if (note) note.style.display = hasShippingCost ? "none" : "block";

  return values;
}
