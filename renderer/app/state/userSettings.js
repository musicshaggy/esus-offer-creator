const FALLBACK = { initials: "", offerSeq: {} };

function emitSettingsChanged(settings) {
  if (typeof window === "undefined" || !window.dispatchEvent) return;
  window.dispatchEvent(
    new CustomEvent("esus:settingsChanged", {
      detail: { settings: settings || FALLBACK },
    })
  );
}

export async function getUserSettings() {
  if (!window.esusAPI?.settingsGet) return FALLBACK; // w przeglądarce
  return await window.esusAPI.settingsGet();
}

export async function setUserSettings(patch) {
  if (!window.esusAPI?.settingsSet) return { ...FALLBACK, ...patch };
  const next = await window.esusAPI.settingsSet(patch);
  emitSettingsChanged(next);
  return next;
}

export async function resetUserCounter() {
  if (!window.esusAPI?.settingsResetCounter) return { ...FALLBACK };
  return await window.esusAPI.settingsResetCounter();
}

export async function clearAllUserData() {
  if (!window.esusAPI?.settingsClearAllData) return { ...FALLBACK };
  const next = await window.esusAPI.settingsClearAllData();
  emitSettingsChanged(next);
  return next;
}

export async function testIdoSellConnection(payload) {
  if (!window.esusAPI?.settingsTestIdoSellConnection) {
    throw new Error("Test połączenia API nie jest dostępny.");
  }
  return await window.esusAPI.settingsTestIdoSellConnection(payload);
}

export async function getIdoSellQuestionsWorkerStatus() {
  if (!window.esusAPI?.idosellQuestionsWorkerGetStatus) {
    return {
      enabled: false,
      notificationsEnabled: true,
      intervalMinutes: 10,
      startWithSystem: false,
      isRunning: false,
      mode: "unsupported",
      lastMessage: "Status workera nie jest dostepny.",
    };
  }
  return await window.esusAPI.idosellQuestionsWorkerGetStatus();
}

export async function startIdoSellQuestionsWorker() {
  if (!window.esusAPI?.idosellQuestionsWorkerStart) {
    throw new Error("Uruchomienie workera nie jest dostepne.");
  }
  return await window.esusAPI.idosellQuestionsWorkerStart();
}

export async function stopIdoSellQuestionsWorker() {
  if (!window.esusAPI?.idosellQuestionsWorkerStop) {
    throw new Error("Zatrzymanie workera nie jest dostepne.");
  }
  return await window.esusAPI.idosellQuestionsWorkerStop();
}

export async function restartIdoSellQuestionsWorker() {
  if (!window.esusAPI?.idosellQuestionsWorkerRestart) {
    throw new Error("Restart workera nie jest dostepny.");
  }
  return await window.esusAPI.idosellQuestionsWorkerRestart();
}
