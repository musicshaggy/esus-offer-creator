import { el, escapeHtml, toNumber, money } from "../utils/format.js";
import { store, removeItem, updateItem, moveItem } from "../state/store.js";
import { itemNetAfterDiscount, calcRowProfitAndMargin } from "../calc/pricing.js";
import { getRateToPLN } from "../utils/exchangeRates.js";
import { getVatRateFromUI } from "../utils/vat.js";

function offerCcy() {
  return String(store.offer?.ccy || store.settings?.offerCcy || "PLN").toUpperCase();
}

/** ===== Tooltip: cena po rabacie (singleton) ===== */
let _discTipEl = null;
let _discTipActive = null;
let _noteTipEl = null;
let _noteTipActive = null;
let _dragItemIndex = null;
let _itemsSyncGutterWrap = null;
let _itemsSyncGutterEl = null;
let _itemsSyncGutterBound = false;

function ensureDiscountTip() {
  if (_discTipEl) return _discTipEl;

  const tip = document.createElement("div");
  tip.className = "esus-discount-tip";
  tip.style.position = "fixed";
  tip.style.zIndex = "25000";
  tip.style.display = "none";
  tip.style.maxWidth = "280px";
  tip.style.padding = "8px 10px";
  tip.style.borderRadius = "10px";
  tip.style.background = "rgba(10, 12, 18, 0.95)";
  tip.style.border = "1px solid rgba(255,255,255,0.14)";
  tip.style.boxShadow = "0 18px 50px rgba(0,0,0,0.45)";
  tip.style.color = "rgba(255,255,255,0.92)";
  tip.style.fontSize = "12px";
  tip.style.fontWeight = "650";
  tip.style.letterSpacing = "0.01em";
  tip.style.pointerEvents = "none";

  document.body.appendChild(tip);
  _discTipEl = tip;
  return tip;
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function clampInt(n, a, b) {
  const v = parseInt(String(n ?? "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(v)) return a;
  return clamp(v, a, b);
}

function positionTipNearCursor(tip, ev) {
  const pad = 12;
  const rectW = tip.offsetWidth || 240;
  const rectH = tip.offsetHeight || 48;

  let x = ev.clientX + pad;
  let y = ev.clientY - rectH - pad;

  x = clamp(x, 8, window.innerWidth - rectW - 8);
  y = clamp(y, 8, window.innerHeight - rectH - 8);

  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hideDiscountTip() {
  if (_discTipEl) _discTipEl.style.display = "none";
  _discTipActive = null;
}

function ensureNoteTip() {
  if (_noteTipEl) return _noteTipEl;

  const tip = document.createElement("div");
  tip.className = "esus-note-tip";
  tip.style.position = "fixed";
  tip.style.zIndex = "25000";
  tip.style.display = "none";
  tip.style.maxWidth = "340px";
  tip.style.padding = "10px 12px";
  tip.style.borderRadius = "12px";
  tip.style.background = "rgba(10, 12, 18, 0.97)";
  tip.style.border = "1px solid rgba(255,255,255,0.14)";
  tip.style.boxShadow = "0 18px 50px rgba(0,0,0,0.45)";
  tip.style.color = "rgba(255,255,255,0.92)";
  tip.style.fontSize = "12px";
  tip.style.lineHeight = "1.45";
  tip.style.pointerEvents = "none";
  tip.style.whiteSpace = "pre-wrap";
  tip.style.wordBreak = "break-word";

  document.body.appendChild(tip);
  _noteTipEl = tip;
  return tip;
}

function hideNoteTip() {
  if (_noteTipEl) _noteTipEl.style.display = "none";
  _noteTipActive = null;
}

function showNoteTipForIndex(i, ev) {
  const tip = ensureNoteTip();
  const it = store.items[i];
  const note = String(it?.internalNote || "").trim();
  if (!note) return hideNoteTip();

  tip.textContent = note;
  tip.style.display = "block";
  positionTipNearCursor(tip, ev);
}

function showDiscountTipForIndex(i, ev) {
  const tip = ensureDiscountTip();
  const it = store.items[i];
  if (!it) return hideDiscountTip();

  const disc = Math.max(0, toNumber(it.discount));
  if (!(disc > 0)) return hideDiscountTip();

  const qty = Math.max(1, parseInt(it.qty || 1, 10));
  const unitAfter = itemNetAfterDiscount(it);
  const lineAfter = unitAfter * qty;
  const ccy = offerCcy();

  tip.innerHTML =
    `Cena po rabacie: <b>${money(unitAfter, ccy)}</b><br>` +
    `<span style="opacity:.78">Wartość pozycji (${qty} szt.): ${money(lineAfter, ccy)}</span>`;

  tip.style.display = "block";
  positionTipNearCursor(tip, ev);
}

/** ===== Warranty toggle (delegation) ===== */
let _warrantyToggleBound = false;

function warrantyToggleHandler(e) {
  const tbody = e.currentTarget;
  const toggle = e.target.closest?.('[data-act="toggleWarranty"]');
  if (!toggle || !tbody.contains(toggle)) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const i = parseInt(toggle.getAttribute("data-i"), 10);
  if (!Number.isFinite(i)) return;

  const panel = tbody.querySelector(`.itemDetailsWarranty[data-warranty="${i}"]`);
  if (!panel) return;

  panel.hidden = !panel.hidden;

  const caret = toggle.querySelector(".itemDetailsCaret");
  const expanded = !panel.hidden;
  if (caret) caret.textContent = expanded ? "∧" : "∨";
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
}

/** ===== PLN hint under buyNet when ccy != PLN ===== */
function formatBuyHintText(buyNet, buyCcy, rate) {
  // 1 linijka (Ty zrobisz CSS white-space:nowrap)
  const pln = buyNet * rate;
  const rateTxt = rate.toLocaleString("pl-PL", { maximumFractionDigits: 4 });
  return `≈ ${money(pln)} · kurs ${buyCcy}: ${rateTxt}`;
}

function updateBuyPlnHintForIndex(i) {
  const it = store.items[i];
  const hintEl = document.querySelector(`.js-buyPlnHint[data-i="${i}"]`);
  if (!it || !hintEl) return;

  const buyNet = Math.max(0, toNumber(it.buyNet));
  const buyCcy = String(it.buyCcy || "PLN").toUpperCase();

  if (buyCcy === "PLN") {
    hintEl.textContent = "";
    hintEl.style.display = "none";
    hintEl.closest(".input-money")?.classList.remove("has-pln-hint");
    return;
  }

  const rate = getRateToPLN(buyCcy, store.exchange?.rates);
  hintEl.style.display = "block";
  hintEl.closest(".input-money")?.classList.add("has-pln-hint");

  if (!rate) {
    hintEl.textContent = "≈ brak kursu do przeliczenia";
    return;
  }

  hintEl.textContent = formatBuyHintText(buyNet, buyCcy, rate);
}

export function recalcAllBuyHintsUI() {
  store.items.forEach((_it, idx) => updateBuyPlnHintForIndex(idx));
}

export function updateRowCalcUI(tr, it) {
  if (!tr) return;

  const { profitLine, marginPct } = calcRowProfitAndMargin(it);

  const profitEl = tr.querySelector(".js-profitValue");
  const marginEl = tr.querySelector(".js-marginValue");

  const ccy = offerCcy();

  if (profitEl) {
    profitEl.textContent = money(profitLine, ccy);
    profitEl.classList.toggle("negative", profitLine < 0);
  }
  if (marginEl) {
    marginEl.textContent =
      marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%";
  }
}

function bindCurrencyDelegationOnce(tbody, { onTotalsChanged, onStateChanged } = {}) {
  if (tbody._ccyBound) return;
  tbody._ccyBound = true;

  const closeAll = () => {
    tbody.querySelectorAll(".js-ccyMenu.is-open").forEach((m) => {
      m.classList.remove("is-open");
      m.setAttribute("aria-hidden", "true");
    });
    tbody.querySelectorAll(".js-ccyBtn[aria-expanded='true']").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
    });
  };

  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".input-money")) closeAll();
  });

  tbody.addEventListener("click", (ev) => {
   const btn = ev.target.closest(".js-ccyBtn");
	if (btn) {
	  ev.preventDefault();
	  ev.stopPropagation();

	  const i = parseInt(btn.getAttribute("data-i"), 10);
	  if (!Number.isFinite(i)) return;

	  const menu = ensureFloatingMenu();

	  // toggle
	  if (_ccyCtx && _ccyCtx.btnEl === btn && menu.style.display === "block") {
		closeFloatingMenu();
		return;
	  }

	  _ccyCtx = { i, btnEl: btn };
	  positionFloatingMenu(menu, btn);

	  // zamykanie po kliknięciu poza
	  setTimeout(() => {
		document.addEventListener("click", (e2) => {
		  if (menu.style.display !== "block") return;
		  if (e2.target.closest(".ccyMenuFloating")) return;
		  if (e2.target.closest(".js-ccyBtn")) return;
		  closeFloatingMenu();
		}, { once: true });
	  }, 0);

	  document.addEventListener("scroll", onAnyScroll, true);
	  window.addEventListener("resize", onResize);
	  return;
	}

  });
  
  let _ccyFloating = null;
