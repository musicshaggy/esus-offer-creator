/* excel-export.js
 * Wymaga: ExcelJS globalnie jako window.ExcelJS (z CDN)
 */

function n(v) {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function pad2(x) { return String(x).padStart(2, "0"); }
function fmtDatePL(d) {
  if (!d) return "";
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

function moneyFmt(cell) { cell.numFmt = '#,##0.00" PLN"'; }
function pctFmt(cell) { cell.numFmt = '0.00"%"'; }
function intFmt(cell) { cell.numFmt = "0"; }

function moneyFmtByCurrency(cell, currency = "PLN") {
  const ccy = String(currency || "PLN").toUpperCase();
  cell.numFmt = `#,##0.00" ${ccy}"`;
}

function getRateToPLN(code, rates = {}) {
  const ccy = String(code || "PLN").toUpperCase();
  if (ccy === "PLN") return 1;
  const rate = Number(rates?.[ccy]);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function toPLN(amount, ccy, rates = {}) {
  const value = n(amount);
  const rate = getRateToPLN(ccy, rates);
  return rate ? value * rate : value;
}

function fromPLN(amount, ccy, rates = {}) {
  const value = n(amount);
  const rate = getRateToPLN(ccy, rates);
  return rate ? value / rate : value;
}

function formatWarrantyValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);

  const lifetime = !!value.lifetime;
  const nbd = !!value.nbd;
  const months = Math.max(0, parseInt(value.months ?? 0, 10) || 0);

  if (lifetime) return nbd ? "Dozywotnia NBD" : "Dozywotnia";
  if (!(months > 0)) return "";

  const parts = ["Gwarancja"];
  if (nbd) parts.push("NBD");
  parts.push(`${months} mies.`);
  return parts.join(" ");
}

function formatLeadtimeValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value !== "object") return String(value);

  if (typeof value.label === "string" && value.label.trim()) return value.label.trim();
  if (typeof value.text === "string" && value.text.trim()) return value.text.trim();
  if (typeof value.value === "string" && value.value.trim()) return value.value.trim();
  return "";
}

function borderAll(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF2A2F3A" } },
    left: { style: "thin", color: { argb: "FF2A2F3A" } },
    bottom: { style: "thin", color: { argb: "FF2A2F3A" } },
    right: { style: "thin", color: { argb: "FF2A2F3A" } },
  };
}

