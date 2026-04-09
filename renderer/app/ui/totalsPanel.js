import { escapeHtml, money, moneyCcy, toNumber } from "../utils/format.js";
import { store } from "../state/store.js";
import { itemNetAfterDiscount } from "../calc/pricing.js";
import { getVatRateFromUI, getVatFromUI } from "../utils/vat.js";
import { toPLN, fromPLN } from "../utils/currency.js";

let totals = {
  revenueNet: 0,
  costNet: 0,
  profitNet: 0,
  marginPct: 0,
  sumVat: 0,
  sumGross: 0,
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function moneyWithPLNFromPLN(amountPLN, offerCcy) {
  const vPLN = Number(amountPLN || 0);

  if (!offerCcy || offerCcy === "PLN") {
    return money(vPLN, "PLN");
  }

  const vOffer = fromPLN(vPLN, offerCcy);
  return `${money(vOffer, offerCcy)} | ${money(vPLN, "PLN")}`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? "1" : "0";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function renderBreakdownChart() {
  const root = document.getElementById("profitBreakdownChart");
  if (!root) return;

  const items = store.items.map((it, idx) => {
    const qty = Math.max(1, parseInt(it?.qty || 1, 10) || 1);
    const offerCcy = String(store.offer?.ccy || store.settings?.offerCcy || "PLN").toUpperCase();
    const revenuePLN = toPLN(itemNetAfterDiscount(it) * qty, offerCcy);
    const buyCcy = String(it?.buyCcy || "PLN").toUpperCase();
    const costPLN = toPLN(Math.max(0, toNumber(it?.buyNet)) * qty, buyCcy);
    const profitPLN = revenuePLN - costPLN;

    return {
      label: String(it?.desc || "").trim() || `Pozycja ${idx + 1}`,
      costPLN,
      profitPLN,
    };
  });

  if (!items.length) {
    root.innerHTML = `<div class="financeChartEmpty">Dodaj pozycje, aby zobaczyć breakdown kosztu i zysku.</div>`;
    return;
  }

  const maxAbs = Math.max(...items.map((item) => item.costPLN + Math.abs(item.profitPLN)), 1);
  const rowH = 48;
  const labelX = 12;
  const barX = 230;
  const barW = 220;
  const valueX = 560;
  const width = 620;
  const height = 22 + items.length * rowH;

  const rowsSvg = items.map((item, idx) => {
    const y = 18 + idx * rowH;
    const costW = Math.max(8, (item.costPLN / maxAbs) * barW);
    const profitW = Math.max(0, (Math.abs(item.profitPLN) / maxAbs) * barW);
    const positive = item.profitPLN >= 0;
    const label = escapeHtml(item.label.length > 30 ? `${item.label.slice(0, 30)}…` : item.label);
    const profitLabel = item.profitPLN >= 0 ? `+${money(item.profitPLN, "PLN")}` : money(item.profitPLN, "PLN");

    return `
      <g transform="translate(0 ${y})">
        <text x="${labelX}" y="11" fill="#E9EEFC" font-size="12" font-weight="700">${label}</text>
        <text x="${labelX}" y="27" fill="rgba(168,179,214,.82)" font-size="10">Koszt ${escapeHtml(money(item.costPLN, "PLN"))}</text>
        <rect x="${barX}" y="6" width="${barW}" height="12" rx="6" fill="rgba(255,255,255,.05)" />
        <rect x="${barX}" y="6" width="${costW}" height="12" rx="6" fill="rgba(125,141,173,.82)" />
        ${positive
          ? `<rect x="${barX + costW}" y="6" width="${profitW}" height="12" rx="6" fill="rgba(0,154,255,.9)" />`
          : ""}
        ${!positive
          ? `<rect x="${barX + Math.max(0, costW - profitW)}" y="6" width="${Math.min(costW, profitW)}" height="12" rx="6" fill="rgba(255,95,95,.9)" />`
          : ""}
        <text x="${valueX}" y="12" fill="${positive ? "#79D2FF" : "#FF8C8C"}" font-size="11" font-weight="800" text-anchor="end">${escapeHtml(profitLabel)}</text>
        <text x="${valueX}" y="28" fill="rgba(168,179,214,.78)" font-size="10" text-anchor="end">${positive ? "zysk" : "strata"}</text>
      </g>
    `;
  }).join("");

  root.innerHTML = `
    <svg class="financeChartSvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Breakdown kosztu i zysku per pozycja">
      ${rowsSvg}
    </svg>
  `;
}

function renderMarginGauge(marginPct) {
  const root = document.getElementById("marginGaugeChart");
  if (!root) return;

  const min = -20;
  const max = 60;
  const safeMargin = Number.isFinite(marginPct) ? marginPct : 0;
  const normalized = (clamp(safeMargin, min, max) - min) / (max - min);
  const angle = 180 + normalized * 180;
  const cx = 160;
  const cy = 150;
  const r = 108;
  const valueColor =
    safeMargin < 10 ? "#FF8C8C" :
    safeMargin < 25 ? "#FFD36F" :
    "#78D7FF";

  const track = describeArc(cx, cy, r, 180, 360);
  const valueArc = describeArc(cx, cy, r, 180, angle);
  const pointer = polarToCartesian(cx, cy, r - 14, angle);

  root.innerHTML = `
    <svg class="financeChartSvg" viewBox="0 0 320 220" role="img" aria-label="Gauge marży">
      <defs>
        <linearGradient id="marginGaugeTrack" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgba(255,92,92,.65)" />
          <stop offset="45%" stop-color="rgba(255,211,111,.7)" />
          <stop offset="100%" stop-color="rgba(0,154,255,.9)" />
        </linearGradient>
      </defs>
      <path d="${track}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="18" stroke-linecap="round" />
      <path d="${valueArc}" fill="none" stroke="url(#marginGaugeTrack)" stroke-width="18" stroke-linecap="round" />
      <line x1="${cx}" y1="${cy}" x2="${pointer.x}" y2="${pointer.y}" stroke="${valueColor}" stroke-width="4" stroke-linecap="round" />
      <circle cx="${cx}" cy="${cy}" r="8" fill="${valueColor}" />
      <text x="${cx}" y="${cy - 18}" text-anchor="middle" fill="rgba(168,179,214,.85)" font-size="11">Aktualna marża</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#E9EEFC" font-size="28" font-weight="800">${escapeHtml(safeMargin.toLocaleString("pl-PL", { maximumFractionDigits: 2 }))}%</text>
      <text x="36" y="178" fill="rgba(168,179,214,.75)" font-size="10">-20%</text>
      <text x="${cx}" y="196" text-anchor="middle" fill="rgba(168,179,214,.75)" font-size="10">20%</text>
      <text x="282" y="178" text-anchor="end" fill="rgba(168,179,214,.75)" font-size="10">60%</text>
      <text x="${cx}" y="214" text-anchor="middle" fill="${valueColor}" font-size="11" font-weight="700">${safeMargin < 10 ? "niska" : safeMargin < 25 ? "umiarkowana" : "mocna"} marża</text>
    </svg>
  `;
}

function renderFinanceCharts() {
  renderBreakdownChart();
  renderMarginGauge(totals.marginPct);
}

export function recalcTotalsUI() {
  const vatRate = getVatRateFromUI();
  const vat = getVatFromUI();
  setText("sumVatLabel", `Suma VAT ${vat.label}`);

  const offerCcy = String(store.offer?.ccy || store.settings?.offerCcy || "PLN").toUpperCase();
  setText("shippingNetLabel", `Koszt wysyłki NETTO (${offerCcy})`);

  // 1) Sprzedaż (offerCcy) + VAT w walucie oferty
  let revenueOffer = 0;
  let revenuePLN = 0;
  let costPLN = 0;

  for (const it of store.items) {
    const qty = Math.max(1, parseInt(it?.qty || 1, 10));
    const lineOffer = itemNetAfterDiscount(it) * qty;

    revenueOffer += lineOffer;
    revenuePLN += toPLN(lineOffer, offerCcy);

    // koszt zawsze sprowadzamy do PLN (buyCcy-aware)
    const buyNet = Math.max(0, toNumber(it.buyNet));
    const buyCcy = String(it.buyCcy || "PLN").toUpperCase();
    costPLN += toPLN(buyNet * qty, buyCcy);
  }

  const sumVatOffer = revenueOffer * vatRate;
  const sumGrossOffer = revenueOffer + sumVatOffer;

  // 2) Wewnętrzne (marża na bazie PLN)
  const profitPLN = revenuePLN - costPLN;
  const marginPct = revenuePLN > 0 ? (profitPLN / revenuePLN) * 100 : 0;

  // 3) Dane totals trzymamy spójnie: revenue/VAT/gross w walucie oferty, cost/profit w PLN (bazowe)
  totals = {
    revenueNet: revenueOffer,
    costNet: costPLN,       // PLN
    profitNet: profitPLN,   // PLN
    marginPct,
    sumVat: sumVatOffer,
    sumGross: sumGrossOffer,
  };

  setText("sumNet", moneyCcy(totals.revenueNet, offerCcy));
  setText("sumVat", moneyCcy(totals.sumVat, offerCcy));
  setText("sumGross", moneyCcy(totals.sumGross, offerCcy));

  // ✅ tylko tutaj: show offerCcy + PLN
  setText("sumCostNet", moneyWithPLNFromPLN(totals.costNet, offerCcy));
  setText("sumProfitNet", moneyWithPLNFromPLN(totals.profitNet, offerCcy));

  setText(
    "sumMargin",
    totals.marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%"
  );

  renderFinanceCharts();
}

export function getTotalsUI() {
  return totals;
}
