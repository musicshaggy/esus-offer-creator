import { getUserSettings, setUserSettings, resetUserCounter, clearAllUserData } from "../state/userSettings.js";
import { offersService } from "../offers/offersService.js";
import { showToast, showToastAction } from "./toast.js";

function el(id) {
  return document.getElementById(id);
}

function deriveInitials(fullName) {
  const cleaned = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  const parts = cleaned.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  const first = parts[0][0] || "";
  const last = parts[parts.length - 1][0] || "";
  return (first + last).toUpperCase();
}

function normalizeInitials(v) {
  const s = String(v || "").trim().toUpperCase();
  if (!s || s === "XX") return "";
  if (!/^[A-Z0-9]{2,5}$/.test(s)) return "";
  return s;
}

function show() {
  const node = el("settingsModalBackdrop");
  if (node) node.style.display = "block";
}

function hide() {
  const node = el("settingsModalBackdrop");
  if (node) node.style.display = "none";
}

async function fillForm() {
  const settings = await getUserSettings();
  const profile = settings?.profile || {};
  const initialsEl = el("settingsProfileInitials");

  el("settingsProfileFullName").value = profile?.fullName || "";
  el("settingsProfileEmail").value = profile?.email || "";
  el("settingsProfilePhone").value = profile?.phone || "";
  if (initialsEl) {
    initialsEl.value = normalizeInitials(profile?.initials) || deriveInitials(profile?.fullName || "");
    initialsEl.dataset.touched = "0";
  }
}

function setExchangeInfo(text) {
  const node = el("settingsExchangeLastUpdated");
  if (!node) return;
  node.textContent = text || "brak danych";
}

function setActiveTab(tabId = "general") {
  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    const active = btn.getAttribute("data-settings-tab") === tabId;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    const active = panel.getAttribute("data-settings-panel") === tabId;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

export function initSettingsModal({
  onProfileSaved,
  onCounterReset,
  onClearAllData,
  onClearAllOffers,
  onRefreshExchangeRates,
  getExchangeStatus,
} = {}) {
  const backdrop = el("settingsModalBackdrop");
  if (!backdrop) return;

  const open = async () => {
    await fillForm();
    const exchange = await getExchangeStatus?.();
    const label = exchange?.lastUpdated
      ? `${exchange.lastUpdated}${exchange?.isOutdated ? " (zapisane / mogą być nieaktualne)" : ""}`
      : "brak danych";
    setExchangeInfo(label);
    setActiveTab("general");
    show();
  };

  el("btnAppSettings")?.addEventListener("click", open);
  el("btnSettingsCloseTop")?.addEventListener("click", hide);
  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.getAttribute("data-settings-tab") || "general");
    });
  });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) hide();
  });

  const fullNameEl = el("settingsProfileFullName");
  const initialsEl = el("settingsProfileInitials");
  if (fullNameEl && initialsEl) {
    fullNameEl.addEventListener("input", () => {
      if (String(initialsEl.dataset.touched || "0") === "1") return;
      initialsEl.value = deriveInitials(fullNameEl.value);
    });
    initialsEl.addEventListener("input", () => {
      initialsEl.dataset.touched = initialsEl.value.trim() ? "1" : "0";
    });
  }

  el("btnSettingsSaveProfile")?.addEventListener("click", async () => {
    const fullName = fullNameEl?.value.trim() || "";
    const email = el("settingsProfileEmail")?.value.trim() || "";
    const phone = el("settingsProfilePhone")?.value.trim() || "";
    const initials =
      normalizeInitials(initialsEl?.value) ||
      normalizeInitials(deriveInitials(fullName));

    if (!fullName || !email || !phone || !initials) {
      showToast("Uzupełnij imię i nazwisko, e-mail, telefon oraz poprawne inicjały.", {
        type: "error",
        ms: 3800,
      });
      return;
    }

    const next = await setUserSettings({
      initials,
      profile: { fullName, email, phone, initials },
    });

    await onProfileSaved?.(next?.profile || { fullName, email, phone, initials });
    showToast("Zapisano dane osoby wystawiającej.", { type: "info", ms: 2400 });
    hide();
  });

  el("btnSettingsRefreshRates")?.addEventListener("click", async () => {
    try {
      const exchange = await onRefreshExchangeRates?.();
      const label = exchange?.lastUpdated
        ? `${exchange.lastUpdated}${exchange?.isOutdated ? " (zapisane / mogą być nieaktualne)" : ""}`
        : "brak danych";
      setExchangeInfo(label);
    } catch (e) {
      console.warn("Exchange refresh failed:", e);
      showToast("Nie udało się odświeżyć kursów NBP.", { type: "error", ms: 3200 });
    }
  });

  el("btnSettingsResetCounter")?.addEventListener("click", () => {
    showToastAction("Wyczyścić licznik numeracji ofert?", {
      type: "info",
      ms: 0,
      actionLabel: "Wyczyść",
      secondaryLabel: "Anuluj",
      onSecondary: async () => {},
      onAction: async () => {
        await resetUserCounter();
        await onCounterReset?.();
        showToast("Licznik numeracji został wyczyszczony.", { type: "info", ms: 2600 });
      },
    });
  });

  el("btnSettingsClearData")?.addEventListener("click", () => {
    showToastAction("Wyczyścić dane aplikacji? To usunie profil, licznik numeracji i zapamiętanych klientów.", {
      type: "error",
      ms: 0,
      actionLabel: "Wyczyść dane",
      secondaryLabel: "Anuluj",
      onSecondary: async () => {},
      onAction: async () => {
        await clearAllUserData();
        hide();
        await onClearAllData?.();
      },
    });
  });

  el("btnSettingsClearOffers")?.addEventListener("click", () => {
    showToastAction("Usunąć wszystkie zapisane oferty? Tej operacji nie można cofnąć.", {
      type: "error",
      ms: 0,
      actionLabel: "Usuń oferty",
      secondaryLabel: "Anuluj",
      onSecondary: async () => {},
      onAction: async () => {
        await offersService.deleteAll();
        hide();
        await onClearAllOffers?.();
      },
    });
  });
}
