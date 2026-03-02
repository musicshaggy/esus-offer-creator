import { el, q } from "./ui/dom.js";
import { todayYMD } from "./utils/format.js";

import { store, setItems, getItems, addItem } from "./state/store.js";
import { recalcTotalsUI, getTotalsUI } from "./ui/totalsPanel.js";

import { initWindowControls } from "./ui/windowControls.js";
import { ensureUserProfile, applyProfileToForm } from "./ui/profileModal.js";
import { refreshOfferPreview, loadUserInitialsAndSeq, persistInitials } from "./ui/offerNumber.js";
import { initOffersSubpage } from "./ui/offersPage.js";
import { renderItems, recalcAllRowsUI } from "./ui/itemsTable.js";

import { clearSavedState, loadStateFromStorage } from "./state/persistence.js";
import { generatePdf } from "./export/pdf.js";
import { initExcelExport } from "./export/excel.js";
import {
  showToast,
  showToastAction,
  showToastProgress,
  updateToastProgress,
  endToastProgress,
} from "./ui/toast.js";

import { fetchExchangeRates, loadCachedExchangeRates } from "./utils/exchangeRates.js";
import { setExchange } from "./state/store.js";
import { changeOfferCurrency } from "./utils/offerCurrency.js";

import {
  bootLastOrCreateNew,
  createNewOffer,
  collectOfferPayload,
  scheduleAutosave,
  saveNow,
  setActiveOffer,
  flushAutosave,
  commitAndSaveNow, // ✅ DODANE
} from "./offers/offersController.js";

// 1) sync: z localStorage (żeby EUR/USD działało od razu po otwarciu oferty)
setExchange(loadCachedExchangeRates());

// 2) async: odśwież z NBP i po tym przelicz UI
fetchExchangeRates().then((ex) => {
  setExchange(ex);

  try {
    recalcAllRowsUI();
    recalcTotalsUI?.();
  } catch {}
});

let cameFromMainPage = false;
let currentOfferId = null; // ID aktualnie otwartej oferty w formularzu

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
      pageId === "offersPage" && cameFromMainPage && !!currentOfferId
        ? "inline-flex"
        : "none";
  }
}

