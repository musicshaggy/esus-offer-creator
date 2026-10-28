// Independent module: the 1.7.3 DOM and state remain mounted when switching.
import {
  requirementLabels,
  taxCaseLabels,
  translateDiagnostic,
  errorText,
  validationMessage,
} from "./invoice-ui-pl.js";
import { getUserSettings } from "./state/userSettings.js";
import { resolveModuleVisibility } from "./ui/moduleVisibility.js";
const partyFields = [
  ["name", "Nazwa"],
  ["street", "Ulica / skrytka pocztowa"],
  ["postcode", "Kod pocztowy"],
  ["city", "Miejscowość"],
  ["country", "Kod kraju"],
  ["vat_id", "Identyfikator VAT"],
  ["tax_id", "Numer podatkowy"],
  ["endpoint", "Adres elektroniczny"],
  ["endpoint_scheme", "Schemat adresu (e-mail: EM)"],
];
const generalFields = [
  ["number", "Numer faktury"],
  ["issue_date", "Data wystawienia"],
  ["delivery_date", "Data dostawy"],
  ["sales_date", "Data sprzedaży (źródło)"],
  ["due_date", "Termin płatności"],
  ["currency", "Waluta"],
  ["buyer_reference", "Referencja nabywcy / Leitweg-ID"],
  ["purchase_order", "Numer zamówienia nabywcy"],
  ["supplier_number", "Numer dostawcy u nabywcy"],
  ["source_order", "Zamówienie IdoSell"],
  ["iban", "IBAN"],
  ["payment_text", "Informacja o płatności (źródło)"],
  ["payment_code", "Metoda płatności"],
  ["net_total", "Kwota netto faktury"],
  ["tax_total", "VAT faktury"],
  ["gross_total", "Kwota brutto faktury"],
  ["paid", "Kwota zapłacona"],
  ["payable", "Pozostało do zapłaty"],
];
const lineFields = [
  ["identifier", "Nr"],
  ["description", "Opis"],
  ["quantity", "Ilość"],
  ["unit", "Jednostka (sztuka: C62)"],
  ["net_price", "Cena jednostkowa netto"],
  ["net_amount", "Wartość netto pozycji"],
  ["tax_rate", "Stawka VAT (%)"],
  ["tax_amount", "VAT pozycji"],
  ["gross_amount", "Wartość brutto pozycji"],
  ["source_gross_price", "Cena brutto (źródło)"],
];
const taxFields = [
  ["tax_case", "Sposób opodatkowania"],
  ["tax_reason", "Uzasadnienie zwolnienia z VAT"],
  ["delivery_country", "Rzeczywisty kraj dostawy"],
  ["delivery_street", "Ulica"],
  ["delivery_postcode", "Kod pocztowy"],
  ["delivery_city", "Miejscowość"],
  ["remarks", "Uwagi klienta"],
];
let invoice;
let page = 0;
let selectedLine = 0;
let busy = false;
let dirty = false;
let revision = 0;
const root = document.createElement("section");
root.id = "invoiceWorkspace";
root.hidden = true;
root.lang = "pl";
root.innerHTML = `
<div class="invoice-heading">
  <div><h1>E-faktury (DE)</h1><p>Zaimportuj PDF lub zamówienie IdoSell, sprawdź dane i wyeksportuj zweryfikowaną niemiecką e-fakturę.</p></div>
  <div class="invoice-output">
    <label>Format eksportu<select data-invoice-control="invoiceTarget"><option>XRechnung</option><option>ZUGFeRD EN16931</option></select></label>
    <label>Język dokumentu PDF<select data-invoice-control="invoiceLanguage"><option value="de">Niemiecki</option><option value="en">Angielski</option><option value="pl">Polski</option><option value="hu">Węgierski</option></select></label>
  </div>
</div>
<div class="invoice-actions">
  <button data-action="import">Importuj PDF</button>
  <button class="secondary" data-action="loadDraft">Otwórz wersję roboczą</button>
  <button class="secondary" data-action="saveDraft">Zapisz wersję roboczą</button>
  <button class="secondary" data-action="saveSeller">Zapisz sprzedawcę</button>
  <button class="secondary" data-action="check">Sprawdź</button>
  <button data-action="export">Sprawdź i eksportuj</button>
</div>
<div id="invoiceStatus" role="status" aria-live="polite">Przygotowywanie faktury…</div>
<div class="invoice-layout">
  <aside class="card invoice-preview">
    <div class="invoice-preview-actions"><button class="secondary" id="invoicePrev" aria-label="Poprzednia strona PDF">◀</button><span id="invoicePage">Oryginalny PDF</span><button class="secondary" id="invoiceNext" aria-label="Następna strona PDF">▶</button></div>
    <p id="invoicePreviewHint">Zaimportuj PDF, aby porównać dane z oryginalną fakturą.</p>
    <img id="invoicePreviewImage" alt="Oryginalna faktura" hidden>
  </aside>
  <div class="card invoice-editor">
    <div class="invoice-tabs" role="tablist" aria-label="Dane faktury"></div>
    <p class="invoice-requirement-help">Pola oznaczone jako <strong>Wymagane</strong> są obowiązkowe dla wybranego eksportu. Warunkowe zależą od danych faktury; „Jedno z pól” oznacza wymagane uzupełnienie co najmniej jednej z alternatyw.</p>
    <div id="invoiceForms"></div>
  </div>
</div>`;
document.body.append(root);
// Upstream autosave collects every input with an ID. Keep invoice controls scoped
// via data attributes, so offer persistence cannot collect or restore them.
const $ = (id) =>
  root.querySelector(`[data-invoice-control="${id}"]`) ||
  document.getElementById(id);

