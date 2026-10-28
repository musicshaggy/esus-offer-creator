import { escapeHtml } from "../utils/format.js";
import { documentDesign as design, companyColumns } from "../config/documentDesign.js";

const asset = (name) => new URL(`../../assets/${name}`, import.meta.url).href;
const text = (value) => escapeHtml(String(value ?? ""));
const multiline = (value) => text(value).replace(/\r?\n/g, "<br>");
const rgb = (color) => `rgb(${color.join(",")})`;

export const documentFieldLabels = Object.freeze({
  number: "Dokumentnummer", date: "Dokumentdatum", deliveryDate: "Lieferdatum",
  expectedDate: "Voraussichtliches Lieferdatum", reference: "Rechnungs-/Bestellbezug",
  recipient: "Empfänger", address: "Anschrift", contact: "Ansprechpartner",
  servicePeriod: "Leistungszeitraum", payment: "Zahlungsinformation", notes: "Zusatztext",
  dueDate: "Fällig am",
});

export function documentFieldsMarkup(values, type) {
  const relevant = ["number", "date", type === "confirmation" ? "expectedDate" : "deliveryDate",
    "reference", "recipient", "address", "contact", "servicePeriod", ...(type === "invoice" ? ["dueDate","payment"] : []), "notes"];
  return `<section class="iaiOrdersDetailCard"><h4>Dokumentangaben</h4>
    <p class="iaiOrdersPreviewMeta">Vorbelegte Angaben prüfen. Änderungen werden lokal für dieses Dokument gespeichert.</p>
    <div class="iaiOrdersDetailsGrid">${relevant.map((key) => `<label>${text(type === "wz" && key === "number" ? "Unsere Bestellnummer" : type === "wz" && key === "reference" ? "Ihre Bestellnummer" : documentFieldLabels[key])}${["number","date","recipient","address"].includes(key) ? " *" : " (optional)"}
      ${["address", "notes", "payment"].includes(key)
        ? `<textarea data-document-field="${key}" data-document-type="${type}" rows="2">${text(values[key])}</textarea>`
        : `<input data-document-field="${key}" data-document-type="${type}" type="${key.toLowerCase().includes("date") ? "date" : "text"}" ${type === "wz" && key === "number" ? "readonly" : ""} value="${text(values[key])}">`}
      </label>`).join("")}</div></section>`;
}

export function buildFooterMarkup(columns) {
  const cells=columns.map((column,index) => `<td style="width:${[60,60,55][index]}mm;vertical-align:top;padding:0;overflow-wrap:anywhere">${column.map(multiline).join("<br>")}</td>`).join("");
  return `<footer class="footer" style="display:block;width:100%;border-top:1px solid #ddd;padding-top:2mm;color:#202b3c"><table style="width:100%;table-layout:fixed;border-collapse:collapse;font:7pt/1.4 Inter,Arial,sans-serif"><tr>${cells}</tr></table></footer>`;
}

const isShippingCost = (row) => /^\s*(versandkosten|lieferkosten|frachtkosten|shipping costs?)\b/i.test(row.description);

function documentNotes(data) {
  const shipping=data.rows.map((row,index)=>isShippingCost(row)?index:-1).filter(index=>index>=0);
  let notes=String(data.notes || "");const tracking={};
  if(shipping.length===1){
    const numbers=[];
    notes=notes.split(/\r?\n/).filter(line=>{
      const match=line.match(/^\s*(sendungsnummern?|sendungsnr\.?|tracking(?:nummer|[- ]?number)?)\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9 /,;\-]*)\s*$/i);
      if(match){numbers.push(match[2].trim());return false;}return true;
    }).join("\n").trim();
    if(numbers.length)tracking[shipping[0]]=numbers;
  }
  return {notes,tracking};
}

