import { escapeHtml, money } from "../utils/format.js";
import { getUserSettings, setUserSettings } from "../state/userSettings.js";
import { getCompanyFooterLines } from "../i18n/pdfI18n.js";
import { showToast } from "./toast.js";

const CLOSED_STATUSES = new Set([
  "joined",
  "missing",
  "lost",
  "false",
  "canceled",
  "finished_ext",
  "finished",
]);

const IAI_ORDERS_DEFAULT_LANG = "pl";
const IAI_ORDERS_SUPPORTED_LANGS = new Set(["pl", "de", "en"]);
const IAI_ORDERS_LOCALES = {
  pl: "pl-PL",
  de: "de-DE",
  en: "en-GB",
};
const IAI_ORDERS_DOCUMENT_TYPES = ["wz", "invoice", "confirmation"];
const IAI_ORDERS_SERIAL_SPLIT_REGEX = /[\n\r,;]+/;
const ESUS_LOGO_URL = new URL("../../assets/logo_1_big.png", import.meta.url).href;

const IAI_ORDERS_I18N = {
  pl: {
    moduleEyebrow: "Moduł IdoSell",
    heroTitle: "Otwórz zamówienie IAI",
    heroText:
      "Przeglądaj aktywne zamówienia z IdoSell, dołącz konkretne ID z ręcznego wyszukania i generuj dokumenty robocze do druku.",
    langLabel: "Język modułu",
    metaLabel: "Status modułu",
    sourceLabel: "Widok",
    panelTitle: "Lista zamówień",
    panelText:
      "Pokazujemy zamówienia spoza statusów zamkniętych. W polu poniżej możesz dodatkowo wpisać konkretne ID lub numery seryjne zamówień.",
    reload: "Odśwież",
    apply: "Pokaż zamówienia",
    lookupLabel: "ID lub numery seryjne zamówień do dołączenia",
    lookupPlaceholder:
      "Wklej jedno lub wiele ID. Możesz oddzielać je enterem, spacją albo przecinkiem.",
    lookupHint: "Ręczne wyszukiwanie może pokazać też zamówienia z zamkniętych statusów.",
    clear: "Wyczyść",
    loadingTitle: "Ładowanie danych",
    loadingText: "Trwa przygotowanie listy zamówień IAI.",
    loadingOrdersTitle: "Pobieranie danych",
    loadingOrdersText: "Ładowanie zamówień IAI...",
    loadingMeta: "Ładowanie...",
    loadingSource: "Trwa pobieranie zamówień z IdoSell.",
    sourceActive: "Lista pokazuje aktywne statusy zamówień.",
    sourceManual: "Wyniki dokładnego wyszukiwania po ID lub numerze seryjnym.",
    shownOrders: "Pokazano {count} zamówień",
    noIntegrationMeta: "Integracja IdoSell nie jest jeszcze gotowa.",
    noIntegrationSource: "Uzupełnij ustawienia integracji, aby odblokować moduł zamówień.",
    noIntegrationTitle: "Brak aktywnej integracji",
    noIntegrationText:
      "Ten moduł odblokuje się automatycznie po zapisaniu i poprawnym skonfigurowaniu integracji IdoSell.",
    noOrdersTitle: "Brak zamówień do pokazania",
    noOrdersText:
      "Lista nie zwróciła aktywnych zamówień. Możesz też wpisać ID lub numer seryjny, aby dodać konkretne zamówienie do widoku.",
    noSearchResultsTitle: "Nie znaleziono zamówienia",
    noSearchResultsText: "Żadne zamówienie nie pasuje dokładnie do wpisanego ID lub numeru seryjnego.",
    fetchListFailedMeta: "Nie udało się pobrać listy zamówień.",
    fetchFailedTitle: "Błąd pobierania",
    fetchFailedText: "IdoSell API nie zwróciło poprawnej odpowiedzi.",
    headOrder: "Zamówienie / klient",
    headStatus: "Status",
    headDate: "Data dodania",
    headValue: "Wartość",
    headActions: "Akcje",
    preview: "Podgląd",
    openDocument: "Otwórz dokument",
    serialPromptTitle: "Numery seryjne",
    serialPromptText: "Uzupełnij numery seryjne dla pozycji lub pomiń ten krok.",
    serialPromptSkip: "Pomiń",
    serialPromptSave: "Zapisz i otwórz",
    serialPromptClose: "Zamknij",
    documentType: "Typ dokumentu",
    documentType_wz: "WZ",
    documentType_invoice: "Rachunek",
    documentType_confirmation: "Potwierdzenie",
    wzShort: "WZ",
    invoice: "Rachunek",
    confirmationDocTitle: "Potwierdzenie przyjęcia zamówienia",
    confirmationDocSubtitle:
      "Dokument potwierdza przyjęcie zamówienia do realizacji i nie stanowi rachunku ani faktury.",
    confirmationLeadTimeTitle: "Czas realizacji",
    confirmationLeadTimeValue: "Planowany termin realizacji: {value}",
    confirmationLeadTimeFallback:
      "Termin realizacji potwierdzimy po finalnej weryfikacji dostępności i logistyki.",
    close: "Zamknij",
    invoiceLater: "Rachunek dodamy w kolejnej iteracji.",
    saveLangFailed: "Nie udało się zapisać języka modułu.",
    serialNumbers: "Numery seryjne",
    serialNumbersShort: "S/N",
    serialsPlaceholder: "Wpisz jeden numer seryjny w osobnej linii.",
    serialsHelp: "Każdy numer seryjny wpisz w osobnej linii. Zostaną dodane do WZ i rachunku.",
    serialsEmpty: "Brak numerów seryjnych",
    invoiceDocTitle: "Rachunek roboczy",
    invoiceDocSubtitle: "Dokument pomocniczy do weryfikacji pozycji zamówienia.",
    recipient: "Odbiorca",
    documentDate: "Data dokumentu",
    documentNumber: "Numer dokumentu",
    orderDateLabel: "Data zamówienia",
    customerNumber: "Numer klienta",
    paymentTarget: "Termin płatności",
    dueDateLabel: "Termin końcowy",
    prepareInvoiceFailed: "Nie udało się przygotować rachunku dla tego zamówienia.",
    generateInvoiceFailed: "Nie udało się wygenerować rachunku.",
    prepareDocumentFailed: "Nie udało się przygotować dokumentu: {doc}.",
    generateDocumentFailed: "Nie udało się wygenerować dokumentu: {doc}.",
    manualAdded: "Dodane z wyszukania ręcznego",
    activeStatus: "Status aktywny",
    positionsShort: "poz.",
    order: "Zamówienie",
    orderDetails: "Szczegóły zamówienia",
    status: "Status",
    value: "Wartość",
    products: "Produkty",
    shipping: "Dostawa",
    payment: "Płatność",
    termDays: "Termin: {days} dni",
    confirmation: "Potwierdzenie: {value}",
    planned: "Plan: {value}",
    package: "Paczka: {value}",
    customer: "Klient",
    deliveryAddress: "Adres dostawy",
    taxId: "NIP",
    company: "Firma",
    orderItems: "Pozycje zamówienia",
    additionalInfo: "Informacje dodatkowe",
    notesTitle: "Uwagi do zamówienia",
    clientNote: "Uwaga klienta:",
    courierNote: "Uwaga dla kuriera:",
    lp: "Lp",
    product: "Produkt",
    variant: "Wariant",
    qty: "Ilość",
    net: "Netto",
    gross: "Brutto",
    vat: "VAT",
    noItemsInResponse: "Brak pozycji w odpowiedzi API.",
    noItemsInOrder: "Brak pozycji w zamówieniu.",
    printPdf: "Drukuj / zapisz PDF",
    printDocument: "Drukuj",
    exportPdf: "Eksportuj PDF",
    exportPdfDialogTitle: "Eksportuj dokument do PDF",
    exportPdfSaved: "Dokument PDF został zapisany.",
    exportPdfFailed: "Nie udało się wyeksportować dokumentu PDF.",
    wzTitle: "Dokument WZ",
    orderSn: "Zamówienie IAI {orderId} / SN {serial}",
    total: "Razem",
    fetchDetailsFailed: "Nie udało się pobrać szczegółów zamówienia.",
    fetchDetailsIaiFailed: "Nie udało się pobrać szczegółów zamówienia IAI.",
    prepareWzFailed: "Nie udało się przygotować WZ dla tego zamówienia.",
    popupBlocked: "Przeglądarka zablokowała okno podglądu dokumentu.",
    generateWzFailed: "Nie udało się wygenerować WZ.",
    status_new: "Nowe",
    status_payment_waiting: "Oczekuje na płatność",
    status_delivery_waiting: "Oczekuje na dostawę",
    status_on_order: "W realizacji",
    status_packed: "Kompletowane",
    status_packed_fulfillment: "Kompletowane fulfillment",
    status_packed_ready: "Spakowane",
    status_ready: "Gotowe",
    status_wait_for_dispatch: "Czeka na wysyłkę",
    status_suspended: "Wstrzymane",
    status_joined: "Połączone",
    status_missing: "Brakujące",
    status_lost: "Utracone",
    status_false: "Fałszywe",
    status_canceled: "Anulowane",
    status_finished_ext: "Zakończone w FA",
    status_finished: "Zakończone",
    payment_prepaid: "Przedpłata",
    payment_cash_on_delivery: "Pobranie",
    payment_tradecredit: "Kredyt kupiecki",
    confirmation_email: "E-mail",
    confirmation_phone_client: "Telefon od klienta",
    confirmation_phone_service: "Telefon od obsługi",
    confirmation_none: "Brak",
  },
  de: {
    moduleEyebrow: "IdoSell-Modul",
    heroTitle: "IAI-Bestellung öffnen",
    heroText:
      "Durchsuche aktive IdoSell-Bestellungen, füge konkrete IDs aus der manuellen Suche hinzu und generiere Arbeitsdokumente zum Druck.",
    langLabel: "Modulsprache",
    metaLabel: "Modulstatus",
    sourceLabel: "Ansicht",
    panelTitle: "Bestellliste",
    panelText:
      "Wir zeigen Bestellungen außerhalb geschlossener Status an. Unten kannst du zusätzlich konkrete IDs oder Seriennummern eintragen.",
    reload: "Aktualisieren",
    apply: "Bestellungen anzeigen",
    lookupLabel: "Bestell-IDs oder Seriennummern zusätzlich laden",
    lookupPlaceholder:
      "Eine oder mehrere IDs einfügen. Du kannst sie mit Enter, Leerzeichen oder Komma trennen.",
    lookupHint: "Die manuelle Suche kann auch Bestellungen mit geschlossenen Status anzeigen.",
    clear: "Leeren",
    loadingTitle: "Daten werden geladen",
    loadingText: "Die IAI-Bestellliste wird vorbereitet.",
    loadingOrdersTitle: "Datenabruf läuft",
    loadingOrdersText: "IAI-Bestellungen werden geladen...",
    loadingMeta: "Wird geladen...",
    loadingSource: "Bestellungen werden aus IdoSell geladen.",
    sourceActive: "Die Liste zeigt Bestellungen mit aktiven Status.",
    sourceManual: "Exakte Suchergebnisse nach ID oder Seriennummer.",
    shownOrders: "{count} Bestellungen angezeigt",
    noIntegrationMeta: "Die IdoSell-Integration ist noch nicht bereit.",
    noIntegrationSource: "Ergänze die Integrationseinstellungen, um das Bestellmodul freizuschalten.",
    noIntegrationTitle: "Keine aktive Integration",
    noIntegrationText:
      "Dieses Modul wird automatisch freigeschaltet, sobald die IdoSell-Integration korrekt gespeichert und konfiguriert wurde.",
    noOrdersTitle: "Keine Bestellungen zum Anzeigen",
    noOrdersText:
      "Die Liste hat keine aktiven Bestellungen zurückgegeben. Du kannst auch eine ID oder Seriennummer eingeben, um eine konkrete Bestellung hinzuzufügen.",
    noSearchResultsTitle: "Bestellung nicht gefunden",
    noSearchResultsText: "Keine Bestellung stimmt exakt mit der eingegebenen ID oder Seriennummer überein.",
    fetchListFailedMeta: "Die Bestellliste konnte nicht geladen werden.",
    fetchFailedTitle: "Fehler beim Laden",
    fetchFailedText: "Die IdoSell-API hat keine korrekte Antwort zurückgegeben.",
    headOrder: "Bestellung / Kunde",
    headStatus: "Status",
    headDate: "Erstellt am",
    headValue: "Wert",
    headActions: "Aktionen",
    preview: "Vorschau",
    openDocument: "Dokument öffnen",
    serialPromptTitle: "Seriennummern",
    serialPromptText: "Seriennummern ergänzen oder diesen Schritt überspringen.",
    serialPromptSkip: "Überspringen",
    serialPromptSave: "Speichern und öffnen",
    serialPromptClose: "Schließen",
    documentType: "Dokumenttyp",
    documentType_wz: "WZ",
    documentType_invoice: "Rechnung",
    documentType_confirmation: "Auftragsbestätigung",
    wzShort: "WZ",
    invoice: "Rechnung",
    confirmationDocTitle: "Auftragsbestätigung",
    confirmationDocSubtitle:
      "Dieses Dokument bestätigt den Auftragseingang und ist keine Rechnung.",
    confirmationLeadTimeTitle: "Lieferzeit",
    confirmationLeadTimeValue: "Voraussichtlicher Realisierungstermin: {value}",
    confirmationLeadTimeFallback:
      "Den finalen Realisierungstermin bestätigen wir nach Prüfung von Verfügbarkeit und Logistik.",
    close: "Schließen",
    invoiceLater: "Die Rechnung fügen wir in der nächsten Iteration hinzu.",
    saveLangFailed: "Die Modulsprache konnte nicht gespeichert werden.",
    serialNumbers: "Seriennummern",
    serialNumbersShort: "S/N",
    serialsPlaceholder: "Jede Seriennummer in eine eigene Zeile eintragen.",
    serialsHelp: "Jede Seriennummer in einer separaten Zeile eintragen. Sie wird in WZ und Rechnung übernommen.",
    serialsEmpty: "Keine Seriennummern",
    invoiceDocTitle: "Rechnung",
    invoiceDocSubtitle: "Bitte prüfen Sie die Positionen und Zahlungsdaten.",
    recipient: "Empfänger",
    documentDate: "Dokumentdatum",
    documentNumber: "Dokumentnummer",
    orderDateLabel: "Auftragsdatum",
    customerNumber: "Kundennummer",
    paymentTarget: "Zahlungsziel",
    dueDateLabel: "Fälligkeitsdatum",
    prepareInvoiceFailed: "Die Rechnung für diese Bestellung konnte nicht vorbereitet werden.",
    generateInvoiceFailed: "Die Rechnung konnte nicht generiert werden.",
    prepareDocumentFailed: "Das Dokument konnte nicht vorbereitet werden: {doc}.",
    generateDocumentFailed: "Das Dokument konnte nicht generiert werden: {doc}.",
    manualAdded: "Aus manueller Suche hinzugefügt",
    activeStatus: "Aktiver Status",
    positionsShort: "Pos.",
    order: "Bestellung",
    orderDetails: "Bestelldetails",
    status: "Status",
    value: "Wert",
    products: "Produkte",
    shipping: "Versand",
    payment: "Zahlung",
    termDays: "Frist: {days} Tage",
    confirmation: "Bestätigung: {value}",
    planned: "Geplant: {value}",
    package: "Paket: {value}",
    customer: "Kunde",
    deliveryAddress: "Lieferadresse",
    taxId: "USt-IdNr.",
    company: "Firma",
    orderItems: "Bestellpositionen",
    additionalInfo: "Zusätzliche Informationen",
    notesTitle: "Hinweise zur Bestellung",
    clientNote: "Kundenhinweis:",
    courierNote: "Hinweis für Kurier:",
    lp: "Pos.",
    product: "Produkt",
    variant: "Variante",
    qty: "Menge",
    net: "Netto",
    gross: "Brutto",
    vat: "MwSt.",
    noItemsInResponse: "Keine Positionen in der API-Antwort.",
    noItemsInOrder: "Keine Positionen in der Bestellung.",
    printPdf: "Drucken / als PDF speichern",
    printDocument: "Drucken",
    exportPdf: "PDF exportieren",
    exportPdfDialogTitle: "Dokument als PDF exportieren",
    exportPdfSaved: "Das PDF-Dokument wurde gespeichert.",
    exportPdfFailed: "Das PDF-Dokument konnte nicht exportiert werden.",
    wzTitle: "Lieferschein",
    orderSn: "IAI-Bestellung {orderId} / SN {serial}",
    total: "Gesamt",
    fetchDetailsFailed: "Bestelldetails konnten nicht geladen werden.",
    fetchDetailsIaiFailed: "IAI-Bestelldetails konnten nicht geladen werden.",
    prepareWzFailed: "WZ für diese Bestellung konnte nicht vorbereitet werden.",
    popupBlocked: "Das Vorschaufenster für das Dokument wurde vom Browser blockiert.",
    generateWzFailed: "WZ konnte nicht generiert werden.",
    status_new: "Neu",
    status_payment_waiting: "Wartet auf Zahlung",
    status_delivery_waiting: "Wartet auf Lieferung",
    status_on_order: "In Bearbeitung",
    status_packed: "Kommissionierung",
    status_packed_fulfillment: "Fulfillment-Kommissionierung",
    status_packed_ready: "Verpackt",
    status_ready: "Bereit",
    status_wait_for_dispatch: "Wartet auf Versand",
    status_suspended: "Angehalten",
    status_joined: "Zusammengeführt",
    status_missing: "Fehlend",
    status_lost: "Verloren",
    status_false: "Falsch",
    status_canceled: "Storniert",
    status_finished_ext: "In FA abgeschlossen",
    status_finished: "Abgeschlossen",
    payment_prepaid: "Vorkasse",
    payment_cash_on_delivery: "Nachnahme",
    payment_tradecredit: "Handelskredit",
    confirmation_email: "E-Mail",
    confirmation_phone_client: "Telefon vom Kunden",
    confirmation_phone_service: "Telefon vom Support",
    confirmation_none: "Keine",
  },
  en: {
    moduleEyebrow: "IdoSell module",
    heroTitle: "Open IAI order",
    heroText:
      "Browse active IdoSell orders, add specific IDs from manual lookup, and generate draft documents for printing.",
    langLabel: "Module language",
    metaLabel: "Module status",
    sourceLabel: "View",
    panelTitle: "Orders list",
    panelText:
      "We show orders outside closed statuses. Below you can also enter specific IDs or serial numbers.",
    reload: "Refresh",
    apply: "Show orders",
    lookupLabel: "Order IDs or serial numbers to include",
    lookupPlaceholder:
      "Paste one or more IDs. You can separate them with Enter, spaces, or commas.",
    lookupHint: "Manual lookup may also return orders with closed statuses.",
    clear: "Clear",
    loadingTitle: "Loading data",
    loadingText: "Preparing the IAI orders list.",
    loadingOrdersTitle: "Fetching data",
    loadingOrdersText: "Loading IAI orders...",
    loadingMeta: "Loading...",
    loadingSource: "Orders are being fetched from IdoSell.",
    sourceActive: "The list shows orders with active statuses.",
    sourceManual: "Exact search results by ID or serial number.",
    shownOrders: "{count} orders shown",
    noIntegrationMeta: "IdoSell integration is not ready yet.",
    noIntegrationSource: "Fill in integration settings to unlock the orders module.",
    noIntegrationTitle: "No active integration",
    noIntegrationText:
      "This module will unlock automatically after the IdoSell integration is saved and configured correctly.",
    noOrdersTitle: "No orders to display",
    noOrdersText:
      "The list returned no active orders. You can also enter an ID or serial number to add a specific order to the view.",
    noSearchResultsTitle: "Order not found",
    noSearchResultsText: "No order exactly matches the entered ID or serial number.",
    fetchListFailedMeta: "Failed to fetch the orders list.",
    fetchFailedTitle: "Loading error",
    fetchFailedText: "IdoSell API did not return a valid response.",
    headOrder: "Order / customer",
    headStatus: "Status",
    headDate: "Created at",
    headValue: "Value",
    headActions: "Actions",
    preview: "Preview",
    openDocument: "Open document",
    serialPromptTitle: "Serial numbers",
    serialPromptText: "Add serial numbers for the items or skip this step.",
    serialPromptSkip: "Skip",
    serialPromptSave: "Save and open",
    serialPromptClose: "Close",
    documentType: "Document type",
    documentType_wz: "WZ",
    documentType_invoice: "Invoice",
    documentType_confirmation: "Order confirmation",
    wzShort: "WZ",
    invoice: "Invoice",
    confirmationDocTitle: "Order confirmation",
    confirmationDocSubtitle:
      "This document confirms order acceptance and is not an invoice.",
    confirmationLeadTimeTitle: "Lead time",
    confirmationLeadTimeValue: "Planned completion date: {value}",
    confirmationLeadTimeFallback:
      "The final completion date will be confirmed after availability and logistics are verified.",
    close: "Close",
    invoiceLater: "Invoice will be added in the next iteration.",
    saveLangFailed: "Failed to save the module language.",
    serialNumbers: "Serial numbers",
    serialNumbersShort: "S/N",
    serialsPlaceholder: "Enter one serial number per line.",
    serialsHelp: "Enter each serial number on a separate line. They will be added to the WZ and invoice documents.",
    serialsEmpty: "No serial numbers",
    invoiceDocTitle: "Invoice",
    invoiceDocSubtitle: "Please review the ordered items and payment details.",
    recipient: "Recipient",
    documentDate: "Document date",
    documentNumber: "Document number",
    orderDateLabel: "Order date",
    customerNumber: "Customer number",
    paymentTarget: "Payment term",
    dueDateLabel: "Due date",
    prepareInvoiceFailed: "Failed to prepare the invoice for this order.",
    generateInvoiceFailed: "Failed to generate the invoice.",
    prepareDocumentFailed: "Failed to prepare the document: {doc}.",
    generateDocumentFailed: "Failed to generate the document: {doc}.",
    manualAdded: "Added from manual lookup",
    activeStatus: "Active status",
    positionsShort: "items",
    order: "Order",
    orderDetails: "Order details",
    status: "Status",
    value: "Value",
    products: "Products",
    shipping: "Shipping",
    payment: "Payment",
    termDays: "Term: {days} days",
    confirmation: "Confirmation: {value}",
    planned: "Planned: {value}",
    package: "Package: {value}",
    customer: "Customer",
    deliveryAddress: "Delivery address",
    taxId: "Tax ID",
    company: "Company",
    orderItems: "Order items",
    additionalInfo: "Additional information",
    notesTitle: "Order notes",
    clientNote: "Customer note:",
    courierNote: "Courier note:",
    lp: "No.",
    product: "Product",
    variant: "Variant",
    qty: "Qty",
    net: "Net",
    gross: "Gross",
    vat: "VAT",
    noItemsInResponse: "No items in API response.",
    noItemsInOrder: "No items in this order.",
    printPdf: "Print / save PDF",
    printDocument: "Print",
    exportPdf: "Export PDF",
    exportPdfDialogTitle: "Export document to PDF",
    exportPdfSaved: "The PDF document has been saved.",
    exportPdfFailed: "The PDF document could not be exported.",
    wzTitle: "Delivery note",
    orderSn: "IAI order {orderId} / SN {serial}",
    total: "Total",
    fetchDetailsFailed: "Failed to fetch order details.",
    fetchDetailsIaiFailed: "Failed to fetch IAI order details.",
    prepareWzFailed: "Failed to prepare WZ for this order.",
    popupBlocked: "The document preview window was blocked by the browser.",
    generateWzFailed: "Failed to generate WZ.",
    status_new: "New",
    status_payment_waiting: "Waiting for payment",
    status_delivery_waiting: "Waiting for delivery",
    status_on_order: "In progress",
    status_packed: "Picking",
    status_packed_fulfillment: "Fulfillment picking",
    status_packed_ready: "Packed",
    status_ready: "Ready",
    status_wait_for_dispatch: "Waiting for dispatch",
    status_suspended: "Suspended",
    status_joined: "Merged",
    status_missing: "Missing",
    status_lost: "Lost",
    status_false: "False",
    status_canceled: "Canceled",
    status_finished_ext: "Completed in FA",
    status_finished: "Completed",
    payment_prepaid: "Prepaid",
    payment_cash_on_delivery: "Cash on delivery",
    payment_tradecredit: "Trade credit",
    confirmation_email: "E-mail",
    confirmation_phone_client: "Phone by client",
    confirmation_phone_service: "Phone by staff",
    confirmation_none: "None",
  },
};

