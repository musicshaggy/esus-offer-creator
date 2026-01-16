import { offersService } from "./offersService.js";

let autosaveTimer=null;
let activeOffer=null;

export function setActiveOffer(payload){
  activeOffer = payload;
}

export async function bootLastOrCreateNew(deps){
  const last = await offersService.getLast();
  const payload = last ? await offersService.open(last) : await offersService.new();
  activeOffer = payload;
  deps.setItems(payload.items||[]);
  deps.renderItems();
  deps.recalcTotals();
  return payload;
}

export async function createNewOffer(deps){
  const payload = await offersService.new();
  activeOffer = payload;
  deps.setItems(payload.items||[]);
  deps.renderItems();
  deps.recalcTotals();
  return payload;
}

export function collectOfferPayload({getItems,getTotals}){
  if(!activeOffer) throw new Error("Brak aktywnej oferty");
  return {
    ...activeOffer,
    items: getItems(),
    totals: getTotals?getTotals():null,
    meta: {...activeOffer.meta, updatedAt:new Date().toISOString()}
  };
}

export function scheduleAutosave(fn, delay=600){
  if(autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(fn, delay);
}

export async function saveNow(payload){
  return offersService.save(payload);
}