let _ccyCtx = null; // { i, btnEl }

function ensureFloatingMenu() {
  if (_ccyFloating) return _ccyFloating;

  const menu = document.createElement("div");
  menu.className = "ccyMenuFloating";
  menu.style.display = "none";

  menu.innerHTML = `
    <button type="button" class="ccyOpt" data-ccy="PLN">PLN</button>
    <button type="button" class="ccyOpt" data-ccy="USD">USD</button>
    <button type="button" class="ccyOpt" data-ccy="EUR">EUR</button>
  `;

  document.body.appendChild(menu);
  _ccyFloating = menu;

  // wybór opcji
  menu.addEventListener("click", (ev) => {
    const opt = ev.target.closest(".ccyOpt");
    if (!opt || !_ccyCtx) return;

    const ccy = String(opt.getAttribute("data-ccy") || "PLN").toUpperCase();
    const { i, btnEl } = _ccyCtx;

    updateItem(i, {
      buyCcy: ccy,
      ...buildSyncResetPatch(i, { buyCcy: ccy }),
    });

    // update UI buttona
    btnEl.textContent = ccy;
    btnEl.setAttribute("data-ccy", ccy);

    // update hint + przeliczenia
    updateBuyPlnHintForIndex(i);
    onTotalsChanged?.();
    updateRowCalcUI(btnEl.closest("tr"), store.items[i]);
    onStateChanged?.();

    closeFloatingMenu();
  });

  return menu;
}

	function closeFloatingMenu() {
	  if (!_ccyFloating) return;
	  _ccyFloating.style.display = "none";
	  _ccyCtx = null;
	  document.removeEventListener("scroll", onAnyScroll, true);
	  window.removeEventListener("resize", onResize);
	}

	function positionFloatingMenu(menu, btnEl) {
	  const r = btnEl.getBoundingClientRect();
	  const pad = 6;

	  menu.style.display = "block";
	  menu.style.left = `${Math.round(r.left)}px`;
	  menu.style.top = `${Math.round(r.bottom + pad)}px`;

	  // jeśli wychodzi poza ekran w prawo
	  const mr = menu.getBoundingClientRect();
	  if (mr.right > window.innerWidth - 8) {
		const x = Math.max(8, window.innerWidth - mr.width - 8);
		menu.style.left = `${Math.round(x)}px`;
	  }

	  // jeśli wychodzi poza dół, pokaż nad przyciskiem
	  if (mr.bottom > window.innerHeight - 8) {
		const y = Math.max(8, r.top - mr.height - pad);
		menu.style.top = `${Math.round(y)}px`;
	  }
	}

	function onAnyScroll() {
	  if (!_ccyFloating || !_ccyCtx) return;
	  positionFloatingMenu(_ccyFloating, _ccyCtx.btnEl);
	}

	function onResize() {
	  if (!_ccyFloating || !_ccyCtx) return;
	  positionFloatingMenu(_ccyFloating, _ccyCtx.btnEl);
	}

}



