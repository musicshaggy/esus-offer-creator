// renderer/app/i18n/pdfI18n.js
// i18n helper tylko pod generowanie PDF (teksty + formatowanie).
// Użycie w pdf.js:
//   import { t, getLocale, formatMoney, formatDate, vatLabel, getTableHead, getDocLabel } from "../i18n/pdfI18n.js";

const LOCALES = {
  pl: "pl-PL",
  en: "en-GB",
  de: "de-DE",
  hu: "hu-HU",
};

const DEFAULT_LANG = "pl";

/**
 * Słownik: klucze powinny być stabilne, a tłumaczenia możliwie krótkie
 * (szczególnie nagłówki tabeli).
 */
const DICT = {
  pl: {
    // labels/sections
    offer: "Oferta",
    estimate: "Wycena szacunkowa",
    customer: "Klient:",
    preparedBy: "Osoba przygotowująca:",
    summary: "Podsumowanie:",
    terms: "Warunki:",
    notesTitle: "Uwagi:",
    extraArrangementsTitle: "Dodatkowe ustalenia:",
    validity: "Ważność oferty do:",
    payment: "Płatność:",
    delivery: "Dostawa:",
    estimatedLeadTime: "Szacunkowy czas realizacji:",
    businessDays: "dni roboczych",

    // payment methods
    prepay: "Przedpłata",
    invoiceDeferred: "Faktura z odroczonym terminem",

    // delivery
    deliverySellerCost: "koszt po stronie sprzedawcy",

    // summary lines
    sumNet: "Suma netto",
    vat: "VAT",
    sumGross: "Suma brutto",
    shippingNet: "Wysyłka netto",
    shippingGross: "Wysyłka brutto",

    // estimate disclaimer
    estimateDisclaimer:
      "Dokument stanowi wycenę szacunkową i nie jest wiążącą ofertą. Ostateczne warunki wymagają potwierdzenia sprzedawcy.",

    // table headers (krótkie!)
    thLp: "Lp",
    thDesc: "Opis",
    thNetAfterDisc: "Cena netto (po rab.)",
    thDiscount: "Rabat",
    thVat: "VAT",
    thGrossUnit: "Cena brutto",
    thQty: "Ilość",
    thGrossLine: "Wartość brutto",

    // currency note (only shown for PL language + non-PLN offers)
    offerCurrencyNoteTitle: "Adnotacja walutowa",
    offerCurrencyLabel: "Waluta oferty",
    exchangeRateLabel: "Kurs przeliczeniowy",
    exchangeRateDateLabel: "Kurs NBP z dnia",

    // misc
    missingData: "(brak danych)",
  },

  en: {
    offer: "Offer",
    estimate: "Estimate",
    customer: "Customer:",
    preparedBy: "Prepared by:",
    summary: "Summary:",
    terms: "Terms:",
    notesTitle: "Notes:",
    extraArrangementsTitle: "Additional terms:",
    validity: "Offer valid until:",
    payment: "Payment:",
    delivery: "Delivery:",
    estimatedLeadTime: "Estimated lead time:",
    businessDays: "business days",

    prepay: "Prepayment",
    invoiceDeferred: "Invoice with deferred payment",

    deliverySellerCost: "at seller’s cost",

    sumNet: "Net total",
    vat: "VAT",
    sumGross: "Gross total",
    shippingNet: "Shipping net",
    shippingGross: "Shipping gross",

    estimateDisclaimer:
      "This document is an estimate and is not a binding offer. Final terms require seller confirmation.",

    thLp: "No",
    thDesc: "Description",
    thNetAfterDisc: "Net (after disc.)",
    thDiscount: "Disc.",
    thVat: "VAT",
    thGrossUnit: "Gross",
    thQty: "Qty",
    thGrossLine: "Gross total",

    missingData: "(missing)",
  },

  de: {
    offer: "Angebot",
    estimate: "Kostenschätzung",
    customer: "Kunde:",
    preparedBy: "Erstellt von:",
    summary: "Zusammenfassung:",
    terms: "Bedingungen:",
    notesTitle: "Hinweise:",
    extraArrangementsTitle: "Zusätzliche Vereinbarungen:",
    validity: "Gültig bis:",
    payment: "Zahlung:",
    delivery: "Lieferung:",
    estimatedLeadTime: "Voraussichtliche Lieferzeit:",
    businessDays: "Werktage",

    prepay: "Vorkasse",
    invoiceDeferred: "Rechnung mit Zahlungsziel",

    deliverySellerCost: "auf Kosten des Verkäufers",

    sumNet: "Netto-Summe",
    vat: "MwSt.",
    sumGross: "Brutto-Summe",
    shippingNet: "Versand netto",
    shippingGross: "Versand brutto",

    estimateDisclaimer:
      "Dieses Dokument ist eine Kostenschätzung und kein verbindliches Angebot. Endgültige Bedingungen erfordern die Bestätigung des Verkäufers.",

    thLp: "Pos.",
    thDesc: "Beschreibung",
    thNetAfterDisc: "Netto (nach Rab.)",
    thDiscount: "Rab.",
    thVat: "MwSt.",
    thGrossUnit: "Brutto",
    thQty: "Menge",
    thGrossLine: "Brutto gesamt",

    missingData: "(keine Daten)",
  },

  hu: {
    offer: "Ajánlat",
    estimate: "Becsült ajánlat",
    customer: "Ügyfél:",
    preparedBy: "Készítette:",
    summary: "Összesítés:",
    terms: "Feltételek:",
    notesTitle: "Megjegyzések:",
    extraArrangementsTitle: "További feltételek:",
    validity: "Ajánlat érvényes:",
    payment: "Fizetés:",
    delivery: "Szállítás:",
    estimatedLeadTime: "Becsült teljesítési idő:",
    businessDays: "munkanap",

    prepay: "Előleg",
    invoiceDeferred: "Halasztott fizetésű számla",

    deliverySellerCost: "az eladó költségére",

    sumNet: "Nettó összeg",
    vat: "ÁFA",
    sumGross: "Bruttó összeg",
    shippingNet: "Szállítás nettó",
    shippingGross: "Szállítás bruttó",

    estimateDisclaimer:
      "Ez a dokumentum becslés, nem minősül kötelező érvényű ajánlatnak. A végleges feltételek az eladó megerősítését igénylik.",

    thLp: "Tétel",
    thDesc: "Leírás",
    thNetAfterDisc: "Nettó (kedv. után)",
    thDiscount: "Kedv.",
    thVat: "ÁFA",
    thGrossUnit: "Bruttó",
    thQty: "Db",
    thGrossLine: "Bruttó össz.",

    missingData: "(nincs adat)",
  },
};