const invoiceDialog = document.createElement("div");
invoiceDialog.className = "invoiceAppDialog";
invoiceDialog.hidden = true;
invoiceDialog.innerHTML = `
  <div class="invoiceAppDialog__backdrop"></div>
  <div class="invoiceAppDialog__panel" role="alertdialog" aria-modal="true" aria-labelledby="invoiceAppDialogTitle" aria-describedby="invoiceAppDialogMessage">
    <div class="invoiceAppDialog__icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
    <div class="invoiceAppDialog__content">
      <h2 id="invoiceAppDialogTitle"></h2>
      <p id="invoiceAppDialogMessage"></p>
      <div class="invoiceAppDialog__actions">
        <button type="button" class="secondary invoiceAppDialog__cancel">Wróć</button>
        <button type="button" class="invoiceAppDialog__confirm">Potwierdź</button>
      </div>
    </div>
  </div>
`;
document.body.append(invoiceDialog);

let invoiceDialogResolve = null;
let invoiceDialogPreviousFocus = null;

function closeInvoiceDialog(result) {
  if (invoiceDialog.hidden) return;
  invoiceDialog.hidden = true;
  document.body.classList.remove("invoice-dialog-open");
  const resolve = invoiceDialogResolve;
  invoiceDialogResolve = null;
  invoiceDialogPreviousFocus?.focus?.();
  invoiceDialogPreviousFocus = null;
  resolve?.(result);
}

function showInvoiceDialog({
  title,
  message,
  confirmLabel = "Potwierdź",
  cancelLabel = "Wróć",
  danger = false,
  cancelable = true,
} = {}) {
  if (invoiceDialogResolve) closeInvoiceDialog(false);

  invoiceDialog.querySelector("#invoiceAppDialogTitle").textContent = title || "E-faktury (DE)";
  invoiceDialog.querySelector("#invoiceAppDialogMessage").textContent = message || "";
  const cancelButton = invoiceDialog.querySelector(".invoiceAppDialog__cancel");
  const confirmButton = invoiceDialog.querySelector(".invoiceAppDialog__confirm");
  cancelButton.textContent = cancelLabel;
  cancelButton.hidden = !cancelable;
  confirmButton.textContent = confirmLabel;
  confirmButton.classList.toggle("danger", danger);
  invoiceDialog.classList.toggle("is-danger", danger);

  invoiceDialogPreviousFocus = document.activeElement;
  invoiceDialog.hidden = false;
  document.body.classList.add("invoice-dialog-open");
  requestAnimationFrame(() => (cancelable ? cancelButton : confirmButton).focus());

  return new Promise((resolve) => {
    invoiceDialogResolve = resolve;
  });
}

