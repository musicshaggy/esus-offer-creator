import {
  getUserSettings,
  setUserSettings,
  resetUserCounter,
  clearAllUserData,
  testIdoSellConnection,
} from "../state/userSettings.js";
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

function normalizeBaseUrl(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";

  try {
    const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return raw;
  }
}

function validateIdoSellBaseUrl(v) {
  const normalized = normalizeBaseUrl(v);
  if (!normalized) return { ok: false, message: "Podaj Base URL do panelu IdoSell." };

  try {
    const url = new URL(normalized);

    if (url.protocol !== "https:") {
      return { ok: false, message: "Base URL IdoSell musi używać HTTPS." };
    }

    return { ok: true, normalizedBaseUrl: url.origin };
  } catch {
    return { ok: false, message: "Base URL IdoSell jest nieprawidłowy." };
  }
}

function show() {
  const node = el("settingsModalBackdrop");
  if (node) node.style.display = "block";
}

function hide() {
  const node = el("settingsModalBackdrop");
  if (node) node.style.display = "none";
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

function setIdoSellStatus(text, type = "neutral") {
  const box = el("settingsIdoSellStatusBox");
  const node = el("settingsIdoSellStatusText");
  if (!box || !node) return;

  box.classList.remove("is-success", "is-error");
  if (type === "success") box.classList.add("is-success");
  if (type === "error") box.classList.add("is-error");
  node.textContent = text || "Brak testu połączenia.";
}

function setIdoSellSectionEnabled(enabled) {
  const section = el("settingsIdoSellSection");
  const nodes = [
    el("settingsIdoSellBaseUrl"),
    el("settingsIdoSellApiKey"),
    el("btnSettingsTestIdoSell"),
  ];

  section?.classList.toggle("is-disabled", !enabled);
  nodes.forEach((node) => {
    if (!node) return;
    node.disabled = !enabled;
  });
}

function updateIdoSellSaveButtonEnabled(enabled, testPassed) {
  const saveBtn = el("btnSettingsSaveIdoSell");
  if (!saveBtn) return;
  saveBtn.disabled = !enabled || !testPassed;
}

function configureIdoSellApiKeyField(input, hasApiKey) {
  if (!input) return;
  input.value = "";
  input.dataset.hasStoredSecret = hasApiKey ? "1" : "0";
  input.placeholder = hasApiKey
    ? "Klucz zapisany bezpiecznie. Wpisz nowy tylko jeśli chcesz go zmienić."
    : "Wklej klucz Admin API";
}

async function fillForm() {
  const settings = await getUserSettings();
  const profile = settings?.profile || {};
  const initialsEl = el("settingsProfileInitials");
  const idosell = settings?.integrations?.idosell || {};
  const idosellEnabled = idosell?.enabled !== false;

  el("settingsProfileFullName").value = profile?.fullName || "";
  el("settingsProfileEmail").value = profile?.email || "";
  el("settingsProfilePhone").value = profile?.phone || "";
  el("settingsIdoSellEnabled").checked = idosellEnabled;
  el("settingsIdoSellBaseUrl").value = idosell?.baseUrl || "";
  configureIdoSellApiKeyField(el("settingsIdoSellApiKey"), !!idosell?.hasApiKey);
  setIdoSellSectionEnabled(idosellEnabled);

  if (initialsEl) {
    initialsEl.value = normalizeInitials(profile?.initials) || deriveInitials(profile?.fullName || "");
    initialsEl.dataset.touched = "0";
  }

  updateIdoSellSaveButtonEnabled(idosellEnabled, false);
  setIdoSellStatus(idosellEnabled ? "Wykonaj pozytywny test połączenia, aby zapisać integrację." : "Integracja IdoSell jest wyłączona.");
}

function buildExchangeLabel(exchange) {
  return exchange?.lastUpdated
    ? `${exchange.lastUpdated}${exchange?.isOutdated ? " (zapisane / mogą być nieaktualne)" : ""}`
    : "brak danych";
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
  let idosellTestPassed = false;

  function resetIdoSellTestState() {
    idosellTestPassed = false;
    const enabled = !!el("settingsIdoSellEnabled")?.checked;
    updateIdoSellSaveButtonEnabled(enabled, false);
    setIdoSellStatus(enabled ? "Wykonaj pozytywny test połączenia, aby zapisać integrację." : "Integracja IdoSell jest wyłączona.");
  }

  const open = async () => {
    await fillForm();
    const exchange = await getExchangeStatus?.();
    setExchangeInfo(buildExchangeLabel(exchange));
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
  const idosellEnabledEl = el("settingsIdoSellEnabled");
  const idosellBaseUrlEl = el("settingsIdoSellBaseUrl");
  const idosellApiKeyEl = el("settingsIdoSellApiKey");

  if (fullNameEl && initialsEl) {
    fullNameEl.addEventListener("input", () => {
      if (String(initialsEl.dataset.touched || "0") === "1") return;
      initialsEl.value = deriveInitials(fullNameEl.value);
    });
    initialsEl.addEventListener("input", () => {
      initialsEl.dataset.touched = initialsEl.value.trim() ? "1" : "0";
    });
  }

  idosellBaseUrlEl?.addEventListener("blur", () => {
    idosellBaseUrlEl.value = normalizeBaseUrl(idosellBaseUrlEl.value);
  });

  idosellBaseUrlEl?.addEventListener("input", () => {
    resetIdoSellTestState();
  });

  idosellApiKeyEl?.addEventListener("input", () => {
    resetIdoSellTestState();
  });

  idosellEnabledEl?.addEventListener("change", async () => {
    const enabled = !!idosellEnabledEl.checked;
    setIdoSellSectionEnabled(enabled);
    idosellTestPassed = false;
    updateIdoSellSaveButtonEnabled(enabled, false);
    await setUserSettings({
      integrations: {
        idosell: { enabled },
      },
    });
    setIdoSellStatus(enabled ? "Wykonaj pozytywny test połączenia, aby zapisać integrację." : "Integracja IdoSell jest wyłączona.");
    showToast(
      enabled ? "Włączono integrację IdoSell." : "Wyłączono integrację IdoSell.",
      { type: "info", ms: 2200 }
    );
  });

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

  el("btnSettingsSaveIdoSell")?.addEventListener("click", async () => {
    const baseUrlCheck = validateIdoSellBaseUrl(idosellBaseUrlEl?.value);
    const apiKey = String(idosellApiKeyEl?.value || "").trim();
    const hasStoredSecret = String(idosellApiKeyEl?.dataset?.hasStoredSecret || "0") === "1";

    if (!baseUrlCheck.ok) {
      setIdoSellStatus(baseUrlCheck.message, "error");
      showToast(baseUrlCheck.message, { type: "error", ms: 3200 });
      return;
    }
    const baseUrl = baseUrlCheck.normalizedBaseUrl;

    const patch = {
      integrations: {
        idosell: { enabled: true, baseUrl },
      },
    };

    if (apiKey) {
      patch.integrations.idosell.apiKey = apiKey;
    }

    const next = await setUserSettings(patch);

    if (idosellBaseUrlEl) idosellBaseUrlEl.value = baseUrl;
    configureIdoSellApiKeyField(idosellApiKeyEl, !!next?.integrations?.idosell?.hasApiKey || hasStoredSecret || !!apiKey);
    idosellTestPassed = false;
    updateIdoSellSaveButtonEnabled(true, false);
    setIdoSellStatus(
      apiKey
        ? "Dane integracji zapisane. Klucz API został zapisany bezpiecznie w magazynie systemowym."
        : "Dane integracji zapisane. Istniejący klucz API pozostał bez zmian."
    );
    showToast("Zapisano ustawienia integracji IdoSell.", { type: "info", ms: 2400 });
  });

  el("btnSettingsTestIdoSell")?.addEventListener("click", async () => {
    if (!idosellEnabledEl?.checked) {
      setIdoSellStatus("Włącz integrację IdoSell, aby przetestować połączenie.", "error");
      showToast("Włącz integrację IdoSell, aby przetestować połączenie.", { type: "error", ms: 3000 });
      return;
    }

    const baseUrlCheck = validateIdoSellBaseUrl(idosellBaseUrlEl?.value);
    const apiKey = String(idosellApiKeyEl?.value || "").trim();
    const hasStoredSecret = String(idosellApiKeyEl?.dataset?.hasStoredSecret || "0") === "1";

    if (!baseUrlCheck.ok) {
      setIdoSellStatus(baseUrlCheck.message, "error");
      showToast(baseUrlCheck.message, { type: "error", ms: 3200 });
      return;
    }

    if (!apiKey && !hasStoredSecret) {
      setIdoSellStatus("Uzupełnij Base URL i klucz API przed testem.", "error");
      showToast("Uzupełnij Base URL i klucz API.", { type: "error", ms: 2800 });
      return;
    }
    const baseUrl = baseUrlCheck.normalizedBaseUrl;

    if (idosellBaseUrlEl) idosellBaseUrlEl.value = baseUrl;
    setIdoSellStatus("Trwa test połączenia z IdoSell...");

    try {
      const result = await testIdoSellConnection({ baseUrl, apiKey });
      const suffix = result?.endpoint
        ? ` Endpoint: ${result.endpoint}.`
        : result?.version
          ? ` Wersja API: v${result.version}.`
          : "";

      setIdoSellStatus(`${result?.message || "Brak odpowiedzi z testu."}${suffix}`, result?.ok ? "success" : "error");

      if (result?.ok) {
        idosellTestPassed = true;
        updateIdoSellSaveButtonEnabled(true, true);
        showToast("Połączenie z IdoSell zostało potwierdzone.", { type: "info", ms: 2800 });
      } else {
        idosellTestPassed = false;
        updateIdoSellSaveButtonEnabled(true, false);
        showToast("Test połączenia z IdoSell nie powiódł się.", { type: "error", ms: 3200 });
      }
    } catch (e) {
      console.warn("IdoSell connection test failed:", e);
      idosellTestPassed = false;
      updateIdoSellSaveButtonEnabled(true, false);
      setIdoSellStatus(`Nie udało się wykonać testu: ${String(e?.message || e)}`, "error");
      showToast("Nie udało się wykonać testu IdoSell API.", { type: "error", ms: 3200 });
    }
  });

  el("btnSettingsRefreshRates")?.addEventListener("click", async () => {
    try {
      const exchange = await onRefreshExchangeRates?.();
      setExchangeInfo(buildExchangeLabel(exchange));
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
