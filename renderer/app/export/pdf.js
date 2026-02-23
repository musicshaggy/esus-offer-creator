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

/* ===== ESUS summary footer (enterprise) ===== */
const ESUS_BLUE = [0, 154, 255];

function pdfSafeText(v) {
  return String(v ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function drawEsusTotalsBars(doc, {
  x,
  y,
  w,
  lang,
  fontName,
  offerCcy,
  vat,
  sumNet,
  sumVat,
  sumGross,
  shippingNet,
}) {
  // Enterprise "card footer" (nie zlewa się z tabelą)
  const cardH = 12;
  const accentH = 2;

  // Shipping "pill" po prawej
  const shippingH = 9;

  // Delikatny odstęp od tabeli + divider (żeby się nie zlewało)
  const dividerH = 1.2;
  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.line(x, y, x + w, y);
  y += dividerH;

  // CARD background
  doc.setFillColor(243, 246, 250);
  doc.rect(x, y, w, cardH, "F");

  // Accent top line
  doc.setFillColor(...ESUS_BLUE);
  doc.rect(x, y, w, accentH, "F");

  // Card border
  doc.setDrawColor(220, 228, 238);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, cardH);

  const segW = w / 3;
  const baseY = y + 8.2;

  // Labels
  const netLbl = pdfSafeText(String(t(lang, "sumNet") || "Suma netto").replace(/\s*:\s*$/, ""));
  const vatLbl = pdfSafeText(
    `${String(t(lang, "vat") || "VAT").replace(/\s*:\s*$/, "")} ${vatLabelI18n(lang, vat)}`.trim()
  );
  const grossLbl = pdfSafeText(String(t(lang, "sumGross") || "Suma brutto").replace(/\s*:\s*$/, ""));

  // Values
  const netStr = pdfSafeText(formatMoney(sumNet, lang, offerCcy));
  const vatStr = pdfSafeText(formatMoney(sumVat, lang, offerCcy));
  const grossStr = pdfSafeText(formatMoney(sumGross, lang, offerCcy));

  // Text colors: enterprise dark
  doc.setTextColor(25, 35, 45);

  // seg 1
  doc.setFont(fontName, "normal"); doc.setFontSize(8);
  doc.text(netLbl, x + 4, baseY);
  doc.setFont(fontName, "bold"); doc.setFontSize(9);
  doc.text(netStr, x + segW - 4, baseY, { align: "right" });

  // seg 2
  doc.setFont(fontName, "normal"); doc.setFontSize(8);
  doc.text(vatLbl, x + segW + 4, baseY);
  doc.setFont(fontName, "bold"); doc.setFontSize(9);
  doc.text(vatStr, x + 2 * segW - 4, baseY, { align: "right" });

  // seg 3
  doc.setFont(fontName, "normal"); doc.setFontSize(8);
  doc.text(grossLbl, x + 2 * segW + 4, baseY);
  doc.setFont(fontName, "bold"); doc.setFontSize(9);
  doc.text(grossStr, x + w - 4, baseY, { align: "right" });

  // ===== SHIPPING pill (right, under card) =====
  const y2 = y + cardH; // doklejone pionowo

  const shipLabel = pdfSafeText(String(t(lang, "delivery") || "Dostawa").replace(/\s*:\s*$/, ""));
  const shipNetNum = Number(shippingNet || 0);
  const shipValue =
    shipNetNum === 0
      ? pdfSafeText(t(lang, "deliverySellerCost") || "—")
      : pdfSafeText(formatMoney(shipNetNum, lang, offerCcy));

  const padL = 4, padR = 4, gap = 4;

  doc.setFont(fontName, "normal"); doc.setFontSize(8);
  const labelW = doc.getTextWidth(shipLabel);

  doc.setFont(fontName, "bold"); doc.setFontSize(9);
  const valueW = doc.getTextWidth(shipValue);

  const minShipW = padL + labelW + gap + valueW + padR;

  // ~22% bazowo, rośnie jeśli trzeba; max 55% (żeby zawsze się zmieściło)
  let shipW = Math.min(w * 0.55, Math.max(w * 0.22, Math.max(40, minShipW)));
  shipW = Math.min(shipW, w);
  const shipX = x + (w - shipW);

  // pill background
  doc.setFillColor(...ESUS_BLUE);
  doc.rect(shipX, y2, shipW, shippingH, "F");

  // pill text
  doc.setTextColor(255, 255, 255);
  const shipY = y2 + 6.0;

  doc.setFont(fontName, "normal");
  doc.setFontSize(8);
  doc.text(shipLabel, shipX + padL, shipY);

  doc.setFont(fontName, "bold");
  doc.setFontSize(9);
  doc.text(shipValue, shipX + shipW - padR, shipY, { align: "right" });

  // restore
  doc.setTextColor(0);
  return y2 + shippingH;
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

  const isEstimate = !!document.getElementById("isEstimate")?.checked;

  // VAT z UI
  const vat = getVatFromUI(); // { rate, label, code }
  const VAT_RATE = vat.rate;

  // Tekst do wąskiej kolumny VAT w tabeli (WDT/EX lub %)
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
  } catch (e) {
    logoData = null;
  }
  if (logoData) doc.addImage(logoData, "PNG", margin, 10, 40, 12);

  const infoTopY = 36;

  // Customer (right)
  const custLines = formatCustomerBlock(lang);
  const rightX = pageW - margin;
  let clientY = infoTopY;

  doc.setFont(fontName, "bold");
  doc.setFontSize(10);
  doc.text(t(lang, "customer"), rightX, clientY, { align: "right" });
  clientY += 5;

  doc.setFont(fontName, "normal");
  doc.setFontSize(10);

  custLines.forEach((line) => {
    doc.text(String(line), rightX, clientY, { align: "right" });
    clientY += 5;
  });
  const clientBlockBottomY = clientY + 2;

  // Prepared by (left)
  const creatorLines = formatCreatorBlock(lang);
  let creatorY = infoTopY;

  doc.setFont(fontName, "bold");
  doc.setFontSize(10);
  doc.text(t(lang, "preparedBy"), margin, creatorY);
  creatorY += 5;

  doc.setFont(fontName, "normal");
  doc.setFontSize(10);

  creatorLines.forEach((line) => {
    doc.text(String(line), margin, creatorY);
    creatorY += 5;
  });
  const creatorBlockBottomY = creatorY + 2;

  // Header
  const headerY = Math.max(clientBlockBottomY, creatorBlockBottomY) + 8;

  const offerNoFromUi = (document.getElementById("offerNumberPreview")?.textContent || "").trim();
  const offerNo = offerNoFromUi && offerNoFromUi !== "—" ? offerNoFromUi : buildOfferNumber();

  const docLabel = getDocLabel(lang, isEstimate);

  doc.setFont(fontName, "bold");
  doc.setFontSize(16);
  doc.text(`${docLabel}: ${offerNo}`, pageW / 2, headerY, { align: "center" });

  // Subtitle
  const subtitle = (el("creatorNotes")?.value || "").trim();
  let headerBlockBottomY = headerY;

  if (subtitle) {
    doc.setFont(fontName, "normal");
    doc.setFontSize(11);
    doc.setTextColor(60);
    doc.text(subtitle, pageW / 2, headerY + 6, { align: "center" });
    doc.setTextColor(0);
    headerBlockBottomY = headerY + 6;
  }

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
    startY: Math.max(creatorBlockBottomY, headerBlockBottomY + (isEstimate ? 8 : 6)),
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

  // ===== ESUS Summary footer (enterprise) =====
  const sumNet = store.items.reduce(
    (acc, it) => acc + itemNetAfterDiscount(it) * Math.max(1, parseInt(it.qty || 1, 10)),
    0
  );
  const sumVat = sumNet * VAT_RATE;
  const sumGross = sumNet + sumVat;

  const shipNet = toNumber(el("shippingNet").value);

  const at = doc.lastAutoTable;

  // ✅ dokładnie jak tabela, ale bezpiecznie przycięte do marginesów strony
  const tableX0 = at?.table?.startX ?? at?.settings?.margin?.left ?? margin;
  const maxRight = pageW - margin;
  const tableEndX = at?.table?.endX ?? (tableX0 + (at?.table?.width ?? (pageW - margin * 2)));
  const tableX = Math.max(margin, tableX0);
  const tableW = Math.max(20, Math.min(tableEndX, maxRight) - tableX);

  // doklejone do tabeli (bez odstępu) – divider w funkcji
  let barsY = (at?.finalY ?? 0);

  // reserve: divider+card+shipping+oddech na terms
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
  let termsY = barsBottomY + 8;
  if (ensureSpace(45, termsY)) termsY = margin + 20;

  doc.setFont(fontName, "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(t(lang, "terms"), margin, termsY);

  doc.setFont(fontName, "normal");
  doc.setFontSize(10);

  const paymentMethod = document.getElementById("paymentMethod")?.value || "prepay";
  const invoiceDays = document.getElementById("invoiceDays")?.value || "30";
  const payText = formatPaymentText(lang, paymentMethod, invoiceDays);

  const validUntilRaw = el("validUntil").value;
  const validUntil = validUntilRaw ? formatDate(validUntilRaw, lang) : t(lang, "missingData");

  const extra = el("termsExtra").value.trim();

  let ty = termsY + 6;

  const termLines = [
    `${labelNoColon(lang, "payment")}: ${payText}`,
    shipNet === 0
      ? `${labelNoColon(lang, "delivery")}: ${t(lang, "deliverySellerCost")}`
      : `${labelNoColon(lang, "delivery")}: ${t(lang, "shippingNet")} (${formatMoney(shipNet, lang, DOC_CCY)})`,
  ];

  termLines.forEach((line) => {
    doc.text(line, margin, ty);
    ty += 5;
  });

  const estimateDaysRaw = (el("estimateDays")?.value ?? "").toString().trim();
  if (estimateDaysRaw !== "" && !isNaN(parseInt(estimateDaysRaw, 10))) {
    const days = Math.max(0, parseInt(estimateDaysRaw, 10));
    doc.text(`${t(lang, "estimatedLeadTime")} ${days} ${t(lang, "businessDays")}`, margin, ty);
    ty += 5;
  }

  doc.setFont(fontName, "normal");
  doc.text(`${t(lang, "validity")} `, margin, ty);
  const labelWidth = doc.getTextWidth(`${t(lang, "validity")} `);
  doc.setFont(fontName, "bold");
  doc.text(validUntil, margin + labelWidth, ty);
  doc.setFont(fontName, "normal");
  ty += 5;

  if (extra) {
    const boxX = margin;
    const boxW = pageW - margin * 2;

    const title = t(lang, "extraArrangementsTitle");
    const wrapped = doc.splitTextToSize(extra, boxW - 10);
    const lines = wrapped.slice(0, 40);

    const lineH = 4.2, headerH = 6, paddingTop = 5, paddingBottom = 4;
    let boxY = ty + 4;
    const boxH = paddingTop + headerH + lines.length * lineH + paddingBottom;

    const moved = ensureSpace(boxH, boxY);
    if (moved) boxY = margin + 20;

    doc.setDrawColor(0, 154, 255);
    doc.setLineWidth(0.6);
    doc.rect(boxX, boxY, boxW, boxH);

    doc.setFont(fontName, "bold");
    doc.setFontSize(9);
    doc.setTextColor(40);
    doc.text(title, boxX + 4, boxY + 6);

    doc.setFont(fontName, "normal");
    doc.setFontSize(9);
    doc.setTextColor(60);

    const textStartY = boxY + 11;
    lines.forEach((line, i) => doc.text(line, boxX + 5, textStartY + i * lineH));

    doc.setTextColor(0);
    ty = boxY + boxH;
  }

  // ===== Footer =====
  const footerMargin = margin;

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120);

  const footerOffset = 6;
  let footerY = pageH - footerMargin + footerOffset;

  if ((lang || "pl").toLowerCase() === "pl") {
    const companyFooter =
      "ESUS IT Spółka z o. o., ul. Somosierry 30A, 71-181 Szczecin. " +
      "Sąd Rejonowy dla miasta Szczecina, VII Wydział Gospodarczy Krajowego Rejestru Sądowego, " +
      "KRS: 0001012470; VAT No / NIP: PL8522690002; REGON: 524134686; " +
      "Kapitał zakładowy 5 000 zł.";

    const companyLines = doc.splitTextToSize(companyFooter, pageW - footerMargin * 2);
    for (let i = companyLines.length - 1; i >= 0; i--) {
      doc.text(companyLines[i], pageW / 2, footerY, { align: "center" });
      footerY -= 3.6;
    }
  } else {
    const lines = getCompanyFooterLines(lang) || [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = String(lines[i] ?? "");
      if (!line.trim()) {
        footerY -= 3;
        continue;
      }
      doc.text(line, pageW / 2, footerY, { align: "center" });
      footerY -= 3.6;
    }
  }

  if (isEstimate) {
    doc.setFontSize(8);
    doc.setTextColor(110);

    const estimateLines = doc.splitTextToSize(
      t(lang, "estimateDisclaimer"),
      pageW - footerMargin * 2
    );

    for (let i = estimateLines.length - 1; i >= 0; i--) {
      footerY -= 4;
      doc.text(estimateLines[i], pageW / 2, footerY, { align: "center" });
    }
  }

  doc.setTextColor(0);

  const prefix = getFilePrefix(lang);
  doc.save(`${prefix}_${offerNo.replaceAll("/", "-")}.pdf`);
}