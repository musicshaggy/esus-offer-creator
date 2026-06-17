import { NOTO_BOLD_URL, NOTO_REG_URL } from "../config/constants.js";
import { itemNetAfterDiscount } from "../calc/pricing.js";
import { toPLN, fromPLN } from "../utils/currency.js";
import { escapeHtml, moneyCcy, toNumber, ymdToPL } from "../utils/format.js";
import { showToast } from "./toast.js";

const STORAGE_KEY = "esus.pmReport.v1";
const MONTH_LABELS = [
  "styczen",
  "luty",
  "marzec",
  "kwiecien",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpien",
  "wrzesien",
  "pazdziernik",
  "listopad",
  "grudzien",
];

function q(id) {
  return document.getElementById(id);
}

function round2(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function startOfMonth(monthValue) {
  const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-01`;
}

function endOfMonth(monthValue) {
  const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const last = new Date(year, monthIndex + 1, 0);
  return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`;
}

function diffDaysInclusive(fromYmd, toYmd) {
  const start = Date.parse(`${fromYmd}T00:00:00`);
  const end = Date.parse(`${toYmd}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function normalizeYmd(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function parseMonthLabel(monthValue) {
  const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "-";
  const monthIndex = Math.max(0, Math.min(11, Number(match[2]) - 1));
  return `${MONTH_LABELS[monthIndex]} ${match[1]}`;
}

function offerIdFromRow(row) {
  return String(
    row?.id ||
      row?.key ||
      row?.offerId ||
      row?.offerUID ||
      row?.offerUuid ||
      row?.meta?.id ||
      row?.meta?.offerId ||
      row?.offerNo ||
      row?.meta?.offerNo ||
      ""
  );
}

function pickOfferNo(row) {
  return (
    row?.meta?.offerNo ||
    row?.meta?.offerNumber ||
    row?.meta?.number ||
    row?.offerNo ||
    row?.offerNumber ||
    row?.number ||
    row?.no ||
    row?.fields?.offerNumber ||
    row?.fields?.offerNo ||
    row?.id ||
    "-"
  );
}

function pickClient(row) {
  return (
    row?.meta?.customerName ||
    row?.meta?.clientName ||
    row?.customer?.name ||
    row?.client?.name ||
    row?.client ||
    row?.customerName ||
    row?.clientName ||
    row?.fields?.custName ||
    row?.fields?.customerName ||
    row?.fields?.clientName ||
    "-"
  );
}

function pickCreatedAt(row) {
  return (
    row?.meta?.createdAt ||
    row?.createdAt ||
    row?.meta?.updatedAt ||
    row?.updatedAt ||
    ""
  );
}

function pickOfferStatus(row) {
  return String(
    row?.fields?.offerStatus ||
    row?.meta?.offerStatus ||
    row?.offerStatus ||
    "nowa"
  ).trim().toLowerCase();
}

function getVatRateFromPayload(payload) {
  const raw =
    payload?.fields?.offerVat ??
    payload?.fields?.offerVatCode ??
    payload?.fields?.vatCode ??
    payload?.meta?.vatCode ??
    payload?.vatCode ??
    payload?.meta?.vat?.code ??
    null;

  if (raw == null) return 0.23;

  const value = String(raw).trim().toUpperCase();
  if (value.includes("WDT")) return 0;
  if (value === "EX" || value.includes("0_EX")) return 0;
  if (value.startsWith("0")) return 0;

  const num = parseInt(value.replace("%", ""), 10);
  return Number.isFinite(num) ? num / 100 : 0.23;
}

function computeTotalsFromPayload(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const itemsNet = items.reduce((acc, item) => {
    const qty = Math.max(1, parseInt(item?.qty || 1, 10));
    return acc + itemNetAfterDiscount(item) * qty;
  }, 0);

  const shippingNet = toNumber(payload?.fields?.shippingNet ?? payload?.fields?.shipNet ?? payload?.meta?.shippingNet ?? 0);
  const net = round2(itemsNet + shippingNet);
  const vatRate = getVatRateFromPayload(payload);
  const gross = round2(net * (1 + vatRate));
  return { net, gross, vatRate };
}

function computeProfitFromPayload(payload, offerCcy) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  let profitNetPln = 0;

  for (const item of items) {
    const qty = Math.max(1, parseInt(item?.qty || 1, 10));
    const sellNet = itemNetAfterDiscount(item) * qty;
    const sellNetPln = toPLN(sellNet, offerCcy);
    const buyNet = Math.max(0, toNumber(item?.buyNet)) * qty;
    const buyNetPln = toPLN(buyNet, String(item?.buyCcy || "PLN").toUpperCase());
    profitNetPln += sellNetPln - buyNetPln;
  }

  const shippingNet = toNumber(payload?.fields?.shippingNet ?? payload?.fields?.shipNet ?? payload?.meta?.shippingNet ?? 0);
  if (shippingNet > 0) {
    profitNetPln += toPLN(shippingNet, offerCcy);
  }

  const vatRate = getVatRateFromPayload(payload);
  const profitGrossPln = profitNetPln * (1 + vatRate);

  return {
    vatRate,
    profitNetPln: round2(profitNetPln),
    profitGrossPln: round2(profitGrossPln),
    profitNet: round2(fromPLN(profitNetPln, offerCcy)),
    profitGross: round2(fromPLN(profitGrossPln, offerCcy)),
  };
}

function sanitizeSelectionIds(ids) {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.map((value) => String(value || "").trim()).filter(Boolean)));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      mode: parsed?.mode === "range" ? "range" : "month",
      month: /^\d{4}-\d{2}$/.test(parsed?.month || "") ? parsed.month : currentMonthValue(),
      dateFrom: normalizeYmd(parsed?.dateFrom) || startOfMonth(currentMonthValue()),
      dateTo: normalizeYmd(parsed?.dateTo) || endOfMonth(currentMonthValue()),
      doneText: String(parsed?.doneText || ""),
      planText: String(parsed?.planText || ""),
      pmSalary: round2(parsed?.pmSalary || 0),
      realizedOfferIds: sanitizeSelectionIds(parsed?.realizedOfferIds),
      csvRaw: String(parsed?.csvRaw || ""),
      csvFileName: String(parsed?.csvFileName || ""),
    };
  } catch {
    return {
      mode: "month",
      month: currentMonthValue(),
      dateFrom: startOfMonth(currentMonthValue()),
      dateTo: endOfMonth(currentMonthValue()),
      doneText: "",
      planText: "",
      pmSalary: 0,
      realizedOfferIds: [],
      csvRaw: "",
      csvFileName: "",
    };
  }
}

function saveState(state) {
  const payload = {
    mode: state.mode,
    month: state.month,
    dateFrom: state.dateFrom,
    dateTo: state.dateTo,
    doneText: state.doneText,
    planText: state.planText,
    pmSalary: state.pmSalary,
    realizedOfferIds: sanitizeSelectionIds(state.realizedOfferIds),
    csvRaw: state.csvRaw,
    csvFileName: state.csvFileName,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function getPeriodFromState(state) {
  if (state.mode === "month") {
    const from = startOfMonth(state.month);
    const to = endOfMonth(state.month);
    return {
      mode: "month",
      from,
      to,
      days: diffDaysInclusive(from, to),
      label: parseMonthLabel(state.month),
    };
  }

  const from = normalizeYmd(state.dateFrom);
  const to = normalizeYmd(state.dateTo);
  const days = diffDaysInclusive(from, to);
  return {
    mode: "range",
    from,
    to,
    days,
    label: from && to ? `${ymdToPL(from)} - ${ymdToPL(to)} (${days} dni)` : "-",
  };
}

function getNextPeriodLabel(period) {
  if (period.mode === "month") return "kolejny miesiąc";
  if (period.days === 14) return "kolejne 2 tygodnie";
  if (period.days === 7) return "kolejny tydzień";
  if (period.days === 1) return "kolejny dzień";
  return `kolejne ${period.days || 0} dni`;
}

function getPmCostFactor(period) {
  if (period.mode === "month") return 0.5;
  if (period.days === 14) return 0.25;
  if (period.days <= 0) return 0;
  return Math.min(0.5, round2((period.days / 30) * 0.5));
}

function shiftYmd(ymd, days) {
  const stamp = Date.parse(`${normalizeYmd(ymd)}T00:00:00`);
  if (!Number.isFinite(stamp)) return "";
  const next = new Date(stamp + Number(days || 0) * 86400000);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

function getPreviousPeriod(period) {
  if (!period?.from || !period?.to || !period?.days) {
    return { mode: "range", from: "", to: "", days: 0, label: "-" };
  }

  if (period.mode === "month") {
    const [yearRaw, monthRaw] = String(period.from).split("-").map(Number);
    const previousMonthDate = new Date(yearRaw, (monthRaw || 1) - 2, 1);
    const month = `${previousMonthDate.getFullYear()}-${pad2(previousMonthDate.getMonth() + 1)}`;
    const from = startOfMonth(month);
    const to = endOfMonth(month);
    return {
      mode: "month",
      from,
      to,
      days: diffDaysInclusive(from, to),
      label: parseMonthLabel(month),
    };
  }

  const to = shiftYmd(period.from, -1);
  const from = shiftYmd(to, -(period.days - 1));
  return {
    mode: "range",
    from,
    to,
    days: diffDaysInclusive(from, to),
    label: from && to ? `${ymdToPL(from)} - ${ymdToPL(to)} (${period.days} dni)` : "-",
  };
}

function aggregateOfferRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const count = safeRows.length;
  const netPln = round2(safeRows.reduce((acc, row) => acc + toNumber(row?.netPln), 0));
  const grossPln = round2(safeRows.reduce((acc, row) => acc + toNumber(row?.grossPln), 0));
  const profitNetPln = round2(safeRows.reduce((acc, row) => acc + toNumber(row?.profitNetPln), 0));
  const profitGrossPln = round2(safeRows.reduce((acc, row) => acc + toNumber(row?.profitGrossPln), 0));

  return {
    count,
    netPln,
    grossPln,
    profitNetPln,
    profitGrossPln,
    avgGrossPln: count ? round2(grossPln / count) : 0,
    avgProfitNetPln: count ? round2(profitNetPln / count) : 0,
  };
}

function calcDeltaPct(currentValue, previousValue) {
  const current = toNumber(currentValue);
  const previous = toNumber(previousValue);
  if (previous === 0) return current === 0 ? 0 : null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

function formatDeltaPct(delta) {
  if (delta == null) return "brak bazy";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString("pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function isWithinPeriod(value, period) {
  const ymd = normalizeYmd(value);
  if (!ymd || !period?.from || !period?.to) return false;
  return ymd >= period.from && ymd <= period.to;
}

function bbcodeToHtml(input) {
  let html = escapeHtml(String(input || ""));

  html = html.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, body) => {
    const parts = String(body || "")
      .split(/\[\*\]/g)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!parts.length) return "";
    return `<ul>${parts.map((item) => `<li>${item}</li>`).join("")}</ul>`;
  });

  html = html
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>")
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>")
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");

  html = html.replace(/\n/g, "<br />");
  return html;
}

function bbcodeToPlainText(input) {
  return String(input || "")
    .replace(/\[list\]/gi, "")
    .replace(/\[\/list\]/gi, "")
    .replace(/\[\*\]/gi, "- ")
    .replace(/\[\/?(b|i|u)\]/gi, "")
    .trim();
}

function insertBbCode(textarea, type) {
  if (!textarea) return;

  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const selected = textarea.value.slice(start, end);

  let replacement = selected;

  if (type === "b" || type === "i" || type === "u") {
    replacement = `[${type}]${selected || "tekst"}[/${type}]`;
  } else if (type === "list") {
    const lines = (selected || "Nowy punkt").split(/\r?\n/).filter(Boolean);
    replacement = `[list]\n${lines.map((line) => `[*] ${line}`).join("\n")}\n[/list]`;
  } else if (type === "item") {
    const lines = (selected || "Nowy punkt").split(/\r?\n/);
    replacement = lines.map((line) => `[*] ${line || "Nowy punkt"}`).join("\n");
  }

  textarea.setRangeText(replacement, start, end, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

async function fetchArrayBufferAsBase64(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function ensurePdfFonts(doc) {
  const fontList = doc.getFontList?.() || {};
  if (fontList.NotoSans && (fontList.NotoSans.normal || fontList.NotoSans.bold)) return;

  const regularBase64 = await fetchArrayBufferAsBase64(NOTO_REG_URL);
  const boldBase64 = await fetchArrayBufferAsBase64(NOTO_BOLD_URL);

  doc.addFileToVFS("NotoSans-Regular.ttf", regularBase64);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", boldBase64);
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatPercent(value, digits = 1) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0,0%";
  return `${num.toLocaleString("pl-PL", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function detectDelimiter(headerLine) {
  const line = String(headerLine || "");
  if (line.includes("\t")) return "\t";
  if ((line.match(/;/g) || []).length >= (line.match(/,/g) || []).length) return ";";
  return ",";
}

function splitDelimitedLine(line, delimiter) {
  if (delimiter === "\t") return String(line || "").split("\t");

  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < String(line || "").length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseSubiektRows(rawText) {
  const text = String(rawText || "").replace(/\uFEFF/g, "").trim();
  if (!text) return [];

  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const rows = [];

  for (const line of lines.slice(1)) {
    const cols = splitDelimitedLine(line, delimiter).map((value) => String(value || "").trim());
    if (cols.length < 10) continue;

    const qty = Math.max(0, toNumber(cols[4]));
    const gross = toNumber(cols[6]);
    const net = toNumber(cols[7]);
    const cost = toNumber(cols[8]);
    const profit = toNumber(cols[9]);
    const marginPct = toNumber(cols[10]);

    if (!cols[1]) continue;
    // Wiersze z iloscia 0 w eksporcie Subiekta zwykle oznaczaja korekty
    // niezwiązane z realnym ruchem towaru, więc pomijamy je w raporcie PM.
    if (qty <= 0) continue;

    rows.push({
      type: cols[0] || "",
      name: cols[1] || "",
      symbol: cols[2] || "",
      group: cols[3] || "Bez grupy",
      qty,
      unit: cols[5] || "",
      gross,
      net,
      cost,
      profit,
      marginPct,
      totalGross: round2(gross),
      totalNet: round2(net),
      totalCost: round2(cost),
      totalProfit: round2(profit),
    });
  }

  return rows;
}

function buildSubiektInsights(rawText, period, pmSalary) {
  const rows = parseSubiektRows(rawText);
  if (!rows.length) return null;

  const totalQty = round2(rows.reduce((acc, row) => acc + row.qty, 0));
  const totalGross = round2(rows.reduce((acc, row) => acc + row.totalGross, 0));
  const totalNet = round2(rows.reduce((acc, row) => acc + row.totalNet, 0));
  const totalCost = round2(rows.reduce((acc, row) => acc + row.totalCost, 0));
  const totalProfit = round2(rows.reduce((acc, row) => acc + row.totalProfit, 0));
  const weightedMarginPct = totalNet > 0 ? round2((totalProfit / totalNet) * 100) : 0;
  const roiPct = totalCost > 0 ? round2((totalProfit / totalCost) * 100) : 0;
  const profitAfterCompanyCosts = round2(totalProfit * 0.7);
  const pmCostFactor = getPmCostFactor(period);
  const pmCost = round2(toNumber(pmSalary) * pmCostFactor);
  const pmNetResult = round2(profitAfterCompanyCosts - pmCost);

  const byGroupMap = new Map();
  const byProductMap = new Map();

  for (const row of rows) {
    const groupKey = row.group || "Bez grupy";
    const groupCurrent = byGroupMap.get(groupKey) || {
      group: groupKey,
      qty: 0,
      totalNet: 0,
      totalGross: 0,
      totalCost: 0,
      totalProfit: 0,
      uniqueProducts: 0,
    };
    groupCurrent.qty += row.qty;
    groupCurrent.totalNet += row.totalNet;
    groupCurrent.totalGross += row.totalGross;
    groupCurrent.totalCost += row.totalCost;
    groupCurrent.totalProfit += row.totalProfit;
    groupCurrent.uniqueProducts += 1;
    byGroupMap.set(groupKey, groupCurrent);

    const productKey = `${row.symbol}__${row.name}`;
    const productCurrent = byProductMap.get(productKey) || {
      key: productKey,
      name: row.name,
      symbol: row.symbol,
      group: row.group,
      qty: 0,
      totalNet: 0,
      totalGross: 0,
      totalCost: 0,
      totalProfit: 0,
    };
    productCurrent.qty += row.qty;
    productCurrent.totalNet += row.totalNet;
    productCurrent.totalGross += row.totalGross;
    productCurrent.totalCost += row.totalCost;
    productCurrent.totalProfit += row.totalProfit;
    byProductMap.set(productKey, productCurrent);
  }

  const groups = Array.from(byGroupMap.values())
    .map((group) => ({
      ...group,
      totalNet: round2(group.totalNet),
      totalGross: round2(group.totalGross),
      totalCost: round2(group.totalCost),
      totalProfit: round2(group.totalProfit),
      marginPct: group.totalNet > 0 ? round2((group.totalProfit / group.totalNet) * 100) : 0,
      roiPct: group.totalCost > 0 ? round2((group.totalProfit / group.totalCost) * 100) : 0,
      shareProfitPct: totalProfit !== 0 ? round2((group.totalProfit / totalProfit) * 100) : 0,
    }))
    .sort((a, b) => b.totalProfit - a.totalProfit);

  const products = Array.from(byProductMap.values())
    .map((product) => ({
      ...product,
      totalNet: round2(product.totalNet),
      totalGross: round2(product.totalGross),
      totalCost: round2(product.totalCost),
      totalProfit: round2(product.totalProfit),
      marginPct: product.totalNet > 0 ? round2((product.totalProfit / product.totalNet) * 100) : 0,
      roiPct: product.totalCost > 0 ? round2((product.totalProfit / product.totalCost) * 100) : 0,
    }));

  const bestSellers = products
    .slice()
    .sort((a, b) => (b.qty - a.qty) || (b.totalNet - a.totalNet))
    .slice(0, 5);

  const topProducts = products
    .slice()
    .sort((a, b) => (b.totalProfit - a.totalProfit) || (b.totalNet - a.totalNet))
    .slice(0, 5);

  const attentionProducts = products
    .filter((product) => product.totalProfit < 0 || product.marginPct <= 10)
    .sort((a, b) => (a.totalProfit - b.totalProfit) || (a.marginPct - b.marginPct))
    .slice(0, 5);

  return {
    rows,
    totalQty,
    totalGross,
    totalNet,
    totalCost,
    totalProfit,
    weightedMarginPct,
    roiPct,
    profitAfterCompanyCosts,
    pmCostFactor,
    pmCost,
    pmNetResult,
    uniqueProducts: products.length,
    groupsCount: groups.length,
    groups,
    bestSellers,
    topProducts,
    attentionProducts,
    historicalComparisonNote: "Porównanie okres do okresu wymaga załadowania danych z kolejnego eksportu historycznego.",
  };
}

function renderBarList(items, maxValue, valueFormatter, metaFormatter) {
  if (!items?.length) return "Brak danych.";
  const safeMax = Math.max(1, Number(maxValue || 0));
  return `
    <div class="pmReportBarList">
      ${items
        .map((item) => {
          const width = Math.max(6, Math.round((Number(item.value || 0) / safeMax) * 100));
          return `
            <div class="pmReportBarRow">
              <div class="pmReportBarLabel">
                <span class="pmReportBarName">${escapeHtml(item.name)}</span>
                <span class="pmReportBarMeta">${escapeHtml(metaFormatter(item))}</span>
                <div class="pmReportBarTrack">
                  <div class="pmReportBarFill" style="width:${width}%;"></div>
                </div>
              </div>
              <div class="pmReportBarValue">${escapeHtml(valueFormatter(item))}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildSummary(period, state, offerRows, previousOfferRows) {
  const realized = offerRows.filter((row) => state.realizedOfferIds.includes(row.id));
  const sumNetPln = round2(realized.reduce((acc, row) => acc + row.netPln, 0));
  const sumGrossPln = round2(realized.reduce((acc, row) => acc + row.grossPln, 0));
  const profitNetPln = round2(realized.reduce((acc, row) => acc + row.profitNetPln, 0));
  const profitGrossPln = round2(realized.reduce((acc, row) => acc + row.profitGrossPln, 0));
  const pmCostFactor = getPmCostFactor(period);
  const pmCost = round2(toNumber(state.pmSalary) * pmCostFactor);
  const subiekt = buildSubiektInsights(state.csvRaw, period, state.pmSalary);
  const previousPeriod = getPreviousPeriod(period);
  const currentAll = aggregateOfferRows(offerRows);
  const previousAll = aggregateOfferRows(previousOfferRows);

  return {
    period,
    previousPeriod,
    realized,
    inRangeCount: offerRows.length,
    realizedCount: realized.length,
    sumNetPln,
    sumGrossPln,
    profitNetPln,
    profitGrossPln,
    pmCostFactor,
    pmCost,
    subiekt,
    offerComparison: {
      currentAll,
      previousAll,
      countDeltaPct: calcDeltaPct(currentAll.count, previousAll.count),
      grossDeltaPct: calcDeltaPct(currentAll.grossPln, previousAll.grossPln),
      profitDeltaPct: calcDeltaPct(currentAll.profitNetPln, previousAll.profitNetPln),
    },
  };
}

function buildMailHtml(summary, state) {
  const subiekt = summary.subiekt;
  const rowsHtml = summary.realized.length
    ? summary.realized
        .map(
          (row) => `
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;">${escapeHtml(row.offerNo)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;">${escapeHtml(row.client)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;">${escapeHtml(ymdToPL(row.createdAt))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(row.net, row.ccy))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(row.gross, row.ccy))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(row.profitNet, row.ccy))}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="6" style="padding:12px;border-bottom:1px solid #dbe3f0;">Brak oznaczonych ofert do raportu.</td></tr>`;

  const groupsHtml = subiekt?.groups?.length
    ? subiekt.groups
        .slice(0, 6)
        .map(
          (group) => `
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;">${escapeHtml(group.group)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(group.totalNet, "PLN"))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(group.totalProfit, "PLN"))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(formatPercent(group.roiPct))}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="4" style="padding:12px;border-bottom:1px solid #dbe3f0;">Brak danych z Subiekta.</td></tr>`;

  const topProductsHtml = subiekt?.topProducts?.length
    ? subiekt.topProducts
        .map(
          (product) => `
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;">${escapeHtml(product.name)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(product.qty.toLocaleString("pl-PL"))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(product.totalNet, "PLN"))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(product.totalProfit, "PLN"))}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="4" style="padding:12px;border-bottom:1px solid #dbe3f0;">Brak danych z Subiekta.</td></tr>`;

  const attentionHtml = subiekt?.attentionProducts?.length
    ? subiekt.attentionProducts
        .map(
          (product) => `
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;">${escapeHtml(product.name)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(product.qty.toLocaleString("pl-PL"))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(product.totalProfit, "PLN"))}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(formatPercent(product.marginPct))}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="4" style="padding:12px;border-bottom:1px solid #dbe3f0;">Brak pozycji wymagających uwagi.</td></tr>`;

  const offerComparisonRows = `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;">Bieżący okres</td>
      <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(String(summary.offerComparison.currentAll.count))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(summary.offerComparison.currentAll.grossPln, "PLN"))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(summary.offerComparison.currentAll.profitNetPln, "PLN"))}</td>
    </tr>
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;">${escapeHtml(`Poprzedni okres (${summary.previousPeriod.label})`)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(String(summary.offerComparison.previousAll.count))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(summary.offerComparison.previousAll.grossPln, "PLN"))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #dbe3f0;text-align:right;">${escapeHtml(moneyCcy(summary.offerComparison.previousAll.profitNetPln, "PLN"))}</td>
    </tr>
  `;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5;max-width:980px;">
      <h1 style="margin:0 0 12px;font-size:28px;">Raport PM</h1>
      <p style="margin:0 0 20px;color:#475569;">Zakres: <strong>${escapeHtml(summary.period.label)}</strong></p>

      <div style="display:inline-block;margin:0 0 10px;padding:6px 12px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:700;">Sekcja ofert</div>
      <h2 style="margin:0 0 10px;font-size:22px;">Oferty z programu</h2>

      <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
        <tr>
          <td style="width:33%;padding:14px;border:1px solid #dbe3f0;background:#f8fbff;">
            <div style="font-size:12px;color:#64748b;">Zrealizowane oferty</div>
            <div style="font-size:24px;font-weight:700;">${summary.realizedCount}</div>
          </td>
          <td style="width:33%;padding:14px;border:1px solid #dbe3f0;background:#f8fbff;">
            <div style="font-size:12px;color:#64748b;">Suma brutto</div>
            <div style="font-size:24px;font-weight:700;">${escapeHtml(moneyCcy(summary.sumGrossPln, "PLN"))}</div>
          </td>
          <td style="width:33%;padding:14px;border:1px solid #dbe3f0;background:#f8fbff;">
            <div style="font-size:12px;color:#64748b;">Zysk netto ofert</div>
            <div style="font-size:24px;font-weight:700;">${escapeHtml(moneyCcy(summary.profitNetPln, "PLN"))}</div>
          </td>
        </tr>
      </table>

      <h3 style="margin:0 0 10px;font-size:18px;">Porównanie do poprzedniego okresu</h3>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:10px 12px;text-align:left;">Okres</th>
            <th style="padding:10px 12px;text-align:right;">Liczba ofert</th>
            <th style="padding:10px 12px;text-align:right;">Brutto wszystkich ofert</th>
            <th style="padding:10px 12px;text-align:right;">Zysk netto wszystkich ofert</th>
          </tr>
        </thead>
        <tbody>${offerComparisonRows}</tbody>
      </table>

      <ul style="margin:0 0 24px;padding-left:20px;color:#475569;">
        <li>Zmiana liczby ofert: ${escapeHtml(formatDeltaPct(summary.offerComparison.countDeltaPct))}</li>
        <li>Zmiana wartości brutto wszystkich ofert: ${escapeHtml(formatDeltaPct(summary.offerComparison.grossDeltaPct))}</li>
        <li>Zmiana zysku netto wszystkich ofert: ${escapeHtml(formatDeltaPct(summary.offerComparison.profitDeltaPct))}</li>
      </ul>

      <h2 style="margin:0 0 10px;font-size:20px;">Zrealizowane oferty</h2>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:10px 12px;text-align:left;">Nr</th>
            <th style="padding:10px 12px;text-align:left;">Klient</th>
            <th style="padding:10px 12px;text-align:left;">Data</th>
            <th style="padding:10px 12px;text-align:right;">Netto</th>
            <th style="padding:10px 12px;text-align:right;">Brutto</th>
            <th style="padding:10px 12px;text-align:right;">Zysk netto</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <h2 style="margin:0 0 10px;font-size:20px;">Wykonane działania</h2>
      <div style="margin:0 0 24px;padding:16px;border:1px solid #dbe3f0;border-radius:12px;background:#fff;">${bbcodeToHtml(state.doneText) || "Brak opisu."}</div>

      <h2 style="margin:0 0 10px;font-size:20px;">Plan na ${escapeHtml(getNextPeriodLabel(summary.period))}</h2>
      <div style="margin:0 0 24px;padding:16px;border:1px solid #dbe3f0;border-radius:12px;background:#fff;">${bbcodeToHtml(state.planText) || "Brak planu."}</div>

      <div style="display:inline-block;margin:0 0 10px;padding:6px 12px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;">Sekcja Subiekt</div>
      <h2 style="margin:0 0 10px;font-size:22px;">Sprzedaż i rentowność z Subiekta</h2>
      ${
        subiekt
          ? `
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
        <tr>
          <td style="width:25%;padding:14px;border:1px solid #dbe3f0;background:#f8fbff;">
            <div style="font-size:12px;color:#64748b;">Netto z CSV</div>
            <div style="font-size:24px;font-weight:700;">${escapeHtml(moneyCcy(subiekt.totalNet, "PLN"))}</div>
          </td>
          <td style="width:25%;padding:14px;border:1px solid #dbe3f0;background:#f8fbff;">
            <div style="font-size:12px;color:#64748b;">Zysk z CSV (G)</div>
            <div style="font-size:24px;font-weight:700;">${escapeHtml(moneyCcy(subiekt.totalProfit, "PLN"))}</div>
          </td>
          <td style="width:25%;padding:14px;border:1px solid #dbe3f0;background:#f8fbff;">
            <div style="font-size:12px;color:#64748b;">ROI</div>
            <div style="font-size:24px;font-weight:700;">${escapeHtml(formatPercent(subiekt.roiPct))}</div>
          </td>
          <td style="width:25%;padding:14px;border:1px solid #dbe3f0;background:#f8fbff;">
            <div style="font-size:12px;color:#64748b;">Wynik PM netto</div>
            <div style="font-size:24px;font-weight:700; color:${subiekt.pmNetResult >= 0 ? "#0f9f5f" : "#c0392b"};">${escapeHtml(moneyCcy(subiekt.pmNetResult, "PLN"))}</div>
          </td>
        </tr>
      </table>
      `
          : `<p style="margin:0 0 20px;color:#64748b;">Brak załadowanych danych CSV z Subiekta.</p>`
      }

      ${
        subiekt
          ? `<ul style="margin:0 0 24px;padding-left:20px;color:#475569;">
              <li>Zysk po kosztach firmy (70%): ${escapeHtml(moneyCcy(subiekt.profitAfterCompanyCosts, "PLN"))}</li>
              <li>Koszt PM dla okresu: ${escapeHtml(moneyCcy(subiekt.pmCost, "PLN"))}</li>
              <li>Wynik PM netto: ${escapeHtml(moneyCcy(subiekt.pmNetResult, "PLN"))}</li>
            </ul>`
          : ""
      }

      <h2 style="margin:0 0 10px;font-size:20px;">Grupy towarowe</h2>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:10px 12px;text-align:left;">Grupa</th>
            <th style="padding:10px 12px;text-align:right;">Netto</th>
            <th style="padding:10px 12px;text-align:right;">Zysk</th>
            <th style="padding:10px 12px;text-align:right;">ROI</th>
          </tr>
        </thead>
        <tbody>${groupsHtml}</tbody>
      </table>

      <h2 style="margin:0 0 10px;font-size:20px;">Top produkty po zysku</h2>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:10px 12px;text-align:left;">Towar</th>
            <th style="padding:10px 12px;text-align:right;">Ilość</th>
            <th style="padding:10px 12px;text-align:right;">Netto</th>
            <th style="padding:10px 12px;text-align:right;">Zysk</th>
          </tr>
        </thead>
        <tbody>${topProductsHtml}</tbody>
      </table>

      <h2 style="margin:0 0 10px;font-size:20px;">Pozycje do uwagi</h2>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:10px 12px;text-align:left;">Towar</th>
            <th style="padding:10px 12px;text-align:right;">Ilość</th>
            <th style="padding:10px 12px;text-align:right;">Zysk</th>
            <th style="padding:10px 12px;text-align:right;">Marża</th>
          </tr>
        </thead>
        <tbody>${attentionHtml}</tbody>
      </table>

      <h2 style="margin:0 0 10px;font-size:20px;">Podsumowanie końcowe</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:0 0;margin:0 0 12px;">
        <tr>
          <td style="width:50%;padding:16px;border:1px solid #dbe3f0;background:#f8fbff;vertical-align:top;">
            <div style="font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.04em;">Oferty z programu</div>
            <ul style="margin:12px 0 0;padding-left:18px;">
              <li>Zrealizowane oferty: ${escapeHtml(String(summary.realizedCount))}</li>
              <li>Suma brutto: ${escapeHtml(moneyCcy(summary.sumGrossPln, "PLN"))}</li>
              <li>Zysk netto ofert: ${escapeHtml(moneyCcy(summary.profitNetPln, "PLN"))}</li>
            </ul>
          </td>
          <td style="width:50%;padding:16px;border:1px solid #dbe3f0;background:#f8fbff;vertical-align:top;">
            <div style="font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.04em;">Subiekt</div>
            <ul style="margin:12px 0 0;padding-left:18px;">
              <li>Netto z CSV: ${escapeHtml(moneyCcy(subiekt?.totalNet || 0, "PLN"))}</li>
              <li>Zysk z CSV (G): ${escapeHtml(moneyCcy(subiekt?.totalProfit || 0, "PLN"))}</li>
              <li>Wynik PM netto: ${escapeHtml(moneyCcy(subiekt?.pmNetResult || 0, "PLN"))}</li>
            </ul>
          </td>
        </tr>
      </table>
      <p style="margin:0;color:#64748b;">Uwaga: sekcja ofert i sekcja Subiekt są prezentowane osobno i nie są sumowane między sobą.</p>
    </div>
  `;
}

function buildHtmlDocument(summary, state) {
  const mailHtml = buildMailHtml(summary, state);
  return { mailHtml };
}

async function exportPdf(summary, state) {
  if (!window.jspdf?.jsPDF) {
    throw new Error("Brak jsPDF w oknie aplikacji.");
  }

  const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
  const subiekt = summary.subiekt;
  await ensurePdfFonts(doc);
  doc.setFont("NotoSans", "normal");

  const marginX = 14;
  let cursorY = 18;

  doc.setFont("NotoSans", "bold");
  doc.setFontSize(18);
  doc.text("Raport PM", marginX, cursorY);
  cursorY += 8;

  doc.setFont("NotoSans", "normal");
  doc.setFontSize(10);
  doc.setTextColor(88, 102, 126);
  doc.text(`Zakres: ${summary.period.label}`, marginX, cursorY);
  cursorY += 8;

  doc.setTextColor(30, 41, 59);
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(12);
  doc.text("Sekcja ofert", marginX, cursorY);
  cursorY += 6;
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(11);
  const summaryLines = [
    `Oferty w zakresie: ${summary.inRangeCount}`,
    `Zrealizowane oferty: ${summary.realizedCount}`,
    `Suma netto ofert: ${moneyCcy(summary.sumNetPln, "PLN")}`,
    `Suma brutto ofert: ${moneyCcy(summary.sumGrossPln, "PLN")}`,
    `Zysk netto ofert: ${moneyCcy(summary.profitNetPln, "PLN")}`,
    `Zysk brutto ofert: ${moneyCcy(summary.profitGrossPln, "PLN")}`,
  ];

  summaryLines.forEach((line) => {
    doc.text(line, marginX, cursorY);
    cursorY += 6;
  });

  cursorY += 2;
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(12);
  doc.text(`Porównanie do poprzedniego okresu (${summary.previousPeriod.label})`, marginX, cursorY);
  cursorY += 4;
  doc.autoTable({
    startY: cursorY,
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, font: "NotoSans", fontStyle: "bold" },
    styles: { font: "NotoSans", fontSize: 8.6, cellPadding: 2.2, overflow: "linebreak" },
    head: [["Okres", "Liczba ofert", "Brutto wszystkich ofert", "Zysk netto wszystkich ofert"]],
    body: [
      [
        "Bieżący okres",
        String(summary.offerComparison.currentAll.count),
        moneyCcy(summary.offerComparison.currentAll.grossPln, "PLN"),
        moneyCcy(summary.offerComparison.currentAll.profitNetPln, "PLN"),
      ],
      [
        `Poprzedni okres (${summary.previousPeriod.label})`,
        String(summary.offerComparison.previousAll.count),
        moneyCcy(summary.offerComparison.previousAll.grossPln, "PLN"),
        moneyCcy(summary.offerComparison.previousAll.profitNetPln, "PLN"),
      ],
    ],
  });

  cursorY = (doc.lastAutoTable?.finalY || cursorY) + 8;
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(10);
  [
    `Zmiana liczby ofert: ${formatDeltaPct(summary.offerComparison.countDeltaPct)}`,
    `Zmiana brutto wszystkich ofert: ${formatDeltaPct(summary.offerComparison.grossDeltaPct)}`,
    `Zmiana zysku netto wszystkich ofert: ${formatDeltaPct(summary.offerComparison.profitDeltaPct)}`,
  ].forEach((line) => {
    doc.text(line, marginX, cursorY);
    cursorY += 5;
  });

  cursorY += 3;
  const tableRows = summary.realized.map((row) => [
    row.offerNo,
    row.client,
    ymdToPL(row.createdAt),
    moneyCcy(row.net, row.ccy),
    moneyCcy(row.gross, row.ccy),
    moneyCcy(row.profitNet, row.ccy),
    moneyCcy(row.profitGross, row.ccy),
  ]);

  doc.autoTable({
    startY: cursorY,
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235], textColor: 255, font: "NotoSans", fontStyle: "bold" },
    styles: { font: "NotoSans", fontSize: 9, cellPadding: 2.5, overflow: "linebreak" },
    head: [["Nr oferty", "Klient", "Data", "Netto", "Brutto", "Zysk netto", "Zysk brutto"]],
    body: tableRows.length ? tableRows : [["-", "Brak oznaczonych ofert", "-", "-", "-", "-", "-"]],
  });

  cursorY = (doc.lastAutoTable?.finalY || cursorY) + 10;
  if (cursorY > 250) {
    doc.addPage();
    cursorY = 18;
  }

  const blocks = [
    { title: "Wykonane działania", text: bbcodeToPlainText(state.doneText) || "Brak opisu." },
    { title: `Plan na ${getNextPeriodLabel(summary.period)}`, text: bbcodeToPlainText(state.planText) || "Brak planu." },
    {
      title: "Sekcja Subiekt",
      text: subiekt
        ? `Netto z CSV: ${moneyCcy(subiekt.totalNet, "PLN")}\n` +
          `Zysk z CSV (G): ${moneyCcy(subiekt.totalProfit, "PLN")}\n` +
          `ROI: ${formatPercent(subiekt.roiPct)}\n` +
          `Wynik po kosztach firmy: ${moneyCcy(subiekt.profitAfterCompanyCosts, "PLN")}\n` +
          `Koszt PM: ${moneyCcy(subiekt.pmCost, "PLN")}\n` +
          `Wynik PM netto: ${moneyCcy(subiekt.pmNetResult, "PLN")}`
        : `Wynagrodzenie PM: ${moneyCcy(state.pmSalary, "PLN")}\nBrak załadowanych danych CSV z Subiekta.`,
    },
  ];

  blocks.forEach((block, index) => {
    if (cursorY > 250 && index > 0) {
      doc.addPage();
      cursorY = 18;
    }
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(12);
    doc.text(block.title, marginX, cursorY);
    cursorY += 6;
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(block.text, 180);
    doc.text(lines, marginX, cursorY);
    cursorY += Math.max(10, lines.length * 5 + 4);
  });

  if (subiekt) {
    if (cursorY > 220) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(12);
    doc.text("Grupy towarowe", marginX, cursorY);
    cursorY += 4;
    doc.autoTable({
      startY: cursorY,
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, font: "NotoSans", fontStyle: "bold" },
      styles: { font: "NotoSans", fontSize: 8.6, cellPadding: 2.2, overflow: "linebreak" },
      head: [["Grupa", "Netto", "Zysk", "ROI"]],
      body: subiekt.groups.slice(0, 8).map((group) => [
        group.group,
        moneyCcy(group.totalNet, "PLN"),
        moneyCcy(group.totalProfit, "PLN"),
        formatPercent(group.roiPct),
      ]),
    });

    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 8;
    if (cursorY > 220) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(12);
    doc.text("Top produkty po zysku", marginX, cursorY);
    cursorY += 4;
    doc.autoTable({
      startY: cursorY,
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], textColor: 255, font: "NotoSans", fontStyle: "bold" },
      styles: { font: "NotoSans", fontSize: 8.4, cellPadding: 2.1, overflow: "linebreak" },
      head: [["Towar", "Ilość", "Netto", "Zysk"]],
      body: subiekt.topProducts.map((product) => [
        product.name,
        product.qty.toLocaleString("pl-PL"),
        moneyCcy(product.totalNet, "PLN"),
        moneyCcy(product.totalProfit, "PLN"),
      ]),
    });

    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 8;
    if (cursorY > 220) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(12);
    doc.text("Pozycje do uwagi", marginX, cursorY);
    cursorY += 4;
    doc.autoTable({
      startY: cursorY,
      theme: "grid",
      headStyles: { fillColor: [127, 29, 29], textColor: 255, font: "NotoSans", fontStyle: "bold" },
      styles: { font: "NotoSans", fontSize: 8.4, cellPadding: 2.1, overflow: "linebreak" },
      head: [["Towar", "Ilość", "Zysk", "Marża"]],
      body: (subiekt.attentionProducts.length ? subiekt.attentionProducts : [{ name: "Brak pozycji wymagających uwagi.", qty: "", totalProfit: "", marginPct: "" }]).map((product) => [
        product.name,
        product.qty === "" ? "" : product.qty.toLocaleString("pl-PL"),
        product.totalProfit === "" ? "" : moneyCcy(product.totalProfit, "PLN"),
        product.marginPct === "" ? "" : formatPercent(product.marginPct),
      ]),
    });

    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 8;
  }

  if (cursorY > 220) {
    doc.addPage();
    cursorY = 18;
  }

  doc.setFont("NotoSans", "bold");
  doc.setFontSize(12);
  doc.text("Podsumowanie końcowe", marginX, cursorY);
  cursorY += 6;
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(10);
  [
    `Oferty z programu: ${summary.realizedCount} zrealizowane, brutto ${moneyCcy(summary.sumGrossPln, "PLN")}, zysk netto ${moneyCcy(summary.profitNetPln, "PLN")}`,
    `Subiekt: netto ${moneyCcy(subiekt?.totalNet || 0, "PLN")}, zysk G ${moneyCcy(subiekt?.totalProfit || 0, "PLN")}, wynik PM netto ${moneyCcy(subiekt?.pmNetResult || 0, "PLN")}`,
    "Uwaga: sekcja ofert i sekcja Subiekt są prezentowane osobno i nie są sumowane między sobą.",
  ].forEach((line) => {
    const lines = doc.splitTextToSize(line, 180);
    doc.text(lines, marginX, cursorY);
    cursorY += lines.length * 5 + 1;
  });

  const suffix = summary.period.mode === "month" ? summary.period.label.replace(/\s+/g, "-") : `${summary.period.from}_${summary.period.to}`;
  doc.save(`raport-pm_${suffix}.pdf`);
}

async function loadOfferRows(period) {
  if (!window.esusAPI?.offersList || !window.esusAPI?.offersOpen) {
    throw new Error("Brak API ofert w preloadzie.");
  }

  const list = await window.esusAPI.offersList();
  const source = Array.isArray(list) ? list : [];
  const candidateRows = source.filter((row) => {
    const createdAt = normalizeYmd(pickCreatedAt(row));
    if (!createdAt) return true;
    return isWithinPeriod(createdAt, period);
  });

  const result = [];
  let index = 0;
  const concurrency = Math.min(4, Math.max(1, candidateRows.length));

  async function worker() {
    while (index < candidateRows.length) {
      const current = candidateRows[index++];
      const id = offerIdFromRow(current);
      if (!id) continue;

      try {
        const payload = await window.esusAPI.offersOpen(id);
        const createdAt = normalizeYmd(pickCreatedAt(payload) || pickCreatedAt(current));
        if (!isWithinPeriod(createdAt, period)) continue;

        const ccy = String(payload?.meta?.offerCcy || current?.offerCcy || "PLN").toUpperCase();
        const totals = computeTotalsFromPayload(payload);
        const profit = computeProfitFromPayload(payload, ccy);

        result.push({
          id,
          offerNo: String(pickOfferNo(payload) || pickOfferNo(current)),
          client: String(pickClient(payload) || pickClient(current)),
          createdAt,
          status: pickOfferStatus(payload || current),
          ccy,
          net: totals.net,
          gross: totals.gross,
          netPln: round2(toPLN(totals.net, ccy)),
          grossPln: round2(toPLN(totals.gross, ccy)),
          profitNet: profit.profitNet,
          profitGross: profit.profitGross,
          profitNetPln: profit.profitNetPln,
          profitGrossPln: profit.profitGrossPln,
        });
      } catch (error) {
        console.warn("PM report offer load failed", id, error);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  result.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt), "pl"));
  return result;
}

export function initPmReportPanel() {
  const root = q("offersPmReportView");
  if (!root) {
    return {
      activate: async () => {},
      refreshOffers: async () => {},
    };
  }

  const state = loadState();
  let offerRows = [];
  let previousOfferRows = [];
  let loading = false;
  let refreshToken = 0;

  const refs = {
    monthModeBtn: q("pmReportModeMonth"),
    rangeModeBtn: q("pmReportModeRange"),
    monthPanel: q("pmReportMonthPanel"),
    rangePanel: q("pmReportRangePanel"),
    monthInput: q("pmReportMonth"),
    fromInput: q("pmReportDateFrom"),
    toInput: q("pmReportDateTo"),
    salaryInput: q("pmReportPmSalary"),
    applyBtn: q("pmReportApply"),
    exportHtmlBtn: q("pmReportExportHtml"),
    exportPdfBtn: q("pmReportExportPdf"),
    quickHtmlBtn: q("pmReportQuickHtml"),
    quickPdfBtn: q("pmReportQuickPdf"),
    selectAllBtn: q("pmReportSelectAll"),
    clearSelectionBtn: q("pmReportClearSelection"),
    offersBody: q("pmReportOffersBody"),
    rangeLabel: q("pmReportRangeLabel"),
    nextPeriodLabel: q("pmReportNextPeriodLabel"),
    offersInRange: q("pmReportOffersInRange"),
    realizedMeta: q("pmReportOffersRealizedMeta"),
    netTotal: q("pmReportNetTotal"),
    grossTotal: q("pmReportGrossTotal"),
    profitNet: q("pmReportProfitNet"),
    profitGross: q("pmReportProfitGross"),
    pmCost: q("pmReportPmCost"),
    pmCostHint: q("pmReportPmCostHint"),
    offersCompare: q("pmReportOffersCompare"),
    offersBars: q("pmReportOffersBars"),
    doneText: q("pmReportDoneText"),
    planText: q("pmReportPlanText"),
    donePreview: q("pmReportDonePreview"),
    planPreview: q("pmReportPlanPreview"),
    planTitle: q("pmReportPlanTitle"),
    planHint: q("pmReportPlanHint"),
    csvFile: q("pmReportCsvFile"),
    csvRaw: q("pmReportCsvRaw"),
    csvMeta: q("pmReportCsvMeta"),
    subiektStats: q("pmReportSubiektStats"),
    groupsBody: q("pmReportGroupsBody"),
    attentionBody: q("pmReportAttentionBody"),
    topProductsBody: q("pmReportTopProductsBody"),
    roiPlaceholder: q("pmReportRoiPlaceholder"),
    momPlaceholder: q("pmReportMomPlaceholder"),
    finalSummary: q("pmReportFinalSummary"),
  };

  function syncStateFromForm() {
    state.month = refs.monthInput?.value || currentMonthValue();
    state.dateFrom = refs.fromInput?.value || startOfMonth(state.month);
    state.dateTo = refs.toInput?.value || endOfMonth(state.month);
    state.pmSalary = round2(refs.salaryInput?.value || 0);
    state.doneText = refs.doneText?.value || "";
    state.planText = refs.planText?.value || "";
    state.csvRaw = refs.csvRaw?.value || "";
    saveState(state);
  }

  function applyStateToForm() {
    if (refs.monthInput) refs.monthInput.value = state.month;
    if (refs.fromInput) refs.fromInput.value = state.dateFrom || startOfMonth(state.month);
    if (refs.toInput) refs.toInput.value = state.dateTo || endOfMonth(state.month);
    if (refs.salaryInput) refs.salaryInput.value = state.pmSalary ? String(state.pmSalary) : "";
    if (refs.doneText) refs.doneText.value = state.doneText;
    if (refs.planText) refs.planText.value = state.planText;
    if (refs.csvRaw) refs.csvRaw.value = state.csvRaw;
  }

  function renderMode() {
    const isMonth = state.mode === "month";
    refs.monthModeBtn?.classList.toggle("is-active", isMonth);
    refs.rangeModeBtn?.classList.toggle("is-active", !isMonth);
    if (refs.monthPanel) refs.monthPanel.hidden = !isMonth;
    if (refs.rangePanel) refs.rangePanel.hidden = isMonth;
  }

  function renderEditors() {
    if (refs.donePreview) refs.donePreview.innerHTML = bbcodeToHtml(state.doneText);
    if (refs.planPreview) refs.planPreview.innerHTML = bbcodeToHtml(state.planText);
  }

  function renderCsvMeta() {
    const source = state.csvFileName ? `Plik: ${state.csvFileName}` : "Brak pliku CSV.";
    const extra = state.csvRaw ? ` Zapisano ${state.csvRaw.length} znaków.` : "";
    if (refs.csvMeta) refs.csvMeta.textContent = `${source}${extra}`;
  }

  function renderSubiektInsights() {
    const insights = buildSubiektInsights(state.csvRaw, getPeriodFromState(state), state.pmSalary);
    const groupShareItems = insights?.groups?.slice(0, 4).map((group) => ({
      name: group.group,
      value: Math.max(0, group.totalProfit),
      shareProfitPct: group.shareProfitPct,
      totalProfit: group.totalProfit,
    }));

    if (refs.subiektStats) {
      refs.subiektStats.innerHTML = insights
        ? `
          <div class="pmReportSubiektStat">
            <span>Netto z CSV</span>
            <strong>${escapeHtml(moneyCcy(insights.totalNet, "PLN"))}</strong>
            <small>${escapeHtml(`${insights.totalQty.toLocaleString("pl-PL")} szt. | ${insights.uniqueProducts} produktów`)}</small>
          </div>
          <div class="pmReportSubiektStat">
            <span>Zysk z CSV (G)</span>
            <strong>${escapeHtml(moneyCcy(insights.totalProfit, "PLN"))}</strong>
            <small>${escapeHtml(`Marża ważona: ${formatPercent(insights.weightedMarginPct)}`)}</small>
          </div>
          <div class="pmReportSubiektStat">
            <span>ROI</span>
            <strong>${escapeHtml(formatPercent(insights.roiPct))}</strong>
            <small>${escapeHtml(`Po kosztach firmy: ${moneyCcy(insights.profitAfterCompanyCosts, "PLN")}`)}</small>
          </div>
          <div class="pmReportSubiektStat">
            <span>Wynik PM netto</span>
            <strong class="${insights.pmNetResult >= 0 ? "pmReportValuePos" : "pmReportValueNeg"}">${escapeHtml(
              moneyCcy(insights.pmNetResult, "PLN")
            )}</strong>
            <small>${escapeHtml(`Koszt PM: ${moneyCcy(insights.pmCost, "PLN")} (${formatPercent(insights.pmCostFactor * 100, 0)})`)}</small>
          </div>
        `
        : "";
    }

    if (refs.groupsBody) {
      refs.groupsBody.innerHTML = insights?.groups?.length
        ? insights.groups
            .slice(0, 6)
            .map(
              (group) => `
                <tr>
                  <td>${escapeHtml(group.group)}</td>
                  <td class="right">${escapeHtml(moneyCcy(group.totalNet, "PLN"))}</td>
                  <td class="right">${escapeHtml(moneyCcy(group.totalProfit, "PLN"))}</td>
                  <td class="right">${escapeHtml(formatPercent(group.roiPct))}</td>
                </tr>
              `
            )
            .join("")
        : `<tr><td colspan="4" class="pmReportEmptyCell">Brak danych z Subiekta.</td></tr>`;
    }

    if (refs.attentionBody) {
      refs.attentionBody.innerHTML = insights?.attentionProducts?.length
        ? insights.attentionProducts
            .map(
              (product) => `
                <tr>
                  <td>${escapeHtml(product.name)}</td>
                  <td class="right">${escapeHtml(product.qty.toLocaleString("pl-PL"))}</td>
                  <td class="right ${product.totalProfit < 0 ? "pmReportValueNeg" : ""}">${escapeHtml(moneyCcy(product.totalProfit, "PLN"))}</td>
                  <td class="right">${escapeHtml(formatPercent(product.marginPct))}</td>
                </tr>
              `
            )
            .join("")
        : `<tr><td colspan="4" class="pmReportEmptyCell">Brak pozycji wymagających uwagi.</td></tr>`;
    }

    if (refs.topProductsBody) {
      refs.topProductsBody.innerHTML = insights?.topProducts?.length
        ? insights.topProducts
            .map(
              (product) => `
                <tr>
                  <td>${escapeHtml(product.name)}</td>
                  <td class="right">${escapeHtml(product.qty.toLocaleString("pl-PL"))}</td>
                  <td class="right">${escapeHtml(moneyCcy(product.totalNet, "PLN"))}</td>
                  <td class="right">${escapeHtml(moneyCcy(product.totalProfit, "PLN"))}</td>
                </tr>
              `
            )
            .join("")
        : `<tr><td colspan="4" class="pmReportEmptyCell">Brak danych z Subiekta.</td></tr>`;
    }

    if (refs.roiPlaceholder) {
      refs.roiPlaceholder.innerHTML = insights
        ? `
          <div class="pmReportChartStack">
            <div class="pmReportKpiList">
              <div class="pmReportKpiRow">
                <div class="pmReportKpiLabel">Zysk po kosztach firmy (70%)</div>
                <div class="pmReportKpiValue">${escapeHtml(moneyCcy(insights.profitAfterCompanyCosts, "PLN"))}</div>
              </div>
              <div class="pmReportKpiRow">
                <div class="pmReportKpiLabel">Koszt PM dla okresu</div>
                <div class="pmReportKpiValue">${escapeHtml(moneyCcy(insights.pmCost, "PLN"))}</div>
              </div>
              <div class="pmReportKpiRow">
                <div class="pmReportKpiLabel">Wynik PM netto</div>
                <div class="pmReportKpiValue ${insights.pmNetResult >= 0 ? "pmReportValuePos" : "pmReportValueNeg"}">${escapeHtml(
                  moneyCcy(insights.pmNetResult, "PLN")
                )}</div>
              </div>
              <div class="pmReportKpiRow">
                <div class="pmReportKpiLabel">Liczba grup towarowych</div>
                <div class="pmReportKpiValue">${escapeHtml(String(insights.groupsCount))}</div>
              </div>
            </div>
            <div class="pmReportChartMiniTitle">Najmocniejsze grupy po zysku</div>
            ${
              groupShareItems?.length
                ? renderBarList(
                    groupShareItems,
                    Math.max(...groupShareItems.map((item) => item.value)),
                    (item) => moneyCcy(item.totalProfit, "PLN"),
                    (item) => `${formatPercent(item.shareProfitPct)} udziału w zysku`
                  )
                : `<div class="pmReportChartPlaceholderText">Brak grup do pokazania.</div>`
            }
          </div>
        `
        : "Oczekuje na dane z CSV z Subiekta.";
    }

    if (refs.momPlaceholder) {
      refs.momPlaceholder.innerHTML = insights?.bestSellers?.length
        ? renderBarList(
            insights.bestSellers.map((product) => ({
              name: product.name,
              value: product.qty,
              totalNet: product.totalNet,
            })),
            Math.max(...insights.bestSellers.map((product) => product.qty)),
            (item) => `${Number(item.value).toLocaleString("pl-PL")} szt.`,
            (item) => `${moneyCcy(item.totalNet, "PLN")} netto`
          )
        : "Lista pojawi sie po imporcie i parsowaniu CSV.";
    }
  }

  function renderOfferInsights(summary) {
    if (loading) {
      if (refs.offersCompare) refs.offersCompare.textContent = "Ładowanie porównania do poprzedniego okresu...";
      if (refs.offersBars) refs.offersBars.textContent = "Ładowanie wykresu wartości ofert...";
      return;
    }

    if (refs.offersCompare) {
      refs.offersCompare.innerHTML = `
        <div class="pmReportChartStack">
          <div class="pmReportChartMiniTitle">Poprzedni analogiczny okres: ${escapeHtml(summary.previousPeriod.label)}</div>
          <div class="pmReportKpiList">
            <div class="pmReportKpiRow">
              <div class="pmReportKpiLabel">Oferty utworzone: ${summary.offerComparison.currentAll.count} vs ${summary.offerComparison.previousAll.count}</div>
              <div class="pmReportKpiValue">${escapeHtml(formatDeltaPct(summary.offerComparison.countDeltaPct))}</div>
            </div>
            <div class="pmReportKpiRow">
              <div class="pmReportKpiLabel">Brutto wszystkich ofert: ${moneyCcy(summary.offerComparison.currentAll.grossPln, "PLN")} vs ${moneyCcy(summary.offerComparison.previousAll.grossPln, "PLN")}</div>
              <div class="pmReportKpiValue ${summary.offerComparison.grossDeltaPct > 0 ? "pmReportValuePos" : summary.offerComparison.grossDeltaPct < 0 ? "pmReportValueNeg" : ""}">${escapeHtml(
                formatDeltaPct(summary.offerComparison.grossDeltaPct)
              )}</div>
            </div>
            <div class="pmReportKpiRow">
              <div class="pmReportKpiLabel">Zysk netto wszystkich ofert: ${moneyCcy(summary.offerComparison.currentAll.profitNetPln, "PLN")} vs ${moneyCcy(summary.offerComparison.previousAll.profitNetPln, "PLN")}</div>
              <div class="pmReportKpiValue ${summary.offerComparison.profitDeltaPct > 0 ? "pmReportValuePos" : summary.offerComparison.profitDeltaPct < 0 ? "pmReportValueNeg" : ""}">${escapeHtml(
                formatDeltaPct(summary.offerComparison.profitDeltaPct)
              )}</div>
            </div>
            <div class="pmReportKpiRow">
              <div class="pmReportKpiLabel">Średnia wartość brutto oferty</div>
              <div class="pmReportKpiValue">${escapeHtml(moneyCcy(summary.offerComparison.currentAll.avgGrossPln, "PLN"))}</div>
            </div>
          </div>
        </div>
      `;
    }

    if (refs.offersBars) {
      const barItems = [
        {
          name: "Bieżący okres",
          value: summary.offerComparison.currentAll.grossPln,
          grossPln: summary.offerComparison.currentAll.grossPln,
          count: summary.offerComparison.currentAll.count,
        },
        {
          name: "Poprzedni okres",
          value: summary.offerComparison.previousAll.grossPln,
          grossPln: summary.offerComparison.previousAll.grossPln,
          count: summary.offerComparison.previousAll.count,
        },
      ];

      refs.offersBars.innerHTML = renderBarList(
        barItems,
        Math.max(...barItems.map((item) => item.value), 1),
        (item) => moneyCcy(item.grossPln, "PLN"),
        (item) => `${item.count.toLocaleString("pl-PL")} ofert`
      );
    }
  }

  function renderFinalSummary(summary) {
    if (!refs.finalSummary) return;

    refs.finalSummary.innerHTML = `
      <article class="pmReportFinalCard">
        <div class="pmReportMiniTableTitle">Oferty z programu</div>
        <div class="pmReportFinalRows">
          <div class="pmReportFinalRow"><span>Zrealizowane oferty</span><strong>${escapeHtml(String(summary.realizedCount))}</strong></div>
          <div class="pmReportFinalRow"><span>Suma netto</span><strong>${escapeHtml(moneyCcy(summary.sumNetPln, "PLN"))}</strong></div>
          <div class="pmReportFinalRow"><span>Suma brutto</span><strong>${escapeHtml(moneyCcy(summary.sumGrossPln, "PLN"))}</strong></div>
          <div class="pmReportFinalRow"><span>Zysk netto ofert</span><strong>${escapeHtml(moneyCcy(summary.profitNetPln, "PLN"))}</strong></div>
          <div class="pmReportFinalRow"><span>Zysk brutto ofert</span><strong>${escapeHtml(moneyCcy(summary.profitGrossPln, "PLN"))}</strong></div>
        </div>
      </article>
      <article class="pmReportFinalCard">
        <div class="pmReportMiniTableTitle">Subiekt</div>
        <div class="pmReportFinalRows">
          <div class="pmReportFinalRow"><span>Netto z CSV</span><strong>${escapeHtml(moneyCcy(summary.subiekt?.totalNet || 0, "PLN"))}</strong></div>
          <div class="pmReportFinalRow"><span>Zysk z CSV (G)</span><strong>${escapeHtml(moneyCcy(summary.subiekt?.totalProfit || 0, "PLN"))}</strong></div>
          <div class="pmReportFinalRow"><span>ROI</span><strong>${escapeHtml(formatPercent(summary.subiekt?.roiPct || 0))}</strong></div>
          <div class="pmReportFinalRow"><span>Wynik PM netto</span><strong class="${(summary.subiekt?.pmNetResult || 0) >= 0 ? "pmReportValuePos" : "pmReportValueNeg"}">${escapeHtml(
            moneyCcy(summary.subiekt?.pmNetResult || 0, "PLN")
          )}</strong></div>
          <div class="pmReportFinalRow"><span>Uwaga</span><strong>Bez sumowania z ofertą</strong></div>
        </div>
      </article>
    `;
  }

  function renderSummary() {
    const period = getPeriodFromState(state);
    const summary = buildSummary(period, state, offerRows, previousOfferRows);
    const nextPeriodLabel = getNextPeriodLabel(period);

    if (refs.rangeLabel) refs.rangeLabel.textContent = period.label;
    if (refs.nextPeriodLabel) refs.nextPeriodLabel.textContent = nextPeriodLabel;
    if (refs.planTitle) refs.planTitle.textContent = `Plan na ${nextPeriodLabel}`;
    if (refs.planHint) refs.planHint.textContent = `Plan powinien odpowiadać okresowi: ${nextPeriodLabel}.`;

    if (refs.offersInRange) refs.offersInRange.textContent = String(summary.inRangeCount);
    if (refs.realizedMeta) refs.realizedMeta.textContent = `Zrealizowane: ${summary.realizedCount}`;
    if (refs.netTotal) refs.netTotal.textContent = moneyCcy(summary.sumNetPln, "PLN");
    if (refs.grossTotal) refs.grossTotal.textContent = moneyCcy(summary.sumGrossPln, "PLN");
    if (refs.profitNet) refs.profitNet.textContent = moneyCcy(summary.profitNetPln, "PLN");
    if (refs.profitGross) refs.profitGross.textContent = moneyCcy(summary.profitGrossPln, "PLN");
    if (refs.pmCost) refs.pmCost.textContent = moneyCcy(summary.pmCost, "PLN");
    if (refs.pmCostHint) refs.pmCostHint.textContent = `Współczynnik okresu: ${(summary.pmCostFactor * 100).toFixed(0)}%`;
    renderOfferInsights(summary);
    renderSubiektInsights();
    renderFinalSummary(summary);
  }

  function renderOffersTable() {
    if (!refs.offersBody) return;

    if (loading) {
      refs.offersBody.innerHTML = `<tr><td colspan="9" class="pmReportEmptyCell">Ładowanie ofert...</td></tr>`;
      return;
    }

    if (!offerRows.length) {
      refs.offersBody.innerHTML = `<tr><td colspan="9" class="pmReportEmptyCell">Brak ofert w wybranym zakresie.</td></tr>`;
      return;
    }

    refs.offersBody.innerHTML = offerRows
      .map((row) => {
        const checked = state.realizedOfferIds.includes(row.id) ? "checked" : "";
        return `
          <tr>
            <td>
              <label class="pmReportCheckbox">
                <input type="checkbox" data-offer-realized="${escapeHtml(row.id)}" ${checked} />
                <span>Tak</span>
              </label>
            </td>
            <td>${escapeHtml(row.offerNo)}</td>
            <td>${escapeHtml(row.client)}</td>
            <td>${escapeHtml(ymdToPL(row.createdAt))}</td>
            <td>${escapeHtml(row.ccy)}</td>
            <td class="right">${escapeHtml(moneyCcy(row.net, row.ccy))}</td>
            <td class="right">${escapeHtml(moneyCcy(row.gross, row.ccy))}</td>
            <td class="right">${escapeHtml(moneyCcy(row.profitNet, row.ccy))}</td>
            <td class="right">${escapeHtml(moneyCcy(row.profitGross, row.ccy))}</td>
          </tr>
        `;
      })
      .join("");

    refs.offersBody.querySelectorAll("[data-offer-realized]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = String(checkbox.getAttribute("data-offer-realized") || "");
        if (!id) return;
        if (checkbox.checked) {
          state.realizedOfferIds = sanitizeSelectionIds([...state.realizedOfferIds, id]);
        } else {
          state.realizedOfferIds = state.realizedOfferIds.filter((value) => value !== id);
        }
        saveState(state);
        renderSummary();
      });
    });
  }

  async function refreshOffers() {
    const token = ++refreshToken;
    syncStateFromForm();
    const period = getPeriodFromState(state);
    const previousPeriod = getPreviousPeriod(period);

    if (!period.from || !period.to || period.days <= 0) {
      showToast("Uzupełnij poprawny zakres raportu.", { type: "error", ms: 3000 });
      return;
    }

    loading = true;
    renderSummary();
    renderOffersTable();

    try {
      const [rows, previousRows] = await Promise.all([
        loadOfferRows(period),
        previousPeriod.from && previousPeriod.to ? loadOfferRows(previousPeriod) : Promise.resolve([]),
      ]);
      if (token !== refreshToken) return;
      offerRows = rows;
      previousOfferRows = previousRows;
      state.realizedOfferIds = sanitizeSelectionIds([
        ...state.realizedOfferIds,
        ...rows.filter((row) => row.status === "zrealizowana").map((row) => row.id),
      ]);
      saveState(state);
      renderOffersTable();
      renderSummary();
    } catch (error) {
      console.error(error);
      if (token !== refreshToken) return;
      offerRows = [];
      previousOfferRows = [];
      renderOffersTable();
      renderSummary();
      showToast("Nie udało się pobrać ofert do raportu.", { type: "error", ms: 3500 });
    } finally {
      if (token !== refreshToken) return;
      loading = false;
      renderOffersTable();
      renderSummary();
    }
  }

  async function handleExportHtml() {
    syncStateFromForm();
    const summary = buildSummary(getPeriodFromState(state), state, offerRows, previousOfferRows);
    const { mailHtml } = buildHtmlDocument(summary, state);

    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([mailHtml], { type: "text/html" }),
            "text/plain": new Blob([mailHtml], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(mailHtml);
      }
      showToast("HTML raportu skopiowany do schowka.", { type: "info", ms: 3200 });
    } catch {
      showToast("Nie udało się skopiować HTML do schowka.", { type: "error", ms: 3200 });
    }
  }

  async function handleExportPdf() {
    syncStateFromForm();
    const summary = buildSummary(getPeriodFromState(state), state, offerRows, previousOfferRows);
    try {
      await exportPdf(summary, state);
      showToast("Raport PDF został wygenerowany.", { type: "info", ms: 2500 });
    } catch (error) {
      console.error(error);
      showToast("Nie udało się wygenerować PDF raportu.", { type: "error", ms: 3500 });
    }
  }

  refs.monthModeBtn?.addEventListener("click", () => {
    state.mode = "month";
    saveState(state);
    renderMode();
    renderSummary();
    refreshOffers();
  });

  refs.rangeModeBtn?.addEventListener("click", () => {
    state.mode = "range";
    if (!state.dateFrom || !state.dateTo) {
      state.dateFrom = startOfMonth(state.month);
      state.dateTo = endOfMonth(state.month);
    }
    saveState(state);
    renderMode();
    renderSummary();
    refreshOffers();
  });

  refs.applyBtn?.addEventListener("click", () => {
    refreshOffers();
  });

  refs.exportHtmlBtn?.addEventListener("click", () => {
    handleExportHtml();
  });

  refs.exportPdfBtn?.addEventListener("click", () => {
    handleExportPdf();
  });

  refs.quickHtmlBtn?.addEventListener("click", () => {
    handleExportHtml();
  });

  refs.quickPdfBtn?.addEventListener("click", () => {
    handleExportPdf();
  });

  refs.selectAllBtn?.addEventListener("click", () => {
    state.realizedOfferIds = sanitizeSelectionIds(offerRows.map((row) => row.id));
    saveState(state);
    renderOffersTable();
    renderSummary();
  });

  refs.clearSelectionBtn?.addEventListener("click", () => {
    state.realizedOfferIds = [];
    saveState(state);
    renderOffersTable();
    renderSummary();
  });

  refs.doneText?.addEventListener("input", () => {
    syncStateFromForm();
    renderEditors();
    renderSummary();
  });

  refs.planText?.addEventListener("input", () => {
    syncStateFromForm();
    renderEditors();
    renderSummary();
  });

  refs.salaryInput?.addEventListener("input", () => {
    syncStateFromForm();
    renderSummary();
  });

  refs.monthInput?.addEventListener("change", () => {
    syncStateFromForm();
    renderSummary();
    refreshOffers();
  });

  refs.fromInput?.addEventListener("change", () => {
    syncStateFromForm();
    renderSummary();
    refreshOffers();
  });

  refs.toInput?.addEventListener("change", () => {
    syncStateFromForm();
    renderSummary();
    refreshOffers();
  });

  refs.csvRaw?.addEventListener("input", () => {
    syncStateFromForm();
    renderCsvMeta();
    renderSubiektInsights();
  });

  refs.csvFile?.addEventListener("change", async () => {
    const file = refs.csvFile?.files?.[0];
    if (!file) return;

    try {
      state.csvRaw = await file.text();
      state.csvFileName = file.name;
      saveState(state);
      if (refs.csvRaw) refs.csvRaw.value = state.csvRaw;
      renderCsvMeta();
      renderSubiektInsights();
      showToast("CSV zapisany w formularzu raportu.", { type: "info", ms: 2200 });
    } catch (error) {
      console.error(error);
      showToast("Nie udało się odczytać pliku CSV.", { type: "error", ms: 3200 });
    }
  });

  root.querySelectorAll(".pmReportBbToolbar").forEach((toolbar) => {
    toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-bb]");
      if (!button) return;
      const targetId = toolbar.getAttribute("data-target");
      const textarea = targetId ? q(targetId) : null;
      insertBbCode(textarea, button.getAttribute("data-bb"));
    });
  });

  applyStateToForm();
  renderMode();
  renderEditors();
  renderCsvMeta();
  renderSummary();

  return {
    activate: async () => {
      renderMode();
      renderEditors();
      renderCsvMeta();
      renderSummary();
      await refreshOffers();
    },
    refreshOffers,
  };
}