function q(id) {
  return document.getElementById(id);
}

function normalizeIaiOrdersLang(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return IAI_ORDERS_SUPPORTED_LANGS.has(normalized) ? normalized : IAI_ORDERS_DEFAULT_LANG;
}

function normalizeIaiOrdersDocumentType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return IAI_ORDERS_DOCUMENT_TYPES.includes(normalized) ? normalized : "wz";
}

function interpolate(template, vars = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_match, key) => String(vars?.[key] ?? ""));
}

function t(lang, key, vars = null) {
  const normalizedLang = normalizeIaiOrdersLang(lang);
  const source = IAI_ORDERS_I18N[normalizedLang] || IAI_ORDERS_I18N[IAI_ORDERS_DEFAULT_LANG];
  const fallback = IAI_ORDERS_I18N[IAI_ORDERS_DEFAULT_LANG];
  const text = source?.[key] ?? fallback?.[key] ?? key;
  return vars ? interpolate(text, vars) : text;
}

function getLangLocale(lang) {
  return IAI_ORDERS_LOCALES[normalizeIaiOrdersLang(lang)] || IAI_ORDERS_LOCALES[IAI_ORDERS_DEFAULT_LANG];
}

function getDocumentTypeLabel(type, lang = IAI_ORDERS_DEFAULT_LANG) {
  return t(lang, `documentType_${normalizeIaiOrdersDocumentType(type)}`);
}

