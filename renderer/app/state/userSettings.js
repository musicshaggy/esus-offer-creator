const FALLBACK = { initials: "", offerSeq: {} };

export async function getUserSettings() {
  if (!window.esusAPI?.settingsGet) return FALLBACK; // w przeglądarce
  return await window.esusAPI.settingsGet();
}

export async function setUserSettings(patch) {
  if (!window.esusAPI?.settingsSet) return { ...FALLBACK, ...patch };
  return await window.esusAPI.settingsSet(patch);
}
