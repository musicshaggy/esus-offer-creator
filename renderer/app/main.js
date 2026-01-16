import { el, q } from "./ui/dom.js";
import { todayYMD } from "./utils/format.js";

import { store, setItems, getItems, addItem } from "./state/store.js";
import { recalcTotalsUI, getTotalsUI } from "./ui/totalsPanel.js";

import { initWindowControls } from "./ui/windowControls.js";
import { ensureUserProfile, applyProfileToForm } from "./ui/profileModal.js";
import { refreshOfferPreview, loadUserInitialsAndSeq, persistInitials } from "./ui/offerNumber.js";
import { initOffersSubpage } from "./ui/offersPage.js";
import { renderItems } from "./ui/itemsTable.js";

import { clearSavedState, loadStateFromStorage } from "./state/persistence.js";
import { generatePdf } from "./export/pdf.js";
import { initExcelExport } from "./export/excel.js";

import {
  bootLastOrCreateNew,
  createNewOffer,
  collectOfferPayload,
  scheduleAutosave,
  saveNow,
  setActiveOffer,
} from "./offers/offersController.js";

let cameFromMainPage = false;

function showPage(pageId) {
  const mainPage = document.getElementById("mainPage");
  const offersPage = document.getElementById("offersPage");
  if (!mainPage || !offersPage) return;
  
  if (pageId === "offersPage") {
    cameFromMainPage = mainPage.classList.contains("is-active");
  }

  mainPage.classList.toggle("is-active", pageId === "mainPage");
  offersPage.classList.toggle("is-active", pageId === "offersPage");
  


  // Shared header action sets (single header for both views)
  const actionsMain = document.getElementById("headerActionsMain");
  const actionsOffers = document.getElementById("headerActionsOffers");
  const headerTitle = document.getElementById("headerTitle");
  const btnBack = document.getElementById("btnOffersBack");

  if (actionsMain) actionsMain.style.display = pageId === "mainPage" ? "flex" : "none";
  if (actionsOffers) actionsOffers.style.display = pageId === "offersPage" ? "flex" : "none";

  if (headerTitle) {
    headerTitle.textContent = pageId === "offersPage" ? "Oferty" : "Generator wyceny (PDF)";
  }
    if (btnBack) {
    btnBack.style.display =
      pageId === "offersPage" && cameFromMainPage ? "inline-flex" : "none";
  }
}

function normalizeItem(it = {}) {
  return {
    desc: it.desc ?? "",
    net: Number(it.net ?? 0),
    buyNet: Number(it.buyNet ?? 0),
    discount: Number(it.discount ?? 0),
    qty: Math.max(1, parseInt(it.qty ?? 1, 10) || 1),
  };
}

async function autosaveActiveOffer() {
if (document.getElementById("offersPage")?.classList.contains("is-active")) return;
  try {
    const payload = collectOfferPayload({ getItems, getTotals: getTotalsUI });

    // keep basic form fields for list preview / re-open
    payload.fields = payload.fields || {};
    document.querySelectorAll("input,select,textarea").forEach((n) => {
      if (!n.id) return;
      payload.fields[n.id] = n.type === "checkbox" ? !!n.checked : n.value;
    });

    await saveNow(payload);
  } catch (e) {
    console.warn("Autosave failed:", e);
  }
}

function wireAutosaveOnFormInputs() {
  document.querySelectorAll("input,select,textarea").forEach((n) => {
    n.addEventListener("input", () => scheduleAutosave(autosaveActiveOffer));
    n.addEventListener("change", () => scheduleAutosave(autosaveActiveOffer));
  });
}

function wireAddItemButtons() {
  const add = () => {
    addItem(normalizeItem({ qty: 1 }));
    // re-render with callbacks so totals/autosave keep working
    renderItems({
      onTotalsChanged: recalcTotalsUI,
      onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
    });
    recalcTotalsUI();
    scheduleAutosave(autosaveActiveOffer);
  };

  el("btnAddItem")?.addEventListener("click", add);
  el("btnAddItem2")?.addEventListener("click", add);
}

function wirePdfButton() {
  el("btnPdf")?.addEventListener("click", async () => {
    await generatePdf({
      onBefore: () => {
        recalcTotalsUI();
      },
    });
    scheduleAutosave(autosaveActiveOffer);
  });
}

function wireClearButton() {
  el("btnClear")?.addEventListener("click", () => {
    clearSavedState();
    // keep UI consistent
    setItems([]);
    renderItems({ onTotalsChanged: recalcTotalsUI, onStateChanged: () => scheduleAutosave(autosaveActiveOffer) });
    recalcTotalsUI();
    alert("Wyczyszczono zapis lokalny (localStorage).");
  });
}

function wireOfferNumberControls() {
  const initialsEl = el("creatorInitials");
  const seqEl = el("monthlySeq");
  if (!initialsEl || !seqEl) return;

  initialsEl.addEventListener("input", async () => {
    refreshOfferPreview();
    await persistInitials(initialsEl.value);
  });
  seqEl.addEventListener("input", refreshOfferPreview);
}

