// Central in-memory store used by UI modules.
// A few files import `store.items`, others import helper fns.
// Keep both APIs for compatibility.

export const store = {
  items: [],
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
