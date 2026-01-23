import { getUserSettings, setUserSettings } from "../state/userSettings.js";
import { el } from "./dom.js";

export function refreshOfferPreview() {
  // In some UI variants we do not render explicit inputs for initials / monthly seq.
  // Keep the function safe and fall back to sane defaults.
  const initialsEl = el("creatorInitials");
  const seqEl = el("monthlySeq");

  const initials = (initialsEl?.value || "XX").trim().toUpperCase();
  const seq = Math.max(1, parseInt(seqEl?.value || "1", 10));

  const noPreviewEl = el("offerNumberPreview");
  if (noPreviewEl) noPreviewEl.textContent = buildOfferNumber(seq, initials);

  const keyPreviewEl = el("offerKeyPreview");
  if (keyPreviewEl) keyPreviewEl.textContent = `klucz: ${offerKey(initials)}`;
}

export function offerKey(initials) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}_${initials}`;
}

export function buildOfferNumber(seq, initials) {
  // Backward compatible: some callers use buildOfferNumber() without args.
  // In that case, read the current values from the form.
  const seqResolved = (seq !== undefined && seq !== null)
    ? seq
    : Math.max(1, parseInt(document.getElementById("monthlySeq")?.value || "1", 10));

  const initialsResolved = (initials !== undefined && initials !== null)
    ? initials
    : (document.getElementById("creatorInitials")?.value || "XX").trim().toUpperCase();

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lp = String(Math.max(1, seqResolved)).padStart(2, "0");
  return `${lp}/${initialsResolved}/${m}/${y}`;
}

export async function loadUserInitialsAndSeq({ getInitialsEl, setInitialsEl, setSeqEl }) {
  const s = await getUserSettings();
  if (s.initials && setInitialsEl) setInitialsEl.value = s.initials;

  const initials = (getInitialsEl?.value || s.initials || "XX").trim().toUpperCase() || "XX";

  // Prefer IPC-provided gap-filling sequence (prod-safe, based on existing offers).
  let seq = 1;
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (window.esusAPI?.getNextOfferSeq) {
      seq = await window.esusAPI.getNextOfferSeq(initials, year, month);
    } else {
      const key = offerKey(initials);
      seq = (s.offerSeq && s.offerSeq[key]) ? s.offerSeq[key] : 1;
    }
  } catch {
    const key = offerKey(initials);
    seq = (s.offerSeq && s.offerSeq[key]) ? s.offerSeq[key] : 1;
  }

  if (setSeqEl) setSeqEl.value = String(seq);
  return { initials, seq };
}

export async function persistInitials(initials) {
  await setUserSettings({ initials: initials.trim().toUpperCase() });
}

export async function bumpSeqAndPersist(initials, currentSeq) {
  const key = offerKey(initials);
  const next = Math.max(1, parseInt(currentSeq, 10) || 1) + 1;

  await setUserSettings({
    offerSeq: { [key]: next }
  });

  return { key, next };
}
