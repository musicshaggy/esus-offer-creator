// renderer/app/state/store.js

// Central in-memory store used by UI modules.
// A few files import `store.items`, others import helper fns.
// Keep both APIs for compatibility.

export const store = {
  items: [],

  // ✅ Kursy walut do przeliczeń kosztu zakupu -> PLN
  exchange: {
    rates: { USD: 4.0, EUR: 4.3 }, // fallback
    lastUpdated: "brak danych",
    isOutdated: true,
  },
};

export function getItems() {
  return store.items;
}

export function setItems(next) {
  store.items = Array.isArray(next) ? next : [];
}

export function addItem(it) {
  store.items.push(it);
}

export function removeItem(idx) {
  if (!Number.isFinite(idx)) return;
  store.items.splice(idx, 1);
}

export function updateItem(idx, patch) {
  if (!Number.isFinite(idx)) return;
  const it = store.items[idx];
  if (!it) return;
  store.items[idx] = { ...it, ...(patch || {}) };
}

// ✅ settery do kursów
export function setExchange(next) {
  if (!next || typeof next !== "object") return;
  store.exchange = {
    ...store.exchange,
    ...(next || {}),
    rates: { ...(store.exchange?.rates || {}), ...(next?.rates || {}) },
  };
}

export function getExchange() {
  return store.exchange;
}