function buildDocumentTypeOptionsMarkup(lang, selectedType = "wz") {
  const normalizedType = normalizeIaiOrdersDocumentType(selectedType);
  return IAI_ORDERS_DOCUMENT_TYPES.map((type) => {
    const selected = type === normalizedType ? " selected" : "";
    return `<option value="${type}"${selected}>${escapeHtml(getDocumentTypeLabel(type, lang))}</option>`;
  }).join("");
}

function getIaiOrdersModuleLang(settings) {
  return normalizeIaiOrdersLang(settings?.modulePrefs?.iaiOrders?.lang);
}

function getIaiOrdersSerialsStore(settings) {
  const store = settings?.modulePrefs?.iaiOrders?.orderItemSerials;
  return store && typeof store === "object" && !Array.isArray(store) ? store : {};
}

function normalizeSerialList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(IAI_ORDERS_SERIAL_SPLIT_REGEX)
        .map((entry) => String(entry || "").trim());

  const unique = [];
  const seen = new Set();
  for (const entry of source) {
    const normalizedEntry = String(entry || "").trim();
    if (!normalizedEntry) continue;
    const key = normalizedEntry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalizedEntry);
  }
  return unique;
}

function serialListToText(value) {
  return normalizeSerialList(value).join("\n");
}

function isIdoSellReady(settings) {
  const idosell = settings?.integrations?.idosell || {};
  return idosell.enabled !== false && !!idosell.baseUrl && !!idosell.hasApiKey;
}

function formatDateTime(value, lang = IAI_ORDERS_DEFAULT_LANG) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const normalized = raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleString(getLangLocale(lang), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value, currency = "PLN", lang = IAI_ORDERS_DEFAULT_LANG) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(getLangLocale(lang), {
      style: "currency",
      currency: String(currency || "PLN").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return money(value, currency);
  }
}

