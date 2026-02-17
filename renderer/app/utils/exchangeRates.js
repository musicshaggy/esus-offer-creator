// renderer/app/utils/exchangeRates.js
import { showToast } from "../ui/toast.js";

const NBP_API_URL = "https://api.nbp.pl/api/exchangerates/tables/A/?format=json";
const FALLBACK = { USD: 4.00, EUR: 4.30 };

export function getRateToPLN(code, rates) {
  if (!code || code === "PLN") return 1;
  const r = rates?.[code];
  return Number.isFinite(Number(r)) ? Number(r) : null;
}

export async function fetchExchangeRates() {
  try {
    const response = await fetch(NBP_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const table = data?.[0];
    const effectiveDate = table?.effectiveDate || "brak daty";

    const rates = {};
    (table?.rates || []).forEach((rate) => {
      if (rate.code === "USD" || rate.code === "EUR") {
        rates[rate.code] = rate.mid;
      }
    });

    // sanity: jeśli NBP nie zwrócił USD/EUR, użyj fallback
    if (!rates.USD) rates.USD = FALLBACK.USD;
    if (!rates.EUR) rates.EUR = FALLBACK.EUR;

    localStorage.setItem("exchangeRates", JSON.stringify(rates));
    localStorage.setItem("exchangeLastUpdated", effectiveDate);

    showToast(`Kursy walut zaktualizowane (NBP, ${effectiveDate})`, { type: "success", ms: 2500 });

    return { rates, lastUpdated: effectiveDate, isOutdated: false };
  } catch (err) {
    const storedRatesStr = localStorage.getItem("exchangeRates");
    const storedRates = storedRatesStr ? JSON.parse(storedRatesStr) : FALLBACK;
    const lastUpdated = localStorage.getItem("exchangeLastUpdated") || "brak danych";

    showToast(
      `Nie udało się pobrać kursów z NBP. Używam zapisanych z ${lastUpdated} (mogą być nieaktualne).`,
      { type: "warning", ms: 8000 }
    );

    // upewnij się, że mamy USD/EUR
    if (!storedRates.USD) storedRates.USD = FALLBACK.USD;
    if (!storedRates.EUR) storedRates.EUR = FALLBACK.EUR;

    return { rates: storedRates, lastUpdated, isOutdated: true };
  }
}

export function loadCachedExchangeRates() {
  try {
    const storedRatesStr = localStorage.getItem("exchangeRates");
    const storedRates = storedRatesStr ? JSON.parse(storedRatesStr) : null;
    const lastUpdated = localStorage.getItem("exchangeLastUpdated") || "brak danych";

    const rates = {
      USD: Number(storedRates?.USD ?? 4.0),
      EUR: Number(storedRates?.EUR ?? 4.3),
    };

    return { rates, lastUpdated, isOutdated: true };
  } catch {
    return { rates: { USD: 4.0, EUR: 4.3 }, lastUpdated: "brak danych", isOutdated: true };
  }
}

