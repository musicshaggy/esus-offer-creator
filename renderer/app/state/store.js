// renderer/app/state/store.js

// Central in-memory store used by UI modules.
// A few files import `store.items`, others import helper fns.
// Keep both APIs for compatibility.

export const store = {
  items: [],

  // ✅ Ustawienia oferty / UI
  // - offerCcy: waluta sprzedaży (wszystkie ceny "net" w pozycjach są w tej walucie)
  // - lang: język dokumentu (PDF/UI w przyszłości)
  // - vatCode: kod stawki VAT z UI (np. "23", "19", "27", "0_wdt", "0_ex")
  settings: {
    offerCcy: "PLN", // PLN | EUR | USD
    lang: "pl",      // pl | en | de | hu
    vatCode: "23",   // domyślnie PL	
  },

  offer: {
    ccy: "PLN",   // PLN | EUR | USD
    lang: "pl",   // pl | en | de | hu
    vatCode: "23" // "23" | "19" | "27" | "0_wdt" | "0_ex"
  },
  
  // ✅ Kursy walut do przeliczeń (NBP, relacja do PLN)
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
  // nie dotykamy store.settings/store.exchange
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

// ✅ settery do ustawień oferty / UI
export function setSettings(next) {
  if (!next || typeof next !== "object") return;
  store.settings = {
    ...store.settings,
    ...(next || {}),
  };

  // normalizacja (żeby nie rozjechało się w innych miejscach)
  store.settings.offerCcy = String(store.settings.offerCcy || "PLN").toUpperCase();
  store.settings.lang = String(store.settings.lang || "pl").toLowerCase();
  store.settings.vatCode = String(store.settings.vatCode || "23");
}

export function getSettings() {
  return store.settings;
}

export function setOffer(patch) {
  if (!patch || typeof patch !== "object") return;
  store.offer = { ...store.offer, ...patch };
}

export function getOffer() {
  return store.offer;
}