function fill(cell, argb) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleHeader(cell, argb, bold = true) {
  fill(cell, argb);
  cell.font = { bold, color: { argb: "FF0B1220" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  borderAll(cell);
}

function styleSubHeader(cell, argb) {
  fill(cell, argb);
  cell.font = { bold: true, color: { argb: "FF0B1220" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  borderAll(cell);
}

function styleCell(cell, align = "center") {
  cell.alignment = { vertical: "middle", horizontal: align, wrapText: true };
  borderAll(cell);
}

function setRowHeight(ws, r, h) { ws.getRow(r).height = h; }

export async function exportOfferToExcel(payload) {
  if (!window.ExcelJS) {
    alert("Brak ExcelJS. Dodaj w HTML: <script src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'></script>");
    return;
  }

  const ExcelJS = window.ExcelJS;

  const vatRate = n(payload.vatRate ?? 0.23);
  const shippingNet = n(payload.shippingNet ?? 0);
  const offerCurrency = String(payload.offerCurrency ?? "PLN").toUpperCase();
  const exchangeRates = payload.exchangeRates ?? {};

  const offerNo = payload.offerNo ?? "";
  const docLabel = payload.docLabel ?? "Oferta";
  const createdAt = payload.createdAt ?? new Date();

  const customerName = payload.customerName ?? "";
  const customerNip = payload.customerNip ?? "";
  const customerAddr = payload.customerAddr ?? "";
  const customerContact = payload.customerContact ?? "";

  const createdBy = payload.createdBy ?? "";
  const createdByContact = payload.createdByContact ?? "";

  const payText = payload.paymentText ?? "";
  const validUntil = payload.validUntil ?? "";
  const estimateDays = payload.estimateDays ?? "";
  const extra = payload.termsExtra ?? "";
  const notes = payload.creatorNotes ?? "";

  const items = (payload.items ?? []).map((it) => ({
    desc: String(it.desc ?? ""),
    qty: Math.max(1, parseInt(String(it.qty ?? 1), 10) || 1),
    sellNet: Math.max(0, n(it.net)),
    buyNet: Math.max(0, n(it.buyNet)),
    discount: clamp(n(it.discount), 0, 100),
    warranty: formatWarrantyValue(it.warranty),
    leadtime: formatLeadtimeValue(it.leadtime),
    buyCcy: String(it.buyCcy ?? "PLN").toUpperCase(),
    sellCcy: offerCurrency,
  }));

  const rows = items.map((it, idx) => {
    const sellNetAfter = it.sellNet * (1 - it.discount / 100);
    const netLine = sellNetAfter * it.qty;
    const grossLine = netLine * (1 + vatRate);
    const revenuePLN = toPLN(netLine, it.sellCcy, exchangeRates);

    const costUnitBuy = it.buyNet;
    const costLineBuy = costUnitBuy * it.qty;
    const costLinePLN = toPLN(costLineBuy, it.buyCcy, exchangeRates);

    const profitLinePLN = revenuePLN - costLinePLN;
    const profitUnitPLN = it.qty > 0 ? profitLinePLN / it.qty : 0;

    return {
      lp: idx + 1,
      product: it.desc,
      qty: it.qty,
      unitNet: it.sellNet,
      netAfter: sellNetAfter,
      netLine,
      grossLine,
      sellCcy: it.sellCcy,
      buyCcy: it.buyCcy,
      warranty: it.warranty,
      leadtime: it.leadtime,
      costUnitBuy,
      costLinePLN,
      profitUnit: fromPLN(profitUnitPLN, it.sellCcy, exchangeRates),
      profitLine: fromPLN(profitLinePLN, it.sellCcy, exchangeRates),
      margin: revenuePLN > 0 ? (profitLinePLN / revenuePLN) * 100 : 0,
      rateToPLN: getRateToPLN(it.buyCcy, exchangeRates) ?? 1,
    };
  });

  const revenueNet = rows.reduce((a, r) => a + r.netLine, 0);
  const costNetPLN = rows.reduce((a, r) => a + r.costLinePLN, 0);
  const revenueNetPLN = rows.reduce((a, r) => a + toPLN(r.netLine, r.sellCcy, exchangeRates), 0);
  const profitNetPLN = revenueNetPLN - costNetPLN;
  const profitNet = fromPLN(profitNetPLN, offerCurrency, exchangeRates);
  const marginPct = revenueNetPLN > 0 ? (profitNetPLN / revenueNetPLN) * 100 : 0;

  const vat = revenueNet * vatRate;
  const revenueGross = revenueNet + vat;

  const wb = new ExcelJS.Workbook();
  wb.creator = "ESUS IT";
  wb.created = new Date(createdAt);

  const ws = wb.addWorksheet("Kalkulator", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 5 }],
  });

  ws.columns = [
    { key: "A", width: 5 },
    { key: "B", width: 38 },
    { key: "C", width: 10 },
    { key: "D", width: 14 },
    { key: "E", width: 16 },
    { key: "F", width: 16 },
    { key: "G", width: 16 },
    { key: "H", width: 10 },
    { key: "I", width: 12 },
    { key: "J", width: 14 },
    { key: "K", width: 2 },
    { key: "L", width: 16 },
    { key: "M", width: 16 },
    { key: "N", width: 12 },
    { key: "O", width: 2 },
    { key: "P", width: 12 },
    { key: "Q", width: 12 },
    { key: "R", width: 18 },
    { key: "S", width: 18 },
  ];

  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = `${docLabel.toUpperCase()} DLA KLIENTA`;
  styleHeader(ws.getCell("A1"), "FFBEE3F8");
  ws.getCell("A1").font = { bold: true, size: 12, color: { argb: "FF0B1220" } };

  ws.mergeCells("L1:S1");
  ws.getCell("L1").value = "WYLICZENIE MARZY I ZYSKU (WEWNETRZNE DLA ESUS IT)";
  styleHeader(ws.getCell("L1"), "FFFAD7A0");
  ws.getCell("L1").font = { bold: true, size: 12, color: { argb: "FF0B1220" } };

  setRowHeight(ws, 1, 22);

  ws.mergeCells("A2:E2");
  ws.getCell("A2").value = `Numer: ${offerNo}`;
  ws.getCell("A2").font = { bold: true };
  ws.mergeCells("F2:J2");
  ws.getCell("F2").value = `Data: ${fmtDatePL(createdAt)}`;
  ws.getCell("F2").alignment = { horizontal: "right" };

  ws.mergeCells("A3:J3");
  ws.getCell("A3").value =
    `Klient: ${customerName}` +
    (customerNip ? ` | NIP: ${customerNip}` : "") +
    (customerAddr ? ` | ${customerAddr}` : "") +
    (customerContact ? ` | ${customerContact}` : "");
  ws.getCell("A3").alignment = { wrapText: true };

  ws.mergeCells("A4:J4");
  ws.getCell("A4").value =
    `Przygotowal: ${createdBy}` + (createdByContact ? ` | ${createdByContact}` : "");
  ws.getCell("A4").alignment = { wrapText: true };

  ws.mergeCells("L2:S2");
  ws.getCell("L2").value = `Platnosc: ${payText || "-"}`;
  ws.mergeCells("L3:S3");
  ws.getCell("L3").value = `Waznosc: ${validUntil || "-"}` + (estimateDays ? ` | Czas realizacji: ${estimateDays} dni rob.` : "");
  ws.mergeCells("L4:S4");
  ws.getCell("L4").value = `Wysylka netto: ${shippingNet.toFixed(2)} ${offerCurrency}`;

  ["A2", "A3", "A4", "L2", "L3", "L4", "F2"].forEach((addr) => {
    ws.getCell(addr).alignment = { vertical: "middle", wrapText: true };
  });
  setRowHeight(ws, 2, 18);
  setRowHeight(ws, 3, 18);
  setRowHeight(ws, 4, 18);

  const headerRow = 6;

  const leftHeaders = [
    ["A", "Lp."],
    ["B", "Produkt"],
    ["C", "Ilosc sztuk"],
    ["D", "Cena jedn. netto"],
    ["E", "Cena netto po rab. (szt.)"],
    ["F", "Cena netto x ilosc"],
    ["G", "Razem cena brutto"],
    ["H", "Waluta"],
    ["I", "Gwarancja"],
    ["J", "Termin realizacji"],
  ];
  leftHeaders.forEach(([col, text]) => {
    const c = ws.getCell(`${col}${headerRow}`);
    c.value = text;
    styleSubHeader(c, "FFD6ECFF");
  });

  const rightHeaders = [
    ["L", "Koszt zakupu / szt"],
    ["M", "Koszt razem (PLN)"],
    ["N", "Waluta zakupu"],
    ["P", "Kurs do PLN"],
    ["Q", "Marza (%)"],
    ["R", "Zysk NETTO / szt"],
    ["S", "Zysk x szt."],
  ];
  rightHeaders.forEach(([col, text]) => {
    const c = ws.getCell(`${col}${headerRow}`);
    c.value = text;
    styleSubHeader(c, "FFFFE3B5");
  });

  setRowHeight(ws, headerRow, 28);

  let r = headerRow + 1;
  rows.forEach((x) => {
    ws.getCell(`A${r}`).value = x.lp;
    ws.getCell(`B${r}`).value = x.product;
    ws.getCell(`C${r}`).value = x.qty;
    ws.getCell(`D${r}`).value = x.unitNet;
    ws.getCell(`E${r}`).value = x.netAfter;
    ws.getCell(`F${r}`).value = x.netLine;
    ws.getCell(`G${r}`).value = x.grossLine;
    ws.getCell(`H${r}`).value = x.sellCcy;
    ws.getCell(`I${r}`).value = x.warranty;
    ws.getCell(`J${r}`).value = x.leadtime;

    ws.getCell(`L${r}`).value = x.costUnitBuy;
    ws.getCell(`M${r}`).value = x.costLinePLN;
    ws.getCell(`N${r}`).value = x.buyCcy;
    ws.getCell(`P${r}`).value = x.rateToPLN;
    ws.getCell(`Q${r}`).value = x.margin;
    ws.getCell(`R${r}`).value = x.profitUnit;
    ws.getCell(`S${r}`).value = x.profitLine;

    ["A", "C", "D", "E", "F", "G", "H", "I", "J", "L", "M", "N", "P", "Q", "R", "S"].forEach((col) => {
      styleCell(ws.getCell(`${col}${r}`), "center");
    });
    styleCell(ws.getCell(`B${r}`), "left");

    intFmt(ws.getCell(`A${r}`));
    intFmt(ws.getCell(`C${r}`));

    moneyFmtByCurrency(ws.getCell(`D${r}`), x.sellCcy);
    moneyFmtByCurrency(ws.getCell(`E${r}`), x.sellCcy);
    moneyFmtByCurrency(ws.getCell(`F${r}`), x.sellCcy);
    moneyFmtByCurrency(ws.getCell(`G${r}`), x.sellCcy);
    moneyFmtByCurrency(ws.getCell(`L${r}`), x.buyCcy);
    moneyFmt(ws.getCell(`M${r}`));
    ws.getCell(`P${r}`).numFmt = '#,##0.0000';
    pctFmt(ws.getCell(`Q${r}`));
    moneyFmtByCurrency(ws.getCell(`R${r}`), x.sellCcy);
    moneyFmtByCurrency(ws.getCell(`S${r}`), x.sellCcy);

    if (x.profitLine < 0) {
      ws.getCell(`R${r}`).font = { color: { argb: "FFFF4D4D" }, bold: true };
      ws.getCell(`S${r}`).font = { color: { argb: "FFFF4D4D" }, bold: true };
    } else {
      ws.getCell(`R${r}`).font = { bold: true };
      ws.getCell(`S${r}`).font = { bold: true };
    }

    setRowHeight(ws, r, 24);
    r++;
  });

  const sumRow = r + 1;

  ws.mergeCells(`E${sumRow}:F${sumRow}`);
  ws.getCell(`E${sumRow}`).value = "SUMA NETTO";
  styleHeader(ws.getCell(`E${sumRow}`), "FFD6ECFF");
  ws.getCell(`G${sumRow}`).value = revenueNet;
  moneyFmtByCurrency(ws.getCell(`G${sumRow}`), offerCurrency);
  styleCell(ws.getCell(`G${sumRow}`), "center");
  ws.getCell(`G${sumRow}`).font = { bold: true };

  ws.mergeCells(`E${sumRow + 1}:F${sumRow + 1}`);
  ws.getCell(`E${sumRow + 1}`).value = "SUMA BRUTTO";
  styleHeader(ws.getCell(`E${sumRow + 1}`), "FFD6ECFF");
  ws.getCell(`G${sumRow + 1}`).value = revenueGross;
  moneyFmtByCurrency(ws.getCell(`G${sumRow + 1}`), offerCurrency);
  styleCell(ws.getCell(`G${sumRow + 1}`), "center");
  ws.getCell(`G${sumRow + 1}`).font = { bold: true };

  ws.mergeCells(`L${sumRow}:M${sumRow}`);
  ws.getCell(`L${sumRow}`).value = "KOSZT ZAKUPU NETTO";
  styleHeader(ws.getCell(`L${sumRow}`), "FFFFE3B5");
  ws.getCell(`P${sumRow}`).value = costNetPLN;
  moneyFmt(ws.getCell(`P${sumRow}`));
  styleCell(ws.getCell(`P${sumRow}`), "center");
  ws.getCell(`P${sumRow}`).font = { bold: true };

  ws.mergeCells(`L${sumRow + 1}:M${sumRow + 1}`);
  ws.getCell(`L${sumRow + 1}`).value = "ZYSK NETTO";
  styleHeader(ws.getCell(`L${sumRow + 1}`), "FFFFE3B5");
  ws.getCell(`P${sumRow + 1}`).value = profitNet;
  moneyFmtByCurrency(ws.getCell(`P${sumRow + 1}`), offerCurrency);
  styleCell(ws.getCell(`P${sumRow + 1}`), "center");
  ws.getCell(`P${sumRow + 1}`).font = { bold: true };

  ws.mergeCells(`L${sumRow + 2}:M${sumRow + 2}`);
  ws.getCell(`L${sumRow + 2}`).value = "MARZA";
  styleHeader(ws.getCell(`L${sumRow + 2}`), "FFFFE3B5");
  ws.getCell(`P${sumRow + 2}`).value = marginPct;
  pctFmt(ws.getCell(`P${sumRow + 2}`));
  styleCell(ws.getCell(`P${sumRow + 2}`), "center");
  ws.getCell(`P${sumRow + 2}`).font = { bold: true };

  const commentRow = sumRow + 4;
  ws.mergeCells(`L${commentRow}:S${commentRow}`);
  ws.getCell(`L${commentRow}`).value = "KOMENTARZ (krotki opis jesli oferta odbiega od zalozen)";
  styleHeader(ws.getCell(`L${commentRow}`), "FFFAD7A0");

  ws.mergeCells(`L${commentRow + 1}:S${commentRow + 6}`);
  ws.getCell(`L${commentRow + 1}`).value =
    [extra ? `Ustalenia: ${extra}` : "", notes ? `Uwagi: ${notes}` : ""].filter(Boolean).join("\n") || "";
  ws.getCell(`L${commentRow + 1}`).alignment = { vertical: "top", horizontal: "left", wrapText: true };
  ws.getCell(`L${commentRow + 1}`).border = {
    top: { style: "thin", color: { argb: "FF2A2F3A" } },
    left: { style: "thin", color: { argb: "FF2A2F3A" } },
    bottom: { style: "thin", color: { argb: "FF2A2F3A" } },
    right: { style: "thin", color: { argb: "FF2A2F3A" } },
  };
  setRowHeight(ws, commentRow + 1, 110);

  const safe = (offerNo || "ESUS").replaceAll("/", "-");
  const fileName = `ESUS_internal_${safe}.xlsx`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