/** Bezpieczny getter tłumaczeń */
export function t(lang, key, vars = null) {
  const L = DICT[lang] ? lang : DEFAULT_LANG;
  let s = (DICT[L] && DICT[L][key]) || (DICT[DEFAULT_LANG] && DICT[DEFAULT_LANG][key]) || key;

  if (vars && typeof vars === "object") {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function getLocale(lang) {
  return LOCALES[lang] || LOCALES[DEFAULT_LANG];
}

/**
 * Format kwot w walucie dokumentu.
 * amount: number
 * ccy: "PLN"|"EUR"|"USD"
 */
export function formatMoney(amount, lang, ccy = "PLN") {
  const locale = getLocale(lang);
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(safe);
  } catch {
    // fallback (gdyby Intl/currency padło)
    return `${safe.toFixed(2)} ${ccy}`;
  }
}

/**
 * Format daty z inputa <input type="date">: "YYYY-MM-DD"
 * Uwaga: w HU często spotkasz YYYY.MM.DD – tak ustawiamy.
 */
export function formatDate(ymd, lang) {
  const s = String(ymd || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s || "";

  const y = m[1], mo = m[2], d = m[3];

  switch (lang) {
    case "en":
      // przyjmijmy czytelny ISO w EN (żeby nie mieszać US/UK)
      return `${y}-${mo}-${d}`;
    case "de":
      return `${d}.${mo}.${y}`;
    case "hu":
      return `${y}.${mo}.${d}`;
    case "pl":
    default:
      return `${d}.${mo}.${y}`;
  }
}

/**
 * VAT label do PDF:
 * vat może być np. { code: "23"|"27"|"19"|"0WDT"|"0EX", label:"23%"|"WDT"|... }
 * Jeśli podasz string, też zadziała (np. "WDT", "EX", "23%").
 */
export function vatLabel(lang, vat) {
  if (!vat) return "";

  // jeżeli przekazany string
  if (typeof vat === "string") {
    const s = vat.toUpperCase();
    if (s.includes("WDT")) return "0%";
    if (s.includes("EX")) return "EX";
    return s;
  }

  const code = String(vat.code || "").toUpperCase();

  // 👇 KLUCZOWE: ignorujemy vat.label dla przypadków 0
  if (code === "0WDT") return "0%";
  if (code === "0EX") return "EX";

  // normalne stawki
  const num = parseInt(code, 10);
  if (Number.isFinite(num)) return `${num}%`;

  // fallback
  return vat.label ? String(vat.label) : "";
}

/** Nazwa dokumentu zależna od estimate */
export function getDocLabel(lang, isEstimate) {
  return isEstimate ? t(lang, "estimate") : t(lang, "offer");
}

/**
 * Nagłówek tabeli pod PDF (w kolejności jak w pdf.js).
 * - showDiscountCol: czy pokazywać rabat
 * - includeVatCol: czy masz kolumnę VAT (u Ciebie już jest)
 * - vatBetweenNetAndGross: jeśli VAT ma być między netto i brutto
 */
export function getTableHead(lang, { showDiscountCol, includeVatCol, vatBetweenNetAndGross } = {}) {
  const head = [t(lang, "thLp"), t(lang, "thDesc"), t(lang, "thNetAfterDisc")];

  if (showDiscountCol) head.push(t(lang, "thDiscount"));

  if (includeVatCol && vatBetweenNetAndGross) head.push(t(lang, "thVat"));

  head.push(t(lang, "thGrossUnit"), t(lang, "thQty"), t(lang, "thGrossLine"));

  if (includeVatCol && !vatBetweenNetAndGross) {
    // jeśli ktoś jednak zechce VAT gdzie indziej
    // (np. na końcu) — kontrolujesz w pdf.js
    // head.splice( ... ) w pdf.js wg potrzeb
  }

  return head;
}

/**
 * Pomocnik dla tekstu płatności
 * paymentMethod: "prepay"|"invoice"
 * invoiceDays: number|string
 */
export function formatPaymentText(lang, paymentMethod, invoiceDays) {
  if (paymentMethod === "prepay") return t(lang, "prepay");
  const days = String(invoiceDays || "").trim() || "0";
  return `${t(lang, "invoiceDeferred")} (${days})`;
}

export function getFilePrefix(lang) {
  switch ((lang || "pl").toLowerCase()) {
    case "en": return "Offer";
    case "de": return "Angebot";
    case "hu": return "Ajánlat";
    default:   return "Oferta"; // pl
  }
}


export function getCompanyFooterLines(lang) {
  const l = (lang || "pl").toLowerCase();

  switch (l) {
    case "en":
      return [
        "ESUS IT Sp. z o.o Somosierry 30A 71-181 Szczecin, Poland",
        "District Court of Szczecin, 7th Commercial Division of the National Court Register",
        "KRS: 0001012470; VAT No: PL8522690002; REGON: 524134686",
        "Share capital: 5 000 PLN",
      ];

    case "de":
      return [
        "ESUS IT GmbH",
        "Umsatzsteuer-Identifikationsnummer: DE353880111",
        "Waldsiedlung Fichtendamm 4 15306 Vierlinden Deutschland",
      ];

    case "hu":
      return [
        "ESUS IT ENTERPRISE Kft. Huszár utca 5. 1. em. 7. 1074 Budapest",
        "Cégjegyzékszám: 01-09-372497",
        "Adószám: 28753553-2-42",
      ];

    case "pl":
    default:
      return [
		"ESUS IT Spółka z o. o., ul. Somosierry 30A, 71-181 Szczecin. ",
		"Sąd Rejonowy dla miasta Szczecina, VII Wydział Gospodarczy Krajowego Rejestru Sądowego, ",
		"KRS: 0001012470; VAT No / NIP: PL8522690002; REGON: 524134686; ",
		"Kapitał zakładowy 5 000 zł.",
      ];
  }
}
