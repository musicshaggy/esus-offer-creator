import { el, escapeHtml, toNumber, money } from "../utils/format.js";
import { store, removeItem, updateItem } from "../state/store.js";
import { itemNetAfterDiscount, calcRowProfitAndMargin } from "../calc/pricing.js";
import { getRateToPLN } from "../utils/exchangeRates.js";

function offerCcy() {
  return String(store.offer?.ccy || store.settings?.offerCcy || "PLN").toUpperCase();
}

/** ===== Tooltip: cena po rabacie (singleton) ===== */
let _discTipEl = null;
let _discTipActive = null;
let _noteTipEl = null;
let _noteTipActive = null;

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

    updateItem(i, { buyCcy: ccy });

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

    // ✅ initial profit/margin must use calcRowProfitAndMargin (currency-aware)
    const { profitLine, marginPct } = calcRowProfitAndMargin(it);
    const profitText = money(profitLine, ccy);
    const marginText = marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%";
    const profitClass = profitLine < 0 ? "calcCell negative" : "calcCell";

    const buyCcy = String(it.buyCcy || "PLN").toUpperCase();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <label class="mini">Opis pozycji</label>

        <input class="descInput"
          data-k="desc" data-i="${idx}"
          placeholder="Np. Dell PowerEdge / RAM / SSD..."
          value="${escapeHtml(it.desc)}" />

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
        updateItem(i, { warranty: { ...current, months } });
      } else if (k === "warrantyNbd") {
        const current = store.items[i]?.warranty || { months: 0, nbd: false, lifetime: false };
        const nbd = !!e.target.checked;
        updateItem(i, { warranty: { ...current, nbd } });
      } else if (k === "warrantyLifetime") {
        const current = store.items[i]?.warranty || { months: 0, nbd: false, lifetime: false };
        const lifetime = !!e.target.checked;

        const nextWarranty = {
          ...current,
          lifetime,
          months: lifetime ? 0 : Math.max(0, parseInt(current.months ?? 0, 10) || 0),
        };

        updateItem(i, { warranty: nextWarranty });

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
        updateItem(i, { [k]: Math.max(1, parseInt(e.target.value || "1", 10)) });
      } else if (k === "desc") {
        updateItem(i, { [k]: e.target.value });
      } else {
        updateItem(i, { [k]: toNumber(e.target.value) });
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