function formatDateForDocument(value, lang = IAI_ORDERS_DEFAULT_LANG) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const normalized = raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString(getLangLocale(lang), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function addDaysToDateString(value, days, lang = IAI_ORDERS_DEFAULT_LANG) {
  const raw = String(value || "").trim();
  const amount = Number(days || 0);
  if (!raw || !Number.isFinite(amount) || amount <= 0) return formatDateForDocument(value, lang);

  const normalized = raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return formatDateForDocument(value, lang);
  date.setDate(date.getDate() + amount);
  return date.toLocaleDateString(getLangLocale(lang), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function pickOrderLeadTimeText(order, lang = IAI_ORDERS_DEFAULT_LANG) {
  const dispatchDate =
    order?.orderDetails?.dispatch?.estimatedDeliveryDate ||
    order?.orderDetails?.orderDispatchDate ||
    "";

  if (String(dispatchDate || "").trim()) {
    return t(lang, "confirmationLeadTimeValue", {
      value: formatDateForDocument(dispatchDate, lang),
    });
  }

  return t(lang, "confirmationLeadTimeFallback");
}

function buildDocumentPdfName(title) {
  const safeTitle = String(title || "dokument")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${safeTitle || "dokument"}.pdf`;
}

function openDocumentPopup(html, title, lang = IAI_ORDERS_DEFAULT_LANG) {
  const popup = window.open("", "_blank", "width=1100,height=900");
  if (!popup) {
    showToast(t(lang, "popupBlocked"), {
      type: "error",
      ms: 3200,
    });
    return null;
  }

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  if (title) {
    popup.document.title = title;
  }
  const exportDocumentPdf = async () => {
    try {
      const result = await window.esusAPI.exportPdfFromHtml({
        html,
        defaultName: buildDocumentPdfName(title),
        dialogTitle: t(lang, "exportPdfDialogTitle"),
      });
      if (result?.ok) {
        showToast(t(lang, "exportPdfSaved"), { type: "success", ms: 2800 });
      }
      return result;
    } catch (error) {
      console.error(error);
      showToast(t(lang, "exportPdfFailed"), { type: "error", ms: 3400 });
      return { ok: false, error: String(error?.message || error) };
    }
  };
  popup.document.querySelectorAll("[data-export-pdf]").forEach((button) => {
    button.addEventListener("click", () => {
      void exportDocumentPdf();
    });
  });
  return popup;
}

function pickOrderCurrency(order) {
  return String(
    order?.orderDetails?.payments?.orderCurrency?.currencyId ||
      order?.orderDetails?.payments?.orderBaseCurrency?.billingCurrency ||
      "PLN"
  ).toUpperCase();
}

function pickOrderTotal(order) {
  const orderCurrency = order?.orderDetails?.payments?.orderCurrency || {};
  return (
    Number(orderCurrency?.orderProductsCost || 0) +
    Number(orderCurrency?.orderDeliveryCost || 0) +
    Number(orderCurrency?.orderPayformCost || 0) +
    Number(orderCurrency?.orderInsuranceCost || 0)
  );
}

function pickOrderStatus(order) {
  return String(order?.orderDetails?.orderStatus || "").trim().toLowerCase();
}

function orderStatusTone(status) {
  switch (String(status || "").trim().toLowerCase()) {
    case "new":
      return "info";
    case "payment_waiting":
    case "delivery_waiting":
    case "wait_for_dispatch":
      return "warning";
    case "on_order":
    case "packed":
    case "packed_fulfillment":
    case "suspended":
      return "accent";
    case "packed_ready":
    case "ready":
      return "success";
    case "joined":
    case "missing":
    case "lost":
    case "false":
    case "canceled":
    case "finished_ext":
    case "finished":
      return "muted";
    default:
      return "default";
  }
}

function formatOrderStatus(status) {
  switch (String(status || "").trim().toLowerCase()) {
    case "new":
      return "Nowe";
    case "payment_waiting":
      return "Oczekuje na płatność";
    case "delivery_waiting":
      return "Oczekuje na dostawę";
    case "on_order":
      return "W realizacji";
    case "packed":
      return "Kompletowane";
    case "packed_fulfillment":
      return "Kompletowane fulfillment";
    case "packed_ready":
      return "Spakowane";
    case "ready":
      return "Gotowe";
    case "wait_for_dispatch":
      return "Czeka na wysyłkę";
    case "suspended":
      return "Wstrzymane";
    case "joined":
      return "Połączone";
    case "missing":
      return "Brakujące";
    case "lost":
      return "Utracone";
    case "false":
      return "Fałszywe";
    case "canceled":
      return "Anulowane";
    case "finished_ext":
      return "Zakończone w FA";
    case "finished":
      return "Zakończone";
    default:
      return status || "-";
  }
}

function formatPaymentType(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "prepaid":
      return "Przedpłata";
    case "cash_on_delivery":
      return "Pobranie";
    case "tradecredit":
      return "Kredyt kupiecki";
    default:
      return value || "-";
  }
}

function formatOrderConfirmation(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "email":
      return "E-mail";
    case "phone_client":
      return "Telefon od klienta";
    case "phone_service":
      return "Telefon od obsługi";
    case "none":
      return "Brak";
    default:
      return value || "-";
  }
}

function formatOrderStatusI18n(status, lang = IAI_ORDERS_DEFAULT_LANG) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  return t(lang, `status_${normalizedStatus}`) || status || "-";
}

function formatPaymentTypeI18n(value, lang = IAI_ORDERS_DEFAULT_LANG) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return t(lang, `payment_${normalizedValue}`) || value || "-";
}

function formatOrderConfirmationI18n(value, lang = IAI_ORDERS_DEFAULT_LANG) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return t(lang, `confirmation_${normalizedValue}`) || value || "-";
}

function pickClientResult(order) {
  return order?.clientResult || order?.orderDetails?.clientResult || {};
}

function mergeNonEmptyRecords(base = {}, overlay = {}) {
  const merged = { ...(base || {}) };
  for (const [key, value] of Object.entries(overlay || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim() && merged[key]) continue;
    merged[key] = value;
  }
  return merged;
}

function pickBillingData(order) {
  const client = pickClientResult(order);
  return client?.clientBillingAddress || order?.clientBillingAddress || {};
}

function pickDeliveryData(order) {
  const client = pickClientResult(order);
  return client?.clientDeliveryAddress || order?.clientDeliveryAddress || {};
}

function pickBillingName(order) {
  const billing = pickBillingData(order);
  const fullName = [billing?.clientFirstName, billing?.clientLastName].filter(Boolean).join(" ").trim();

  return billing?.clientFirm || fullName || "";
}

function pickDeliveryName(order) {
  const delivery = pickDeliveryData(order);
  const deliveryName = [
    delivery?.clientDeliveryAddressFirstName,
    delivery?.clientDeliveryAddressLastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return delivery?.clientDeliveryAddressFirm || deliveryName || "";
}

function pickClientName(order) {
  return pickBillingName(order) || pickDeliveryName(order) || "-";
}

function pickClientCompany(order) {
  return String(pickBillingData(order)?.clientFirm || "").trim() || "-";
}

function pickClientTaxId(order) {
  const billing = pickBillingData(order);
  return String(
    billing?.clientNip ||
      billing?.clientTaxNumber ||
      billing?.clientVatId ||
      ""
  ).trim() || "-";
}

function pickClientEmail(order) {
  const client = pickClientResult(order);
  const billing = pickBillingData(order);
  return (
    billing?.clientEmail ||
    client?.clientAccount?.clientEmail ||
    pickDeliveryData(order)?.clientEmail ||
    "-"
  );
}

function pickClientPhone(order) {
  const billing = pickBillingData(order);
  return (
    billing?.clientPhone1 ||
    billing?.clientPhone2 ||
    "-"
  );
}

function pickDeliveryPhone(order) {
  const delivery = pickDeliveryData(order);
  return (
    delivery?.clientDeliveryAddressPhone1 ||
    delivery?.clientDeliveryAddressPhone2 ||
    delivery?.clientDeliveryAddressPhone ||
    "-"
  );
}

function pickClientNumber(order) {
  const client = pickClientResult(order);
  const billing = pickBillingData(order);
  const delivery = pickDeliveryData(order);
  return (
    client?.clientAccount?.clientCode ||
    client?.clientAccount?.clientId ||
    billing?.clientCodeExternal ||
    billing?.clientId ||
    delivery?.clientCodeExternal ||
    "-"
  );
}

function pickBillingAddress(order) {
  const address = pickBillingData(order);
  return [
    address?.clientStreet,
    [address?.clientZipCode, address?.clientCity].filter(Boolean).join(" "),
    address?.clientCountryName || address?.clientCountryId,
  ]
    .filter(Boolean)
    .join(", ");
}

function pickDeliveryAddress(order) {
  const address = pickDeliveryData(order);
  return [
    address?.clientDeliveryAddressStreet,
    [
      address?.clientDeliveryAddressZipCode,
      address?.clientDeliveryAddressCity,
    ]
      .filter(Boolean)
      .join(" "),
    address?.clientDeliveryAddressCountryName || address?.clientDeliveryAddressCountryId,
  ]
    .filter(Boolean)
    .join(", ");
}

function isOrderProductCandidate(product) {
  if (!product || typeof product !== "object" || Array.isArray(product)) return false;
  return [
    "productId",
    "productName",
    "productCode",
    "productQuantity",
    "productOrderPrice",
    "productOrderPriceNet",
    "productPanelPrice",
    "productPanelPriceNet",
    "sizePanelName",
    "versionName",
  ].some((key) => product[key] !== undefined && product[key] !== null);
}

function normalizeProductsCollection(value) {
  if (Array.isArray(value)) {
    return value.filter(isOrderProductCandidate);
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nestedArrays = Object.values(value).filter(Array.isArray);
    for (const candidate of nestedArrays) {
      const normalized = candidate.filter(isOrderProductCandidate);
      if (normalized.length) return normalized;
    }

    if (isOrderProductCandidate(value)) return [value];
  }

  return [];
}

function pickProducts(order) {
  const directCandidates = [
    order?.productsResults,
    order?.products,
    order?.orderDetails?.productsResults,
    order?.orderDetails?.products,
    order?.basket?.productsResults,
    order?.basket?.products,
    order?.basketResult?.productsResults,
    order?.basketResult?.products,
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeProductsCollection(candidate);
    if (normalized.length) return normalized;
  }

  const visited = new Set();
  const queue = [order];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      const normalized = current.filter(isOrderProductCandidate);
      if (normalized.length) return normalized;

      for (const item of current) {
        if (item && typeof item === "object") queue.push(item);
      }
      continue;
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) {
        const normalized = value.filter(isOrderProductCandidate);
        if (normalized.length) return normalized;
      }

      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return [];
}

function pickProductName(product) {
  return product?.productName || product?.name || product?.productLabel || "-";
}

function pickProductCode(product) {
  return product?.productCode || product?.productSizeCodeExternal || product?.code || "";
}

function pickProductQty(product) {
  return Number(
    product?.productQuantity ??
      product?.quantity ??
      product?.qty ??
      0
  );
}

function pickProductNet(product) {
  return Number(
    product?.productOrderPriceNet ??
      product?.productPanelPriceNet ??
      product?.priceNet ??
      product?.netPrice ??
      0
  );
}

function pickProductGross(product) {
  return Number(
    product?.productOrderPrice ??
      product?.productPanelPrice ??
      product?.priceGross ??
      product?.grossPrice ??
      0
  );
}

function pickProductVariant(product) {
  return product?.sizePanelName || product?.versionName || product?.variantName || "-";
}

function lookupOrderToken(order) {
  return String(order?.orderId || order?.orderSerialNumber || "").trim();
}

function buildDocumentFooterColumns(lang, settings = null) {
  const normalizedLang = normalizeIaiOrdersLang(lang);
  const footerLines = getCompanyFooterLines(normalizedLang).filter(Boolean);
  const profile = settings?.profile || {};
  const website = {
    pl: "www.esus-it.pl",
    de: "www.esus-it.de",
    en: "www.esus-it.com",
  }[normalizedLang];
  const contactLines = [
    String(profile?.fullName || "").trim(),
    String(profile?.phone || "").trim() ? `Tel: ${String(profile.phone).trim()}` : "",
    String(profile?.email || "").trim() ? `E-Mail: ${String(profile.email).trim()}` : "",
    `Web: ${website}`,
  ].filter(Boolean);

  const left = footerLines.slice(0, Math.max(1, Math.ceil(footerLines.length / 2)));
  const right = footerLines.slice(left.length);
  return [left, contactLines, right.length ? right : ["ESUS IT"]];
}

function buildDocumentFooterMarkup(lang, settings = null) {
  return buildDocumentFooterColumns(lang, settings)
    .map(
      (column) => `
        <div class="footer-col">
          ${column.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        </div>
      `
    )
    .join("");
}

function buildProductSerialKey(product, index = 0) {
  return [
    String(product?.productId || "").trim(),
    String(pickProductCode(product) || "").trim(),
    String(pickProductName(product) || "").trim(),
    String(pickProductVariant(product) || "").trim(),
    String(index),
  ].join("::");
}

function getOrderItemSerials(order, settings) {
  const token = lookupOrderToken(order);
  if (!token) return {};
  const store = getIaiOrdersSerialsStore(settings);
  const entry = store[token];
  return entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
}

function getProductSerials(order, product, index = 0, settings = null) {
  const serialsByItem = getOrderItemSerials(order, settings);
  return normalizeSerialList(serialsByItem?.[buildProductSerialKey(product, index)] || []);
}

function buildOrderSummary(order, lang = IAI_ORDERS_DEFAULT_LANG) {
  const status = pickOrderStatus(order);
  return {
    token: lookupOrderToken(order),
    orderId: String(order?.orderId || "-"),
    orderSerialNumber: String(order?.orderSerialNumber || "-"),
    status,
    statusLabel: formatOrderStatusI18n(status, lang),
    statusTone: orderStatusTone(status),
    isClosedStatus: CLOSED_STATUSES.has(status),
    clientName: pickClientName(order),
    clientEmail: pickClientEmail(order),
    clientPhone: pickClientPhone(order),
    orderDate: String(order?.orderDetails?.orderAddDate || ""),
    currency: pickOrderCurrency(order),
    totalValue: pickOrderTotal(order),
    productsCount: pickProducts(order).length,
  };
}

function buildWzHtml(order, lang = IAI_ORDERS_DEFAULT_LANG) {
  const summary = buildOrderSummary(order, lang);
  const products = pickProducts(order);
  const payment = order?.orderDetails?.payments || {};
  const orderCurrency = payment?.orderCurrency || {};
  const currency = summary.currency;

  const rows = products
    .map((product, index) => {
      const qty = pickProductQty(product);
      const gross = pickProductGross(product);
      const net = pickProductNet(product);
      const vat = Number(product?.productVat || 0);

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(pickProductName(product))}</strong>
            <div class="muted">${escapeHtml(pickProductCode(product))}</div>
          </td>
          <td>${escapeHtml(pickProductVariant(product))}</td>
          <td class="right">${qty.toLocaleString(getLangLocale(lang))}</td>
          <td class="right">${escapeHtml(formatMoney(net, currency, lang))}</td>
          <td class="right">${escapeHtml(formatMoney(gross, currency, lang))}</td>
          <td class="right">${vat ? `${String(vat).replace(".", ",")}%` : "-"}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>WZ ${escapeHtml(summary.orderId)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:28px;color:#111827}
    h1,h2,h3,p{margin:0}
    .top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}
    .box{border:1px solid #d1d5db;border-radius:14px;padding:14px 16px}
    .grow{flex:1}
    .muted{color:#6b7280;font-size:12px;margin-top:4px}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:20px}
    .meta .box strong{display:block;font-size:18px;margin-top:6px}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    th,td{border:1px solid #d1d5db;padding:10px 12px;font-size:12px;vertical-align:top}
    th{background:#eff6ff;text-align:left}
    .right{text-align:right}
    .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px}
    .toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:18px}
    .toolbar button{padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#111827;color:#fff;font-weight:700;cursor:pointer}
    @media print {.toolbar{display:none} body{margin:12mm}}
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Drukuj</button>
    <button type="button" data-export-pdf>Eksportuj PDF</button>
  </div>
  <div class="top">
    <div class="box grow">
      <h1>Wydanie zewnętrzne (WZ)</h1>
      <p class="muted">Zamówienie IAI ${escapeHtml(summary.orderId)} / SN ${escapeHtml(summary.orderSerialNumber)}</p>
    </div>
    <div class="box">
      <p>Status</p>
      <strong>${escapeHtml(summary.statusLabel)}</strong>
      <p class="muted">${escapeHtml(formatDateTime(summary.orderDate))}</p>
    </div>
  </div>

  <div class="meta">
    <div class="box">
      <p>Klient</p>
      <strong>${escapeHtml(summary.clientName)}</strong>
      <div class="muted">${escapeHtml(pickBillingAddress(order) || "-")}</div>
      <div class="muted">${escapeHtml(summary.clientEmail)}</div>
      <div class="muted">${escapeHtml(summary.clientPhone)}</div>
    </div>
    <div class="box">
      <p>Dostawa</p>
      <strong>${escapeHtml(order?.orderDetails?.dispatch?.courierName || "-")}</strong>
      <div class="muted">${escapeHtml(pickDeliveryAddress(order) || "-")}</div>
      <div class="muted">Termin: ${escapeHtml(formatDateTime(order?.orderDetails?.dispatch?.estimatedDeliveryDate || order?.orderDetails?.orderDispatchDate || ""))}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:52px;">Lp</th>
        <th>Produkt</th>
        <th style="width:120px;">Wariant</th>
        <th style="width:90px;" class="right">Ilosc</th>
        <th style="width:130px;" class="right">Netto</th>
        <th style="width:130px;" class="right">Brutto</th>
        <th style="width:90px;" class="right">VAT</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="7">Brak pozycji w zamówieniu.</td></tr>'}</tbody>
  </table>

  <div class="summary">
      <div class="box"><p>Produkty</p><strong>${escapeHtml(money(orderCurrency?.orderProductsCost || 0, currency))}</strong></div>
    <div class="box"><p>Dostawa</p><strong>${escapeHtml(money(orderCurrency?.orderDeliveryCost || 0, currency))}</strong></div>
    <div class="box"><p>Płatność</p><strong>${escapeHtml(money(orderCurrency?.orderPayformCost || 0, currency))}</strong></div>
    <div class="box"><p>Razem</p><strong>${escapeHtml(money(summary.totalValue, currency))}</strong></div>
  </div>
</body>
</html>`;
}

function buildWzHtmlLocalized(order, lang = IAI_ORDERS_DEFAULT_LANG, settings = null) {
  const summary = buildOrderSummary(order, lang);
  const products = pickProducts(order);
  const payment = order?.orderDetails?.payments || {};
  const orderCurrency = payment?.orderCurrency || {};
  const currency = summary.currency;
  const footerMarkup = buildDocumentFooterMarkup(lang, settings);
  const companyLines = getCompanyFooterLines(normalizeIaiOrdersLang(lang)).filter(Boolean);
  const senderLine = companyLines.slice(0, 2).join(" | ") || "ESUS IT";
  const deliveryDate = formatDateForDocument(
    order?.orderDetails?.dispatch?.estimatedDeliveryDate || order?.orderDetails?.orderDispatchDate || summary.orderDate,
    lang
  );
  const orderDate = formatDateForDocument(summary.orderDate, lang);
  const customerNumber = pickClientNumber(order);
  const recipientName = pickDeliveryName(order) || summary.clientName;
  const deliveryAddress = pickDeliveryAddress(order) || pickBillingAddress(order) || "-";
  const shippingCarrier = order?.orderDetails?.dispatch?.courierName || "-";
  const notes = [order?.orderDetails?.clientNoteToOrder, order?.orderDetails?.clientNoteToCourier]
    .filter(Boolean)
    .join(" | ");

  const rows = products
    .map((product, index) => {
      const qty = pickProductQty(product);
      const gross = pickProductGross(product);
      const net = pickProductNet(product);
      const vat = Number(product?.productVat || 0);
      const serials = getProductSerials(order, product, index, settings);
      const serialsMarkup = serials.length
        ? `<div class="serial-list">${serials.map((serial) => `<div class="serial">${escapeHtml(serial)}</div>`).join("")}</div>`
        : `<span class="muted">${escapeHtml(t(lang, "serialsEmpty"))}</span>`;

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(pickProductName(product))}</strong>
            <div class="muted">${escapeHtml(pickProductCode(product))}</div>
          </td>
          <td>${escapeHtml(pickProductVariant(product))}</td>
          <td>${serialsMarkup}</td>
          <td class="right">${qty.toLocaleString(getLangLocale(lang))}</td>
          <td class="right">${escapeHtml(formatMoney(net, currency, lang))}</td>
          <td class="right">${escapeHtml(formatMoney(gross, currency, lang))}</td>
          <td class="right">${vat ? `${String(vat).replace(".", ",")}%` : "-"}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(normalizeIaiOrdersLang(lang))}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(t(lang, "wzShort"))} ${escapeHtml(summary.orderId)}</title>
  <style>
    :root{--brand:#007fc5;--brand-soft:#eaf5fc;--text:#111827;--muted:#6b7280;--line:#d4dce6}
    body{font-family:Arial,sans-serif;margin:28px;color:var(--text);font-size:13px}
    h1,h2,h3,p{margin:0}
    .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:10px}
    .brand img{display:block;width:190px;max-width:100%;height:auto}
    .sender-line{font-size:11px;color:var(--muted);margin-top:8px}
    .rule{height:3px;background:var(--brand);margin:10px 0 24px}
    .hero{display:grid;grid-template-columns:minmax(0,1.4fr) 280px;gap:28px;align-items:start;margin-bottom:22px}
    .address-card{padding-top:6px}
    .address-card h1{font-size:42px;line-height:1;color:var(--brand);margin-bottom:18px}
    .address-card h2{font-size:16px;margin:0 0 8px}
    .address-block{line-height:1.55;white-space:pre-line}
    .info-card{background:#f3f4f6;padding:18px 20px}
    .info-row{display:grid;grid-template-columns:1.1fr 1fr;gap:18px;padding:4px 0}
    .info-row .label{color:#4b5563}
    .info-row .value{font-weight:700;text-align:right}
    .section{margin:18px 0 14px}
    .section p{line-height:1.55}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border-bottom:1px solid var(--line);padding:10px 10px;font-size:12px;vertical-align:top}
    thead th{border-top:3px solid var(--brand);border-bottom:1px solid var(--line);background:transparent;text-align:left}
    .right{text-align:right}
    .muted{color:var(--muted);font-size:11px;margin-top:4px}
    .serial-list{display:flex;flex-direction:column;gap:4px}
    .serial{padding:4px 6px;border-radius:8px;background:var(--brand-soft);border:1px solid #c7deef;font-size:11px;line-height:1.35}
    .summary{margin-top:26px;margin-left:auto;max-width:360px}
    .summary-row{display:grid;grid-template-columns:1fr auto;gap:18px;padding:8px 0;border-bottom:1px solid #e5e7eb}
    .summary-row.total{border-bottom:none;color:var(--brand);font-size:16px;font-weight:700;padding-top:14px}
    .toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:18px}
    .toolbar button{padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#111827;color:#fff;font-weight:700;cursor:pointer}
    .footer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:54px;padding-top:18px;border-top:1px solid var(--line);font-size:11px;line-height:1.6}
    .footer-col{white-space:pre-line}
    .footer-accent{height:18px;background:var(--brand);margin:26px -28px -28px}
    @media print {.toolbar{display:none} body{margin:12mm}.footer-accent{margin-left:-12mm;margin-right:-12mm;margin-bottom:-12mm}}
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">${escapeHtml(t(lang, "printDocument"))}</button>
    <button type="button" data-export-pdf>${escapeHtml(t(lang, "exportPdf"))}</button>
  </div>
  <div class="brand">
    <div>
      <img src="${escapeHtml(ESUS_LOGO_URL)}" alt="ESUS IT" />
      <div class="sender-line">${escapeHtml(senderLine)}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="hero">
    <div class="address-card">
      <h1>${escapeHtml(t(lang, "wzTitle"))}</h1>
      <div class="muted">${escapeHtml(t(lang, "recipient"))}</div>
      <h2>${escapeHtml(recipientName)}</h2>
      <div class="address-block">${escapeHtml(deliveryAddress)}</div>
    </div>
    <div class="info-card">
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "documentDate"))}</div><div class="value">${escapeHtml(deliveryDate)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "documentNumber"))}</div><div class="value">${escapeHtml(summary.orderSerialNumber || summary.orderId)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "customerNumber"))}</div><div class="value">${escapeHtml(String(customerNumber))}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "orderDateLabel"))}</div><div class="value">${escapeHtml(orderDate)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "shipping"))}</div><div class="value">${escapeHtml(shippingCarrier)}</div></div>
    </div>
  </div>
  <div class="section">
    <p>${escapeHtml(t(lang, "orderSn", { orderId: summary.orderId, serial: summary.orderSerialNumber }))}</p>
    ${
      notes
        ? `<p class="muted">${escapeHtml(notes)}</p>`
        : ""
    }
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:52px;">${escapeHtml(t(lang, "lp"))}</th>
        <th>${escapeHtml(t(lang, "product"))}</th>
        <th style="width:120px;">${escapeHtml(t(lang, "variant"))}</th>
        <th style="width:220px;">${escapeHtml(t(lang, "serialNumbers"))}</th>
        <th style="width:90px;" class="right">${escapeHtml(t(lang, "qty"))}</th>
        <th style="width:130px;" class="right">${escapeHtml(t(lang, "net"))}</th>
        <th style="width:130px;" class="right">${escapeHtml(t(lang, "gross"))}</th>
        <th style="width:90px;" class="right">${escapeHtml(t(lang, "vat"))}</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="8">${escapeHtml(t(lang, "noItemsInOrder"))}</td></tr>`}</tbody>
  </table>

  <div class="summary">
    <div class="summary-row"><div>${escapeHtml(t(lang, "products"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderProductsCost || 0, currency, lang))}</div></div>
    <div class="summary-row"><div>${escapeHtml(t(lang, "shipping"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderDeliveryCost || 0, currency, lang))}</div></div>
    <div class="summary-row"><div>${escapeHtml(t(lang, "payment"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderPayformCost || 0, currency, lang))}</div></div>
    <div class="summary-row total"><div>${escapeHtml(t(lang, "total"))}</div><div>${escapeHtml(formatMoney(summary.totalValue, currency, lang))}</div></div>
  </div>
  <div class="footer">${footerMarkup}</div>
  <div class="footer-accent"></div>
</body>
</html>`;
}

