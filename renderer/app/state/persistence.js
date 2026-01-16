import { ESUS_STORAGE_KEY } from "../config/constants.js";
import { store, setItems } from "./store.js";

export function collectFormState() {
  const fields = {};
  document.querySelectorAll("input, select, textarea").forEach((node) => {
    if (!node.id) return;
    fields[node.id] = node.type === "checkbox" ? !!node.checked : node.value;
  });
  return { fields, items: store.items, savedAt: new Date().toISOString() };
}

export function applyFormState(state, { afterApply } = {}) {
  if (!state || typeof state !== "object") return;

  if (state.fields) {
    Object.entries(state.fields).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (!node) return;
      if (node.type === "checkbox") node.checked = !!value;
      else node.value = value;
    });
  }

  if (Array.isArray(state.items)) {
    setItems(state.items.map((it) => ({
      desc: it.desc ?? "",
      net: Number(it.net ?? 0),
      buyNet: Number(it.buyNet ?? 0),
      discount: Number(it.discount ?? 0),
      qty: Math.max(1, parseInt(it.qty ?? 1, 10)),
    })));
  }

  const pm = document.getElementById("paymentMethod");
  const wrap = document.getElementById("invoiceDaysWrap");
  if (pm && wrap) wrap.style.display = pm.value === "invoice" ? "block" : "none";

  afterApply?.();
}

export function saveStateToStorage() {
  try {
    localStorage.setItem(ESUS_STORAGE_KEY, JSON.stringify(collectFormState()));
  } catch (e) {
    console.warn("Nie udało się zapisać stanu:", e);
  }
}

export function loadStateFromStorage({ afterApply } = {}) {
  try {
    const raw = localStorage.getItem(ESUS_STORAGE_KEY);
    if (!raw) return false;
    applyFormState(JSON.parse(raw), { afterApply });
    return true;
  } catch (e) {
    console.warn("Nie udało się wczytać stanu:", e);
    return false;
  }
}

export function clearSavedState() {
  localStorage.removeItem(ESUS_STORAGE_KEY);
}

export function wireAutosave() {
  const handler = () => saveStateToStorage();
  document.querySelectorAll("input, select, textarea").forEach((node) => {
    node.addEventListener("input", handler);
    node.addEventListener("change", handler);
  });
}
