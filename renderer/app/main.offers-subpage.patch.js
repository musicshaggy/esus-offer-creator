// PATCH: offers as a dedicated subpage instead of translucent modal

import { store } from "./state/store.js";
import { initOffersSubpage } from "./ui/offersPage.js";

// existing imports in your file should stay as-is;
// add only what you need. If you already have init() etc,
// just integrate the functions below.

function showPage(pageId) {
  const main = document.getElementById("mainPage");
  const offers = document.getElementById("offersPage");
  if (!main || !offers) return;

  main.classList.toggle("is-active", pageId === "mainPage");
  offers.classList.toggle("is-active", pageId === "offersPage");
}

export function wireOffersSubpage({ loadOfferIntoForm }) {
  const btnOffers = document.getElementById("btnOffers");
  if (!btnOffers) return null;

  const offersCtl = initOffersSubpage({
    onBack: () => showPage("mainPage"),
    onOpenOfferLoaded: (offer) => {
      // handoff to existing load function
      loadOfferIntoForm?.(offer);
      showPage("mainPage");
    }
  });

  btnOffers.addEventListener("click", async () => {
    showPage("offersPage");
    await offersCtl.refresh();
  });

  return offersCtl;
}