function buildInvoiceHtmlLocalized(order, lang = IAI_ORDERS_DEFAULT_LANG, settings = null) {
  const summary = buildOrderSummary(order, lang);
  const products = pickProducts(order);
  const payment = order?.orderDetails?.payments || {};
  const orderCurrency = payment?.orderCurrency || {};
  const currency = summary.currency;
  const footerMarkup = buildDocumentFooterMarkup(lang, settings);
  const companyLines = getCompanyFooterLines(normalizeIaiOrdersLang(lang)).filter(Boolean);
  const senderLine = companyLines.slice(0, 2).join(" | ") || "ESUS IT";
  const invoiceDate = formatDateForDocument(summary.orderDate, lang);
  const customerNumber = pickClientNumber(order);
  const paymentDays = String(payment?.orderPaymentDays || "-");
  const dueDate = addDaysToDateString(summary.orderDate, payment?.orderPaymentDays || 0, lang);
  const billingName = pickBillingName(order) || summary.clientName;
  const clientTaxId = pickClientTaxId(order);
  const billingAddress = pickBillingAddress(order) || pickDeliveryAddress(order) || "-";
  const unitRows = products
    .map((product, index) => {
      const qty = pickProductQty(product) || 0;
      const gross = pickProductGross(product);
      const net = pickProductNet(product);
      const vat = Number(product?.productVat || 0);
      const unitNet = qty ? net / qty : net;
      const totalVat = gross - net;
      const serials = getProductSerials(order, product, index, settings);
      const serialsMarkup = serials.length
        ? `<div class="serial-list">${serials.map((serial) => `<div class="serial">${escapeHtml(serial)}</div>`).join("")}</div>`
        : `<span class="muted">${escapeHtml(t(lang, "serialsEmpty"))}</span>`;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(pickProductName(product))}</strong>
            <div class="muted">${escapeHtml(pickProductCode(product))}</div>
            <div class="muted">${escapeHtml(pickProductVariant(product))}</div>
          </td>
          <td class="right">${qty.toLocaleString(getLangLocale(lang))}</td>
          <td class="right">${escapeHtml(formatMoney(unitNet, currency, lang))}</td>
          <td class="right">${vat ? `${String(vat).replace(".", ",")}%` : "-"}</td>
          <td class="right">${escapeHtml(formatMoney(totalVat, currency, lang))}</td>
          <td class="right">${escapeHtml(formatMoney(gross, currency, lang))}</td>
        </tr>
        <tr class="serial-row">
          <td colspan="6">${serialsMarkup}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(normalizeIaiOrdersLang(lang))}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(t(lang, "invoice"))} ${escapeHtml(summary.orderId)}</title>
  <style>
    :root{--brand:#007fc5;--brand-soft:#eaf5fc;--text:#111827;--muted:#6b7280;--line:#d4dce6}
    body{font-family:Arial,sans-serif;margin:28px;color:var(--text);font-size:13px}
    h1,h2,h3,p{margin:0}
    .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:10px}
    .brand img{display:block;width:190px;max-width:100%;height:auto}
    .sender-line{font-size:11px;color:var(--muted);margin-top:8px}
    .rule{height:3px;background:var(--brand);margin:10px 0 24px}
    .hero{display:grid;grid-template-columns:minmax(0,1.4fr) 310px;gap:28px;align-items:start;margin-bottom:22px}
    .address-card{padding-top:6px}
    .address-card h1{font-size:42px;line-height:1;color:var(--brand);margin-bottom:18px}
    .address-card h2{font-size:16px;margin:0 0 8px}
    .address-block{line-height:1.55;white-space:pre-line}
    .info-card{background:#f3f4f6;padding:18px 20px}
    .info-row{display:grid;grid-template-columns:1.1fr 1fr;gap:18px;padding:4px 0}
    .info-row .label{color:#4b5563}
    .info-row .value{font-weight:700;text-align:right}
    .section{margin:18px 0 14px}
    .section p{line-height:1.55}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border-bottom:1px solid var(--line);padding:10px 10px;font-size:12px;vertical-align:top}
    thead th{border-top:3px solid var(--brand);border-bottom:1px solid var(--line);background:transparent;text-align:left}
    .serial-row td{padding-top:0;padding-bottom:10px}
    .right{text-align:right}
    .muted{color:var(--muted);font-size:11px;margin-top:4px}
    .serial-list{display:flex;flex-wrap:wrap;gap:6px}
    .serial{padding:4px 6px;border-radius:8px;background:var(--brand-soft);border:1px solid #c7deef;font-size:11px;line-height:1.35}
    .summary{margin-top:26px;margin-left:auto;max-width:360px}
    .summary-row{display:grid;grid-template-columns:1fr auto;gap:18px;padding:8px 0;border-bottom:1px solid #e5e7eb}
    .summary-row.total{border-bottom:none;color:var(--brand);font-size:16px;font-weight:700;padding-top:14px}
    .toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:18px}
    .toolbar button{padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#111827;color:#fff;font-weight:700;cursor:pointer}
    .footer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:54px;padding-top:18px;border-top:1px solid var(--line);font-size:11px;line-height:1.6}
    .footer-col{white-space:pre-line}
    .footer-accent{height:18px;background:var(--brand);margin:26px -28px -28px}
    @media print {.toolbar{display:none} body{margin:12mm}.footer-accent{margin-left:-12mm;margin-right:-12mm;margin-bottom:-12mm}}
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">${escapeHtml(t(lang, "printDocument"))}</button>
    <button type="button" data-export-pdf>${escapeHtml(t(lang, "exportPdf"))}</button>
  </div>
  <div class="brand">
    <div>
      <img src="${escapeHtml(ESUS_LOGO_URL)}" alt="ESUS IT" />
      <div class="sender-line">${escapeHtml(senderLine)}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="hero">
    <div class="address-card">
      <h1>${escapeHtml(t(lang, "invoiceDocTitle"))}</h1>
      <div class="muted">${escapeHtml(t(lang, "customer"))}</div>
      <h2>${escapeHtml(billingName)}</h2>
      <div class="address-block">${escapeHtml(billingAddress)}</div>
      <div class="muted">${escapeHtml(t(lang, "taxId"))}: ${escapeHtml(clientTaxId)}</div>
    </div>
    <div class="info-card">
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "documentDate"))}</div><div class="value">${escapeHtml(invoiceDate)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "documentNumber"))}</div><div class="value">${escapeHtml(summary.orderId)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "customerNumber"))}</div><div class="value">${escapeHtml(String(customerNumber))}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "paymentTarget"))}</div><div class="value">${escapeHtml(paymentDays)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "status"))}</div><div class="value">${escapeHtml(summary.statusLabel)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "dueDateLabel"))}</div><div class="value">${escapeHtml(dueDate)}</div></div>
    </div>
  </div>
  <div class="section">
    <p>${escapeHtml(t(lang, "invoiceDocSubtitle"))}</p>
    <p class="muted">${escapeHtml(t(lang, "orderSn", { orderId: summary.orderId, serial: summary.orderSerialNumber }))}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>${escapeHtml(t(lang, "product"))}</th>
        <th style="width:90px;" class="right">${escapeHtml(t(lang, "qty"))}</th>
        <th style="width:130px;" class="right">${escapeHtml(t(lang, "net"))}</th>
        <th style="width:90px;" class="right">${escapeHtml(t(lang, "vat"))}</th>
        <th style="width:130px;" class="right">${escapeHtml(t(lang, "vat"))}</th>
        <th style="width:130px;" class="right">${escapeHtml(t(lang, "gross"))}</th>
      </tr>
    </thead>
    <tbody>${unitRows || `<tr><td colspan="6">${escapeHtml(t(lang, "noItemsInOrder"))}</td></tr>`}</tbody>
  </table>

  <div class="summary">
    <div class="summary-row"><div>${escapeHtml(t(lang, "products"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderProductsCost || 0, currency, lang))}</div></div>
    <div class="summary-row"><div>${escapeHtml(t(lang, "payment"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderPayformCost || 0, currency, lang))}</div></div>
    <div class="summary-row"><div>${escapeHtml(t(lang, "shipping"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderDeliveryCost || 0, currency, lang))}</div></div>
    <div class="summary-row total"><div>${escapeHtml(t(lang, "invoiceDocTitle"))}</div><div>${escapeHtml(formatMoney(summary.totalValue, currency, lang))}</div></div>
  </div>
  <div class="footer">${footerMarkup}</div>
  <div class="footer-accent"></div>
