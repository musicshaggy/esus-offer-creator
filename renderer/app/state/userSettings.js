const FALLBACK = { initials: "", offerSeq: {} };

export async function getUserSettings() {
  if (!window.esusAPI?.settingsGet) return FALLBACK; // w przeglądarce
  return await window.esusAPI.settingsGet();
}

export async function setUserSettings(patch) {
  if (!window.esusAPI?.settingsSet) return { ...FALLBACK, ...patch };
  return await window.esusAPI.settingsSet(patch);
}

export async function resetUserCounter() {
  if (!window.esusAPI?.settingsResetCounter) return { ...FALLBACK };
  return await window.esusAPI.settingsResetCounter();
}

export async function clearAllUserData() {
  if (!window.esusAPI?.settingsClearAllData) return { ...FALLBACK };
  return await window.esusAPI.settingsClearAllData();
}
