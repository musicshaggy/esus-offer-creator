import { VAT_RATE, LOGO_URL_B, NOTO_REG_URL, NOTO_BOLD_URL } from "../config/constants.js";
import { el, money, toNumber, ymdToPL } from "../utils/format.js";
import { store } from "../state/store.js";
import { itemNetAfterDiscount } from "../calc/pricing.js";
import { buildOfferNumber } from "../ui/offerNumber.js";
import { showToast } from "../ui/toast.js";


async function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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

function formatCustomerBlock() {
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
  return lines;
}

function formatCreatorBlock() {
  const lines = [];
  const name = document.getElementById("creatorName")?.value.trim();
  const email = document.getElementById("creatorEmail")?.value.trim();
  const phone = document.getElementById("creatorPhone")?.value.trim();

  if (name) lines.push(name);
  if (email) lines.push(email);
  if (phone) lines.push(`Tel. ${phone}`);

  return lines;
}

export async function generatePdf({ onBefore } = {}) {
  onBefore?.();

  if (store.items.length === 0) {
    showToast("Dodaj przynajmniej jedną pozycję.", { type: "error", ms: 3500 } );
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
      "Nie udało się załadować fontów do PDF (polskie znaki). PDF wygeneruje się czcionką domyślną.", { type: "error", ms: 3500 }
    );
  }
  doc.setFont(fontName, "normal");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  const isEstimate = !!document.getElementById("isEstimate")?.checked;

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
      const estimateText =
        "Dokument stanowi wycenę szacunkową i nie jest wiążącą ofertą. " +
        "Ostateczne warunki wymagają potwierdzenia sprzedawcy.";
      const estimateLines = doc.splitTextToSize(estimateText, pageW - margin * 2);
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

  // Klient + Osoba (wyrównanie do tej samej wysokości)
  // Ustal wspólny start Y dla bloków informacyjnych.
  // Logo kończy się ok. na Y=22, więc 36mm daje bezpieczny odstęp.
  const infoTopY = 36;

  // Klient
  const custLines = formatCustomerBlock();
  const rightX = pageW - margin;
  let clientY = infoTopY;

  doc.setFont(fontName, "bold");
  doc.setFontSize(10);
  doc.text("Klient:", rightX, clientY, { align: "right" });
  clientY += 5;
  doc.setFont(fontName, "normal");
  doc.setFontSize(10);

  (custLines.length ? custLines : ["(brak danych)"]).forEach((line) => {
    doc.text(String(line), rightX, clientY, { align: "right" });
    clientY += 5;
  });
  const clientBlockBottomY = clientY + 2;

  // Osoba
  const creatorLines = formatCreatorBlock();
  let creatorY = infoTopY;
  doc.setFont(fontName, "bold");
  doc.setFontSize(10);
  doc.text("Osoba przygotowująca:", margin, creatorY);
  creatorY += 5;
  doc.setFont(fontName, "normal");
  (creatorLines.length ? creatorLines : ["(brak danych)"]).forEach((line) => {
    doc.text(String(line), margin, creatorY);
    creatorY += 5;
  });
  const creatorBlockBottomY = creatorY + 2;

  // Header dokumentu (pod blokami Klient + Osoba)
  const headerY = Math.max(clientBlockBottomY, creatorBlockBottomY) + 8;

  const offerNoFromUi = (document.getElementById("offerNumberPreview")?.textContent || "").trim();
  const offerNo =
    offerNoFromUi && offerNoFromUi !== "—" ? offerNoFromUi : buildOfferNumber();
  const docLabel = isEstimate ? "Wycena szacunkowa" : "Oferta";
  doc.setFont(fontName, "bold");
  doc.setFontSize(16);
  doc.text(`${docLabel}: ${offerNo}`, pageW / 2, headerY, { align: "center" });

  // Tabela
  const showDiscountCol = !!el("showDiscountColumnPdf").checked;
  const head = ["Lp", "Opis", "Cena netto (po rab.)"];
  if (showDiscountCol) head.push("Rabat");
  head.push("Cena brutto", "Ilość", "Wartość brutto");

  const body = store.items.map((it, idx) => {
    const qty = Math.max(1, parseInt(it.qty || 1, 10));
    const disc = Math.min(100, Math.max(0, toNumber(it.discount)));
    const netAfter = itemNetAfterDiscount(it);
    const grossUnit = netAfter * (1 + VAT_RATE);
    const grossLine = grossUnit * qty;

    const row = [String(idx + 1), it.desc || "-", money(netAfter).replace(" zł", "")];
    if (showDiscountCol)
      row.push(`${disc.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%`);
    row.push(
      money(grossUnit).replace(" zł", ""),
      String(qty),
      money(grossLine).replace(" zł", "")
    );
    return row;
  });

  doc.autoTable({
    startY: Math.max(creatorBlockBottomY, headerY + (isEstimate ? 8 : 6)),
    head: [head],
    body,
    theme: "grid",
    headStyles: {
      fillColor: [0, 154, 255],
      textColor: [255, 255, 255],
      font: fontName,
      fontStyle: "bold",
    },
    styles: { font: fontName, fontStyle: "normal", fontSize: 9, cellPadding: 2.2 },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: showDiscountCol ? 72 : 84 } },
  });

  const afterTableY = doc.lastAutoTable.finalY + 6;

  // Podsumowanie
  const sumNet = store.items.reduce(
    (acc, it) =>
      acc + itemNetAfterDiscount(it) * Math.max(1, parseInt(it.qty || 1, 10)),
    0
  );
  const sumVat = sumNet * VAT_RATE;
  const sumGross = sumNet + sumVat;

  const shipNet = toNumber(el("shippingNet").value);
  const shipGross = shipNet * (1 + VAT_RATE);

  doc.setFont(fontName, "bold");
  doc.setFontSize(11);
  doc.text("Podsumowanie:", margin, afterTableY);

  doc.setFont(fontName, "normal");
  doc.setFontSize(10);
  const sumBlockY = afterTableY + 6;
  doc.text(`Suma netto: ${money(sumNet)}`, margin, sumBlockY);
  doc.text(`VAT 23%: ${money(sumVat)}`, margin, sumBlockY + 5);
  doc.setFont(fontName, "bold");
  doc.text(`Suma brutto: ${money(sumGross)}`, margin, sumBlockY + 10);
  doc.setFont(fontName, "normal");
  if (shipNet === 0)
    doc.text("Dostawa: koszt po stronie sprzedawcy", pageW - margin, sumBlockY, {
      align: "right",
    });
  else {
    doc.text(`Wysyłka netto: ${money(shipNet)}`, pageW - margin, sumBlockY, {
      align: "right",
    });
    doc.text(`Wysyłka brutto: ${money(shipGross)}`, pageW - margin, sumBlockY + 5, {
      align: "right",
    });
  }

  // Linia
  const lineY = sumBlockY + 16;
  doc.setDrawColor(0, 154, 255);
  doc.setLineWidth(1.2);
  doc.line(margin, lineY, pageW - margin, lineY);

  // Warunki
  // Terms section can be pushed below the reserved footer area if the table is long.
  // Ensure we have enough space for at least a few lines + optional boxes.
  let termsY = lineY + 8;
  if (ensureSpace(45, termsY)) termsY = margin + 20;
  doc.setFont(fontName, "bold");
  doc.setFontSize(11);
  doc.text("Warunki:", margin, termsY);

  doc.setFont(fontName, "normal");
  doc.setFontSize(10);

  const paymentMethod = document.getElementById("paymentMethod")?.value || "prepay";
  const invoiceDays = document.getElementById("invoiceDays")?.value || "30";
  const payText =
    paymentMethod === "prepay"
      ? "Przedpłata"
      : `Faktura z odroczonym terminem (${invoiceDays} dni)`;
  const validUntil = el("validUntil").value ? ymdToPL(el("validUntil").value) : "(nie podano)";
  const extra = el("termsExtra").value.trim();

  let ty = termsY + 6;
  const termLines = [
    `Płatność: ${payText}`,
    shipNet === 0 ? "Dostawa: koszt po stronie sprzedawcy" : `Dostawa: wysyłka (netto ${money(shipNet)})`,
  ];
  termLines.forEach((t) => {
    doc.text(t, margin, ty);
    ty += 5;
  });

  const estimateDaysRaw = (el("estimateDays")?.value ?? "").toString().trim();
  if (estimateDaysRaw !== "" && !isNaN(parseInt(estimateDaysRaw, 10))) {
    const days = Math.max(0, parseInt(estimateDaysRaw, 10));
    doc.text(`Szacunkowy czas realizacji: ${days} dni roboczych`, margin, ty);
    ty += 5;
  }

  doc.setFont(fontName, "normal");
  doc.text("Ważność oferty do: ", margin, ty);
  const labelWidth = doc.getTextWidth("Ważność oferty do: ");
  doc.setFont(fontName, "bold");
  doc.text(validUntil, margin + labelWidth, ty);
  doc.setFont(fontName, "normal");
  ty += 5;

  if (extra) {
    const boxX = margin;
    const boxW = pageW - margin * 2;

    const title = "Dodatkowe ustalenia:";
    const wrapped = doc.splitTextToSize(extra, boxW - 10);
    const lines = wrapped.slice(0, 40);

    const lineH = 4.2,
      headerH = 6,
      paddingTop = 5,
      paddingBottom = 4;
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

  const notes = el("creatorNotes").value.trim();
  if (notes) {
    const boxX = margin;
    const boxW = pageW - margin * 2;
    let boxY = ty + 6;

    const approxH =
      14 + Math.min(7, doc.splitTextToSize(notes, pageW - margin * 2 - 10).length) * 4;
    const moved = ensureSpace(approxH, boxY);
    if (moved) boxY = margin + 20;

    doc.setFont(fontName, "bold");
    doc.setFontSize(9);
    doc.setTextColor(40);
    doc.text("Uwagi:", boxX + 4, boxY + 6);

    doc.setFont(fontName, "normal");
    doc.setFontSize(8);
    doc.setTextColor(60);
    const wrappedN = doc.splitTextToSize(notes, boxW - 10);
    const nLines = wrappedN.slice(0, 7);
    const textStartY = boxY + 11;
    nLines.forEach((line, i) => doc.text(line, boxX + 5, textStartY + i * 4));

    const boxH = 14 + nLines.length * 4;
    doc.setDrawColor(0, 154, 255);
    doc.setLineWidth(0.6);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2);

    doc.setTextColor(0);
  }

  // Stopka
  const footerMargin = margin;
  const companyFooter =
    "ESUS IT Spółka z o. o., ul. Somosierry 30A, 71-181 Szczecin. " +
    "Sąd Rejonowy dla miasta Szczecina, VII Wydział Gospodarczy Krajowego Rejestru Sądowego, " +
    "KRS: 0001012470; VAT No / NIP: PL8522690002; REGON: 524134686; " +
    "Kapitał zakładowy 5 000 zł.";

  doc.setFont(fontName, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  const companyLines = doc.splitTextToSize(companyFooter, pageW - footerMargin * 2);
  let footerY = pageH - footerMargin;
  for (let i = companyLines.length - 1; i >= 0; i--) {
    doc.text(companyLines[i], pageW / 2, footerY, { align: "center" });
    footerY -= 3.6;
  }

  if (isEstimate) {
    const estimateText =
      "Dokument stanowi wycenę szacunkową i nie jest wiążącą ofertą. " +
      "Ostateczne warunki wymagają potwierdzenia sprzedawcy.";
    doc.setFontSize(8);
    doc.setTextColor(110);
    const estimateLines = doc.splitTextToSize(estimateText, pageW - footerMargin * 2);
    estimateLines.reverse().forEach((line) => {
      footerY -= 4;
      doc.text(line, pageW / 2, footerY, { align: "center" });
    });
  }

  doc.setTextColor(0);
  doc.save(`Oferta_${offerNo.replaceAll("/", "-")}.pdf`);
}
