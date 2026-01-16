import { el, escapeHtml, toNumber, money } from "../utils/format.js";
import { store, removeItem, updateItem } from "../state/store.js";
import { itemNetAfterDiscount, calcRowProfitAndMargin } from "../calc/pricing.js";

/** ===== Tooltip: cena po rabacie (singleton) ===== */
let _discTipEl = null;
let _discTipActive = null;

function ensureDiscountTip() {
  if (_discTipEl) return _discTipEl;

  const tip = document.createElement("div");
  tip.className = "esus-discount-tip";
  // inline style = działa od razu, bez dokładania CSS
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
  tip.style.pointerEvents = "none"; // tooltip nie ma przechwytywać myszy

  document.body.appendChild(tip);
  _discTipEl = tip;
  return tip;
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
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

function showDiscountTipForIndex(i, ev) {
  const tip = ensureDiscountTip();

  const it = store.items[i];
  if (!it) {
    hideDiscountTip();
    return;
  }

  const disc = Math.max(0, toNumber(it.discount));
  if (!(disc > 0)) {
    hideDiscountTip();
    return;
  }

  const qty = Math.max(1, parseInt(it.qty || 1, 10));
  const unitAfter = itemNetAfterDiscount(it); // netto po rabacie / szt.
  const lineAfter = unitAfter * qty;

  tip.innerHTML =
    `Cena po rabacie: <b>${money(unitAfter)}</b><br>` +
    `<span style="opacity:.78">Wartość pozycji (${qty} szt.): ${money(lineAfter)}</span>`;

  tip.style.display = "block";
  positionTipNearCursor(tip, ev);
}

export function updateRowCalcUI(tr, it) {
  if (!tr) return;

  const { profitLine, marginPct } = calcRowProfitAndMargin(it);

  const profitEl = tr.querySelector(".js-profitValue");
  const marginEl = tr.querySelector(".js-marginValue");

  if (profitEl) {
    profitEl.textContent = money(profitLine);
    profitEl.classList.toggle("negative", profitLine < 0);
  }
  if (marginEl) {
    marginEl.textContent = marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%";
  }
}

export function renderItems({ onTotalsChanged, onStateChanged } = {}) {
  const tbody = el("itemsBody");
  tbody.innerHTML = "";

  store.items.forEach((it, idx) => {
    const qty = Math.max(1, parseInt(it.qty || 1, 10));
    const sellNetAfter = itemNetAfterDiscount(it);
    const buyNet = Math.max(0, toNumber(it.buyNet));
    const revenueLine = sellNetAfter * qty;
    const costLine = buyNet * qty;
    const profitLine = revenueLine - costLine;
    const marginLine = revenueLine > 0 ? (profitLine / revenueLine) * 100 : 0;

    const profitText = money(profitLine);
    const marginText = marginLine.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%";
    const profitClass = profitLine < 0 ? "calcCell negative" : "calcCell";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <label class="mini">Opis pozycji</label>
        <input class="descInput" data-k="desc" data-i="${idx}" placeholder="Np. Dell PowerEdge / RAM / SSD..." value="${escapeHtml(it.desc)}" />
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
            data-ccy="PLN"
            aria-haspopup="listbox"
            aria-expanded="false"
            title="Wybierz walutę"
          >
            PLN
          </button>

          <div class="ccyMenu js-ccyMenu" role="listbox" aria-hidden="true">
            <button type="button" class="ccyOpt" data-ccy="PLN">PLN</button>
            <button type="button" class="ccyOpt" data-ccy="USD">USD</button>
            <button type="button" class="ccyOpt" data-ccy="EUR">EUR</button>
          </div>
        </div>
      </td>

      <td>
        <label class="mini">Netto (PLN)</label>
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

  tbody.querySelectorAll("input").forEach((ctrl) => {
    ctrl.addEventListener("input", (e) => {
      const i = parseInt(e.target.getAttribute("data-i"), 10);
      const k = e.target.getAttribute("data-k");
      if (!Number.isFinite(i) || !k) return;

      if (k === "qty") updateItem(i, { [k]: Math.max(1, parseInt(e.target.value || "1", 10)) });
      else if (k === "desc") updateItem(i, { [k]: e.target.value });
      else updateItem(i, { [k]: toNumber(e.target.value) });

      onTotalsChanged?.();
      updateRowCalcUI(e.target.closest("tr"), store.items[i]);
      onStateChanged?.();

      // jeśli tooltip jest aktywny na rabacie, aktualizuj treść w locie
      if (_discTipActive && _discTipActive.getAttribute("data-i") === String(i)) {
        const fakeEv = e; // e ma clientX/Y tylko przy myszce; jeśli brak, zostaw pozycję
        try {
          // jeśli event nie ma clientX/Y (np. klawiatura), nie ruszaj pozycji
          if (typeof fakeEv.clientX === "number") showDiscountTipForIndex(i, fakeEv);
          else showDiscountTipForIndex(i, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
        } catch {
          // no-op
        }
      }
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

    inp.addEventListener("mouseleave", () => {
      hideDiscountTip();
    });
  });

  tbody.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-del"), 10);
      removeItem(idx);
      hideDiscountTip(); // jak usuwasz wiersz, chowamy tooltip
      renderItems({ onTotalsChanged, onStateChanged });
      onTotalsChanged?.();
      onStateChanged?.();
    });
  });
}