/** ===== Internal note modal (singleton) ===== */
let _noteModalEl = null;
let _noteModalTextarea = null;
let _noteModalTitle = null;
let _noteModalSaveBtn = null;
let _noteModalClearBtn = null;
let _noteModalBackdrop = null;
let _noteModalCtx = null;
let _productSearchModalEl = null;
let _productSearchModalTitle = null;
let _productSearchModalSub = null;
let _productSearchModalInput = null;
let _productSearchModalResults = null;
let _productSearchModalStatus = null;
let _productSearchModalSpinner = null;
let _productSearchModalSubmit = null;
let _productSearchModalCtx = null;
let _productSearchModalProducts = [];

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function ensureItemsSyncGutter() {
  const area = document.querySelector(".itemsTableArea");
  const wrap = area?.querySelector(".tableWrap");
  if (!area || !wrap) return null;

  if (!_itemsSyncGutterEl || _itemsSyncGutterWrap !== area) {
    _itemsSyncGutterEl?.remove();
    const gutter = document.createElement("div");
    gutter.className = "itemsSyncGutter";
    area.appendChild(gutter);
    _itemsSyncGutterWrap = area;
    _itemsSyncGutterEl = gutter;
  }

  if (!_itemsSyncGutterBound) {
    const refresh = () => updateItemsSyncGutter();
    wrap.addEventListener("scroll", refresh);
    window.addEventListener("resize", refresh);
    _itemsSyncGutterBound = true;
  }

  return _itemsSyncGutterEl;
}

function updateItemsSyncGutter() {
  const area = document.querySelector(".itemsTableArea");
  const wrap = area?.querySelector(".tableWrap");
  const tbody = el("itemsBody");
  const gutter = ensureItemsSyncGutter();
  if (!area || !wrap || !tbody || !gutter) return;

  const wrapRect = wrap.getBoundingClientRect();
  gutter.innerHTML = "";

  Array.from(tbody.querySelectorAll("tr")).forEach((row) => {
    const state = row.classList.contains("itemRowSync-synced")
      ? "synced"
      : row.classList.contains("itemRowSync-missing")
        ? "missing"
        : "";
    if (!state) return;

    const rowRect = row.getBoundingClientRect();
    const bar = document.createElement("div");
    bar.className = `itemsSyncGutterBar is-${state}`;
    bar.style.top = `${rowRect.top - wrapRect.top + 14}px`;
    bar.style.height = `${Math.max(0, rowRect.height - 28)}px`;
    gutter.appendChild(bar);
  });
}

function normalizeSyncText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeWarrantyState(value) {
  const warranty = value && typeof value === "object" ? value : {};
  return {
    months: Math.max(0, parseInt(warranty.months || "0", 10) || 0),
    lifetime: warranty.lifetime === true,
    nbd: warranty.nbd === true,
  };
}

function valuesDifferForSync(key, currentValue, nextValue) {
  switch (key) {
    case "desc":
      return normalizeSyncText(currentValue) !== normalizeSyncText(nextValue);
    case "qty":
      return Math.max(1, parseInt(currentValue || "1", 10) || 1) !== Math.max(1, parseInt(nextValue || "1", 10) || 1);
    case "buyNet":
    case "net":
    case "discount":
      return toNumber(currentValue) !== toNumber(nextValue);
    case "buyCcy":
      return String(currentValue || "PLN").toUpperCase() !== String(nextValue || "PLN").toUpperCase();
    case "warranty":
      return JSON.stringify(normalizeWarrantyState(currentValue)) !== JSON.stringify(normalizeWarrantyState(nextValue));
    default:
      return currentValue !== nextValue;
  }
}

function buildSyncResetPatch(itemIdx, patch) {
  const item = store.items[itemIdx];
  const sync = item?.iaiSync;
  if (!(item && sync && sync.synced && patch && typeof patch === "object")) return {};

  if (Object.prototype.hasOwnProperty.call(patch, "desc")) {
    const nextDesc = patch.desc;
    if (valuesDifferForSync("desc", item.desc, nextDesc)) {
      return { iaiSync: null };
    }
  }

  return {};
}

function productGrossToNet(priceGross) {
  const vatRate = Number(getVatRateFromUI() || 0);
  const gross = Number(priceGross || 0);
  return roundMoney(vatRate > 0 ? gross / (1 + vatRate) : gross);
}

function getProductDisplayName(product, fallback = "") {
  return String(
    product?.name ||
      product?.productName ||
      product?.title ||
      product?.description ||
      product?.code ||
      fallback ||
      ""
  ).trim();
}

function applyIdoSellProductToItem(itemIdx, product, { onTotalsChanged, onStateChanged, descInput } = {}) {
  if (!product || !Number.isFinite(itemIdx) || !store.items[itemIdx]) return false;
  const desc = getProductDisplayName(product, store.items[itemIdx]?.desc);

  if (descInput) {
    descInput.value = desc;
  }

  updateItem(itemIdx, {
    desc,
    net: productGrossToNet(product?.priceGross),
    iaiSync: {
      provider: "idosell",
      synced: true,
      syncedAt: new Date().toISOString(),
      productId: product?.id ? String(product.id) : "",
      productCode: String(product?.code || "").trim(),
      productName: desc,
      producerCode: String(product?.producerCode || "").trim(),
      producer: String(product?.producer || "").trim(),
      priceGross: Number(product?.priceGross || 0),
      currency: String(product?.currency || offerCcy()).toUpperCase(),
    },
  });

  renderItems({ onTotalsChanged, onStateChanged });
  onTotalsChanged?.();
  onStateChanged?.();
  return true;
}