export function buildBusinessDocumentHtml(data) {
  const company = design.company;
  const type = data.type;
  const delivery = type === "wz";
  const documentRows = delivery ? data.rows.filter(row => !isShippingCost(row)) : data.rows;
  const {notes,tracking}=documentNotes({...data, rows:documentRows});
  const title = { wz: "Lieferschein", confirmation: "Auftragsbestätigung", invoice: "Rechnung" }[type];
  const intros = {
    wz: "mit diesem Lieferschein dokumentieren wir die nachfolgend aufgeführten Lieferungen und Leistungen.",
    confirmation: "vielen Dank für Ihren Auftrag. Hiermit bestätigen wir die vereinbarten Leistungen und Lieferbedingungen.",
    invoice: "vielen Dank für Ihr Vertrauen. Hiermit stellen wir Ihnen die folgenden Leistungen in Rechnung.",
  };
  const closings = {
    wz: "Bitte prüfen Sie die Lieferung auf Vollständigkeit. Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.",
    confirmation: "Bitte prüfen Sie die Auftragsbestätigung. Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.",
    invoice: "Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.",
  };
  const metadata = delivery ? [["Unsere Bestellnummer",data.number],["Ihre Bestellnummer",String(data.reference || "").trim() || "–"],["Lieferdatum",data.deliveryDate || data.date]] : [[title === "Auftragsbestätigung" ? "Auftragsbestätigungsnr." : `${title === "Lieferschein" ? "Lieferschein" : "Rechnungs"}nr.`, data.number],
    [delivery ? "Lieferdatum" : type === "confirmation" ? "Auftragsbestätigungsdatum" : `${title}datum`, delivery ? data.deliveryDate || data.date : data.date],
    ...(type === "invoice" ? [["Fällig am", data.dueDate], ["Leistungsdatum", data.deliveryDate]] : []),
    ];
  const rows = documentRows.map((row, index) => `<tr>
    <td class="position">${index + 1}</td><td class="description">${multiline(row.description)}
      ${tracking[index] ? `<div class="serials"><em>Sendungsnummer: ${text(tracking[index].join(", "))}</em></div>` : ""}
      ${row.serials?.length ? `<div class="serials">Seriennummern: ${row.serials.map(text).join(", ")}</div>` : ""}</td>
    <td class="quantity">${text(row.quantity)} Stück</td>
    ${delivery ? "" : `<td class="amount">${text(data.money(row.quantity ? row.net / row.quantity : row.net))}</td>
      <td class="amount">${text(data.money(row.net))}</td>`}</tr>`).join("");
  const vatLabels = [...new Set(data.rows.map((row) => row.vat))];
  const totals = delivery ? "" : `<div class="totals">
    <div><span>Nettosumme</span><span>${text(data.money(data.net))}</span></div>
    <div><span>${vatLabels.length === 1 ? `USt. ${text(vatLabels[0])}%` : "USt. Positionen"}</span><span>${text(data.money(data.tax))}</span></div>
    ${data.charges.map(([label, amount]) => amount ? `<div><span>${text(label)} (brutto)</span><span>${text(data.money(amount))}</span></div>` : "").join("")}
    <div class="total"><span>Gesamtbetrag</span><span>${text(data.money(data.gross))}</span></div></div>`;
  const footer = buildFooterMarkup(companyColumns(company));
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="esus-document-style" content="unified"><title>${text(title)} ${text(data.number)}</title>
    <style>
      @font-face{font-family:Inter;src:url('${asset("fonts/Inter-Regular.ttf")}')}
      @font-face{font-family:Inter;src:url('${asset("fonts/Inter-Bold.ttf")}');font-weight:700}
      @page{size:A4;margin:16mm 15mm 42mm 20mm}
      *{box-sizing:border-box}body{margin:0;font:9.5pt/1.4 Inter,Arial,sans-serif;color:${rgb(design.colors.body)}}
      .topbar{position:fixed;top:-16mm;left:-20mm;right:-15mm;height:6mm;background:${rgb(design.colors.accent)}}
      .brand{display:flex;justify-content:space-between;align-items:flex-start;height:41mm}
      .brand img{width:48mm;height:auto}.seller{text-align:right;color:${rgb(design.colors.accent)};font-weight:700}
      .seller strong{font-size:14pt}.seller div{font-size:9pt;margin-top:2mm}
      .sender{margin-left:0;width:75mm;white-space:nowrap;font-size:6.5pt;line-height:3.5mm;color:#6e6e6e;text-decoration:underline;margin-bottom:3mm}
      .details{position:relative;display:grid;grid-template-columns:80mm 65mm;justify-content:space-between;gap:30mm;min-height:27mm}
      .address{margin-left:0;white-space:pre-line;font-size:10pt;line-height:4.5mm}.meta{justify-self:end;align-self:start;width:${type === "invoice" ? 65 : 70}mm;font-size:10pt;line-height:4.5mm}.meta-row{display:flex;justify-content:space-between;gap:3mm;margin-bottom:0}
      .buyer-tax{margin:0;line-height:inherit;font-size:inherit;color:inherit;max-width:75mm;overflow-wrap:anywhere}
      .meta-row span{max-width:${type === "invoice" ? 38 : 50}mm;min-width:0;overflow-wrap:anywhere}.meta-row b{font-weight:400;text-align:right;overflow-wrap:anywhere;flex-shrink:0;max-width:30mm}
      h1{font-size:14pt;color:${rgb(design.colors.accent)};margin:5mm 0 6mm}p{margin:0 0 3mm}
      .intro{margin-bottom:10mm}.items{width:100%;border-collapse:collapse;font-size:9pt;table-layout:auto}
      .items thead{display:table-header-group}.items tr{break-inside:avoid}
      .items th{font-size:7.5pt;color:${rgb(design.colors.accent)};border-bottom:.3mm solid ${rgb(design.colors.accent)};padding:2.3mm}
      .items td{padding:2.3mm;border-bottom:.15mm solid #ddd;vertical-align:top}.items tr:nth-child(even){background:#f7f7f7}
      .position{width:13mm;text-align:center}.description{text-align:left;overflow-wrap:anywhere}
      .quantity{text-align:center;white-space:nowrap;width:20mm}.amount{text-align:right;white-space:nowrap;width:27mm}
      .serials{font-size:8pt;font-weight:400;margin-top:1mm;overflow-wrap:anywhere}
      .totals{width:72mm;margin:3mm 0 7mm auto;break-inside:avoid}.totals div{display:flex;justify-content:space-between;gap:3mm;padding:1mm 0}
      .totals div span:last-child{white-space:nowrap;text-align:right}.total{border-top:.4mm solid ${rgb(design.colors.accent)};color:${rgb(design.colors.body)};font-weight:700}
      .closing{margin-top:7mm}.signature{break-inside:avoid}.footer{position:fixed;bottom:-32mm;left:0;right:0;border-top:.3mm solid #ddd;padding-top:2mm}
      .footer table{width:100%;table-layout:fixed;border-collapse:collapse;font:7pt/1.4 Inter,Arial,sans-serif}.footer td{vertical-align:top;padding:0 1mm 0 0;overflow-wrap:anywhere}
      .screen-actions{margin:10mm 0;display:flex;gap:10px}.screen-actions button{padding:8px 14px;cursor:pointer}
      @media screen{body{max-width:175mm;margin:16mm auto 40mm}.topbar{top:0;left:0;right:0}.footer{position:static;margin-top:22mm}}
      @media print{body{max-width:none;margin:0}.topbar{position:fixed;top:-16mm;left:-20mm;right:-15mm}.topbar{display:none}.footer{display:block;position:static;margin-top:15mm}.native-pdf-export .footer{display:none!important}.screen-actions{display:none}}
    </style></head><body><div class="topbar"></div>
    <header class="brand"><img src="${asset("logo_1_big.png")}" alt="ESUS IT"><div class="seller"><strong>${text(company.name)}</strong><div>${text(company.street)}<br>${text(company.city)}</div></div></header>
    <div class="sender">${text(company.name)} · ${text(company.street)} · ${text(company.city)}</div>
    <div class="details"><div class="address">${text(data.recipient)}<br>${multiline(data.address)}${data.buyerVatId && data.buyerVatId !== "-" ? `<div class="buyer-tax">USt-IdNr.: ${text(data.buyerVatId)}</div>` : ""}</div><div class="meta">${metadata.filter(([, value]) => value).map(([label, value]) => `<div class="meta-row"><span>${text(label)}:</span><b style="${label === "Ihre Bestellnummer" && String(value).length > 18 ? "font-size:8pt" : ""}">${text(label === "Ihre Bestellnummer" ? value : data.formatDate(value))}</b></div>`).join("")}</div></div>
    <h1>${text(delivery ? title : `${title} ${data.number}`)}</h1>
    <div class="intro"><p>Sehr geehrte Damen und Herren,</p><p>${intros[type]}</p></div>
    ${!delivery && data.reference ? `<p>Bezug: ${text(data.reference)}</p>` : ""}
    <table class="items"><thead><tr><th class="position">POS.</th><th class="description">BESCHREIBUNG</th><th class="quantity">MENGE</th>${delivery ? "" : '<th class="amount">EINZELPREIS</th><th class="amount">GESAMT</th>'}</tr></thead><tbody>${rows}</tbody></table>
    ${totals}<section class="closing">
      ${type === "confirmation" && data.expectedDate ? `<p>Der voraussichtliche Liefertermin ist der ${text(data.formatDate(data.expectedDate))}.</p>` : ""}
      ${data.servicePeriod ? `<p>Leistungszeitraum: ${text(data.servicePeriod)}</p>` : ""}
      ${type === "invoice" && data.payment ? `<p>Zahlung: ${multiline(/^handelskredit$/i.test(data.payment.trim()) ? "Kauf auf Rechnung" : data.payment)}</p>` : ""}
      ${notes ? `<p><strong>Kundenbemerkungen</strong><br>${multiline(notes)}</p>` : ""}
      <p>${closings[type]}</p><p class="signature">Mit freundlichen Grüßen${data.contact ? `<br>${text(data.contact)}` : ""}</p>
    </section>${footer}
    <div class="screen-actions"><button data-export-pdf>PDF speichern</button><button onclick="window.print()">Drucken</button></div>
    </body></html>`;
}
