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
  return `${pad2(dt.getDate())}.${pad2(dt.getMonth()+1)}.${dt.getFullYear()}`;
}

function moneyFmt(cell) { cell.numFmt = '#,##0.00" zł"'; }
function pctFmt(cell)   { cell.numFmt = '0.00"%"'; }
function intFmt(cell)   { cell.numFmt = '0'; }

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

  const offerNo  = payload.offerNo ?? "";
  const docLabel = payload.docLabel ?? "Oferta";
  const createdAt = payload.createdAt ?? new Date();

  const customerName = payload.customerName ?? "";
  const customerNip  = payload.customerNip ?? "";
  const customerAddr = payload.customerAddr ?? "";
  const customerContact = payload.customerContact ?? "";

  const createdBy = payload.createdBy ?? "";
  const createdByContact = payload.createdByContact ?? "";

  const payText = payload.paymentText ?? "";
  const validUntil = payload.validUntil ?? "";
  const estimateDays = payload.estimateDays ?? ""; // dni roboczych
  const extra = payload.termsExtra ?? "";
  const notes = payload.creatorNotes ?? "";

  const items = (payload.items ?? []).map((it) => ({
    desc: String(it.desc ?? ""),
    qty: Math.max(1, parseInt(String(it.qty ?? 1), 10) || 1),
    sellNet: Math.max(0, n(it.net)),
    buyNet: Math.max(0, n(it.buyNet)),
    discount: clamp(n(it.discount), 0, 100),
    warranty: String(it.warranty ?? ""),     // opcjonalnie
    leadtime: String(it.leadtime ?? ""),     // opcjonalnie
    currency: String(it.currency ?? "PLN"),  // opcjonalnie
  }));

  // === Wyliczenia per pozycja