function wireTermsUi() {
  const pm = el("paymentMethod");
  const wrap = el("invoiceDaysWrap");
  const shipNet = el("shippingNet");
  const shipNote = el("shippingNote");

  const refresh = () => {
    if (pm && wrap) {
      wrap.style.display = pm.value === "invoice" ? "block" : "none";
    }
    if (shipNet && shipNote) {
      const v = Number(shipNet.value || 0);
      shipNote.style.display = v === 0 ? "block" : "none";
    }
  };

  pm?.addEventListener("change", () => {
    refresh();
    scheduleAutosave(autosaveActiveOffer);
  });
  shipNet?.addEventListener("input", () => {
    refresh();
    scheduleAutosave(autosaveActiveOffer);
  });

  refresh();
}

	function formEl(id) {
	  const root = document.getElementById("mainPage");
	  if (!root) return document.getElementById(id);
	  return root.querySelector(`#${CSS.escape(id)}`) || document.getElementById(id);
	}
	
	function clearCustomerFields() {
  // Czyścimy UI zawsze przez formEl (root = #mainPage) – bez ryzyka konfliktu ID
  const ids = ["custName", "custNip", "custAddr", "custContact"];
  for (const id of ids) {
    const node = formEl(id);
    if (!node) continue;

    if ("value" in node) node.value = "";
    else node.textContent = "";

    // Żeby logika nasłuchów (input/change) nie "odbiła" starych wartości
    try {
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
  }
}


async function init() {
  initWindowControls();




  // date defaults (if field exists)
  const dateEl = el("offerDate");
  if (dateEl && !dateEl.value) dateEl.value = todayYMD();

  // Ensure user profile exists, then populate form
  try {
    const profile = await ensureUserProfile();
    applyProfileToForm(profile);

    // default initials from profile if creatorInitials empty
    const initialsEl = el("creatorInitials");
    if (initialsEl && !initialsEl.value.trim()) initialsEl.value = profile?.initials || "";
  } catch (e) {
    console.warn("Profile init failed:", e);
  }

  // Load initials + monthly seq from settings (Electron) if available
  await loadUserInitialsAndSeq({
    getInitialsEl: el("creatorInitials"),
    setInitialsEl: el("creatorInitials"),
    setSeqEl: el("monthlySeq"),
  });
  refreshOfferPreview();
  wireOfferNumberControls();

  wireTermsUi();

  // Render items with callbacks
  renderItems({
    onTotalsChanged: recalcTotalsUI,
    onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
  });
  recalcTotalsUI();

  wireAddItemButtons();
  wirePdfButton();
  initExcelExport({
    onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
  });
  wireClearButton();
  wireAutosaveOnFormInputs();

  // Offers (Electron) – fallback to localStorage when run in browser
  const deps = {
    setItems: (items) => setItems((items || []).map(normalizeItem)),
    renderItems: () =>
      renderItems({
        onTotalsChanged: recalcTotalsUI,
        onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
      }),
    recalcTotals: recalcTotalsUI,
  };

  // If we have esusAPI (Electron), use offers module.
  // Otherwise try localStorage restore.
  if (window.esusAPI) {
    const payload = await bootLastOrCreateNew(deps);
    if (el("offerNumberPreview")) el("offerNumberPreview").textContent = payload?.meta?.offerNo || "—";

    
const offersCtl = initOffersSubpage({
  onBack: () => showPage("mainPage"),

	onNewOffer: async () => {
	  const p = await createNewOffer(deps);
	  setActiveOffer(p);

	  if (el("offerNumberPreview")) {
		el("offerNumberPreview").textContent = p?.meta?.offerNo || "—";
	  }

	  showPage("mainPage");

	  // WAŻNE: wyczyść klienta *po* przełączeniu widoku (żeby nic go nie nadpisało)
	  queueMicrotask(() => {
		clearCustomerFields();
		scheduleAutosave(autosaveActiveOffer);
	  });
	},


  onOpenOfferLoaded: async (p) => {
	  setActiveOffer(p);

	  if (el("offerNumberPreview")) {
		el("offerNumberPreview").textContent =
		  p?.meta?.offerNo || p?.offerNo || "—";
	  }

	  // APPLY FIELDS (żeby klient i reszta pól nie zostawały z poprzedniej oferty)
	  const fields = p?.fields || {};
	  ["custName", "custNip", "custAddr", "custContact"].forEach((id) => {
		  const node = formEl(id);
		  if (node) node.value = "";
		});

	  Object.keys(fields).forEach((id) => {
		const node = formEl(id);
		if (!node) return;

		const val = fields[id];
		if (node.type === "checkbox") node.checked = !!val;
		else node.value = val ?? "";
	  });

	  setItems((p.items || []).map(normalizeItem));
	  deps.renderItems();
	  recalcTotalsUI();

	  document.getElementById("paymentMethod")
		?.dispatchEvent(new Event("change"));
	  document.getElementById("shippingNet")
		?.dispatchEvent(new Event("input"));

	  scheduleAutosave(autosaveActiveOffer);
	  showPage("mainPage");
  }
});


        el("btnOffers")?.addEventListener("click", async () => {
          showPage("offersPage");
          await offersCtl.refresh();
        });


    

    // Start application at offers list
    showPage("offersPage");
    await offersCtl.refresh();
	el("btnNewOffer")?.addEventListener("click", async () => {
	  const p = await createNewOffer(deps);
	  setActiveOffer(p);

	  if (el("offerNumberPreview")) {
		el("offerNumberPreview").textContent = p?.meta?.offerNo || "—";
	  }

	  showPage("mainPage");

	  queueMicrotask(() => {
		clearCustomerFields();
		scheduleAutosave(autosaveActiveOffer);
	  });
	});

	
	
  } else {
    // Browser mode
    loadStateFromStorage({
      afterApply: () => {
        renderItems({
          onTotalsChanged: recalcTotalsUI,
          onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
        });
        recalcTotalsUI();
      },
    });
  }
}

async function initAppVersion() {
  const el = document.getElementById("appVersion");
  if (!el) return;

  try {
    const v = await window.esusAPI.getAppVersion();
    el.textContent = `v${v}`;
  } catch {
    el.textContent = "";
  }
}

initAppVersion();


// ===== Currency dropdown (PLN/USD/EUR) – UI only =====
(function initCurrencyDropdown() {
	let activePortal = null; // { menu, btn, wrap, placeholder }

	function positionPortal(menu, btn) {
	  const r = btn.getBoundingClientRect();
	  const gap = 6;

	  // prawa krawędź menu równo z prawą krawędzią przycisku
	  const menuWidth = menu.getBoundingClientRect().width || 120;
	  const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, r.right - menuWidth));
	  const top = Math.min(window.innerHeight - 8, r.bottom + gap);

	  menu.style.left = `${left}px`;
	  menu.style.top = `${top}px`;
	}
		
	
	function closeAllMenus() {
	  // zamknij normalne
	  document.querySelectorAll(".js-ccyMenu.is-open").forEach((m) => {
		m.classList.remove("is-open");
		m.setAttribute("aria-hidden", "true");
		m.closest(".input-money")?.classList.remove("ccy-open");
	  });
	  document.querySelectorAll(".js-ccyBtn[aria-expanded='true']").forEach((b) => {
		b.setAttribute("aria-expanded", "false");
	  });

	  // zamknij portal (jeśli aktywny)
	  if (activePortal) {
		const { menu, placeholder, wrap, btn } = activePortal;

		menu.classList.remove("is-open");
		menu.classList.remove("is-portal");
		menu.setAttribute("aria-hidden", "true");

		// wróć menu na miejsce w DOM
		if (placeholder && placeholder.parentNode) {
		  placeholder.replaceWith(menu);
		}

		wrap?.classList.remove("ccy-open");
		btn?.setAttribute("aria-expanded", "false");

		activePortal = null;
	  }
	}


  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-ccyBtn");
    const opt = e.target.closest(".ccyOpt");

    // Klik w opcję waluty
    if (opt) {
      const wrap = opt.closest(".input-money");
      const menu = wrap?.querySelector(".js-ccyMenu");
      const ccyBtn = wrap?.querySelector(".js-ccyBtn");
      const ccy = opt.getAttribute("data-ccy") || "PLN";

      if (ccyBtn) {
        ccyBtn.dataset.ccy = ccy;
        // tekst na przycisku (z chevronem)
        const hasChevron = ccyBtn.querySelector("i");
        ccyBtn.textContent = ccy + " ";
        if (hasChevron) ccyBtn.appendChild(hasChevron);
      }

      // Na razie nic więcej nie robimy (UI-only)
      closeAllMenus();
      e.preventDefault();
      return;
    }

    // Klik w przycisk waluty – toggle menu
    if (btn) {
	  const wrap = btn.closest(".input-money");
	  const menu = wrap?.querySelector(".js-ccyMenu");
	  if (!wrap || !menu) return;

	  const isOpen = activePortal?.btn === btn; // ten sam dropdown otwarty?
	  closeAllMenus();

	  if (!isOpen) {
		// portal: wstaw placeholder, przenieś menu do body
		const placeholder = document.createElement("span");
		placeholder.style.display = "none";
		menu.before(placeholder);

		document.body.appendChild(menu);
		menu.classList.add("is-portal");
		menu.classList.add("is-open");
		menu.setAttribute("aria-hidden", "false");
		btn.setAttribute("aria-expanded", "true");
		wrap.classList.add("ccy-open");

		// pozycjonowanie po renderze
		requestAnimationFrame(() => positionPortal(menu, btn));

		activePortal = { menu, btn, wrap, placeholder };
	  }

	  e.preventDefault();
	  return;
	}

	window.addEventListener("scroll", () => {
	  if (activePortal) positionPortal(activePortal.menu, activePortal.btn);
	}, true); // true = łapie scroll na dowolnym kontenerze

	window.addEventListener("resize", () => {
	  if (activePortal) positionPortal(activePortal.menu, activePortal.btn);
	});
    // Klik poza – zamknij
    closeAllMenus();
  });

  // ESC zamyka
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });
})();


window.addEventListener("DOMContentLoaded", init);
