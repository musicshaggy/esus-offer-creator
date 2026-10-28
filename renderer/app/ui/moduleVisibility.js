import { getUserSettings } from "../state/userSettings.js";

export const DEFAULT_MODULE_VISIBILITY = Object.freeze({
  pmReport: true,
  iaiOrders: true,
  invoicesDe: false,
});

export function resolveModuleVisibility(settings) {
  const saved = settings?.modulePrefs?.visibility || {};
  return {
    pmReport: saved.pmReport !== false,
    iaiOrders: saved.iaiOrders !== false,
    invoicesDe: saved.invoicesDe === true,
  };
}

function setModuleButtonVisibility(id, visible) {
  const button = document.getElementById(id);
  if (!button) return;
  button.dataset.optionalModule = "1";
  button.hidden = !visible;
}

export function applyModuleVisibility(settings, { leaveHiddenView = true } = {}) {
  const visibility = resolveModuleVisibility(settings);
  setModuleButtonVisibility("btnOffersRefresh", visibility.pmReport);
  setModuleButtonVisibility("btnOffersIaiOrders", visibility.iaiOrders);
  setModuleButtonVisibility("btnOffersInvoices", visibility.invoicesDe);

  if (leaveHiddenView) {
    const hiddenReportOpen =
      !visibility.pmReport &&
      document.getElementById("offersPmReportView")?.classList.contains("is-active");
    const hiddenOrdersOpen =
      !visibility.iaiOrders &&
      document.getElementById("offersIaiOrdersView")?.classList.contains("is-active");
    if (hiddenReportOpen || hiddenOrdersOpen) {
      document.getElementById("btnOffers")?.click();
    }
  }

  window.dispatchEvent(
    new CustomEvent("esus:moduleVisibilityApplied", { detail: { visibility } })
  );
  return visibility;
}

export async function initModuleVisibility() {
  try {
    applyModuleVisibility(await getUserSettings(), { leaveHiddenView: false });
  } catch (error) {
    console.warn("Module visibility init failed:", error);
    applyModuleVisibility({}, { leaveHiddenView: false });
  }

  window.addEventListener("esus:settingsChanged", (event) => {
    applyModuleVisibility(event?.detail?.settings || {});
  });
}