const rows = items.map((it, idx) => {
  const sellNetAfter = it.sellNet * (1 - it.discount / 100);

  // sprzedaż
  const netLine = sellNetAfter * it.qty;
  const grossLine = netLine * (1 + vatRate);

  // koszty
  const costUnit = it.buyNet;          // koszt zakupu 1 szt
  const costLine = costUnit * it.qty;  //  koszt razem

  // zysk
  const profitUnit = sellNetAfter - costUnit;     // zysk na sztukę (netto, po rabacie)
  const profitLine = profitUnit * it.qty;         //  zysk x szt.

  // marża liczona od sprzedaży (netto po rabacie, suma)
  const margin = netLine > 0 ? (profitLine / netLine) * 100 : 0;

  return {
    lp: idx + 1,
    product: it.desc,
    qty: it.qty,
    unitNet: it.sellNet,
    netAfter: sellNetAfter,
    netLine,
    grossLine,
    currency: it.currency,
    warranty: it.warranty,
    leadtime: it.leadtime,

    costUnit,     // 
    costLine,     // 
    profitUnit,   // 
    profitLine,   // 
    margin,
  };
});

  const revenueNet = rows.reduce((a, r) => a + r.netLine, 0);
  const costNet    = rows.reduce((a, r) => a + r.costLine, 0);
  const profitNet  = revenueNet - costNet;
  const marginPct  = revenueNet > 0 ? (profitNet / revenueNet) * 100 : 0;

  const vat = revenueNet * vatRate;
  const revenueGross = revenueNet + vat;

  // === Workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "ESUS IT";
  wb.created = new Date(createdAt);

  const ws = wb.addWorksheet("Kalkulator", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 5 }],
  });

  // Kolumny: A..N lewa tabela, O przerwa, P..W prawa tabela
  ws.columns = [
    { key: "A", width: 5 },   // Lp
    { key: "B", width: 38 },  // Produkt
    { key: "C", width: 10 },  // Ilość
    { key: "D", width: 14 },  // cena jedn netto
    { key: "E", width: 16 },  // netto po rabacie (szt.)
    { key: "F", width: 16 },  // cena netto x ilość
    { key: "G", width: 16 },  // brutto
    { key: "H", width: 10 },  // waluta
    { key: "I", width: 12 },  // gwarancja
    { key: "J", width: 14 },  // termin realizacji
    { key: "K", width: 2 },   // spacer
    { key: "L", width: 16 },  // koszt zakupu (PLN)
    { key: "M", width: 16 },  // koszt razem (PLN) - u Ciebie bez FX, ale zostawiamy
    { key: "N", width: 12 },  // marża %
    { key: "O", width: 2 },   // spacer
    { key: "P", width: 18 },  // zysk netto
    { key: "Q", width: 18 },  // zysk x szt
    { key: "R", width: 18 },  // (opcjonalnie) inne
  ];

  // ====== GÓRNE NAGŁÓWKI (jak na screenie) ======
  // Lewy tytuł
  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = `${docLabel.toUpperCase()} DLA KLIENTA`;
  styleHeader(ws.getCell("A1"), "FFBEE3F8"); // jasny niebieski
  ws.getCell("A1").font = { bold: true, size: 12, color: { argb: "FF0B1220" } };

  // Prawy tytuł
  ws.mergeCells("L1:R1");
  ws.getCell("L1").value = "WYLICZENIE MARŻY I ZYSKU (WEWNĘTRZNE DLA ESUS IT)";
  styleHeader(ws.getCell("L1"), "FFFAD7A0"); // jasny pomarańcz
  ws.getCell("L1").font = { bold: true, size: 12, color: { argb: "FF0B1220" } };

  setRowHeight(ws, 1, 22);

  // ====== Meta (2–4) – prosto, czytelnie ======
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
    `Przygotował: ${createdBy}` + (createdByContact ? ` | ${createdByContact}` : "");
  ws.getCell("A4").alignment = { wrapText: true };

  // Warunki (po prawej u góry w stylu „CEO lubi tabelki”)
  ws.mergeCells("L2:R2");
  ws.getCell("L2").value = `Płatność: ${payText || "-"}`;
  ws.mergeCells("L3:R3");
  ws.getCell("L3").value = `Ważność: ${validUntil || "-"}` + (estimateDays ? ` | Czas realizacji: ${estimateDays} dni rob.` : "");
  ws.mergeCells("L4:R4");
  ws.getCell("L4").value = `Wysyłka netto: ${shippingNet.toFixed(2)} PLN`;

  ["A2","A3","A4","L2","L3","L4","F2"].forEach(addr => {
    ws.getCell(addr).alignment = { vertical: "middle", wrapText: true };
  });
  setRowHeight(ws, 2, 18);
  setRowHeight(ws, 3, 18);
  setRowHeight(ws, 4, 18);

  // ====== Nagłówki tabel (wiersz 6) ======
  const headerRow = 6;

  // Lewa tabela
  const leftHeaders = [
    ["A", "Lp."],
    ["B", "Produkt"],
    ["C", "Ilość sztuk"],
    ["D", "Cena jedn. netto"],
    ["E", "Cena netto po rab. (szt.)"],
    ["F", "Cena netto x ilość"],
    ["G", "Razem cena brutto"],
    ["H", "Waluta"],
    ["I", "Gwarancja"],
    ["J", "Termin realizacji"],
  ];
  leftHeaders.forEach(([col, text]) => {
    const c = ws.getCell(`${col}${headerRow}`);
    c.value = text;
    styleSubHeader(c, "FFD6ECFF"); // jaśniejszy niebieski
  });

  // Prawa tabela (wewnętrzna)
	const rightHeaders = [
	  ["L", "Koszt zakupu / szt (PLN)"],
	  ["M", "Koszt razem (PLN)"],
	  ["N", "Marża (%)"],
	  ["P", "Zysk NETTO / szt"],
	  ["Q", "Zysk x szt."],
	  ["R", "Uwagi (wew.)"],
	];
  rightHeaders.forEach(([col, text]) => {
    const c = ws.getCell(`${col}${headerRow}`);
    c.value = text;
    styleSubHeader(c, "FFFFE3B5"); // jaśniejszy pomarańcz
  });

  setRowHeight(ws, headerRow, 28);

  // ====== Wiersze danych ======
  let r = headerRow + 1;
  rows.forEach((x) => {
    // Left
    ws.getCell(`A${r}`).value = x.lp;
    ws.getCell(`B${r}`).value = x.product;
    ws.getCell(`C${r}`).value = x.qty;
    ws.getCell(`D${r}`).value = x.unitNet;
    ws.getCell(`E${r}`).value = x.netAfter;
    ws.getCell(`F${r}`).value = x.netLine;
    ws.getCell(`G${r}`).value = x.grossLine;
    ws.getCell(`H${r}`).value = "PLN";
    ws.getCell(`I${r}`).value = ""; // opcjonalnie
    ws.getCell(`J${r}`).value = ""; // opcjonalnie

	// Right (wewnętrzne)
	ws.getCell(`L${r}`).value = x.costUnit;   // ✅ koszt zakupu 1 szt
	ws.getCell(`M${r}`).value = x.costLine;   // ✅ koszt razem (x szt)
	ws.getCell(`N${r}`).value = x.margin;     // marża % (od sumy)
	ws.getCell(`P${r}`).value = x.profitUnit; // ✅ zysk na 1 szt
	ws.getCell(`Q${r}`).value = x.profitLine; // ✅ zysk x szt
	ws.getCell(`R${r}`).value = "";

    // Style cells
    ["A","C","D","E","F","G","H","I","J","L","M","N","P","Q","R"].forEach(col => {
      styleCell(ws.getCell(`${col}${r}`), ["B"].includes(col) ? "left" : "center");
    });
    styleCell(ws.getCell(`B${r}`), "left");

    // Formats
    intFmt(ws.getCell(`A${r}`));
    intFmt(ws.getCell(`C${r}`));

    moneyFmt(ws.getCell(`D${r}`));
    moneyFmt(ws.getCell(`E${r}`));
    moneyFmt(ws.getCell(`F${r}`));
    moneyFmt(ws.getCell(`G${r}`));

    moneyFmt(ws.getCell(`L${r}`));
    moneyFmt(ws.getCell(`M${r}`));
    pctFmt(ws.getCell(`N${r}`));
    moneyFmt(ws.getCell(`P${r}`));
    moneyFmt(ws.getCell(`Q${r}`));

    // Profit coloring (opcjonalnie: czerwony gdy <0)
    if (x.profit < 0) {
      ws.getCell(`P${r}`).font = { color: { argb: "FFFF4D4D" }, bold: true };
      ws.getCell(`Q${r}`).font = { color: { argb: "FFFF4D4D" }, bold: true };
    } else {
      ws.getCell(`P${r}`).font = { bold: true };
      ws.getCell(`Q${r}`).font = { bold: true };
    }

    setRowHeight(ws, r, 24);
    r++;
  });

  // ====== Podsumowania na dole (jak w Twoim arkuszu) ======
  const sumRow = r + 1;

  ws.mergeCells(`E${sumRow}:F${sumRow}`);
  ws.getCell(`E${sumRow}`).value = "SUMA NETTO";
  styleHeader(ws.getCell(`E${sumRow}`), "FFD6ECFF");
  ws.getCell(`G${sumRow}`).value = revenueNet;
  moneyFmt(ws.getCell(`G${sumRow}`));
  styleCell(ws.getCell(`G${sumRow}`), "center");
  ws.getCell(`G${sumRow}`).font = { bold: true };

  ws.mergeCells(`E${sumRow+1}:F${sumRow+1}`);
  ws.getCell(`E${sumRow+1}`).value = "SUMA BRUTTO";
  styleHeader(ws.getCell(`E${sumRow+1}`), "FFD6ECFF");
  ws.getCell(`G${sumRow+1}`).value = revenueGross;
  moneyFmt(ws.getCell(`G${sumRow+1}`));
  styleCell(ws.getCell(`G${sumRow+1}`), "center");
  ws.getCell(`G${sumRow+1}`).font = { bold: true };

  // Podsumowanie wewnętrzne (koszt/zysk/marża)
  ws.mergeCells(`L${sumRow}:M${sumRow}`);
  ws.getCell(`L${sumRow}`).value = "KOSZT ZAKUPU NETTO";
  styleHeader(ws.getCell(`L${sumRow}`), "FFFFE3B5");
  ws.getCell(`P${sumRow}`).value = costNet;
  moneyFmt(ws.getCell(`P${sumRow}`));
  styleCell(ws.getCell(`P${sumRow}`), "center");
  ws.getCell(`P${sumRow}`).font = { bold: true };

  ws.mergeCells(`L${sumRow+1}:M${sumRow+1}`);
  ws.getCell(`L${sumRow+1}`).value = "ZYSK NETTO";
  styleHeader(ws.getCell(`L${sumRow+1}`), "FFFFE3B5");
  ws.getCell(`P${sumRow+1}`).value = profitNet;
  moneyFmt(ws.getCell(`P${sumRow+1}`));
  styleCell(ws.getCell(`P${sumRow+1}`), "center");
  ws.getCell(`P${sumRow+1}`).font = { bold: true };

  ws.mergeCells(`L${sumRow+2}:M${sumRow+2}`);
  ws.getCell(`L${sumRow+2}`).value = "MARŻA";
  styleHeader(ws.getCell(`L${sumRow+2}`), "FFFFE3B5");
  ws.getCell(`P${sumRow+2}`).value = marginPct;
  pctFmt(ws.getCell(`P${sumRow+2}`));
  styleCell(ws.getCell(`P${sumRow+2}`), "center");
  ws.getCell(`P${sumRow+2}`).font = { bold: true };

  // ====== Komentarz (jak na screenie) ======
  const commentRow = sumRow + 4;
  ws.mergeCells(`L${commentRow}:R${commentRow}`);
  ws.getCell(`L${commentRow}`).value = "KOMENTARZ (krótki opis jeśli oferta odbiega od założeń)";
  styleHeader(ws.getCell(`L${commentRow}`), "FFFAD7A0");

  ws.mergeCells(`L${commentRow+1}:R${commentRow+6}`);
  ws.getCell(`L${commentRow+1}`).value =
    [extra ? `Ustalenia: ${extra}` : "", notes ? `Uwagi: ${notes}` : ""].filter(Boolean).join("\n") || "";
  ws.getCell(`L${commentRow+1}`).alignment = { vertical: "top", horizontal: "left", wrapText: true };
  ws.getCell(`L${commentRow+1}`).border = {
    top: { style: "thin", color: { argb: "FF2A2F3A" } },
    left: { style: "thin", color: { argb: "FF2A2F3A" } },
    bottom: { style: "thin", color: { argb: "FF2A2F3A" } },
    right: { style: "thin", color: { argb: "FF2A2F3A" } },
  };
  setRowHeight(ws, commentRow+1, 110);

  // === Zapis pliku
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
