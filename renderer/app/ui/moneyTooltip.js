import { store } from "../state/store.js";
import { convert } from "../utils/currency.js";
import { money, escapeHtml } from "../utils/format.js";
import { getRateToPLN } from "../utils/exchangeRates.js";

let _tipEl = null;
let _raf = 0;
let _activeAnchor = null;

function ensureTipEl() {
  if (_tipEl) return _tipEl;

  const el = document.createElement("div");
  el.id = "moneyTooltip";
  el.className = "moneyTooltip";
  el.style.display = "none";
  el.setAttribute("role", "tooltip");
  document.body.appendChild(el);
  _tipEl = el;
  return el;
}

function hide() {
  if (!_tipEl) return;
  _tipEl.style.display = "none";
  _activeAnchor = null;
}

function buildHtml({ amt, ccy }) {
  const code = String(ccy || "PLN").toUpperCase();
  const amount = Number(amt || 0);
  const amountPLN = convert(amount, code, "PLN");

  const rate = code === "PLN" ? 1 : getRateToPLN(code, store.exchange?.rates);
  const rateTxt = rate ? rate.toLocaleString("pl-PL", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "brak";
  const updated = store.exchange?.lastUpdated || "brak";
  const stale = store.exchange?.isOutdated ? "Tak" : "Nie";

  return `
    <div class="moneyTooltip__hdr">Przeliczenie na PLN</div>
    <div class="moneyTooltip__grid">
      <div class="moneyTooltip__k">Kwota</div>
      <div class="moneyTooltip__v">${escapeHtml(money(amount, code))}</div>
      <div class="moneyTooltip__k">≈ PLN</div>
      <div class="moneyTooltip__v moneyTooltip__v--em">${escapeHtml(money(amountPLN, "PLN"))}</div>
      <div class="moneyTooltip__k">Kurs (${escapeHtml(code)})</div>
      <div class="moneyTooltip__v">${escapeHtml(rateTxt)} <span class="moneyTooltip__muted">(NBP)</span></div>
      <div class="moneyTooltip__k">Aktualizacja</div>
      <div class="moneyTooltip__v">${escapeHtml(updated)} <span class="moneyTooltip__muted">· nieaktualne: ${escapeHtml(stale)}</span></div>
    </div>
  `;
}

function positionNear(anchorEl) {
  if (!_tipEl || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();

  // prefer: right-bottom of the anchor
  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  _tipEl.style.left = "0px";
  _tipEl.style.top = "0px";
  _tipEl.style.maxWidth = "360px";
  _tipEl.style.display = "block";

  const tw = _tipEl.offsetWidth;
  const th = _tipEl.offsetHeight;

  let left = rect.right + pad;
  let top = rect.bottom + pad;

  if (left + tw > vw - pad) left = rect.left - tw - pad;
  if (left < pad) left = pad;

  if (top + th > vh - pad) top = rect.top - th - pad;
  if (top < pad) top = pad;

  _tipEl.style.left = `${Math.round(left)}px`;
  _tipEl.style.top = `${Math.round(top)}px`;
}

function showFor(anchorEl) {
  const tip = ensureTipEl();
  const amt = anchorEl.getAttribute("data-amt");
  const ccy = anchorEl.getAttribute("data-ccy");
  if (!amt || !ccy) return;
  if (String(ccy).toUpperCase() === "PLN") return;

  _activeAnchor = anchorEl;
  tip.innerHTML = buildHtml({ amt, ccy });
  positionNear(anchorEl);
}

export function initMoneyTooltip() {
  // delegated hover; works for dynamically rendered tables
  document.addEventListener(
    "mouseover",
    (ev) => {
      const a = ev.target?.closest?.("[data-money-tip='1']");
      if (!a) return;
      if (_activeAnchor === a) return;

      cancelAnimationFrame(_raf);
      _raf = requestAnimationFrame(() => showFor(a));
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (ev) => {
      const from = ev.target?.closest?.("[data-money-tip='1']");
      if (!from) return;
      const to = ev.relatedTarget?.closest?.("[data-money-tip='1']");
      if (to && to === from) return;
      hide();
    },
    true
  );

  window.addEventListener("scroll", () => {
    if (_activeAnchor) positionNear(_activeAnchor);
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (_activeAnchor) positionNear(_activeAnchor);
  });
}