function ensureNoteModal() {
  if (_noteModalEl) return _noteModalEl;

  const modal = document.createElement("div");
  modal.className = "itemNoteModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="itemNoteModal__backdrop" data-note-close="1"></div>
    <div class="itemNoteModal__dialog" role="dialog" aria-modal="true" aria-labelledby="itemNoteModalTitle">
      <div class="itemNoteModal__head">
        <div class="itemNoteModal__title" id="itemNoteModalTitle">Notatka wewnętrzna</div>
        <button type="button" class="itemNoteModal__x" data-note-close="1" aria-label="Zamknij">✕</button>
      </div>
      <div class="itemNoteModal__sub">Widoczna tylko w aplikacji. Nie pojawi się na PDF.</div>
      <textarea class="itemNoteModal__textarea" rows="8" placeholder="Dodaj notatkę do tej pozycji..."></textarea>
      <div class="itemNoteModal__actions">
        <button type="button" class="btnTiny itemNoteModal__clear">Wyczyść</button>
        <div class="itemNoteModal__actionsRight">
          <button type="button" class="btnTiny itemNoteModal__save">Zapisz</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  _noteModalEl = modal;
  _noteModalTextarea = modal.querySelector('.itemNoteModal__textarea');
  _noteModalTitle = modal.querySelector('.itemNoteModal__title');
  _noteModalSaveBtn = modal.querySelector('.itemNoteModal__save');
  _noteModalClearBtn = modal.querySelector('.itemNoteModal__clear');
  _noteModalBackdrop = modal.querySelector('.itemNoteModal__backdrop');

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-note-close="1"]')) closeNoteModal();
  });

  _noteModalClearBtn?.addEventListener('click', () => {
    if (!_noteModalTextarea) return;
    _noteModalTextarea.value = '';
    _noteModalTextarea.focus();
  });

  _noteModalSaveBtn?.addEventListener('click', () => {
    if (!_noteModalCtx || !_noteModalTextarea) return;
    const { i, onTotalsChanged, onStateChanged } = _noteModalCtx;
    updateItem(i, { internalNote: _noteModalTextarea.value || '' });

    const btn = document.querySelector(`.itemNoteBtn[data-i="${i}"]`);
    const hasNote = !!String(store.items[i]?.internalNote || '').trim();
    if (btn) {
      btn.classList.toggle('has-note', hasNote);
      btn.setAttribute('aria-label', hasNote ? 'Edytuj notatkę wewnętrzną' : 'Dodaj notatkę wewnętrzną');
      btn.setAttribute('title', hasNote ? 'Edytuj notatkę wewnętrzną' : 'Dodaj notatkę wewnętrzną');
    }

    onTotalsChanged?.();
    onStateChanged?.();
    closeNoteModal();
  });

  document.addEventListener('keydown', (e) => {
    if (!_noteModalEl || _noteModalEl.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNoteModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      _noteModalSaveBtn?.click();
    }
  });

  return modal;
}

function openNoteModal(i, { onTotalsChanged, onStateChanged } = {}) {
  const modal = ensureNoteModal();
  const it = store.items[i];
  if (!modal || !it) return;

  _noteModalCtx = { i, onTotalsChanged, onStateChanged };
  if (_noteModalTitle) _noteModalTitle.textContent = `Notatka wewnętrzna · pozycja ${i + 1}`;
  if (_noteModalTextarea) _noteModalTextarea.value = String(it.internalNote || '');

  modal.hidden = false;
  requestAnimationFrame(() => _noteModalTextarea?.focus());
}

function closeNoteModal() {
  if (!_noteModalEl) return;
  _noteModalEl.hidden = true;
  _noteModalCtx = null;
}