</body>
</html>`;
}

function buildConfirmationHtmlLocalized(order, lang = IAI_ORDERS_DEFAULT_LANG, settings = null) {
  const summary = buildOrderSummary(order, lang);
  const products = pickProducts(order);
  const payment = order?.orderDetails?.payments || {};
  const orderCurrency = payment?.orderCurrency || {};
  const currency = summary.currency;
  const footerMarkup = buildDocumentFooterMarkup(lang, settings);
  const companyLines = getCompanyFooterLines(normalizeIaiOrdersLang(lang)).filter(Boolean);
  const senderLine = companyLines.slice(0, 2).join(" | ") || "ESUS IT";
  const documentDate = formatDateForDocument(summary.orderDate, lang);
  const customerNumber = pickClientNumber(order);
  const billingName = pickBillingName(order) || summary.clientName;
  const clientTaxId = pickClientTaxId(order);
  const billingAddress = pickBillingAddress(order) || pickDeliveryAddress(order) || "-";
  const shippingCarrier = order?.orderDetails?.dispatch?.courierName || "-";
  const leadTimeText = pickOrderLeadTimeText(order, lang);

  const rows = products
    .map((product, index) => {
      const qty = pickProductQty(product) || 0;
      const gross = pickProductGross(product);
      const net = pickProductNet(product);
      const vat = Number(product?.productVat || 0);
      const serials = getProductSerials(order, product, index, settings);
      const serialsMarkup = serials.length
        ? `<div class="serial-list">${serials.map((serial) => `<div class="serial">${escapeHtml(serial)}</div>`).join("")}</div>`
        : `<span class="muted">${escapeHtml(t(lang, "serialsEmpty"))}</span>`;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(pickProductName(product))}</strong>
            <div class="muted">${escapeHtml(pickProductCode(product))}</div>
            <div class="muted">${escapeHtml(pickProductVariant(product))}</div>
          </td>
          <td class="right">${qty.toLocaleString(getLangLocale(lang))}</td>
          <td class="right">${escapeHtml(formatMoney(net, currency, lang))}</td>
          <td class="right">${vat ? `${String(vat).replace(".", ",")}%` : "-"}</td>
          <td class="right">${escapeHtml(formatMoney(gross, currency, lang))}</td>
        </tr>
        <tr class="serial-row">
          <td colspan="5">${serialsMarkup}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(normalizeIaiOrdersLang(lang))}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(t(lang, "confirmationDocTitle"))} ${escapeHtml(summary.orderId)}</title>
  <style>
    :root{--brand:#007fc5;--brand-soft:#eaf5fc;--text:#111827;--muted:#6b7280;--line:#d4dce6}
    body{font-family:Arial,sans-serif;margin:28px;color:var(--text);font-size:13px}
    h1,h2,h3,p{margin:0}
    .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:10px}
    .brand img{display:block;width:190px;max-width:100%;height:auto}
    .sender-line{font-size:11px;color:var(--muted);margin-top:8px}
    .rule{height:3px;background:var(--brand);margin:10px 0 24px}
    .hero{display:grid;grid-template-columns:minmax(0,1.4fr) 310px;gap:28px;align-items:start;margin-bottom:22px}
    .address-card{padding-top:6px}
    .address-card h1{font-size:36px;line-height:1.08;color:var(--brand);margin-bottom:18px}
    .address-card h2{font-size:16px;margin:0 0 8px}
    .address-block{line-height:1.55;white-space:pre-line}
    .info-card{background:#f3f4f6;padding:18px 20px}
    .info-row{display:grid;grid-template-columns:1.1fr 1fr;gap:18px;padding:4px 0}
    .info-row .label{color:#4b5563}
    .info-row .value{font-weight:700;text-align:right}
    .notice{margin:18px 0 20px;padding:14px 16px;border-radius:16px;background:var(--brand-soft);border:1px solid #c7deef}
    .notice h3{font-size:13px;font-weight:800;margin-bottom:6px;color:var(--brand)}
    .notice p{line-height:1.55}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border-bottom:1px solid var(--line);padding:10px 10px;font-size:12px;vertical-align:top}
    thead th{border-top:3px solid var(--brand);border-bottom:1px solid var(--line);background:transparent;text-align:left}
    .serial-row td{padding-top:0;padding-bottom:10px}
    .right{text-align:right}
    .muted{color:var(--muted);font-size:11px;margin-top:4px}
    .serial-list{display:flex;flex-wrap:wrap;gap:6px}
    .serial{padding:4px 6px;border-radius:8px;background:#fff;border:1px solid #c7deef;font-size:11px;line-height:1.35}
    .summary{margin-top:26px;margin-left:auto;max-width:360px}
    .summary-row{display:grid;grid-template-columns:1fr auto;gap:18px;padding:8px 0;border-bottom:1px solid #e5e7eb}
    .summary-row.total{border-bottom:none;color:var(--brand);font-size:16px;font-weight:700;padding-top:14px}
    .toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:18px}
    .toolbar button{padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#111827;color:#fff;font-weight:700;cursor:pointer}
    .footer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:54px;padding-top:18px;border-top:1px solid var(--line);font-size:11px;line-height:1.6}
    .footer-col{white-space:pre-line}
    .footer-accent{height:18px;background:var(--brand);margin:26px -28px -28px}
    @media print {.toolbar{display:none} body{margin:12mm}.footer-accent{margin-left:-12mm;margin-right:-12mm;margin-bottom:-12mm}}
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">${escapeHtml(t(lang, "printDocument"))}</button>
    <button type="button" data-export-pdf>${escapeHtml(t(lang, "exportPdf"))}</button>
  </div>
  <div class="brand">
    <div>
      <img src="${escapeHtml(ESUS_LOGO_URL)}" alt="ESUS IT" />
      <div class="sender-line">${escapeHtml(senderLine)}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="hero">
    <div class="address-card">
      <h1>${escapeHtml(t(lang, "confirmationDocTitle"))}</h1>
      <div class="muted">${escapeHtml(t(lang, "customer"))}</div>
      <h2>${escapeHtml(billingName)}</h2>
      <div class="address-block">${escapeHtml(billingAddress)}</div>
      <div class="muted">${escapeHtml(t(lang, "taxId"))}: ${escapeHtml(clientTaxId)}</div>
    </div>
    <div class="info-card">
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "documentDate"))}</div><div class="value">${escapeHtml(documentDate)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "documentNumber"))}</div><div class="value">${escapeHtml(summary.orderId)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "customerNumber"))}</div><div class="value">${escapeHtml(String(customerNumber))}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "orderDateLabel"))}</div><div class="value">${escapeHtml(documentDate)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "shipping"))}</div><div class="value">${escapeHtml(shippingCarrier)}</div></div>
      <div class="info-row"><div class="label">${escapeHtml(t(lang, "status"))}</div><div class="value">${escapeHtml(summary.statusLabel)}</div></div>
    </div>
  </div>

  <div class="notice">
    <h3>${escapeHtml(t(lang, "confirmationLeadTimeTitle"))}</h3>
    <p>${escapeHtml(leadTimeText)}</p>
    <p class="muted">${escapeHtml(t(lang, "confirmationDocSubtitle"))}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>${escapeHtml(t(lang, "product"))}</th>
        <th style="width:90px;" class="right">${escapeHtml(t(lang, "qty"))}</th>
        <th style="width:130px;" class="right">${escapeHtml(t(lang, "net"))}</th>
        <th style="width:90px;" class="right">${escapeHtml(t(lang, "vat"))}</th>
        <th style="width:130px;" class="right">${escapeHtml(t(lang, "gross"))}</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="5">${escapeHtml(t(lang, "noItemsInOrder"))}</td></tr>`}</tbody>
  </table>

  <div class="summary">
    <div class="summary-row"><div>${escapeHtml(t(lang, "products"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderProductsCost || 0, currency, lang))}</div></div>
    <div class="summary-row"><div>${escapeHtml(t(lang, "payment"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderPayformCost || 0, currency, lang))}</div></div>
    <div class="summary-row"><div>${escapeHtml(t(lang, "shipping"))}</div><div>${escapeHtml(formatMoney(orderCurrency?.orderDeliveryCost || 0, currency, lang))}</div></div>
    <div class="summary-row total"><div>${escapeHtml(t(lang, "total"))}</div><div>${escapeHtml(formatMoney(summary.totalValue, currency, lang))}</div></div>
  </div>
  <div class="footer">${footerMarkup}</div>
  <div class="footer-accent"></div>
