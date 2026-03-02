// renderer/app/pdf/pdf.js
import { LOGO_URL_B, NOTO_REG_URL, NOTO_BOLD_URL } from "../config/constants.js";
import { getVatFromUI } from "../utils/vat.js";
import { el, toNumber } from "../utils/format.js";
import { store } from "../state/store.js";
import { itemNetAfterDiscount } from "../calc/pricing.js";
import { buildOfferNumber } from "../ui/offerNumber.js";
import { showToast } from "../ui/toast.js";

// ✅ i18n dla PDF
import {
  t,
  getLocale,
  formatMoney,
  formatDate,
  vatLabel as vatLabelI18n,
  getTableHead,
  getDocLabel,
  formatPaymentText,
  getFilePrefix,
  getCompanyFooterLines,
} from "../i18n/pdfI18n.js";

async function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function labelNoColon(lang, key) {
  return String(t(lang, key) || "").replace(/\s*:\s*$/, "");
}

async function fetchTtfAsBase64(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status} (${url})`);
  const buf = await res.arrayBuffer();
  return await arrayBufferToBase64(buf);
}

async function ensurePolishFontsForDoc(doc) {
  const list = doc.getFontList?.() || {};
  if (list.NotoSans && (list.NotoSans.normal || list.NotoSans.bold)) return;

  const regB64 = await fetchTtfAsBase64(NOTO_REG_URL);
  const boldB64 = await fetchTtfAsBase64(NOTO_BOLD_URL);

  doc.addFileToVFS("NotoSans-Regular.ttf", regB64);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");

  doc.addFileToVFS("NotoSans-Bold.ttf", boldB64);
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
}

async function fetchAsDataURL(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// 🔑 język z UI (dostosuj ID jeśli u Ciebie inne)
function getPdfLang() {
  const v =
    (document.getElementById("offerLang")?.value ||
      document.getElementById("lang")?.value ||
      store?.settings?.lang ||
      "pl") + "";
  const lang = v.trim().toLowerCase();
  return ["pl", "en", "de", "hu"].includes(lang) ? lang : "pl";
}

// 🔑 waluta dokumentu z UI (dostosuj ID jeśli u Ciebie inne)
function getDocCurrency() {
  const v =
    (document.getElementById("offerCurrency")?.value ||
      document.getElementById("docCcy")?.value ||
      store?.settings?.currency ||
      "PLN") + "";
  const c = v.trim().toUpperCase();
  return ["PLN", "EUR", "USD"].includes(c) ? c : "PLN";
}

function formatCustomerBlock(lang) {
  const lines = [];
  const v = (id) => (document.getElementById(id)?.value ?? "").trim();
  const name = v("custName");
  const nip = v("custNip");
  const addr = v("custAddr");
  const contact = v("custContact");

  if (name) lines.push(name);
  if (nip) lines.push(`NIP: ${nip}`);
  if (addr) lines.push(addr);
  if (contact) lines.push(contact);

  return lines.length ? lines : [t(lang, "missingData")];
}

function formatCreatorBlock(lang) {
  const lines = [];
  const name = document.getElementById("creatorName")?.value.trim();
  const email = document.getElementById("creatorEmail")?.value.trim();
  const phone = document.getElementById("creatorPhone")?.value.trim();

  if (name) lines.push(name);
  if (email) lines.push(email);
  if (phone) lines.push(`Tel. ${phone}`);

  return lines.length ? lines : [t(lang, "missingData")];
}

/* ===== Warranty helpers (PDF) ===== */
function pluralizeMonthsPL(n) {
  const x = Math.abs(Number(n) || 0);
  const mod10 = x % 10;
  const mod100 = x % 100;

  if (x === 1) return "miesiąc";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "miesiące";
  return "miesięcy";
}

function getWarrantyParts(it) {
  const w = it?.warranty;
  if (!w || typeof w !== "object") return null;

  const months = Math.max(0, parseInt(w.months ?? 0, 10) || 0);
  const nbd = !!w.nbd;
  if (!(months > 0)) return null;

  const monthsText = `${months} ${pluralizeMonthsPL(months)}`;
  return { nbd, monthsText };
}

/* ===== ESUS enterprise styles ===== */
const ESUS_BLUE = [0, 154, 255];

function pdfSafeText(v) {
  return String(v ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ===== Header card ===== */
function drawHeaderCard(doc, {
  x,
  y,
  w,
  fontName,
  leftTitle,
  leftLines,
  rightTitle,
  rightLines,
}) {
  const accentH = 2;
  const padX = 8;
  const padTop = 6;
  const padBottom = 6;
  const rowH = 5;

  const colGap = 18;
  const colW = (w - colGap) / 2;

  const leftCount = (leftLines?.length || 0) + 1;
  const rightCount = (rightLines?.length || 0) + 1;
  const rows = Math.max(leftCount, rightCount);
  const cardH = padTop + rows * rowH + padBottom;

  doc.setFillColor(243, 246, 250);
  doc.rect(x, y, w, cardH, "F");

  doc.setFillColor(...ESUS_BLUE);
  doc.rect(x, y, w, accentH, "F");

  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, cardH);

  const leftX = x + padX;
  const topTextY = y + padTop;

  // left
  let ly = topTextY;
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(25, 35, 45);
  doc.text(pdfSafeText(leftTitle), leftX, ly);
  ly += rowH;

  doc.setFont(fontName, "normal");
  doc.setFontSize(9);
  doc.setTextColor(25, 35, 45);
  (leftLines || []).forEach((line) => {
    doc.text(pdfSafeText(line), leftX, ly);
    ly += rowH;
  });

  // right
  let ry = topTextY;
  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(25, 35, 45);
  doc.text(pdfSafeText(rightTitle), x + w - padX, ry, { align: "right" });
  ry += rowH;

  doc.setFont(fontName, "normal");
  doc.setFontSize(9);
  doc.setTextColor(25, 35, 45);
  (rightLines || []).forEach((line) => {
    doc.text(pdfSafeText(line), x + w - padX, ry, { align: "right" });
    ry += rowH;
  });

  // divider – po tekście i tylko na wysokość contentu
  const divX = x + colW + (colGap / 2);
  const contentTop = y + padTop - 1;
  const contentBottom = y + cardH - padBottom + 1;
  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.line(divX, contentTop, divX, contentBottom);

  doc.setTextColor(0);
  return y + cardH;
}

/* ===== Enterprise title (Two-line, left aligned) =====
   (bez linii pod tytułem – user request)
*/
function drawDocTitleBlock(doc, {
  x,
  y,
  w,
  fontName,
  docLabelUpper,
  offerNo,
}) {
  // label
  doc.setFont(fontName, "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 102, 115);
  doc.text(pdfSafeText(docLabelUpper), x, y + 5.2, { align: "left" });

  // number
  doc.setFont(fontName, "bold");
  doc.setFontSize(18);
  doc.setTextColor(25, 35, 45);
  doc.text(pdfSafeText(offerNo), x, y + 12.2, { align: "left" });

  // bottom of title block (no divider)
  doc.setTextColor(0);
  return y + 14.5;
}

/* ===== ESUS summary footer (enterprise) ===== */
function drawEsusTotalsBars(doc, {
  x, y, w, lang, fontName, offerCcy, vat, sumNet, sumVat, sumGross,
  // shippingNet zostaje w argach (może się przydać gdzie indziej), ale tu nie używamy
}) {
  const cardH = 12;
  const accentH = 2;

  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.line(x, y, x + w, y);
  y += 1.2;

  doc.setFillColor(243, 246, 250);
  doc.rect(x, y, w, cardH, "F");

  doc.setFillColor(...ESUS_BLUE);
  doc.rect(x, y, w, accentH, "F");

  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, cardH);

  const segW = w / 3;
  const baseY = y + 8.2;

  const netLbl = pdfSafeText(String(t(lang, "sumNet") || "Suma netto").replace(/\s*:\s*$/, ""));
  const vatLbl = pdfSafeText(
    `${String(t(lang, "vat") || "VAT").replace(/\s*:\s*$/, "")} ${vatLabelI18n(lang, vat)}`.trim()
  );
  const grossLbl = pdfSafeText(String(t(lang, "sumGross") || "Suma brutto").replace(/\s*:\s*$/, ""));

  const netStr = pdfSafeText(formatMoney(sumNet, lang, offerCcy));
  const vatStr = pdfSafeText(formatMoney(sumVat, lang, offerCcy));
  const grossStr = pdfSafeText(formatMoney(sumGross, lang, offerCcy));

  doc.setTextColor(25, 35, 45);

  doc.setFont(fontName, "normal"); doc.setFontSize(8);
  doc.text(netLbl, x + 4, baseY);
  doc.setFont(fontName, "bold"); doc.setFontSize(9);
  doc.text(netStr, x + segW - 4, baseY, { align: "right" });

  doc.setFont(fontName, "normal"); doc.setFontSize(8);
  doc.text(vatLbl, x + segW + 4, baseY);
  doc.setFont(fontName, "bold"); doc.setFontSize(9);
  doc.text(vatStr, x + 2 * segW - 4, baseY, { align: "right" });

  doc.setFont(fontName, "normal"); doc.setFontSize(8);
  doc.text(grossLbl, x + 2 * segW + 4, baseY);
  doc.setFont(fontName, "bold"); doc.setFontSize(9);
  doc.text(grossStr, x + w - 4, baseY, { align: "right" });

  doc.setTextColor(0);
  return y + cardH; // ✅ bez “Dostawa” pod spodem
}

/* ===== Terms card ===== */
function drawTermsCard(doc, {
  x,
  y,
  w,
  fontName,
  lines,
}) {
  const accentH = 2;
  const padX = 6;
  const padTop = 5;
  const rowH = 5.2;

  const rows = (lines || []).filter(Boolean);
  const cardH = padTop + rows.length * rowH + 4;

  doc.setFillColor(243, 246, 250);
  doc.rect(x, y, w, cardH, "F");

  doc.setFillColor(...ESUS_BLUE);
  doc.rect(x, y, w, accentH, "F");

  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, cardH);

  const labelW = Math.max(38, Math.min(58, w * 0.34));
  const valueX = x + padX + labelW;
  const valueW = x + w - padX - valueX;

  let cy = y + padTop + 3.0;

  for (const r of rows) {
    const lbl = pdfSafeText(r.label);
    const val = pdfSafeText(r.value);

    doc.setFont(fontName, "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 92, 104);
    doc.text(lbl, x + padX, cy);

    doc.setTextColor(25, 35, 45);
    doc.setFont(fontName, r.valueBold ? "bold" : "normal");
    doc.setFontSize(9);

    let out = val;
    while (out && doc.getTextWidth(out) > valueW) out = out.slice(0, -1);
    doc.text(out, valueX, cy);

    cy += rowH;
  }

  doc.setTextColor(0);
  return y + cardH;
}

/* ===== Extra arrangements card ===== */
function drawExtraArrangementsCard(doc, {
  x,
  y,
  w,
  fontName,
  title,
  extraText,
}) {
  const accentH = 2;
  const padX = 6;
  const padTop = 6;
  const padBottom = 5;

  doc.setFont(fontName, "normal");
  doc.setFontSize(9);

  const textW = w - padX * 2;
  const wrapped = doc.splitTextToSize(extraText, textW);
  const lines = wrapped.slice(0, 60);

  const lineH = 4.2;
  const headerH = 6.2;
  const cardH = padTop + headerH + lines.length * lineH + padBottom;

  doc.setFillColor(243, 246, 250);
  doc.rect(x, y, w, cardH, "F");

  doc.setFillColor(...ESUS_BLUE);
  doc.rect(x, y, w, accentH, "F");

  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, cardH);

  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.setTextColor(25, 35, 45);
  doc.text(pdfSafeText(title), x + padX, y + padTop);

  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.line(x + padX, y + padTop + 2.2, x + w - padX, y + padTop + 2.2);

  doc.setFont(fontName, "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 72, 86);

  const textStartY = y + padTop + headerH;
  lines.forEach((ln, i) => {
    doc.text(ln, x + padX, textStartY + i * lineH);
  });

  doc.setTextColor(0);
  return { bottomY: y + cardH, height: cardH };
}

export async function generatePdf({ onBefore } = {}) {
  onBefore?.();

  const lang = getPdfLang();
  const locale = getLocale(lang);
  const DOC_CCY = getDocCurrency();

  if (store.items.length === 0) {
    showToast(
      t(lang, "missingData") === "(missing)" ? "Add at least one item." : "Dodaj przynajmniej jedną pozycję.",
      { type: "error", ms: 3500 }
    );
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let fontName = "helvetica";
  try {
    await ensurePolishFontsForDoc(doc);
    fontName = "NotoSans";
  } catch (err) {
    console.error(err);
    showToast(
      "Nie udało się załadować fontów do PDF (polskie znaki). PDF wygeneruje się czcionką domyślną.",
      { type: "error", ms: 3500 }
    );
  }
  doc.setFont(fontName, "normal");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  
  const docX = margin;                 // domyślnie
  const docW = pageW - margin * 2;     // domyślnie

  const isEstimate = !!document.getElementById("isEstimate")?.checked;

  const vat = getVatFromUI();
  const VAT_RATE = vat.rate;

  const vatCellLabel = vatLabelI18n(lang, vat);

  function getFooterReserveHeight() {
    const companyFooter =
      "ESUS IT Spółka z o. o., ul. Somosierry 30A, 71-181 Szczecin. " +
      "Sąd Rejonowy dla miasta Szczecina, VII Wydział Gospodarczy Krajowego Rejestru Sądowego, " +
      "KRS: 0001012470; VAT No / NIP: PL8522690002; REGON: 524134686; " +
      "Kapitał zakładowy 5 000 zł.";

    const companyLines = doc.splitTextToSize(companyFooter, pageW - margin * 2);
    const companyLineH = 3.6;

    let estLinesCount = 0;
    if (isEstimate) {
      const estimateLines = doc.splitTextToSize(t(lang, "estimateDisclaimer"), pageW - margin * 2);
      estLinesCount = estimateLines.length;
    }
    const estimateLineH = 4.0;

    return companyLines.length * companyLineH + estLinesCount * estimateLineH + 4;
  }

  function ensureSpace(heightNeeded, currentY) {
    const reserve = getFooterReserveHeight();
    const bottomLimit = pageH - margin - reserve;
    if (currentY + heightNeeded > bottomLimit) {
      doc.addPage();
      doc.setFont(fontName, "normal");
      doc.setFontSize(10);
      return true;
    }
    return false;
  }

  // Logo
  let logoData = null;
  try {
    logoData = await fetchAsDataURL(LOGO_URL_B);
  } catch {
    logoData = null;
  }

  // ===== Header layout =====
  const topY = 10;
  const logoW = 40;
  const logoH = 12;

  if (logoData) doc.addImage(logoData, "PNG", margin, topY, logoW, logoH);

  // ✅ bez linii pod logo (tylko spacing)
  const afterLogoY = topY + logoH + 6;

  // Header card
  const creatorLines = formatCreatorBlock(lang);
  const custLines = formatCustomerBlock(lang);

  const cardX = margin;
  const cardW = pageW - margin * 2;
  const cardY = afterLogoY;

  const cardBottomY = drawHeaderCard(doc, {
    x: cardX,
    y: cardY,
    w: cardW,
    fontName,
    leftTitle: t(lang, "preparedBy"),
    leftLines: creatorLines,
    rightTitle: t(lang, "customer"),
    rightLines: custLines,
  });

  // ===== Title block (tighter) =====
  const offerNoFromUi = (document.getElementById("offerNumberPreview")?.textContent || "").trim();
  const offerNo = offerNoFromUi && offerNoFromUi !== "—" ? offerNoFromUi : buildOfferNumber();

  const docLabel = getDocLabel(lang, isEstimate);
  const titleY = cardBottomY + 4; // ✅ mniejszy odstęp

  const titleBottomY = drawDocTitleBlock(doc, {
    x: margin,
    y: titleY,
    w: pageW - margin * 2,
    fontName,
    docLabelUpper: String(docLabel || "").toUpperCase(),
    offerNo,
  });

  // Subtitle (tighter)
  const subtitle = (el("creatorNotes")?.value || "").trim();
  let headerBlockBottomY = titleBottomY;

  if (subtitle) {
    doc.setFont(fontName, "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(80, 92, 104);
    doc.text(pdfSafeText(subtitle), margin, titleBottomY + 4.2, { align: "left" }); // ✅ mniejszy odstęp
    doc.setTextColor(0);
    headerBlockBottomY = titleBottomY + 4.2;
  }

  // ✅ mniejszy odstęp do tabeli
  const headerStartForTable = headerBlockBottomY + (isEstimate ? 7 : 5);

  // ===== Table =====
  const showDiscountCol = !!el("showDiscountColumnPdf").checked;

  const head = getTableHead(lang, {
    showDiscountCol,
    includeVatCol: true,
    vatBetweenNetAndGross: true,
  });

  const body = store.items.map((it, idx) => {
    const qty = Math.max(1, parseInt(it.qty || 1, 10));
    const disc = Math.min(100, Math.max(0, toNumber(it.discount)));
    const netAfter = itemNetAfterDiscount(it);

    const grossUnit = netAfter * (1 + VAT_RATE);
    const grossLine = grossUnit * qty;

    const warranty = getWarrantyParts(it);
    const descCell = warranty ? `${it.desc || "-"}\n\u200B` : (it.desc || "-");

    const row = [
      String(idx + 1),
      descCell,
      formatMoney(netAfter, lang, DOC_CCY).replace(/\s?[A-Z]{3}$/i, "").trim(),
    ];

    if (showDiscountCol) {
      row.push(`${disc.toLocaleString(locale, { maximumFractionDigits: 2 })}%`);
    }

    row.push(
      vatCellLabel,
      formatMoney(grossUnit, lang, DOC_CCY).replace(/\s?[A-Z]{3}$/i, "").trim(),
      String(qty),
      formatMoney(grossLine, lang, DOC_CCY).replace(/\s?[A-Z]{3}$/i, "").trim()
    );

    row.__warranty = warranty;
    return row;
  });

  const baseTableFont = 9;
  const warrantyFont = Math.max(6, Math.round(baseTableFont * 0.8));
  const VAT_COL_INDEX = showDiscountCol ? 4 : 3;

  doc.autoTable({
	margin: { left: margin, right: margin },  
    startY: headerStartForTable,
    head: [head],
    body,
    theme: "grid",
    headStyles: {
      fillColor: [0, 154, 255],
      textColor: [255, 255, 255],
      font: fontName,
      fontStyle: "bold",
    },
    styles: {
      font: fontName,
      fontStyle: "normal",
      fontSize: baseTableFont,
      cellPadding: 2.2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: showDiscountCol ? 62 : 70 },
      [VAT_COL_INDEX]: { cellWidth: 14, halign: "center" },
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index !== 1) return;

      const w = data.row?.raw?.__warranty;
      if (!w) return;

      const scale = doc.internal.scaleFactor || 2.83465;
      const lines = Array.isArray(data.cell.text) ? data.cell.text.length : 1;

      const baseLineH = (baseTableFont / scale) * 1.15;
      const warrantyLineH = (warrantyFont / scale) * 1.15;

      const x0 = data.cell.x + data.cell.padding("left");

      let y = data.cell.y + data.cell.padding("top") + (lines - 1) * baseLineH;
      y += (baseLineH - warrantyLineH) * 3;

      doc.setFontSize(warrantyFont);

      let x = x0;
      const write = (txt, bold) => {
        doc.setFont(fontName, bold ? "bold" : "normal");
        doc.text(txt, x, y);
        x += doc.getTextWidth(txt);
      };

      write("Gwarancja ", false);
      if (w.nbd) write("NBD ", true);
      write(w.monthsText, true);

      doc.setFont(fontName, "normal");
      doc.setFontSize(baseTableFont);
    },
  });

  // ===== ESUS Summary footer =====
  const sumNet = store.items.reduce(
    (acc, it) => acc + itemNetAfterDiscount(it) * Math.max(1, parseInt(it.qty || 1, 10)),
    0
  );
  const sumVat = sumNet * VAT_RATE;
  const sumGross = sumNet + sumVat;

  const shipNet = toNumber(el("shippingNet").value);

  const at = doc.lastAutoTable;

  const tableX0 = at?.table?.startX ?? at?.settings?.margin?.left ?? margin;
  const maxRight = pageW - margin;
  const tableEndX = at?.table?.endX ?? (tableX0 + (at?.table?.width ?? (pageW - margin * 2)));
  const tableX = Math.max(margin, tableX0);
  const tableW = Math.max(20, Math.min(tableEndX, maxRight) - tableX);

  let barsY = (at?.finalY ?? 0);

  if (ensureSpace(1.2 + 12 + 9 + 10, barsY)) {
    barsY = margin + 20;
  }

  const barsBottomY = drawEsusTotalsBars(doc, {
    x: tableX,
    y: barsY,
    w: tableW,
    lang,
    fontName,
    offerCcy: DOC_CCY,
    vat,
    sumNet,
    sumVat,
    sumGross,
    shippingNet: shipNet,
  });

  // ===== Terms =====
  let termsY = barsBottomY + 6;
  if (ensureSpace(40, termsY)) termsY = margin + 20;

  const paymentMethod = document.getElementById("paymentMethod")?.value || "prepay";
  const invoiceDays = document.getElementById("invoiceDays")?.value || "30";
  let payText = formatPaymentText(lang, paymentMethod, invoiceDays);

  if (lang === "pl") {
    payText = String(payText).replace(/\((\d+)\)\s*$/, "($1 dni)");
  }

  const validUntilRaw = el("validUntil").value;
  const validUntil = validUntilRaw ? formatDate(validUntilRaw, lang) : t(lang, "missingData");

  const estimateDaysRaw = (el("estimateDays")?.value ?? "").toString().trim();
  const hasLeadTime = estimateDaysRaw !== "" && !isNaN(parseInt(estimateDaysRaw, 10));
  const leadTimeText = hasLeadTime
    ? `${Math.max(0, parseInt(estimateDaysRaw, 10))} ${t(lang, "businessDays")}`
    : "";

  const termRows = [
    { label: labelNoColon(lang, "payment"), value: payText },
    {
      label: labelNoColon(lang, "delivery"),
      value:
        shipNet === 0
          ? (t(lang, "deliverySellerCost") || "—")
          : (
              (lang === "pl")
                ? `Wysyłka kurierska (${formatMoney(shipNet, lang, DOC_CCY)} netto)`
                : `${t(lang, "shippingNet")} (${formatMoney(shipNet, lang, DOC_CCY)})`
            ),
    },
    { label: labelNoColon(lang, "validity"), value: validUntil, valueBold: true },
  ];

  if (hasLeadTime) {
    termRows.push({
      label: pdfSafeText(String(t(lang, "estimatedLeadTime") || "Estimated lead time").replace(/\s*:\s*$/, "")),
      value: leadTimeText,
    });
  }

  const afterTermsY = drawTermsCard(doc, {
    x: tableX,
    y: termsY,
    w: tableW,
    fontName,
    lines: termRows,
  });

  // ===== Extra arrangements =====
  const extra = el("termsExtra").value.trim();
  let ty = afterTermsY + 6;

  if (extra) {
    const title = t(lang, "extraArrangementsTitle");
    let boxY = ty + 2;

    const padX = 0;
    doc.setFont(fontName, "normal");
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(extra, tableW - padX * 2);
    const lines = wrapped.slice(0, 60);
    const lineH = 4.2;
    const headerH = 6.2;
    const padTop = 6;
    const padBottom = 5;
    const cardH = padTop + headerH + lines.length * lineH + padBottom;

    const moved = ensureSpace(cardH, boxY);
    if (moved) boxY = margin + 20;

    const r = drawExtraArrangementsCard(doc, {
      x: tableX,
      y: boxY,
      w: tableW,
      fontName,
      title,
      extraText: extra,
    });

    ty = r.bottomY;
  }

  // ===== Footer =====
  const footerMargin = margin;

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);

  const footerOffset = 6;
  const footerLineH = 3.6;
  const blankGapH = 3;

  let footerY = pageH - footerMargin + footerOffset;

  let footerLines = [];
  let lineHeights = [];

  if ((lang || "pl").toLowerCase() === "pl") {
    const companyFooter =
      "ESUS IT Spółka z o. o., ul. Somosierry 30A, 71-181 Szczecin. " +
      "Sąd Rejonowy dla miasta Szczecina, VII Wydział Gospodarczy Krajowego Rejestru Sądowego, " +
      "KRS: 0001012470; VAT No / NIP: PL8522690002; REGON: 524134686; " +
      "Kapitał zakładowy 5 000 zł.";

    const companyLines = doc.splitTextToSize(companyFooter, pageW - footerMargin * 2);
    footerLines = companyLines;
    lineHeights = companyLines.map(() => footerLineH);
  } else {
    const lines = getCompanyFooterLines(lang) || [];
    footerLines = lines.map((s) => String(s ?? ""));
    lineHeights = footerLines.map((s) => (s.trim() ? footerLineH : blankGapH));
  }

  let estimateLines = [];
  if (isEstimate) {
    doc.setFontSize(8);
    estimateLines = doc.splitTextToSize(t(lang, "estimateDisclaimer"), pageW - footerMargin * 2);
    doc.setFontSize(7.5);
  }

  const companyH = lineHeights.reduce((a, b) => a + b, 0);
  const estimateH = isEstimate ? estimateLines.length * 4 : 0;
  const totalFooterH = companyH + estimateH;

  const dividerY = footerY - totalFooterH - 6;
  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.4);
  doc.line(margin, dividerY, pageW - margin, dividerY);

  for (let i = footerLines.length - 1; i >= 0; i--) {
    const line = footerLines[i];
    if (!String(line).trim()) {
      footerY -= blankGapH;
      continue;
    }
    doc.text(String(line), pageW / 2, footerY, { align: "center" });
    footerY -= footerLineH;
  }

  if (isEstimate) {
    doc.setFontSize(8);
    doc.setTextColor(100);

    for (let i = estimateLines.length - 1; i >= 0; i--) {
      footerY -= 4;
      doc.text(estimateLines[i], pageW / 2, footerY, { align: "center" });
    }

    doc.setFontSize(7.5);
    doc.setTextColor(110);
  }

  doc.setTextColor(0);

  const prefix = getFilePrefix(lang);
  doc.save(`${prefix}_${offerNo.replaceAll("/", "-")}.pdf`);
}