import { exportOfferToExcel } from "../../excel-export.js";
import { store } from "../state/store.js";
import { VAT_RATE } from "../config/constants.js";
import { buildOfferNumber } from "../ui/offerNumber.js";

export function initExcelExport({ onStateChanged } = {}) {
  const btn = document.getElementById("btnExportExcel");
  if (!btn) return;

  btn.disabled = false;
  btn.removeAttribute("disabled");

  btn.addEventListener("click", (e) => {
    e.preventDefault();

    const offerNoFromUi = (document.getElementById("offerNumberPreview")?.textContent || "").trim();
    const offerNo = (offerNoFromUi && offerNoFromUi !== "—") ? offerNoFromUi : buildOfferNumber();

    const creatorEmail = document.getElementById("creatorEmail")?.value ?? "";
    const creatorPhone = document.getElementById("creatorPhone")?.value ?? "";
    const createdByContact = [creatorEmail, creatorPhone].map((x) => String(x).trim()).filter(Boolean).join(" | ");

    exportOfferToExcel({
      items: store.items,
      vatRate: VAT_RATE,
      shippingNet: document.getElementById("shippingNet")?.value ?? 0,
      offerNo,
      docLabel: (document.getElementById("isEstimate")?.checked ? "Wycena szacunkowa" : "Oferta"),
      createdAt: new Date(),
      customerName: document.getElementById("custName")?.value ?? "",
      customerNip: document.getElementById("custNip")?.value ?? "",
      customerAddr: document.getElementById("custAddr")?.value ?? "",
      customerContact: document.getElementById("custContact")?.value ?? "",
      createdBy: document.getElementById("creatorName")?.value ?? "",
      createdByContact,
      paymentText: (document.getElementById("paymentMethod")?.value === "invoice")
        ? `Faktura z odroczonym terminem (${document.getElementById("invoiceDays")?.value ?? ""} dni)`
        : "Przedpłata",
      validUntil: document.getElementById("validUntil")?.value ?? "",
      estimateDays: document.getElementById("estimateDays")?.value ?? "",
      termsExtra: document.getElementById("termsExtra")?.value ?? "",
      creatorNotes: document.getElementById("creatorNotes")?.value ?? "",
    });

    onStateChanged?.();
  });
}