invoiceDialog.querySelector(".invoiceAppDialog__cancel").addEventListener("click", () => closeInvoiceDialog(false));
invoiceDialog.querySelector(".invoiceAppDialog__confirm").addEventListener("click", () => closeInvoiceDialog(true));
invoiceDialog.querySelector(".invoiceAppDialog__backdrop").addEventListener("click", () => closeInvoiceDialog(false));
invoiceDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !invoiceDialog.querySelector(".invoiceAppDialog__cancel").hidden) {
    event.preventDefault();
    closeInvoiceDialog(false);
  }
});
function value(key) {
  return key.split(".").reduce((obj, part) => obj?.[part], invoice) ?? "";
}
function assign(key, next) {
  const parts = key.split(".");
  const last = parts.pop();
  const object = parts.reduce((obj, part) => obj[part], invoice);
  object[last] = next;
}
function target() {
  return $("invoiceTarget").value;
}
function payload(action) {
  return {
    action,
    invoice,
    target: target(),
    language: $("invoiceLanguage").value,
  };
}
function status(text, error = false) {
  $("invoiceStatus").textContent = text;
  $("invoiceStatus").classList.toggle("invoice-error", error);
}
function field(key, title, parent) {
  const label = document.createElement("label");
  label.className = "invoice-field";
  const name = document.createElement("span");
  name.textContent = title;
  const marker = document.createElement("small");
  marker.dataset.requirement = key;
  name.append(marker);
  label.dataset.fieldTitle = title;
  label.append(name);
  let control;
  const options =
    key === "payment_code"
      ? [
          ["", "Wybierz metodę"],
          ["30", "Przelew bankowy"],
          ["58", "Przelew SEPA"],
          ["68", "Płatność online (PayPal)"],
          ["10", "Gotówka"],
        ]
      : key === "tax_case"
        ? [
            ["19 % Deutschland", "19 % Deutschland"],
            [
              "Innergemeinschaftliche Lieferung",
              "Innergemeinschaftliche Lieferung",
            ],
          ]
        : null;
  control = document.createElement(
    options ? "select" : key === "remarks" ? "textarea" : "input",
  );
  if (options)
    for (const [id, text] of options) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = key === "tax_case" ? taxCaseLabels[id] : text;
      control.append(option);
    }
  control.dataset.field = key;
  if (
    ["payment_text", "payment_code", "remarks", "line.description"].includes(
      key,
    )
  )
    label.classList.add("invoice-field-wide");
  control.addEventListener("input", () => {
    if (!invoice) return;
    if (key.startsWith("line."))
      invoice.lines[selectedLine][key.slice(5)] = control.value;
    else assign(key, control.value);
    dirty = true;
    revision++;
    refreshMissingFields();
    renderReport();
    scheduleRequirements();
  });
  label.append(control);
  const missingHint = document.createElement("span");
  missingHint.className = "invoice-missing-hint";
  missingHint.id = "invoiceMissing-" + key.replaceAll(".", "-");
  missingHint.textContent = "Uzupełnij wymagane pole.";
  missingHint.hidden = true;
  label.append(missingHint);
  parent.append(label);
}
const groups = [
  ["general", "Faktura", generalFields],
  [
    "seller",
    "Sprzedawca",
    partyFields
      .map(([key, label]) => ["seller." + key, label])
      .concat([
        ["contact_name", "Osoba kontaktowa"],
        ["contact_phone", "Telefon"],
        ["contact_email", "E-mail kontaktowy"],
      ]),
  ],
  [
    "buyer",
    "Nabywca",
    partyFields.map(([key, label]) => ["buyer." + key, label]),
  ],
  ["tax", "VAT / uwagi", taxFields],
  [
    "lines",
    "Pozycje",
    lineFields.map(([key, label]) => ["line." + key, label]),
  ],
  ["report", "Walidacja", []],
];
const formSections = {
  general: [
    ["Dane faktury", ["number", "issue_date", "delivery_date", "currency"]],
    [
      "Kwoty faktury",
      ["net_total", "tax_total", "gross_total", "paid", "payable"],
    ],
    [
      "Płatność",
      ["payment_text", "payment_code", "iban", "due_date"],
      "Sprawdź informację z PDF, a następnie wybierz metodę płatności. Kredyt kupiecki nie określa sposobu przekazania pieniędzy.",
    ],
    ["Referencja nabywcy", ["buyer_reference"]],
    [
      "Dodatkowe referencje",
      ["purchase_order", "supplier_number"],
      "Dane opcjonalne, jeżeli odbiorca ich nie wymaga.",
    ],
    [
      "Dodatkowe dane z PDF",
      ["sales_date", "source_order"],
      "Dane źródłowe do kontroli; nie zastępują daty wystawienia ani numeru zamówienia nabywcy.",
    ],
  ],
  seller: [
    [
      "Dane i adres sprzedawcy",
      [
        "seller.name",
        "seller.street",
        "seller.postcode",
        "seller.city",
        "seller.country",
      ],
    ],
    [
      "Identyfikacja podatkowa",
      ["seller.vat_id", "seller.tax_id"],
      "Uzupełnij identyfikator VAT lub numer podatkowy. Dostawa wewnątrzwspólnotowa wymaga identyfikatora VAT.",
    ],
    ["Adres elektroniczny", ["seller.endpoint", "seller.endpoint_scheme"]],
    ["Osoba kontaktowa", ["contact_name", "contact_phone", "contact_email"]],
  ],
  buyer: [
    [
      "Dane i adres nabywcy",
      [
        "buyer.name",
        "buyer.street",
        "buyer.postcode",
        "buyer.city",
        "buyer.country",
      ],
    ],
    ["Adres elektroniczny", ["buyer.endpoint", "buyer.endpoint_scheme"]],
    ["Identyfikator VAT", ["buyer.vat_id"]],
    ["Dodatkowe dane z PDF", ["buyer.tax_id"]],
  ],
  tax: [
    ["Opodatkowanie", ["tax_case", "tax_reason"]],
    [
      "Rzeczywisty adres dostawy",
      [
        "delivery_country",
        "delivery_street",
        "delivery_postcode",
        "delivery_city",
      ],
    ],
    ["Uwagi", ["remarks"], "Tekst z faktury pozostaje w języku oryginału."],
  ],
  lines: [
    [
      "Dane pozycji",
      ["line.identifier", "line.description", "line.quantity", "line.unit"],
    ],
    [
      "Kwoty i VAT",
      [
        "line.net_price",
        "line.net_amount",
        "line.tax_rate",
        "line.tax_amount",
        "line.gross_amount",
      ],
    ],
    ["Dodatkowe dane z PDF", ["line.source_gross_price"]],
  ],
};
for (const [id, title, fields] of groups) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = title;
  button.id = "invoiceTab-" + id;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-controls", "invoicePanel-" + id);
  const panel = document.createElement("div");
  panel.id = "invoicePanel-" + id;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", button.id);
  panel.hidden = id !== "general";
  button.setAttribute("aria-selected", String(!panel.hidden));
  button.addEventListener("click", () => activate(id));
  root.querySelector(".invoice-tabs").append(button);
  $("invoiceForms").append(panel);
  if (id === "lines") {
    const select = document.createElement("select");
    select.dataset.invoiceControl = "invoiceLineSelect";
    select.setAttribute("aria-label", "Pozycja faktury");
    select.addEventListener("change", () => {
      selectedLine = Number(select.value);
      fillLine();
    });
    panel.append(select);
  }
  if (id === "report") {
    const missing = document.createElement("section");
    missing.id = "invoiceMissingFields";
    missing.hidden = true;
    panel.append(missing);
    const report = document.createElement("div");
    report.id = "invoiceReport";
    report.textContent = "Nie przeprowadzono jeszcze walidacji.";
    panel.append(report);
    const details = document.createElement("details");
    details.id = "invoiceTechnicalDetails";
    details.hidden = true;
    const summary = document.createElement("summary");
    summary.textContent =
      "Oryginalne komunikaty walidatora (szczegóły techniczne)";
    const raw = document.createElement("pre");
    raw.id = "invoiceTechnicalReport";
    details.append(summary, raw);
    panel.append(details);
  }
  for (const [title, keys, help] of formSections[id] || []) {
    const section = document.createElement("fieldset");
    section.className = "invoice-field-section";
    const legend = document.createElement("legend");
    legend.textContent = title;
    section.append(legend);
    if (help) {
      const hint = document.createElement("p");
      hint.className = "invoice-field-help";
      hint.textContent = help;
      section.append(hint);
    }
    const grid = document.createElement("div");
    grid.className = "invoice-field-grid";
    section.append(grid);
    panel.append(section);
    for (const key of keys) {
      const definition = fields.find(([fieldKey]) => fieldKey === key);
      field(key, definition[1], grid);
    }
  }
  if (id === "tax") {
    const hint = document.createElement("p");
    hint.textContent =
      "Sprawdź sposób opodatkowania. Wybór nie zmienia automatycznie żadnych kwot.";
    panel.append(hint);
  }
}
function activate(id) {
  for (const [key] of groups) {
    $("invoicePanel-" + key).hidden = key !== id;
    $("invoiceTab-" + key).setAttribute("aria-selected", String(key === id));
  }
}
function fillLine() {
  for (const control of root.querySelectorAll('[data-field^="line."]')) {
    control.value =
      invoice?.lines[selectedLine]?.[control.dataset.field.slice(5)] ?? "";
    control.disabled = !invoice?.lines[selectedLine];
  }
  refreshMissingFields();
}
function fill() {
  for (const control of root.querySelectorAll("[data-field]"))
    if (!control.dataset.field.startsWith("line."))
      control.value = value(control.dataset.field);
  const select = $("invoiceLineSelect");
  select.replaceChildren();
  invoice.lines.forEach((line, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${line.identifier || index + 1} · ${line.description || "Pozycja"}`;
    select.append(option);
  });
  selectedLine = 0;
  fillLine();
  renderReport();
  $("invoiceTechnicalDetails").hidden = true;
  scheduleRequirements();
}
let requirementsTimer;
function scheduleRequirements() {
  clearTimeout(requirementsTimer);
  requirementsTimer = setTimeout(updateRequirements, 500);
}
async function updateRequirements() {
  if (!invoice) return;
  const current = revision;
  const currentTarget = target();
  try {
    const rules = await window.invoiceAPI.request(payload("requirements"));
    if (current !== revision || currentTarget !== target()) return;
    for (const marker of root.querySelectorAll("[data-requirement]")) {
      const rule = rules[marker.dataset.requirement] || "optional";
      marker.textContent = requirementLabels[rule];
      marker.closest("label").dataset.requirementKind = rule;
      marker
        .closest("label")
        .querySelector("input, select, textarea")
        .setAttribute("aria-required", String(rule === "Pflicht"));
    }
    refreshMissingFields();
  } catch (error) {
    status(errorText(error), true);
  }
}
function refreshMissingFields() {
  if (!invoice) return;
  const missing = [];
  for (const control of root.querySelectorAll("[data-field]")) {
    const label = control.closest("label");
    const required = label.dataset.requirementKind === "Pflicht";
    const empty = required && !control.disabled && !control.value.trim();
    label.classList.toggle("invoice-field-missing", empty);
    const hint = label.querySelector(".invoice-missing-hint");
    hint.hidden = !empty;
    if (empty) {
      control.setAttribute("aria-invalid", "true");
      control.setAttribute("aria-describedby", hint.id);
    } else {
      control.removeAttribute("aria-invalid");
      control.removeAttribute("aria-describedby");
    }
    if (!required) continue;
    if (control.dataset.field.startsWith("line.")) {
      invoice.lines.forEach((line, index) => {
        if (!String(line[control.dataset.field.slice(5)] ?? "").trim())
          missing.push({
            control,
            index,
            title: `Pozycja ${line.identifier || index + 1}: ${label.dataset.fieldTitle}`,
          });
      });
    } else if (empty) {
      const panel = control.closest('[role="tabpanel"]');
      const tab = $(panel.getAttribute("aria-labelledby")).textContent;
      missing.push({ control, title: `${tab}: ${label.dataset.fieldTitle}` });
    }
  }
  const overview = $("invoiceMissingFields");
  overview.replaceChildren();
  overview.hidden = !missing.length;
  if (!missing.length) return;
  const heading = document.createElement("h3");
  heading.textContent = `Pola do uzupełnienia (${missing.length})`;
  const description = document.createElement("p");
  description.textContent =
    "Kliknij nazwę pola, aby przejść do jego edycji. To lista pustych pól wymaganych, a nie pełna walidacja faktury.";
  const list = document.createElement("ul");
  for (const item of missing) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.className = "invoice-field-link";
    button.textContent = item.title;
    button.addEventListener("click", () => {
      if (item.index !== undefined) {
        selectedLine = item.index;
        $("invoiceLineSelect").value = String(item.index);
        fillLine();
      }
      const panel = item.control.closest('[role="tabpanel"]');
      activate(panel.id.replace("invoicePanel-", ""));
      item.control.scrollIntoView({ block: "center" });
      item.control.focus({ preventScroll: true });
    });
    row.append(button);
    list.append(row);
  }
  overview.append(heading, description, list);
}

function renderReport(result = null) {
  const report = $("invoiceReport");
  report.replaceChildren();
  const summary = document.createElement("section");
  summary.className = "invoice-report-summary";
  if (result) summary.dataset.valid = String(result.valid);
  const heading = document.createElement("h3");
  heading.textContent = result
    ? result.valid
      ? "WALIDACJA POPRAWNA"
      : "EKSPORT ZABLOKOWANY"
    : "Nie przeprowadzono walidacji aktualnych danych";
  const explanation = document.createElement("p");
  explanation.textContent = result
    ? result.standard || "Wynik kontroli danych faktury."
    : "Kliknij „Sprawdź”, aby sprawdzić dane i reguły wybranego formatu. Wskazówki z importu poniżej nie są wynikiem walidacji.";
  summary.append(heading, explanation);
  if (result?.path) {
    const path = document.createElement("p");
    path.textContent = "Zapisano: " + result.path;
    summary.append(path);
  }
  report.append(summary);
  for (const [key, title] of [
    ["errors", "Błędy"],
    ["warnings", "Ostrzeżenia"],
  ]) {
    if (!result?.[key]?.length) continue;
    const section = document.createElement("section");
    section.className = "invoice-report-findings";
    const titleNode = document.createElement("h3");
    titleNode.textContent = `${title} (${result[key].length})`;
    const list = document.createElement("ul");
    for (const finding of result[key]) {
      const row = document.createElement("li");
      row.textContent = validationMessage(finding, key === "warnings");
      list.append(row);
    }
    section.append(titleNode, list);
    report.append(section);
  }
  if (invoice?.import_notes?.length) {
    const notes = document.createElement("details");
    notes.className = "invoice-import-notes";
    notes.open = !result;
    const title = document.createElement("summary");
    title.textContent = `Wskazówki z importu (${invoice.import_notes.length})`;
    const list = document.createElement("ul");
    for (const note of invoice.import_notes) {
      const row = document.createElement("li");
      row.textContent = translateDiagnostic(note);
      list.append(row);
    }
    notes.append(title, list);
    report.append(notes);
  }
  if (!result) $("invoiceTechnicalDetails").hidden = true;
}
async function preview() {
  if (!invoice?.source_file) {
    $("invoicePreviewImage").hidden = true;
    $("invoicePreviewImage").removeAttribute("src");
    $("invoicePreviewHint").hidden = false;
    $("invoicePreviewHint").textContent = invoice?.source_order
      ? `Źródło: zamówienie IdoSell ${invoice.source_order}. Brak oryginalnego PDF. Sprawdź pozycje i sumy z zamówieniem.`
      : "Zaimportuj PDF, aby porównać dane z oryginalną fakturą.";
    $("invoicePage").textContent = invoice?.source_order ? "Zamówienie IdoSell" : "Oryginalny PDF";
    $("invoicePrev").disabled = true;
    $("invoiceNext").disabled = true;
    openSource.disabled = true;
    return;
  }
  openSource.disabled = false;
  const source = invoice.source_sha256;
  const result = await window.invoiceAPI.request({
    ...payload("preview"),
    page,
  });
  if (source !== invoice.source_sha256) return;
  page = result.page;
  $("invoicePreviewImage").src = "data:image/png;base64," + result.image;
  $("invoicePreviewImage").hidden = false;
  $("invoicePreviewHint").hidden = true;
  $("invoicePage").textContent = `Strona ${page + 1} / ${result.count}`;
  $("invoicePrev").disabled = page === 0;
  $("invoiceNext").disabled = page + 1 === result.count;
}
async function confirmReplace(message) {
  if (!dirty) return true;
  return await showInvoiceDialog({
    title: "Niezapisane zmiany",
    message:
      message ||
      "Odrzucić niezapisane zmiany? Jeśli chcesz je zachować, najpierw zapisz wersję roboczą.",
    confirmLabel: "Odrzuć zmiany",
    cancelLabel: "Wróć do faktury",
    danger: true,
  });
}

function discardCurrentInvoice() {
  invoice = null;
  dirty = false;
  revision++;
}
async function action(name) {
  if (busy) return;
  if (["import", "loadDraft"].includes(name) && !(await confirmReplace())) return;
  const submittedRevision = revision;
  const submittedTarget = target();
  busy = true;
  for (const button of root.querySelectorAll("[data-action]"))
    button.disabled = true;
  status("Trwa przetwarzanie…");
  try {
    const result = await window.invoiceAPI.request(payload(name));
    if (result.canceled) {
      status("Anulowano.");
      return;
    }
    if (["import", "loadDraft"].includes(name)) {
      invoice = result;
      revision++;
      dirty = false;
      page = 0;
      fill();
      await preview();
      status("Faktura została wczytana. Sprawdź dane i sposób opodatkowania.");
    } else if (name === "saveDraft") {
      dirty = false;
      status("Zapisano wersję roboczą: " + result.path);
    } else if (name === "saveSeller") status("Zapisano profil sprzedawcy.");
    else {
      if (revision !== submittedRevision || target() !== submittedTarget) {
        renderReport();
        status(
          result.path
            ? "Zapisano wcześniejszą wersję faktury: " +
                result.path +
                ". Sprawdź aktualne dane ponownie."
            : "Dane lub format zmieniły się podczas walidacji. Sprawdź ponownie.",
        );
        return;
      }
      renderReport(result);
      const rawMessages = [
        ...(result.errors || []),
        ...(result.warnings || []),
      ].map((item) =>
        typeof item === "string" ? item : `[${item.rule}] ${item.message}`,
      );
      $("invoiceTechnicalReport").textContent = rawMessages.join("\n");
      $("invoiceTechnicalDetails").hidden = !rawMessages.length;
      activate("report");
      status(
        result.valid
          ? name === "export"
            ? "Zapisano eksport: " + result.path
            : "Walidacja XML zakończona poprawnie. Przy eksporcie ZUGFeRD zostanie dodatkowo sprawdzona zgodność PDF/A."
          : "Popraw dane zgodnie z komunikatami walidacji.",
        !result.valid,
      );
    }
  } catch (error) {
    status(errorText(error), true);
  } finally {
    busy = false;
    for (const button of root.querySelectorAll("[data-action]"))
      button.disabled = false;
  }
}
root
  .querySelectorAll("[data-action]")
  .forEach((button) =>
    button.addEventListener("click", () => action(button.dataset.action)),
  );
const openSource = document.createElement("button");
openSource.className = "secondary";
openSource.textContent = "Otwórz oryginalny PDF";
openSource.addEventListener("click", async () => {
  try {
    await window.invoiceAPI.request(payload("openSource"));
  } catch (error) {
    status(errorText(error), true);
  }
});
root.querySelector(".invoice-preview").append(openSource);
for (const [id, step] of [
  ["invoicePrev", -1],
  ["invoiceNext", 1],
])
  $(id).addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try {
      page += step;
      await preview();
    } catch (error) {
      status(errorText(error), true);
    } finally {
      busy = false;
    }
  });
$("invoiceTarget").addEventListener("change", () => {
  renderReport();
  scheduleRequirements();
  $("invoiceLanguage").disabled = target() === "XRechnung";
});
$("invoiceLanguage").disabled = true;
const invoiceEntry = document.createElement("button");
invoiceEntry.id = "btnOffersInvoices";
invoiceEntry.className = "secondary offers-header-action";
invoiceEntry.title = "E-faktury (DE)";
invoiceEntry.setAttribute("aria-label", "E-faktury (DE)");
invoiceEntry.innerHTML =
  '<i class="fa-solid fa-file-invoice"></i><span class="offers-header-action-label">E-faktury (DE)</span>';
let invoiceModuleVisible = false;
function placeInvoiceEntry() {
  $("btnOffersIaiOrders").after(invoiceEntry);
  const sidebar = invoiceEntry.closest(".erp-sidebar");
  invoiceEntry.classList.toggle("erp-nav-button", !!sidebar);
  invoiceEntry.querySelector("span").classList.toggle("erp-nav-label", !!sidebar);
  invoiceEntry.dataset.optionalModule = "1";
  invoiceEntry.hidden = !invoiceModuleVisible || (!sidebar && !$("offersListView").classList.contains("is-active"));
}
placeInvoiceEntry();
window.addEventListener("DOMContentLoaded", placeInvoiceEntry, { once: true });
new MutationObserver(placeInvoiceEntry).observe($("offersListView"), {
  attributes: true, attributeFilter: ["class"],
});
let previousNavigation = [];
function setInvoiceActive(active) {
  if (active && root.hidden) {
    previousNavigation = [...document.querySelectorAll(".erp-nav-items > button")]
      .filter(button => button !== invoiceEntry)
      .map(button => ({button, current:button.classList.contains("is-current"), aria:button.getAttribute("aria-current")}));
    for (const {button} of previousNavigation) {
      button.classList.remove("is-current"); button.removeAttribute("aria-current");
    }
  } else if (!active) {
    for (const {button,current,aria} of previousNavigation) {
      button.classList.toggle("is-current",current);
      if (aria) button.setAttribute("aria-current",aria); else button.removeAttribute("aria-current");
    }
    previousNavigation = [];
  }
  root.hidden = !active;
  document.body.classList.toggle("invoice-active",active);
  invoiceEntry.classList.toggle("is-current",active);
  if (active) invoiceEntry.setAttribute("aria-current","page"); else invoiceEntry.removeAttribute("aria-current");
}
let replayingInvoiceNavigation = false;
document.addEventListener("click", async event => {
  const button=event.target.closest(".erp-nav-items > button");
  if (replayingInvoiceNavigation || root.hidden || !button || button === invoiceEntry) return;
  if (!dirty) {
    setInvoiceActive(false);
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  if (!(await confirmReplace())) return;

  discardCurrentInvoice();
  setInvoiceActive(false);
  replayingInvoiceNavigation = true;
  try {
    button.click();
  } finally {
    replayingInvoiceNavigation = false;
  }
},true);
invoiceEntry.addEventListener("click", () => {
  setInvoiceActive(true);
  if (!invoice) initialize();
  invoiceBack.focus();
});
const invoiceBack = document.createElement("button");
invoiceBack.id = "invoiceBack";
invoiceBack.className = "secondary";
invoiceBack.innerHTML =
  '<i class="fa-solid fa-arrow-left"></i> Powrót do ofert';
root.querySelector(".invoice-heading h1").textContent = "E-faktury (DE)";
root.querySelector(".invoice-heading > div").prepend(invoiceBack);
invoiceBack.addEventListener("click", async () => {
  if (!(await confirmReplace())) return;
  discardCurrentInvoice();
  setInvoiceActive(false);
  invoiceEntry.focus();
});
window.addEventListener("esus:moduleVisibilityApplied", (event) => {
  invoiceModuleVisible = event?.detail?.visibility?.invoicesDe === true;
  if (!invoiceModuleVisible && !root.hidden) setInvoiceActive(false);
  placeInvoiceEntry();
});
getUserSettings()
  .then((settings) => {
    invoiceModuleVisible = resolveModuleVisibility(settings).invoicesDe;
    placeInvoiceEntry();
  })
  .catch((error) => console.warn("Invoice module visibility load failed:", error));
async function initialize() {
  if (busy) return;
  busy = true;
  try {
    invoice = await window.invoiceAPI.request({ action: "defaults" });
    fill();
    status("Dane sprzedawcy są uzupełnione. Zaimportuj fakturę IdoSell.");
  } catch (error) {
    status(errorText(error), true);
  } finally { busy = false; }
}
// Additional source; PDF importing and existing exports remain unchanged.
window.addEventListener("esus:invoice-from-order", async (event) => {
  const request = event.detail;
  if (!request || typeof request.resolve !== "function") return;
  if (busy || !(await confirmReplace())) { request.resolve(false); return; }
  busy = true;
  let accepted = false;
  try {
    const result = await window.invoiceAPI.request({action:"importOrder",order:request.order,
      language:request.language,purchaseOrder:request.purchaseOrder || ""});
    invoice = result;
    revision++;
    dirty = true;
    page = 0;
    $("invoiceLanguage").value = ["de","en","pl","hu"].includes(request.language) ? request.language : "de";
    fill();
    activate("general");
    await preview();
    setInvoiceActive(true);
    status("Przejęto zamówienie IdoSell. Uzupełnij numer i daty faktury, potwierdź VAT i płatność, następnie sprawdź dokument.");
    accepted = true;
    invoiceBack.focus();
  } catch (error) {
    await showInvoiceDialog({
      title: "Nie udało się utworzyć e-faktury",
      message: errorText(error),
      confirmLabel: "Zamknij",
      cancelable: false,
    });
  } finally {
    busy = false;
    request.resolve(accepted);
  }
});

let closeRequestPending = false;
window.esusAPI?.onWinCloseRequested?.(async () => {
  if (closeRequestPending) return;
  closeRequestPending = true;
  try {
    const confirmed = await confirmReplace(
      "Zamknąć aplikację i odrzucić niezapisane zmiany w e-fakturze?",
    );
    if (confirmed) await window.esusAPI?.winConfirmClose?.();
  } finally {
    closeRequestPending = false;
  }
});
