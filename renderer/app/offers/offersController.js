import { offersService } from "./offersService.js";
import { store, setOffer, setSettings } from "../state/store.js"; // ✅ DODAJ setOffer, setSettings
import { todayYMD } from "../utils/format.js";

let autosaveTimer = null;
let pendingAutosaveFn = null;
let activeOffer = null;

function syncOfferCcyFromPayload(payload) {
  const ccy = String(payload?.meta?.offerCcy || "PLN").toUpperCase();

  // ✅ Źródło prawdy dla bieżącej sesji oferty
  setOffer({ ccy });

  // ✅ Jeśli gdzieś jeszcze patrzysz na settings (np. formatowanie), to synchronizuj
  setSettings({ offerCcy: ccy });
}

function applyNewOfferDefaults(payload) {
  const p = payload || {};
  p.fields = p.fields || {};

  // ✅ ważność zawsze na dziś przy NOWEJ
  p.fields.validUntil = todayYMD();

  // (opcjonalnie) jeżeli wolisz mieć czysto też na poziomie JSON:
  p.fields.termsExtra = "";
  return p;
}

export function setActiveOffer(payload) {
  activeOffer = payload;
  syncOfferCcyFromPayload(payload); // ✅ DODAJ
}

export async function bootLastOrCreateNew(deps) {
  const last = await offersService.getLast();
  const payload = last ? await offersService.open(last) : await offersService.new();

  activeOffer = payload;
  syncOfferCcyFromPayload(payload); // ✅ DODAJ

  deps.setItems(payload.items || []);
  deps.renderItems();
  deps.recalcTotals();
  return payload;
}

export async function createNewOffer(deps) {
  const payloadRaw = await offersService.new();
  const payload = applyNewOfferDefaults(payloadRaw); // ✅ DODAJ

  activeOffer = payload;
  syncOfferCcyFromPayload(payload);

  deps.setItems(payload.items || []);
  deps.renderItems();
  deps.recalcTotals();
  return payload;
}

function pickCurrentOfferCcy() {
  return String(
    store.offer?.ccy ||
    store.settings?.offerCcy ||
    activeOffer?.meta?.offerCcy ||
    "PLN"
  ).toUpperCase();
}

export function collectOfferPayload({ getItems, getTotals }) {
  if (!activeOffer) throw new Error("Brak aktywnej oferty");

  const offerCcy = pickCurrentOfferCcy();

  return {
    ...activeOffer,
    items: getItems(),
    totals: getTotals ? getTotals() : null,
    meta: {
      ...activeOffer.meta,
      offerCcy, // ✅ zapisuj aktualną walutę oferty
      updatedAt: new Date().toISOString(),
    },
  };
}

// --- autosave flush (Twoja wersja) ---
export function scheduleAutosave(fn, delay = 600) {
  pendingAutosaveFn = fn;
  if (autosaveTimer) clearTimeout(autosaveTimer);

  autosaveTimer = setTimeout(async () => {
    autosaveTimer = null;
    const f = pendingAutosaveFn;
    pendingAutosaveFn = null;
    if (typeof f === "function") await f();
  }, delay);
}

export async function flushAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  const f = pendingAutosaveFn;
  pendingAutosaveFn = null;
  if (typeof f === "function") await f();
}

export async function saveNow(payload) {
  return offersService.save(payload);
}

export async function commitAndSaveNow(getters) {
  // 1) commit ostatnio edytowanego pola (blur domyka wpisywanie)
  const ae = document.activeElement;
  if (ae && typeof ae.blur === "function") ae.blur();

  // 2) daj JS-owi przepuścić eventy blur/change (ważne przy 1. edycji po starcie)
  await new Promise((r) => setTimeout(r, 0));

  // 3) jeśli był pending autosave – wykonaj go
  await flushAutosave();

  // 4) HARD SAVE: nawet jeśli nie było pending fn (to jest Twój bug)
  const payload = collectOfferPayload(getters);
  await saveNow(payload);
}