</body>
</html>`;
}

function sameOrder(left, token) {
  const value = String(token || "").trim();
  if (!value) return false;
  return (
    String(left?.orderId || "").trim() === value ||
    String(left?.orderSerialNumber || "").trim() === value
  );
}

export function initIaiOrdersPanel({ onAvailabilityChange } = {}) {
  const view = q("offersIaiOrdersView");
  if (!view) {
    return {
      activate: async () => false,
      syncAvailability: async () => false,
    };
  }

  const listMeta = q("iaiOrdersMeta");
  const sourceMeta = q("iaiOrdersSourceMeta");
  const langSelect = q("iaiOrdersLangSelect");
  const textarea = q("iaiOrdersLookup");
  const applyBtn = q("iaiOrdersApply");
  const clearBtn = q("iaiOrdersClearLookup");
  const reloadBtn = q("iaiOrdersReload");
  const tableWrap = q("iaiOrdersTableWrap");
  const tbody = q("iaiOrdersTbody");
  const emptyState = q("iaiOrdersEmptyState");
  const emptyTitle = q("iaiOrdersEmptyTitle");
  const emptyText = q("iaiOrdersEmptyText");
  const modalBackdrop = q("iaiOrdersModalBackdrop");
  const modalClose = q("iaiOrdersModalClose");
  const modalTitle = q("iaiOrdersModalTitle");
  const modalBody = q("iaiOrdersModalBody");
  const modalDocType = q("iaiOrdersModalDocType");
  const modalGenerate = q("iaiOrdersModalGenerate");
  const serialPromptBackdrop = q("iaiOrdersSerialPromptBackdrop");
  const serialPromptClose = q("iaiOrdersSerialPromptClose");
  const serialPromptBody = q("iaiOrdersSerialPromptBody");
  const serialPromptSkip = q("iaiOrdersSerialPromptSkip");
  const serialPromptSave = q("iaiOrdersSerialPromptSave");

  let lastSettings = null;
  let lastOrders = [];
  let previewOrder = null;
  let currentLang = IAI_ORDERS_DEFAULT_LANG;
  let currentDocumentType = "wz";
  let pendingDocument = null;

  function getOrderSerialsDraft(order, settings = lastSettings) {
    return { ...getOrderItemSerials(order, settings) };
  }

  function collectPreviewSerials(order = previewOrder) {
    const token = lookupOrderToken(order);
    if (!token || !modalBody) return {};

    const next = {};
    const fields = modalBody.querySelectorAll("textarea[data-serial-item-key]");
    for (const field of fields) {
      if (field.dataset.serialOrderToken !== token) continue;
      const itemKey = String(field.dataset.serialItemKey || "").trim();
      if (!itemKey) continue;
      const serials = normalizeSerialList(field.value);
      if (serials.length) {
        next[itemKey] = serials;
      }
    }
    return next;
  }

  async function persistOrderSerials(order = previewOrder, serialsByItem = collectPreviewSerials(order)) {
    const token = lookupOrderToken(order);
    if (!token) return null;

    const currentStore = {
      ...getIaiOrdersSerialsStore(lastSettings),
    };

    if (serialsByItem && Object.keys(serialsByItem).length) {
      currentStore[token] = serialsByItem;
    } else {
      delete currentStore[token];
    }

    const nextSettings = await setUserSettings({
      modulePrefs: {
        iaiOrders: {
          orderItemSerials: currentStore,
        },
      },
    });
    lastSettings = nextSettings;
    return nextSettings;
  }

  if (modalBackdrop && modalBackdrop.parentElement !== document.body) {
    document.body.appendChild(modalBackdrop);
  }
  if (serialPromptBackdrop && serialPromptBackdrop.parentElement !== document.body) {
    document.body.appendChild(serialPromptBackdrop);
  }

  function syncModalDocumentPicker() {
    if (!modalDocType) return;
    modalDocType.innerHTML = buildDocumentTypeOptionsMarkup(currentLang, currentDocumentType);
    modalDocType.value = normalizeIaiOrdersDocumentType(currentDocumentType);
  }

  function applyStaticTranslations() {
    const translations = [
      ["iaiOrdersHeroEyebrow", "moduleEyebrow"],
      ["iaiOrdersHeroTitle", "heroTitle"],
      ["iaiOrdersHeroText", "heroText"],
      ["iaiOrdersLangLabel", "langLabel"],
      ["iaiOrdersMetaLabel", "metaLabel"],
      ["iaiOrdersSourceLabel", "sourceLabel"],
      ["iaiOrdersPanelTitle", "panelTitle"],
      ["iaiOrdersApplyText", "apply"],
      ["iaiOrdersLookupLabel", "lookupLabel"],
      ["iaiOrdersHeadOrder", "headOrder"],
      ["iaiOrdersHeadStatus", "headStatus"],
      ["iaiOrdersHeadDate", "headDate"],
      ["iaiOrdersHeadValue", "headValue"],
      ["iaiOrdersHeadActions", "headActions"],
      ["iaiOrdersModalEyebrow", "orderDetails"],
      ["iaiOrdersModalGenerateText", "openDocument"],
      ["iaiOrdersModalCloseText", "close"],
      ["iaiOrdersSerialPromptTitle", "serialPromptTitle"],
      ["iaiOrdersSerialPromptText", "serialPromptText"],
      ["iaiOrdersSerialPromptSkip", "serialPromptSkip"],
      ["iaiOrdersSerialPromptSaveText", "serialPromptSave"],
    ];

    for (const [id, key] of translations) {
      const node = q(id);
      if (node) node.textContent = t(currentLang, key);
    }

    if (textarea) {
      textarea.placeholder = t(currentLang, "lookupPlaceholder");
    }
    if (clearBtn) {
      clearBtn.title = t(currentLang, "clear");
      clearBtn.setAttribute("aria-label", t(currentLang, "clear"));
    }
    if (reloadBtn) {
      reloadBtn.title = t(currentLang, "reload");
      reloadBtn.setAttribute("aria-label", t(currentLang, "reload"));
    }
    if (serialPromptClose) {
      serialPromptClose.title = t(currentLang, "serialPromptClose");
      serialPromptClose.setAttribute("aria-label", t(currentLang, "serialPromptClose"));
    }
    const modalDocTypeLabel = q("iaiOrdersModalDocTypeLabel");
    if (modalDocTypeLabel) {
      modalDocTypeLabel.textContent = t(currentLang, "documentType");
    }
    if (modalDocType) {
      modalDocType.setAttribute("aria-label", t(currentLang, "documentType"));
    }
    syncModalDocumentPicker();
  }

  async function persistModuleLanguage(lang) {
    const normalizedLang = normalizeIaiOrdersLang(lang);
    currentLang = normalizedLang;
    if (langSelect && langSelect.value !== normalizedLang) {
      langSelect.value = normalizedLang;
    }
    applyStaticTranslations();
    await setUserSettings({
      modulePrefs: {
        iaiOrders: {
          lang: normalizedLang,
        },
      },
    });
  }

  function setLoading(isLoading, text = t(currentLang, "loadingOrdersText")) {
    if (!emptyState || !emptyTitle || !emptyText || !tableWrap) return;

    if (isLoading) {
      emptyState.style.display = "flex";
      emptyTitle.textContent = t(currentLang, "loadingOrdersTitle");
      emptyText.textContent = text;
      tableWrap.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    tableWrap.style.display = "";
  }

  function setEmpty(title, text) {
    if (!emptyState || !emptyTitle || !emptyText || !tableWrap) return;
    emptyState.style.display = "flex";
    emptyTitle.textContent = title;
    emptyText.textContent = text;
    tableWrap.style.display = "none";
  }

  function hideEmpty() {
    if (!emptyState || !tableWrap) return;
    emptyState.style.display = "none";
    tableWrap.style.display = "";
  }

  function renderMeta(metaText = "-", sourceText = "") {
    if (listMeta) listMeta.textContent = metaText;
    if (sourceMeta) sourceMeta.textContent = sourceText;
  }

  async function fetchOrderByToken(token) {
    const baseOrder = lastOrders.find((item) => sameOrder(item, token)) || null;

    const result = await window.esusAPI.idosellOrderGet({ manualLookup: token });
    const detailedOrder = Array.isArray(result?.orders)
      ? result.orders.find((item) => sameOrder(item, token)) || result.orders[0] || null
      : null;

    if (baseOrder && detailedOrder) {
      const detailedProducts = pickProducts(detailedOrder);
      const baseProducts = pickProducts(baseOrder);
      const baseClient = baseOrder?.clientResult || {};
      const detailedClient = detailedOrder?.clientResult || {};

      return {
        ...baseOrder,
        ...detailedOrder,
        clientResult: {
          ...mergeNonEmptyRecords(baseClient, detailedClient),
          clientAccount: mergeNonEmptyRecords(
            baseClient?.clientAccount,
            detailedClient?.clientAccount
          ),
          clientBillingAddress: mergeNonEmptyRecords(
            baseClient?.clientBillingAddress,
            detailedClient?.clientBillingAddress
          ),
          clientDeliveryAddress: mergeNonEmptyRecords(
            baseClient?.clientDeliveryAddress,
            detailedClient?.clientDeliveryAddress
          ),
        },
        orderDetails: detailedOrder.orderDetails || baseOrder.orderDetails,
        productsResults: detailedProducts.length ? detailedProducts : baseProducts,
      };
    }

    return detailedOrder || baseOrder || null;
  }

  function closeSerialPrompt() {
    pendingDocument = null;
    if (serialPromptBackdrop) serialPromptBackdrop.style.display = "none";
    if (serialPromptBody) serialPromptBody.innerHTML = "";
  }

  function collectSerialPromptValues() {
    const values = {};
    if (!serialPromptBody) return values;

    for (const field of serialPromptBody.querySelectorAll("textarea[data-serial-prompt-key]")) {
      const itemKey = String(field.dataset.serialPromptKey || "").trim();
      const serials = normalizeSerialList(field.value);
      if (itemKey && serials.length) values[itemKey] = serials;
    }
    return values;
  }

  async function openSerialPrompt(token, type) {
    const normalizedType = normalizeIaiOrdersDocumentType(type);
    const docLabel = getDocumentTypeLabel(normalizedType, currentLang);

    try {
      const order = await fetchOrderByToken(token);
      if (!order) {
        showToast(t(currentLang, "prepareDocumentFailed", { doc: docLabel }), {
          type: "error",
          ms: 3200,
        });
        return;
      }

      const products = pickProducts(order);
      const serialsByItem = getOrderSerialsDraft(order);
      pendingDocument = { order, token, type: normalizedType };

      if (serialPromptBody) {
        serialPromptBody.innerHTML = products.length
          ? products
              .map((product, index) => {
                const itemKey = buildProductSerialKey(product, index);
                return `
                  <div class="iaiOrdersSerialPromptRow">
                    <div class="iaiOrdersSerialPromptProduct">
                      <strong>${escapeHtml(pickProductName(product))}</strong>
                      <span>${escapeHtml(pickProductCode(product))}</span>
                    </div>
                    <textarea
                      class="iaiOrdersSerialPromptInput"
                      data-serial-prompt-key="${escapeHtml(itemKey)}"
                      rows="2"
                      placeholder="${escapeHtml(t(currentLang, "serialsPlaceholder"))}"
                    >${escapeHtml(serialListToText(serialsByItem[itemKey] || []))}</textarea>
                  </div>
                `;
              })
              .join("")
          : `<div class="iaiOrdersSerialsHelp">${escapeHtml(t(currentLang, "noItemsInResponse"))}</div>`;
      }

      applyStaticTranslations();
      if (serialPromptBackdrop) serialPromptBackdrop.style.display = "flex";
      serialPromptBody?.querySelector("textarea")?.focus();
    } catch (error) {
      console.error(error);
      showToast(t(currentLang, "fetchDetailsIaiFailed"), { type: "error", ms: 3400 });
    }
  }

  async function completeSerialPrompt({ saveSerials }) {
    const pending = pendingDocument;
    if (!pending) return;

    if (saveSerials) {
      await persistOrderSerials(pending.order, collectSerialPromptValues());
    }

    closeSerialPrompt();
    await printDocument(pending.token, pending.type, pending.order);
  }

  async function syncAvailability() {
    lastSettings = await getUserSettings();
    currentLang = getIaiOrdersModuleLang(lastSettings);
    if (langSelect) langSelect.value = currentLang;
    applyStaticTranslations();

    const ready = isIdoSellReady(lastSettings);

    applyBtn.disabled = !ready;
    clearBtn.disabled = !ready;
    reloadBtn.disabled = !ready;
    textarea.disabled = !ready;
    if (langSelect) langSelect.disabled = false;

    onAvailabilityChange?.(ready, lastSettings);

    if (!ready) {
      tbody.innerHTML = "";
      lastOrders = [];
      renderMeta(t(currentLang, "noIntegrationMeta"), t(currentLang, "noIntegrationSource"));
      setEmpty(t(currentLang, "noIntegrationTitle"), t(currentLang, "noIntegrationText"));
      return false;
    }

    return true;
  }

  function renderRows(rows = []) {
    tbody.innerHTML = "";

    if (!Array.isArray(rows) || rows.length === 0) {
      const hasLookup = !!String(textarea?.value || "").trim();
      setEmpty(
        t(currentLang, hasLookup ? "noSearchResultsTitle" : "noOrdersTitle"),
        t(currentLang, hasLookup ? "noSearchResultsText" : "noOrdersText")
      );
      return;
    }

    hideEmpty();

    for (const order of rows) {
      const summary = buildOrderSummary(order, currentLang);
      const tr = document.createElement("tr");
      tr.className = summary.isClosedStatus ? "iaiOrdersRow iaiOrdersRow--closed" : "iaiOrdersRow";
      tr.innerHTML = `
        <td class="num">${escapeHtml(summary.orderSerialNumber)}</td>
        <td>
          <div class="iaiOrdersPrimary">${escapeHtml(summary.orderId)}</div>
          <div class="iaiOrdersSecondary">${escapeHtml(summary.clientName)}</div>
        </td>
        <td>
          <span class="iaiOrdersStatus iaiOrdersStatus--${escapeHtml(summary.statusTone || "default")}">${escapeHtml(summary.statusLabel)}</span>
          ${
            summary.isClosedStatus
              ? `<div class="iaiOrdersSecondary">${escapeHtml(t(currentLang, "manualAdded"))}</div>`
              : `<div class="iaiOrdersSecondary">${escapeHtml(t(currentLang, "activeStatus"))}</div>`
          }
        </td>
        <td class="iaiOrdersSecondary">${escapeHtml(formatDateTime(summary.orderDate, currentLang))}</td>
        <td class="right">
          <div class="iaiOrdersPrimary">${escapeHtml(formatMoney(summary.totalValue, summary.currency, currentLang))}</div>
          <div class="iaiOrdersSecondary">${summary.productsCount} ${escapeHtml(t(currentLang, "positionsShort"))}</div>
        </td>
        <td class="right">
          <div class="row-actions">
            <button class="btn2" data-act="preview">${escapeHtml(t(currentLang, "preview"))}</button>
            <div class="iaiOrdersDocPicker">
              <select class="iaiOrdersDocSelect" data-doc-type aria-label="${escapeHtml(t(currentLang, "documentType"))}">
                ${buildDocumentTypeOptionsMarkup(currentLang, currentDocumentType)}
              </select>
            </div>
            <button
              class="btn2 primary iaiOrdersDocAction"
              data-act="document"
              title="${escapeHtml(t(currentLang, "openDocument"))}"
              aria-label="${escapeHtml(t(currentLang, "openDocument"))}"
            ><i class="fa-solid fa-file-arrow-up"></i></button>
          </div>
        </td>
      `;

      const docTypeSelect = tr.querySelector("[data-doc-type]");
      tr.querySelector('[data-act="preview"]')?.addEventListener("click", () => {
        void openPreview(summary.token);
      });
      docTypeSelect?.addEventListener("change", (event) => {
        currentDocumentType = normalizeIaiOrdersDocumentType(event?.target?.value);
        syncModalDocumentPicker();
      });
      tr.querySelector('[data-act="document"]')?.addEventListener("click", () => {
        void openSerialPrompt(summary.token, docTypeSelect?.value || currentDocumentType);
      });
      tbody.appendChild(tr);
    }
  }

  function renderPreview(order) {
    const summary = buildOrderSummary(order, currentLang);
    const billingAddress = pickBillingAddress(order) || "-";
    const deliveryAddress = pickDeliveryAddress(order) || "-";
    const products = pickProducts(order);
    const payment = order?.orderDetails?.payments || {};
    const dispatch = order?.orderDetails?.dispatch || {};
    const currency = summary.currency;
    const orderToken = lookupOrderToken(order);
    const serialsByItem = getOrderSerialsDraft(order);

    modalTitle.textContent = `${t(currentLang, "order")} ${summary.orderId}`;
    modalBody.innerHTML = `
      <div class="iaiOrdersPreviewGrid">
        <section class="iaiOrdersPreviewCard">
          <div class="iaiOrdersPreviewLabel">${escapeHtml(t(currentLang, "status"))}</div>
          <strong>${escapeHtml(summary.statusLabel)}</strong>
          <div class="iaiOrdersPreviewMeta">SN ${escapeHtml(summary.orderSerialNumber)}</div>
          <div class="iaiOrdersPreviewMeta">${escapeHtml(formatDateTime(summary.orderDate, currentLang))}</div>
        </section>
        <section class="iaiOrdersPreviewCard">
          <div class="iaiOrdersPreviewLabel">${escapeHtml(t(currentLang, "value"))}</div>
          <strong>${escapeHtml(formatMoney(summary.totalValue, currency, currentLang))}</strong>
          <div class="iaiOrdersPreviewMeta">${escapeHtml(`${t(currentLang, "products")}: ${formatMoney(payment?.orderCurrency?.orderProductsCost || 0, currency, currentLang)}`)}</div>
          <div class="iaiOrdersPreviewMeta">${escapeHtml(`${t(currentLang, "shipping")}: ${formatMoney(payment?.orderCurrency?.orderDeliveryCost || 0, currency, currentLang)}`)}</div>
        </section>
        <section class="iaiOrdersPreviewCard">
          <div class="iaiOrdersPreviewLabel">${escapeHtml(t(currentLang, "payment"))}</div>
          <strong>${escapeHtml(formatPaymentTypeI18n(payment?.orderPaymentType || "-", currentLang))}</strong>
          <div class="iaiOrdersPreviewMeta">${escapeHtml(t(currentLang, "termDays", { days: String(payment?.orderPaymentDays || "-") }))}</div>
          <div class="iaiOrdersPreviewMeta">${escapeHtml(t(currentLang, "confirmation", { value: formatOrderConfirmationI18n(order?.orderDetails?.orderConfirmation || "-", currentLang) }))}</div>
        </section>
        <section class="iaiOrdersPreviewCard">
          <div class="iaiOrdersPreviewLabel">${escapeHtml(t(currentLang, "shipping"))}</div>
          <strong>${escapeHtml(dispatch?.courierName || "-")}</strong>
          <div class="iaiOrdersPreviewMeta">${escapeHtml(t(currentLang, "planned", { value: formatDateTime(dispatch?.estimatedDeliveryDate || order?.orderDetails?.orderDispatchDate || "", currentLang) }))}</div>
          <div class="iaiOrdersPreviewMeta">${escapeHtml(t(currentLang, "package", { value: dispatch?.deliveryPackageId || "-" }))}</div>
        </section>
      </div>

      <div class="iaiOrdersDetailsGrid">
        <section class="iaiOrdersDetailCard">
          <h4>${escapeHtml(t(currentLang, "customer"))}</h4>
          <p><strong>${escapeHtml(pickBillingName(order) || summary.clientName)}</strong></p>
          <p>${escapeHtml(t(currentLang, "taxId"))}: ${escapeHtml(pickClientTaxId(order))}</p>
          <p>${escapeHtml(t(currentLang, "company"))}: ${escapeHtml(pickClientCompany(order))}</p>
          <p>${escapeHtml(summary.clientEmail)}</p>
          <p>${escapeHtml(summary.clientPhone)}</p>
          <p>${escapeHtml(billingAddress)}</p>
        </section>
        <section class="iaiOrdersDetailCard">
          <h4>${escapeHtml(t(currentLang, "deliveryAddress"))}</h4>
          <p><strong>${escapeHtml(pickDeliveryName(order) || summary.clientName)}</strong></p>
          <p>${escapeHtml(deliveryAddress)}</p>
          <p>${escapeHtml(pickDeliveryPhone(order))}</p>
        </section>
      </div>

      <section class="iaiOrdersDetailCard">
        <div class="iaiOrdersSectionHead">
          <h4>${escapeHtml(t(currentLang, "orderItems"))}</h4>
          <span>${products.length} ${escapeHtml(t(currentLang, "positionsShort"))}</span>
        </div>
        <div class="iaiOrdersProductsWrap">
          <table class="iaiOrdersProductsTable">
            <thead>
              <tr>
                <th class="iaiOrdersProductColLp">${escapeHtml(t(currentLang, "lp"))}</th>
                <th>${escapeHtml(t(currentLang, "product"))}</th>
                <th class="iaiOrdersProductColSerials">${escapeHtml(t(currentLang, "serialNumbers"))}</th>
                <th class="iaiOrdersProductColQty right">${escapeHtml(t(currentLang, "qty"))}</th>
                <th class="iaiOrdersProductColPrice right">${escapeHtml(t(currentLang, "net"))}</th>
                <th class="iaiOrdersProductColPrice right">${escapeHtml(t(currentLang, "gross"))}</th>
              </tr>
            </thead>
            <tbody>
              ${
                products.length
                  ? products
                      .map(
                        (product, index) => {
                          const itemKey = buildProductSerialKey(product, index);
                          const serialsText = serialListToText(serialsByItem[itemKey] || []);
                          return `
                          <tr>
                            <td>${index + 1}</td>
                            <td>
                              <div class="iaiOrdersPrimary">${escapeHtml(pickProductName(product))}</div>
                              <div class="iaiOrdersSecondary">${escapeHtml(pickProductCode(product))}</div>
                            </td>
                            <td>
                              <textarea
                                class="iaiOrdersSerialsInput"
                                data-serial-order-token="${escapeHtml(orderToken)}"
                                data-serial-item-key="${escapeHtml(itemKey)}"
                                rows="3"
                                placeholder="${escapeHtml(t(currentLang, "serialsPlaceholder"))}"
                              >${escapeHtml(serialsText)}</textarea>
                              <div class="iaiOrdersSerialsHelp">${escapeHtml(t(currentLang, "serialsHelp"))}</div>
                            </td>
                            <td class="right">${pickProductQty(product).toLocaleString(getLangLocale(currentLang))}</td>
                            <td class="right">${escapeHtml(formatMoney(pickProductNet(product), currency, currentLang))}</td>
                            <td class="right">${escapeHtml(formatMoney(pickProductGross(product), currency, currentLang))}</td>
                          </tr>
                        `;
                        }
                      )
                      .join("")
                  : `<tr><td colspan="6">${escapeHtml(t(currentLang, "noItemsInResponse"))}</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="iaiOrdersDetailCard">
        <div class="iaiOrdersSectionHead">
          <h4>${escapeHtml(t(currentLang, "notesTitle"))}</h4>
          <span>${escapeHtml(t(currentLang, "additionalInfo"))}</span>
        </div>
        <p><strong>${escapeHtml(t(currentLang, "clientNote"))}</strong> ${escapeHtml(order?.orderDetails?.clientNoteToOrder || "-")}</p>
        <p><strong>${escapeHtml(t(currentLang, "courierNote"))}</strong> ${escapeHtml(order?.orderDetails?.clientNoteToCourier || "-")}</p>
      </section>
    `;
  }

  async function openPreview(token) {
    try {
      const order = await fetchOrderByToken(token);
      if (!order) {
        showToast(t(currentLang, "fetchDetailsFailed"), {
          type: "error",
          ms: 3200,
        });
        return;
      }

      previewOrder = order;
      renderPreview(order);
      syncModalDocumentPicker();
      modalBackdrop.style.display = "flex";
      modalBackdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("iai-orders-modal-open");
    } catch (error) {
      console.error(error);
      showToast(t(currentLang, "fetchDetailsIaiFailed"), {
        type: "error",
        ms: 3400,
      });
    }
  }

  function buildDocumentHtmlForType(order, type) {
    const normalizedType = normalizeIaiOrdersDocumentType(type);
    switch (normalizedType) {
      case "invoice":
        return buildInvoiceHtmlLocalized(order, currentLang, lastSettings);
      case "confirmation":
        return buildConfirmationHtmlLocalized(order, currentLang, lastSettings);
      case "wz":
      default:
        return buildWzHtmlLocalized(order, currentLang, lastSettings);
    }
  }

  async function printDocument(token, type = currentDocumentType, preparedOrder = null) {
    const normalizedType = normalizeIaiOrdersDocumentType(type);
    const docLabel = getDocumentTypeLabel(normalizedType, currentLang);

    try {
      const order = preparedOrder || (await fetchOrderByToken(token));
      if (!order) {
        showToast(t(currentLang, "prepareDocumentFailed", { doc: docLabel }), {
          type: "error",
          ms: 3200,
        });
        return;
      }

      if (previewOrder && lookupOrderToken(previewOrder) === lookupOrderToken(order)) {
        await persistOrderSerials(previewOrder);
      }

      const html = buildDocumentHtmlForType(order, normalizedType);
      const title = `${docLabel} ${order?.orderId || ""}`.trim();
      openDocumentPopup(html, title, currentLang);
    } catch (error) {
      console.error(error);
      showToast(t(currentLang, "generateDocumentFailed", { doc: docLabel }), {
        type: "error",
        ms: 3400,
      });
    }
  }

  async function printWz(token) {
    return printDocument(token, "wz");
  }

  async function printInvoice(token) {
    return printDocument(token, "invoice");
  }

  async function loadOrders() {
    const ready = await syncAvailability();
    if (!ready) return false;

    setLoading(true);
    renderMeta(t(currentLang, "loadingMeta"), t(currentLang, "loadingSource"));

    try {
      const result = await window.esusAPI.idosellOrdersList({
        manualLookup: textarea.value,
        resultsLimit: 100,
      });

      lastOrders = Array.isArray(result?.orders) ? result.orders : [];
      renderMeta(
        t(currentLang, "shownOrders", { count: lastOrders.length }),
        textarea.value.trim() ? t(currentLang, "sourceManual") : t(currentLang, "sourceActive")
      );
      renderRows(lastOrders);
      if (previewOrder) {
        renderPreview(previewOrder);
      }
      return true;
    } catch (error) {
      console.error(error);
      tbody.innerHTML = "";
      lastOrders = [];
      renderMeta(t(currentLang, "fetchListFailedMeta"), "");
      setEmpty(
        t(currentLang, "fetchFailedTitle"),
        String(error?.message || t(currentLang, "fetchFailedText"))
      );
      return false;
    }
  }

  function closePreview() {
    if (previewOrder) {
      void persistOrderSerials(previewOrder);
    }
    modalBackdrop.style.display = "none";
    modalBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("iai-orders-modal-open");
    previewOrder = null;
  }

  applyBtn?.addEventListener("click", () => {
    void loadOrders();
  });

  clearBtn?.addEventListener("click", () => {
    textarea.value = "";
    void loadOrders();
  });

  reloadBtn?.addEventListener("click", () => {
    void loadOrders();
  });

  langSelect?.addEventListener("change", async (event) => {
    try {
      await persistModuleLanguage(event?.target?.value);
      if (previewOrder) renderPreview(previewOrder);
      void loadOrders();
    } catch (error) {
      console.error(error);
      showToast(t(currentLang, "saveLangFailed"), { type: "error", ms: 2800 });
    }
  });

  textarea?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void loadOrders();
    }
  });

  modalBody?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (!target.matches("[data-serial-item-key]")) return;
    if (!previewOrder) return;
    void persistOrderSerials(previewOrder);
  });

  modalClose?.addEventListener("click", closePreview);
  modalBackdrop?.addEventListener("click", (event) => {
    if (event.target === modalBackdrop) {
      closePreview();
    }
  });
  modalDocType?.addEventListener("change", (event) => {
    currentDocumentType = normalizeIaiOrdersDocumentType(event?.target?.value);
  });
  modalGenerate?.addEventListener("click", () => {
    if (previewOrder) {
      void printDocument(lookupOrderToken(previewOrder), modalDocType?.value || currentDocumentType);
    }
  });
  serialPromptClose?.addEventListener("click", closeSerialPrompt);
  serialPromptSkip?.addEventListener("click", () => {
    void completeSerialPrompt({ saveSerials: false });
  });
  serialPromptSave?.addEventListener("click", () => {
    void completeSerialPrompt({ saveSerials: true });
  });
  serialPromptBackdrop?.addEventListener("click", (event) => {
    if (event.target === serialPromptBackdrop) closeSerialPrompt();
  });

  window.addEventListener("esus:settingsChanged", () => {
    void syncAvailability().then((ready) => {
      if (ready) {
        renderRows(lastOrders);
      }
      if (previewOrder) renderPreview(previewOrder);
    });
  });

  return {
    activate: async () => {
      await loadOrders();
      return true;
    },
    syncAvailability,
  };
}