function ensureProductSearchModal() {
  if (_productSearchModalEl) return _productSearchModalEl;

  const modal = document.createElement("div");
  modal.className = "itemSearchModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="itemSearchModal__backdrop" data-product-search-close="1"></div>
    <div class="itemSearchModal__dialog" role="dialog" aria-modal="true" aria-labelledby="itemSearchModalTitle">
      <div class="itemSearchModal__head">
        <div class="itemSearchModal__title" id="itemSearchModalTitle">Wyszukaj produkt w IdoSell</div>
        <button type="button" class="itemSearchModal__x" data-product-search-close="1" aria-label="Zamknij">×</button>
      </div>
      <div class="itemSearchModal__sub">Wpisz nazwę lub fragment modelu. Integracja z API IdoSell zostanie podpięta w kolejnym kroku.</div>
      <div class="itemSearchModal__searchRow">
        <input class="itemSearchModal__input" type="text" placeholder="Np. Ubiquiti UDM-PRO-MAX" />
        <button type="button" class="secondary itemSearchModal__submit" disabled>
          <i class="fa-solid fa-magnifying-glass"></i>
          Szukaj w IdoSell
        </button>
      </div>
      <div class="itemSearchModal__status">Wpisz nazwę produktu i kliknij Szukaj.</div>
      <div class="itemSearchModal__results"></div>
    </div>
  `;

  document.body.appendChild(modal);
  _productSearchModalEl = modal;
  _productSearchModalTitle = modal.querySelector(".itemSearchModal__title");
  _productSearchModalSub = modal.querySelector(".itemSearchModal__sub");
  _productSearchModalInput = modal.querySelector(".itemSearchModal__input");
  _productSearchModalResults = modal.querySelector(".itemSearchModal__results");
  _productSearchModalStatus = modal.querySelector(".itemSearchModal__status");
  _productSearchModalSubmit = modal.querySelector(".itemSearchModal__submit");

  if (_productSearchModalStatus) {
    const statusRow = document.createElement("div");
    statusRow.className = "itemSearchModal__statusRow";

    const spinner = document.createElement("span");
    spinner.className = "itemSearchModal__spinner";
    spinner.setAttribute("aria-hidden", "true");

    _productSearchModalStatus.parentNode?.insertBefore(statusRow, _productSearchModalStatus);
    statusRow.appendChild(spinner);
    statusRow.appendChild(_productSearchModalStatus);
    _productSearchModalSpinner = spinner;
  }

  if (_productSearchModalSub) {
    _productSearchModalSub.textContent =
      "Wpisz indeks produktu z IdoSell. Szukamy po indeksie, zeby uniknac wolnego przeszukiwania calego katalogu.";
  }
  if (_productSearchModalInput) {
    _productSearchModalInput.placeholder = "Np. UDM-PRO-MAX";
  }
  if (_productSearchModalSubmit) {
    _productSearchModalSubmit.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Szukaj po indeksie';
  }

  const refreshSubmitState = () => {
    if (!_productSearchModalSubmit || !_productSearchModalInput) return;
    _productSearchModalSubmit.disabled = String(_productSearchModalInput.value || "").trim().length < 2;
  };

  const renderResults = (result) => {
    if (!_productSearchModalResults || !_productSearchModalStatus) return;

    const products = Array.isArray(result?.products) ? result.products : [];
    _productSearchModalProducts = products;
    if (!products.length) {
      _productSearchModalResults.innerHTML = `
        <div class="itemSearchModal__placeholder">
          <div class="itemSearchModal__placeholderTitle">Brak wyników</div>
          <div class="itemSearchModal__placeholderText">${result?.message || "Nie znaleziono produktów dla podanego zapytania."}</div>
        </div>
      `;
      return;
    }

    _productSearchModalResults.innerHTML = products.map((product, index) => {
      const title = escapeHtml(product?.name || product?.code || "Produkt bez nazwy");
      const meta = [
        product?.code ? `Kod: ${escapeHtml(product.code)}` : "",
        product?.producer ? `Producent: ${escapeHtml(product.producer)}` : "",
        product?.producerCode ? `Kod producenta: ${escapeHtml(product.producerCode)}` : "",
      ].filter(Boolean).join(" · ");
      const price = Number.isFinite(product?.priceGross)
        ? `${money(product.priceGross, product.currency || "PLN")} brutto`
        : "";

      return `
        <div class="itemSearchResultCard">
          <div class="itemSearchResultMain">
            <div class="itemSearchResultTitle">${title}</div>
            ${meta ? `<div class="itemSearchResultMeta">${meta}</div>` : ""}
          </div>
          <div class="itemSearchResultSide">
            ${price ? `<div class="itemSearchResultPrice">${escapeHtml(price)}</div>` : ""}
            <button
              type="button"
              class="btnTiny itemSearchResultPick"
              data-product-pick="${index}"
            >
              Dodaj
            </button>
          </div>
        </div>
      `;
    }).join("");
  };

  const runSearch = async () => {
    if (!_productSearchModalInput || !_productSearchModalStatus || !_productSearchModalSubmit) return;
    const query = String(_productSearchModalInput.value || "").trim();
    if (query.length < 2) return;

    _productSearchModalSubmit.disabled = true;
    _productSearchModalSpinner?.classList.add("is-active");
    _productSearchModalStatus.textContent = "Wyszukiwanie produktów w IdoSell…";

    try {
      const result = await window.esusAPI?.idosellSearchProducts?.(query);
      if (!_productSearchModalEl || _productSearchModalEl.hidden) return;

      if (result?.ok) {
        const count = Array.isArray(result.products) ? result.products.length : 0;
        _productSearchModalStatus.textContent = result?.cached
          ? `Znaleziono ${count} wyników (cache lokalny).`
          : `Znaleziono ${count} wyników.`;
      } else {
        _productSearchModalStatus.textContent = result?.message || "Nie udało się wyszukać produktów.";
      }

      renderResults(result);
    } catch (error) {
      _productSearchModalStatus.textContent = "Nie udało się wyszukać produktów w IdoSell.";
      renderResults({ ok: false, products: [], message: String(error?.message || error || "") });
    } finally {
      _productSearchModalSpinner?.classList.remove("is-active");
      refreshSubmitState();
    }
  };

  _productSearchModalInput?.addEventListener("input", () => {
    refreshSubmitState();
  });
  _productSearchModalInput?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    await runSearch();
  });
  _productSearchModalSubmit?.addEventListener("click", async () => {
    await runSearch();
  });

  modal.addEventListener("click", (e) => {
    if (e.target.closest('[data-product-search-close="1"]')) closeProductSearchModal();

    const pickBtn = e.target.closest("[data-product-pick]");
    if (!pickBtn) return;

    const productIdx = parseInt(pickBtn.getAttribute("data-product-pick") || "-1", 10);
    const product = _productSearchModalProducts[productIdx];
    const itemIdx = _productSearchModalCtx?.i;
    const applied = applyIdoSellProductToItem(itemIdx, product, {
      onTotalsChanged: _productSearchModalCtx?.onTotalsChanged,
      onStateChanged: _productSearchModalCtx?.onStateChanged,
    });
    if (applied) closeProductSearchModal();
  });

  document.addEventListener("keydown", (e) => {
    if (!_productSearchModalEl || _productSearchModalEl.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeProductSearchModal();
    }
  });

  return modal;
}

function openProductSearchModal(i, { onTotalsChanged, onStateChanged } = {}) {
  const modal = ensureProductSearchModal();
  const item = store.items[i];
  if (!modal || !item) return;

  _productSearchModalCtx = { i, onTotalsChanged, onStateChanged };
  _productSearchModalProducts = [];
  if (_productSearchModalTitle) {
    _productSearchModalTitle.textContent = `Wyszukaj produkt w IdoSell · pozycja ${i + 1}`;
  }
  if (_productSearchModalInput) {
    _productSearchModalInput.value = String(item?.desc || "");
  }
  if (_productSearchModalStatus) {
    _productSearchModalStatus.textContent = "Wpisz nazwę produktu i kliknij Szukaj.";
  }
  if (_productSearchModalResults) {
    _productSearchModalResults.innerHTML = `
      <div class="itemSearchModal__placeholder">
        <div class="itemSearchModal__placeholderTitle">Gotowe do wyszukiwania</div>
        <div class="itemSearchModal__placeholderText">Wyniki z największym dopasowaniem będą pokazywane na samej górze listy.</div>
      </div>
    `;
  }
  if (_productSearchModalTitle) {
    _productSearchModalTitle.textContent = `Wyszukaj produkt po indeksie - pozycja ${i + 1}`;
  }
  if (_productSearchModalInput) {
    _productSearchModalInput.value = "";
    _productSearchModalInput.placeholder = "Np. UDM-PRO-MAX";
  }
  if (_productSearchModalStatus) {
    _productSearchModalStatus.textContent = "Wpisz indeks produktu i kliknij Szukaj.";
  }
  _productSearchModalSpinner?.classList.remove("is-active");
  if (_productSearchModalSubmit) {
    _productSearchModalSubmit.disabled = true;
  }

  modal.hidden = false;
  requestAnimationFrame(() => _productSearchModalInput?.focus());
}

function closeProductSearchModal() {
  if (!_productSearchModalEl) return;
  _productSearchModalEl.hidden = true;
  _productSearchModalCtx = null;
  _productSearchModalProducts = [];
}

async function quickSearchAndApplyProduct(i, query, buttonEl, { onTotalsChanged, onStateChanged, descInput } = {}) {
  const q = String(query || "").trim();
  if (!Number.isFinite(i) || i < 0 || q.length < 2 || !buttonEl) return;

  buttonEl.classList.add("is-loading");
  buttonEl.disabled = true;

  try {
    const result = await window.esusAPI?.idosellSearchProducts?.(q);
    const product = Array.isArray(result?.products) ? result.products[0] : null;
    if (!result?.ok || !product) return;

    applyIdoSellProductToItem(i, product, { onTotalsChanged, onStateChanged, descInput });
  } finally {
    buttonEl.classList.remove("is-loading");
    buttonEl.disabled = false;
  }
}

export function renderItems({ onTotalsChanged, onStateChanged } = {}) {
  const tbody = el("itemsBody");
  if (!tbody) return;

  const ccy = offerCcy();

  // warranty toggle: bind once (capture)
  if (!_warrantyToggleBound) {
    tbody.removeEventListener("click", warrantyToggleHandler, true);
    tbody.addEventListener("click", warrantyToggleHandler, true);
    _warrantyToggleBound = true;
  }

  // currency menu: bind once
  bindCurrencyDelegationOnce(tbody, { onTotalsChanged, onStateChanged });

  tbody.innerHTML = "";

  const clearDragClasses = () => {
    tbody.querySelectorAll(".is-dragging, .drop-before, .drop-after").forEach((node) => {
      node.classList.remove("is-dragging", "drop-before", "drop-after");
    });
  };

  store.items.forEach((it, idx) => {
    // backward compatible warranty object
    if (!it.warranty || typeof it.warranty !== "object") {
      it.warranty = { months: 0, nbd: false, lifetime: false };
    } else {
      it.warranty.months = Number(it.warranty.months || 0);
      it.warranty.nbd = !!it.warranty.nbd;
      it.warranty.lifetime = !!it.warranty.lifetime;
    }
    it.internalNote = String(it.internalNote || "");

    const wMonths = Math.max(0, parseInt(it?.warranty?.months || 0, 10) || 0);
    const wNbd = !!it?.warranty?.nbd;
    const wLifetime = !!it?.warranty?.lifetime;
    const hasInternalNote = !!String(it?.internalNote || "").trim();
    const isIaiSynced = !!(it?.iaiSync && it.iaiSync.synced);
    const showIaiSyncWarnings = !!store.offer?.iaiSyncReviewRequested;
    const rowSyncClass = isIaiSynced
      ? " itemRowSync itemRowSync-synced"
      : showIaiSyncWarnings
        ? " itemRowSync itemRowSync-missing"
        : "";

    // ✅ initial profit/margin must use calcRowProfitAndMargin (currency-aware)
    const { profitLine, marginPct } = calcRowProfitAndMargin(it);
    const profitText = money(profitLine, ccy);
    const marginText = marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%";
    const profitClass = profitLine < 0 ? "calcCell negative" : "calcCell";

    const buyCcy = String(it.buyCcy || "PLN").toUpperCase();

    const tr = document.createElement("tr");
    tr.className = rowSyncClass.trim();
    tr.innerHTML = `
      <td>
        <div class="itemDescMeta" aria-hidden="true">
          <span class="itemDescMetaLp">Lp.</span>
          <span class="itemDescMetaLabel">Opis pozycji</span>
        </div>
        <div class="itemDescRow">
          <div class="itemLpBadge" data-drag-handle="${idx}" draggable="true" title="Przeciągnij, aby zmienić kolejność" aria-label="Pozycja ${idx + 1}. Przeciągnij, aby zmienić kolejność">${idx + 1}</div>
          <input class="descInput"
            data-k="desc" data-i="${idx}"
            placeholder="Opis pozycji..."
            value="${escapeHtml(it.desc)}" />
          <button
            type="button"
            class="itemSearchBtn"
            data-item-search="${idx}"
            title="Wyszukaj produkt w IdoSell"
            aria-label="Wyszukaj produkt w IdoSell"
          >
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
        </div>

        <div class="itemRowMetaActions">
          <span
            class="itemDetailsToggle"
            data-act="toggleWarranty"
            data-i="${idx}"
            aria-expanded="false"
            title="Pokaż/ukryj szczegóły"
            style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;opacity:.85;"
          >
            <span class="itemDetailsCaret" aria-hidden="true">∨</span>
            <span>Szczegóły pozycji</span>
          </span>

          <button
            type="button"
            class="itemNoteBtn ${hasInternalNote ? "has-note" : ""}"
            data-note="${idx}"
            data-i="${idx}"
            title="${hasInternalNote ? "Edytuj notatkę wewnętrzną" : "Dodaj notatkę wewnętrzną"}"
            aria-label="${hasInternalNote ? "Edytuj notatkę wewnętrzną" : "Dodaj notatkę wewnętrzną"}"
          >
            <span aria-hidden="true">📝</span>
          </button>
        </div>

        <div
          class="itemDetailsWarranty"
          data-warranty="${idx}"
          hidden
          style="margin-top:6px; gap:14px; align-items:center; flex-wrap:wrap; opacity:.92;"
        >
          <label class="mini" style="display:flex; gap:8px; align-items:center; margin:0;">
            Gwarancja
            <input
              data-k="warrantyMonths"
              data-i="${idx}"
              type="number"
              min="0"
              max="120"
              step="1"
              value="${wLifetime ? "" : wMonths}"
              ${wLifetime ? "disabled" : ""}
              style="width:80px;"
            />
            miesięcy
          </label>

          <label class="mini" style="display:flex; gap:8px; align-items:center; margin:0;">
            <input
              type="checkbox"
              data-k="warrantyLifetime"
              data-i="${idx}"
              ${wLifetime ? "checked" : ""}
            />
            Dożywotnia
          </label>

          <label class="mini" style="display:flex; gap:8px; align-items:center; margin:0;">
            <input type="checkbox" data-k="warrantyNbd" data-i="${idx}" ${wNbd ? "checked" : ""} />
            NBD
          </label>
        </div>
      </td>

      <td>
        <label class="mini">Zakup NETTO</label>

        <div class="input-money">
          <input
            data-k="buyNet"
            data-i="${idx}"
            type="number"
            min="0"
            step="0.01"
            value="${toNumber(it.buyNet)}"
          />

          <button
            type="button"
            class="input-money__ccyBtn js-ccyBtn"
            data-i="${idx}"
            data-ccy="${buyCcy}"
            aria-haspopup="listbox"
            aria-expanded="false"
            title="Wybierz walutę"
          >${buyCcy}</button>

          <!-- ✅ hint (absolutem zrobisz w CSS, żeby nie przesuwał buttona) -->
          <div class="buyPlnHint js-buyPlnHint" data-i="${idx}" style="display:none;"></div>
        </div>
      </td>

      <td>
        <label class="mini">Netto (${ccy})</label>
        <input data-k="net" data-i="${idx}" type="number" min="0" step="0.01" value="${toNumber(it.net)}" />
      </td>

      <td>
        <label class="mini">Rabat (%)</label>
        <input data-k="discount" data-i="${idx}" type="number" min="0" max="100" step="0.01" value="${toNumber(it.discount)}" />
      </td>

      <td>
        <label class="mini">Ilość</label>
        <input data-k="qty" data-i="${idx}" type="number" min="1" step="1" value="${Math.max(1, parseInt(it.qty || 1, 10))}" />
      </td>

      <td class="td-actions">
        <button class="btnTiny danger" title="Usuń" data-del="${idx}">🗑</button>
      </td>

      <td class="profitCell">
        <div class="profitWrap">
          <div class="${profitClass} js-profitValue">${profitText}</div>
          <div class="mini js-marginValue">${marginText}</div>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("tr").forEach((tr, idx) => {
    tr.dataset.itemIndex = String(idx);

    tr.addEventListener("dragover", (event) => {
      if (_dragItemIndex === null) return;
      event.preventDefault();

      const rect = tr.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;

      tr.classList.toggle("drop-before", before);
      tr.classList.toggle("drop-after", !before);
    });

    tr.addEventListener("dragleave", () => {
      tr.classList.remove("drop-before", "drop-after");
    });

    tr.addEventListener("drop", (event) => {
      if (_dragItemIndex === null) return;
      event.preventDefault();

      const targetIndex = parseInt(tr.dataset.itemIndex || "-1", 10);
      if (!Number.isFinite(targetIndex) || targetIndex < 0) {
        clearDragClasses();
        _dragItemIndex = null;
        return;
      }

      const rect = tr.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      let nextIndex = before ? targetIndex : targetIndex + 1;

      if (_dragItemIndex < nextIndex) nextIndex -= 1;
      nextIndex = Math.max(0, Math.min(store.items.length - 1, nextIndex));

      if (_dragItemIndex !== nextIndex) {
        moveItem(_dragItemIndex, nextIndex);
        renderItems({ onTotalsChanged, onStateChanged });
        onTotalsChanged?.();
        onStateChanged?.();
      }

      clearDragClasses();
      _dragItemIndex = null;
    });
  });

  tbody.querySelectorAll("[data-drag-handle]").forEach((handle) => {
    const row = handle.closest("tr");

    handle.addEventListener("dragstart", (event) => {
      _dragItemIndex = parseInt(handle.getAttribute("data-drag-handle") || "-1", 10);
      if (!Number.isFinite(_dragItemIndex) || _dragItemIndex < 0) {
        _dragItemIndex = null;
        return;
      }

      row?.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(_dragItemIndex));
    });

    handle.addEventListener("dragend", () => {
      clearDragClasses();
      _dragItemIndex = null;
    });
  });

  // ✅ po renderze: odśwież hinty (raz)
  recalcAllBuyHintsUI();

  // ===== Inputs: zapis do store =====
  tbody.querySelectorAll("input").forEach((ctrl) => {
    const handler = (e) => {
      const i = parseInt(e.target.getAttribute("data-i"), 10);
      const k = e.target.getAttribute("data-k");
      if (!Number.isFinite(i) || !k) return;

      if (k === "warrantyMonths") {
        const current = store.items[i]?.warranty || { months: 0, nbd: false, lifetime: false };
        if (current.lifetime) return;

        const months = clampInt(e.target.value, 0, 120);
        const nextWarranty = { ...current, months };
        updateItem(i, {
          warranty: nextWarranty,
          ...buildSyncResetPatch(i, { warranty: nextWarranty }),
        });
      } else if (k === "warrantyNbd") {
        const current = store.items[i]?.warranty || { months: 0, nbd: false, lifetime: false };
        const nbd = !!e.target.checked;
        const nextWarranty = { ...current, nbd };
        updateItem(i, {
          warranty: nextWarranty,
          ...buildSyncResetPatch(i, { warranty: nextWarranty }),
        });
      } else if (k === "warrantyLifetime") {
        const current = store.items[i]?.warranty || { months: 0, nbd: false, lifetime: false };
        const lifetime = !!e.target.checked;

        const nextWarranty = {
          ...current,
          lifetime,
          months: lifetime ? 0 : Math.max(0, parseInt(current.months ?? 0, 10) || 0),
        };

        updateItem(i, {
          warranty: nextWarranty,
          ...buildSyncResetPatch(i, { warranty: nextWarranty }),
        });

        const tr = e.target.closest("tr");
        const monthsInput = tr?.querySelector(`input[data-k="warrantyMonths"][data-i="${i}"]`);

        if (monthsInput) {
          if (lifetime) {
            monthsInput.disabled = true;
            monthsInput.value = "";
            monthsInput.blur();
          } else {
            monthsInput.disabled = false;
            monthsInput.removeAttribute("disabled");
            monthsInput.value = nextWarranty.months > 0 ? String(nextWarranty.months) : "";
          }
        }
      } else if (k === "qty") {
        const nextQty = Math.max(1, parseInt(e.target.value || "1", 10));
        updateItem(i, {
          [k]: nextQty,
          ...buildSyncResetPatch(i, { [k]: nextQty }),
        });
      } else if (k === "desc") {
        const nextDesc = String(e.target.value || "");
        updateItem(i, {
          [k]: nextDesc,
          ...buildSyncResetPatch(i, { [k]: nextDesc }),
        });
      } else {
        const nextNumber = toNumber(e.target.value);
        updateItem(i, {
          [k]: nextNumber,
          ...buildSyncResetPatch(i, { [k]: nextNumber }),
        });
      }

      onTotalsChanged?.();
      updateRowCalcUI(e.target.closest("tr"), store.items[i]);
      onStateChanged?.();

      // hint PLN (np. po zmianie buyNet)
      updateBuyPlnHintForIndex(i);

      // jeśli tooltip jest aktywny na rabacie, aktualizuj treść w locie
      if (_discTipActive && _discTipActive.getAttribute("data-i") === String(i)) {
        const fakeEv = e;
        try {
          if (typeof fakeEv.clientX === "number") showDiscountTipForIndex(i, fakeEv);
          else showDiscountTipForIndex(i, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
        } catch {}
      }
    };

    ctrl.addEventListener("input", handler);
    ctrl.addEventListener("change", handler);
  });

  tbody.querySelectorAll('input[data-k="desc"]').forEach((input) => {
    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const i = parseInt(input.getAttribute("data-i"), 10);
      if (!Number.isFinite(i)) return;

      const button = input.closest(".itemDescRow")?.querySelector("[data-item-search]");
      await quickSearchAndApplyProduct(i, input.value, button, {
        onTotalsChanged,
        onStateChanged,
        descInput: input,
      });
    });
  });

  // ===== Tooltip hover dla rabatu =====
  tbody.querySelectorAll('input[data-k="discount"]').forEach((inp) => {
    inp.addEventListener("mouseenter", (ev) => {
      _discTipActive = inp;
      const i = parseInt(inp.getAttribute("data-i"), 10);
      if (!Number.isFinite(i)) return;
      showDiscountTipForIndex(i, ev);
    });

    inp.addEventListener("mousemove", (ev) => {
      if (!_discTipEl || _discTipEl.style.display === "none") return;
      positionTipNearCursor(_discTipEl, ev);
    });

    inp.addEventListener("mouseleave", () => hideDiscountTip());
  });


  // ===== Internal note =====
  tbody.querySelectorAll("[data-note]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-note"), 10);
      if (!Number.isFinite(idx)) return;
      openNoteModal(idx, { onTotalsChanged, onStateChanged });
    });

    btn.addEventListener("mouseenter", (ev) => {
      const idx = parseInt(btn.getAttribute("data-note"), 10);
      if (!Number.isFinite(idx)) return;
      _noteTipActive = btn;
      showNoteTipForIndex(idx, ev);
    });

    btn.addEventListener("mousemove", (ev) => {
      if (!_noteTipEl || _noteTipEl.style.display === "none") return;
      positionTipNearCursor(_noteTipEl, ev);
    });

    btn.addEventListener("mouseleave", () => hideNoteTip());
    btn.addEventListener("blur", () => hideNoteTip());
  });

  // ===== Delete =====
  tbody.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-del"), 10);
      removeItem(idx);
      hideDiscountTip();
      hideNoteTip();
      renderItems({ onTotalsChanged, onStateChanged });
      onTotalsChanged?.();
      onStateChanged?.();
    });
  });

  tbody.querySelectorAll("[data-item-search]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.getAttribute("data-item-search"), 10);
      if (!Number.isFinite(i)) return;
      openProductSearchModal(i, { onTotalsChanged, onStateChanged });
    });
  });

  requestAnimationFrame(() => updateItemsSyncGutter());
}

export function recalcAllRowsUI() {
  const tbody = el("itemsBody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll("tr"));
  rows.forEach((tr, idx) => {
    const it = store.items[idx];
    if (!it) return;
    updateRowCalcUI(tr, it);
  });

  // przy okazji: hinty
  recalcAllBuyHintsUI();
}