function initOfferSettingsUI() {
  const lang = document.getElementById("offerLang");
  const vat = document.getElementById("offerVat");
  const ccy = document.getElementById("offerCurrency");
  if (!lang || !vat) return;

  const defaultVatByLang = {
    pl: "23",
    hu: "27",
    de: "19",
    en: "23",
  };

  // tylko EN/DE -> EUR, reszta bez zmian
  const defaultCcyByLang = {
    en: "EUR",
    de: "EUR",
	pl: "PLN"
  };

  let vatManuallyChanged = false;
  let ccyManuallyChanged = false;

  // ✅ tylko zmiany użytkownika blokują automat
  vat.addEventListener("change", (e) => {
    if (e?.isTrusted) vatManuallyChanged = true;
  });

  ccy?.addEventListener("change", (e) => {
    if (e?.isTrusted) ccyManuallyChanged = true;
  });

  lang.addEventListener("change", () => {
    const langCode = String(lang.value || "pl");

    // 1) VAT auto
    if (!vatManuallyChanged) {
      const nextVat = defaultVatByLang[langCode] || "23";
      if (String(vat.value || "") !== String(nextVat)) {
        vat.value = nextVat;
        // odpali Twoje istniejące przeliczenia (offerVat change listener)
        vat.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // 2) Waluta auto (tylko en/de -> EUR)
    if (ccy && !ccyManuallyChanged) {
      const nextCcy = defaultCcyByLang[langCode] || null;
      if (nextCcy && String(ccy.value || "").toUpperCase() !== nextCcy) {
        ccy.value = nextCcy;
        // odpali Twoją istniejącą logikę przeliczania (offerCurrency change listener)
        ccy.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });

  // init VAT (jak było)
  const initialVat = defaultVatByLang[String(lang.value || "pl")] || "23";
  vat.value = vat.value || initialVat;
}

document.addEventListener("DOMContentLoaded", () => {
  initOfferSettingsUI();
});

function normalizeItem(it = {}) {
  const w = it?.warranty && typeof it.warranty === "object" ? it.warranty : {};
  const months = Math.max(0, parseInt(w.months ?? 0, 10) || 0);
  const nbd = !!w.nbd;

  return {
    desc: it.desc ?? "",
    net: Number(it.net ?? 0),
    buyNet: Number(it.buyNet ?? 0),
    buyCcy: String(it.buyCcy || "PLN").toUpperCase(),
    discount: Number(it.discount ?? 0),
    qty: Math.max(1, parseInt(it.qty ?? 1, 10) || 1),
    warranty: { months, nbd },
  };
}

async function autosaveActiveOffer() {
  if (document.getElementById("offersPage")?.classList.contains("is-active")) return;
  try {
    const payload = collectOfferPayload({ getItems, getTotals: getTotalsUI });

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
    setItems([]);
    renderItems({
      onTotalsChanged: recalcTotalsUI,
      onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
    });
    recalcTotalsUI();
    showToast("Wyczyszczono zapis lokalny (localStorage).");
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
  const ids = ["custName", "custNip", "custAddr", "custContact"];
  for (const id of ids) {
    const node = formEl(id);
    if (!node) continue;

    if ("value" in node) node.value = "";
    else node.textContent = "";

    try {
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
  }
}

function clampInt(v, min, max, fallback) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function applyInvoiceDaysToFormValue(raw) {
  const node = formEl("invoiceDays");
  if (!node) return;

  if (raw === undefined || raw === null || String(raw).trim() === "") {
    node.value = "";
    return;
  }

  const val = clampInt(raw, 1, 60, 14);
  node.value = String(val);
}

function wireInvoiceDaysInput() {
  const node = formEl("invoiceDays");
  if (!node) return;

  node.addEventListener("input", () => {
    clampInt(node.value, 1, 60, 14);
    scheduleAutosave(autosaveActiveOffer);
  });

  node.addEventListener("blur", () => {
    const val = clampInt(node.value, 1, 60, 14);
    node.value = String(val);
    scheduleAutosave(autosaveActiveOffer);
  });
}

function setValidUntilToday() {
  const node = formEl("validUntil");
  if (!node) return;
  node.value = todayYMD();
}

function clearFormFieldsForNewOffer() {
  const ids = [
    "custName",
    "custNip",
    "custAddr",
    "custContact",
    "termsExtra",       
    "creatorNotes",
    "shippingNet",
    "shippingNote",
    "estimateDays",
  ];

  ids.forEach((id) => {
    const node = formEl(id);
    if (!node) return;

    if (node.type === "checkbox") node.checked = false;
    else node.value = "";

    try {
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
  });
}

async function init() {
  initWindowControls();

  const dateEl = el("offerDate");
  if (dateEl && !dateEl.value) dateEl.value = todayYMD();

  try {
    const profile = await ensureUserProfile();
    applyProfileToForm(profile);

    const initialsEl = el("creatorInitials");
    if (initialsEl && !initialsEl.value.trim()) initialsEl.value = profile?.initials || "";
  } catch (e) {
    console.warn("Profile init failed:", e);
  }

  await loadUserInitialsAndSeq({
    getInitialsEl: el("creatorInitials"),
    setInitialsEl: el("creatorInitials"),
    setSeqEl: el("monthlySeq"),
  });
  refreshOfferPreview();
  wireOfferNumberControls();

  wireTermsUi();
  wireInvoiceDaysInput();

  renderItems({
    onTotalsChanged: recalcTotalsUI,
    onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
  });
  recalcTotalsUI();
  recalcAllRowsUI();

  wireAddItemButtons();
  wirePdfButton();
  initExcelExport({
    onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
  });
  wireClearButton();
  wireAutosaveOnFormInputs();

  const deps = {
    setItems: (items) => setItems((items || []).map(normalizeItem)),
    renderItems: () =>
      renderItems({
        onTotalsChanged: recalcTotalsUI,
        onStateChanged: () => scheduleAutosave(autosaveActiveOffer),
      }),
    recalcTotals: recalcTotalsUI,
  };

  window.__esusRecalcAfterRates = () => {
    deps.renderItems();
    recalcTotalsUI();
  };

  if (window.esusAPI) {
    const payload = await bootLastOrCreateNew(deps);
    if (el("offerNumberPreview")) el("offerNumberPreview").textContent = payload?.meta?.offerNo || "—";

    const offersCtl = initOffersSubpage({
      onBack: () => showPage("mainPage"),

      onNewOffer: async () => {
        const p = await createNewOffer(deps);
        setActiveOffer(p);

        currentOfferId = p?.id || null;
        if (el("offerNumberPreview")) {
          el("offerNumberPreview").textContent = p?.meta?.offerNo || "—";
        }

        showPage("mainPage");

        queueMicrotask(() => {
		  clearFormFieldsForNewOffer();   // 🔥 zamiast clearCustomerFields
		  setValidUntilToday();           // 🔥 ustaw datę
		  scheduleAutosave(autosaveActiveOffer);
        });
      },

      onOpenOfferLoaded: async (p) => {
        setActiveOffer(p);

        currentOfferId = p?.id || null;
        if (el("offerNumberPreview")) {
          el("offerNumberPreview").textContent = p?.meta?.offerNo || p?.offerNo || "—";
        }

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
		
		setValidUntilToday();
        applyInvoiceDaysToFormValue(fields.invoiceDays);

        setItems((p.items || []).map(normalizeItem));
        deps.renderItems();
        recalcTotalsUI();
        recalcAllRowsUI();

        document.getElementById("paymentMethod")?.dispatchEvent(new Event("change"));
        document.getElementById("shippingNet")?.dispatchEvent(new Event("input"));

        scheduleAutosave(autosaveActiveOffer);
        showPage("mainPage");
      },
    });

    el("btnOffers")?.addEventListener("click", async () => {
      // ✅ ENTERPRISE: pewny zapis ostatniej zmiany (bug "pierwsza zmiana po starcie")
      try {
        await commitAndSaveNow({ getItems, getTotals: getTotalsUI });
      } catch (e) {
        console.warn("commitAndSaveNow failed:", e);
        // fallback: chociaż flush
        try {
          const ae = document.activeElement;
          if (ae && typeof ae.blur === "function") ae.blur();
          await new Promise((r) => setTimeout(r, 0));
          await flushAutosave();
        } catch {}
      }

      showPage("offersPage");
      await offersCtl.refresh();
    });

    showPage("offersPage");
    await offersCtl.refresh();

    el("btnNewOffer")?.addEventListener("click", async () => {
      const p = await createNewOffer(deps);
      setActiveOffer(p);

      currentOfferId = p?.id || null;
      if (el("offerNumberPreview")) {
        el("offerNumberPreview").textContent = p?.meta?.offerNo || "—";
      }

      showPage("mainPage");

      queueMicrotask(() => {
		  clearFormFieldsForNewOffer();   // 🔥 zamiast clearCustomerFields
		  setValidUntilToday();           // 🔥 ustaw datę
		  scheduleAutosave(autosaveActiveOffer);
      });
    });
  } else {
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

// ===== Auto-update toasts (electron-updater) =====
function initUpdateToasts() {
  if (!window.esusAPI?.onUpdateAvailable) return;

  let downloading = false;
  let lastPct = -1;

  window.esusAPI.onUpdateAvailable((d) => {
    if (downloading) return;
    const v = d?.version ? ` v${d.version}` : "";
    showToastAction(`Dostępna aktualizacja${v}.`, {
      type: "info",
      ms: 15000,
      actionLabel: "Pobierz",
      secondaryLabel: "Później",
      onSecondary: async () => {},
      keepOpenOnAction: true,
      onAction: async () => {
        try {
          downloading = true;
          lastPct = -1;
          showToastProgress("Pobieranie aktualizacji…");
          await window.esusAPI.updateDownload();
        } catch (e) {
          downloading = false;
          endToastProgress();
          console.warn(e);
          showToast("Nie udało się pobrać aktualizacji.", { type: "error", ms: 4500 });
        }
      },
    });
  });

  window.esusAPI.onUpdateProgress?.((p) => {
    if (!downloading) return;
    const pct = Number(p?.percent ?? 0);
    if (!Number.isFinite(pct)) return;
    const rounded = Math.max(0, Math.min(100, Math.round(pct)));
    if (rounded === lastPct) return;
    lastPct = rounded;
    updateToastProgress(rounded);
  });

  window.esusAPI.onUpdateDownloaded((d) => {
    downloading = false;
    endToastProgress();

    const v = d?.version ? ` v${d.version}` : "";
    showToastAction(`Aktualizacja${v} pobrana.`, {
      type: "info",
      ms: 0,
      actionLabel: "Uruchom ponownie",
      secondaryLabel: "Później",
      onSecondary: async () => {},
      onAction: async () => {
        await window.esusAPI.updateQuitAndInstall();
      },
    });
  });

  window.esusAPI.onUpdateError((d) => {
    downloading = false;
    endToastProgress();
    console.warn("Updater error:", d);
    showToast("Błąd aktualizacji (szczegóły w konsoli).", { type: "error", ms: 5000 });
  });

  window.esusAPI.updateGetStatus?.()
    .then((st) => {
      if (st?.downloaded?.version) {
        const v = ` v${st.downloaded.version}`;
        showToastAction(`Aktualizacja${v} pobrana.`, {
          type: "info",
          ms: 0,
          actionLabel: "Uruchom ponownie",
          secondaryLabel: "Później",
          onSecondary: async () => {},
          onAction: async () => window.esusAPI.updateQuitAndInstall(),
        });
      }
    })
    .catch(() => {});
}

window.addEventListener("esus:offerDeleted", (ev) => {
  const deletedId = ev?.detail?.id || null;
  if (!deletedId) return;

  if (currentOfferId && deletedId === currentOfferId) {
    currentOfferId = null;
    cameFromMainPage = false;

    const btnBack = document.getElementById("btnOffersBack");
    if (btnBack) btnBack.style.display = "none";
  }
});

initUpdateToasts();

// ===== Currency dropdown (PLN/USD/EUR) – UI only =====
(function initCurrencyDropdown() {
  let activePortal = null;

  function positionPortal(menu, btn) {
    const r = btn.getBoundingClientRect();
    const gap = 6;

    const menuWidth = menu.getBoundingClientRect().width || 120;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, r.right - menuWidth));
    const top = Math.min(window.innerHeight - 8, r.bottom + gap);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function closeAllMenus() {
    document.querySelectorAll(".js-ccyMenu.is-open").forEach((m) => {
      m.classList.remove("is-open");
      m.setAttribute("aria-hidden", "true");
      m.closest(".input-money")?.classList.remove("ccy-open");
    });
    document.querySelectorAll(".js-ccyBtn[aria-expanded='true']").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
    });

    if (activePortal) {
      const { menu, placeholder, wrap, btn } = activePortal;

      menu.classList.remove("is-open");
      menu.classList.remove("is-portal");
      menu.setAttribute("aria-hidden", "true");

      if (placeholder && placeholder.parentNode) {
        placeholder.replaceWith(menu);
      }

      wrap?.classList.remove("ccy-open");
      btn?.setAttribute("aria-expanded", "false");

      activePortal = null;
    }
  }

  document.getElementById("offerVat")?.addEventListener("change", () => {
    recalcAllRowsUI();
    recalcTotalsUI?.();
  });

  document.getElementById("offerCurrency")?.addEventListener("change", (e) => {
    changeOfferCurrency(e.target.value);
    renderItems({ onTotalsChanged: recalcTotalsUI });
    recalcTotalsUI();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-ccyBtn");
    const opt = e.target.closest(".ccyOpt");

    if (opt) {
      const wrap = opt.closest(".input-money");
      const ccyBtn = wrap?.querySelector(".js-ccyBtn");
      const ccy = opt.getAttribute("data-ccy") || "PLN";

      if (ccyBtn) {
        ccyBtn.dataset.ccy = ccy;
        const hasChevron = ccyBtn.querySelector("i");
        ccyBtn.textContent = ccy + " ";
        if (hasChevron) ccyBtn.appendChild(hasChevron);
      }

      closeAllMenus();
      e.preventDefault();
      return;
    }

    if (btn) {
      const wrap = btn.closest(".input-money");
      const menu = wrap?.querySelector(".js-ccyMenu");
      if (!wrap || !menu) return;

      const isOpen = activePortal?.btn === btn;
      closeAllMenus();

      if (!isOpen) {
        const placeholder = document.createElement("span");
        placeholder.style.display = "none";
        menu.before(placeholder);

        document.body.appendChild(menu);
        menu.classList.add("is-portal");
        menu.classList.add("is-open");
        menu.setAttribute("aria-hidden", "false");
        btn.setAttribute("aria-expanded", "true");
        wrap.classList.add("ccy-open");

        requestAnimationFrame(() => positionPortal(menu, btn));

        activePortal = { menu, btn, wrap, placeholder };
      }

      e.preventDefault();
      return;
    }

    closeAllMenus();

    window.addEventListener(
      "scroll",
      () => {
        if (activePortal) positionPortal(activePortal.menu, activePortal.btn);
      },
      true
    );

    window.addEventListener("resize", () => {
      if (activePortal) positionPortal(activePortal.menu, activePortal.btn);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });
})();

window.addEventListener("DOMContentLoaded", init);