import { documentDesign as design, companyColumns } from "../config/documentDesign.js";

const { colors, company } = design;
const left = design.margin, right = 210 - design.rightMargin, width = right - left;

async function loadFont(doc, name, style) {
  const response = await fetch(`./assets/fonts/${name}.ttf`);
  if (!response.ok) throw new Error(`Document font unavailable: ${name}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  doc.addFileToVFS(`${name}.ttf`, btoa(binary));
  doc.addFont(`${name}.ttf`, design.font, style);
}

function setText(doc, size = 9.5, bold = false, color = colors.body) {
  doc.setFont(design.font, bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

export function drawFooter(doc, columns = companyColumns(company), fontName = design.font) {
  const pages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (fontName === design.font) {
      doc.setFillColor(...colors.accent);
      doc.rect(0, 0, 210, 6, "F");
    }
    doc.setFont(fontName,"normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...colors.body);
    doc.text(fontName === design.font ? `Seite ${page} von ${pages}` : `${page}/${pages}`, right, design.footerTop - 4, { align: "right" });
    doc.setDrawColor(...colors.line);
    doc.setLineWidth(0.3);
    doc.line(left, design.footerTop, right, design.footerTop);
    columns.forEach((column, index) => {
      const x = left + index * 60;
      doc.setFont(fontName,"normal");
      doc.setFontSize(7);
      doc.setTextColor(...colors.body);
      let y = design.footerTop + 4;
      for (const value of column) {
        const wrapped = doc.splitTextToSize(value, 54);
        doc.text(wrapped, x, y);
        y += wrapped.length * 3.5;
      }
    });
  }
  doc.setPage(pages);
}

function drawHeader(doc, data) {
  if (data.logo) {
    const image = doc.getImageProperties(data.logo);
    doc.addImage(data.logo, "PNG", left, 16, 48, 48 * image.height / image.width);
  }
  setText(doc, 14, true, colors.heading);
  doc.text(company.name, right, 20, { align: "right" });
  setText(doc, 9, true, colors.heading);
  doc.text(company.street, right, 26, { align: "right" });
  doc.text(company.city, right, 31, { align: "right" });
  setText(doc, 7, false, colors.muted);
  const sender = `${company.name} · ${company.street} · ${company.city}`;
  doc.text(sender, left, 60);
  doc.setDrawColor(...colors.muted);
  doc.setLineWidth(0.15);
  doc.line(left, 60.7, left + doc.getTextWidth(sender), 60.7);
  setText(doc, 10);
  const customerLines = [data.customer.name, data.customer.addr,
    data.customer.taxId ? `USt-IdNr.: ${data.customer.taxId}` : ""]
    .filter(Boolean).flatMap(value => doc.splitTextToSize(value, design.address.textWidth));
  doc.text(customerLines, left, 66, { lineHeightFactor: 4.5 / (10 * 25.4 / 72) });
  const customerBottom = 66 + Math.max(0, customerLines.length - 1) * 4.5;
  let metaY = 66;
  for (const [label, value] of [["Angebotsnr.", data.number], ["Angebotsdatum", data.date],
    ["Kontakt", data.customer.contact]]) {
    if (!value) continue;
    setText(doc, 10);
    const labelLines = doc.splitTextToSize(`${label}:`, 37);
    doc.text(labelLines, 125, metaY);
    setText(doc, 10);
    if (doc.getTextWidth(value) > 26 && value.length > 30) {
      const valueLines = doc.splitTextToSize(value, 65);
      doc.text(valueLines, 125, metaY + labelLines.length * 4.5);
      metaY += (labelLines.length + valueLines.length) * 4.5;
    } else {
      const valueLines = doc.splitTextToSize(value, 26);
      doc.text(valueLines, right, metaY, { align: "right" });
      metaY += Math.max(labelLines.length, valueLines.length) * 4.5;
    }
  }
  let y = Math.max(99, metaY + 10, customerBottom + 10);
  setText(doc, 14, true, colors.heading);
  const title = doc.splitTextToSize(`${data.title} ${data.number}`, width);
  doc.text(title, left, y);
  y += title.length * 6 + 6;
  setText(doc);
  for (const paragraph of [data.subtitle, "Sehr geehrte Damen und Herren,",
    "vielen Dank für Ihr Interesse. Gerne unterbreiten wir Ihnen das folgende Angebot:"]) {
    if (!paragraph) continue;
    const lines = doc.splitTextToSize(paragraph, width);
    doc.text(lines, left, y);
    y += lines.length * 4.5 + 3;
  }
  return y + 5;
}

function tableStyles() {
  return {
    margin: { left, right: 210 - right, top: 20, bottom: 42 },
    theme: "plain",
    rowPageBreak: "avoid",
    styles: { font: design.font, fontSize: 9, textColor: colors.body, cellPadding: 2.3, overflow: "linebreak" },
    headStyles: { fontStyle: "bold", fontSize: 7.5, textColor: colors.heading,
      fillColor: [255, 255, 255], lineColor: colors.heading, lineWidth: { bottom: 0.3 } },
    alternateRowStyles: { fillColor: colors.stripe },
    bodyStyles: { lineColor: colors.line, lineWidth: { bottom: 0.15 } },
  };
}

export async function renderGermanOffer(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadFont(doc, "Inter-Regular", "normal");
  await loadFont(doc, "Inter-Bold", "bold");
  let y = drawHeader(doc, data);
  const head = ["POS.", "BESCHREIBUNG", "MENGE", "EINZELPREIS"];
  if (data.showDiscount) head.push("RABATT");
  head.push("GESAMT");
  const last = head.length - 1;
  const body = data.rows.map((row) => {
    const values = [row.position, row.description, `${row.quantity} Stück`, data.money(row.net)];
    if (data.showDiscount) values.push(`${row.discount}%`);
    values.push(data.money(row.net * row.quantity));
    values.__alternative = row.alternative;
    return values;
  });
  // Reserve space from the actual formatted values; descriptions use the remainder.
  const discountWidth = data.showDiscount ? 17 : 0;
  const numericColumns = [2, 3, last];
  const minimumWidths = [20, 24, 27];
  let numericFontSize = 9;
  function measureWidths() {
    setText(doc, numericFontSize);
    return numericColumns.map((column, index) => Math.max(minimumWidths[index],
      ...body.map((row) => doc.getTextWidth(String(row[column])) + 4.6)));
  }
  let numericWidths = measureWidths();
  while (numericWidths.reduce((sum, width) => sum + width, 0) > 107 - discountWidth && numericFontSize > 7) {
    numericFontSize -= 0.5;
    numericWidths = measureWidths();
  }
  const available = 107 - discountWidth;
  const measured = numericWidths.reduce((sum, width) => sum + width, 0);
  if (measured > available) numericWidths = numericWidths.map((width) => width * available / measured);
  const descriptionWidth = width - 13 - discountWidth - numericWidths.reduce((sum, width) => sum + width, 0);
  doc.autoTable({
    ...tableStyles(), startY: y, head: [head], body,
    columnStyles: { 0: { cellWidth: 13, halign: "center" },
      1: { cellWidth: descriptionWidth, fontStyle: "normal" },
      2: { cellWidth: numericWidths[0], halign: "center", fontSize: numericFontSize },
      3: { cellWidth: numericWidths[1], halign: "right", fontSize: numericFontSize },
      ...(data.showDiscount ? { 4: { cellWidth: 17, halign: "right" } } : {}),
      [last]: { cellWidth: numericWidths[2], halign: "right", fontSize: numericFontSize } },
    didParseCell(cell) {
      // AutoTable's head style overrides column alignment, so align both explicitly.
      if (cell.column.index === 2) cell.cell.styles.halign = "center";
      else if (cell.column.index >= 3) cell.cell.styles.halign = "right";
      if (cell.section === "body") cell.cell.styles.fillColor = cell.row.index % 2 ? colors.stripe : [255, 255, 255];
      if (cell.section === "body" && cell.row.raw.__alternative) {
        cell.cell.styles.textColor = colors.muted;
        cell.cell.styles.fontStyle = "normal";
      }
    },
  });
  y = doc.lastAutoTable.finalY + 5;
  function ensureSpace(height) {
    if (y + height <= design.contentBottom) return;
    doc.addPage();
    y = 23;
  }
  ensureSpace(28);
  for (const [index, row] of [["Nettosumme", data.net], [data.vatLabel, data.tax],
    ["Gesamtbetrag", data.gross]].entries()) {
    const bold = index === 2;
    setText(doc, 9.5, bold, colors.body);
    if (bold) {
      doc.setDrawColor(...colors.heading);
      doc.setLineWidth(0.4);
      doc.line(130, y - 4, right, y - 4);
    }
    doc.text(row[0], 130, y);
    doc.text(data.money(row[1]), right, y, { align: "right" });
    y += 6;
  }
  y += 5;
  if (data.alternativeImpact.length) {
    ensureSpace(25);
    setText(doc, 9, true);
    doc.text(data.alternativeTitle, left, y);
    doc.autoTable({ ...tableStyles(), startY: y + 3,
      head: [data.alternativeHead], body: data.alternativeImpact,
      styles: { ...tableStyles().styles, fontSize: 7.5 } });
    y = doc.lastAutoTable.finalY + 8;
  }
  function paragraph(text, size = 9.5) {
    if (!text) return;
    setText(doc, size);
    const lines = doc.splitTextToSize(String(text), width);
    for (const line of lines) {
      ensureSpace(5);
      setText(doc, size);
      doc.text(line, left, y);
      y += 4.5;
    }
    y += 3;
  }
  if (data.validUntil) paragraph(`Dieses Angebot ist gültig bis zum ${data.validUntil}.`);
  paragraph(data.payment);
  if (data.leadTime) paragraph(`Voraussichtliche Lieferzeit: ${data.leadTime}.`);
  paragraph(data.extra);
  paragraph("Bei Fragen stehen wir Ihnen gerne zur Verfügung und freuen uns auf Ihre Rückmeldung.");
  ensureSpace(15);
  paragraph(["Mit freundlichen Grüßen", data.creator].filter(Boolean).join("\n"));
  paragraph(data.creatorContact, 8);
  paragraph(data.estimateDisclaimer, 8);
  drawFooter(doc);
  doc.save(data.filename);
}
