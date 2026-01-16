import { getUserSettings, setUserSettings } from "../state/userSettings.js";

const el = (id) => document.getElementById(id);

function deriveInitials(fullName) {
  const cleaned = String(fullName || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleaned) return "";

  // rozbijamy po spacji i myślniku (Jan-Krzysztof Kowalski -> Jan, Krzysztof, Kowalski)
  const parts = cleaned
    .split(/[\s-]+/)
    .filter(Boolean);

  if (parts.length === 1) {
    const w = parts[0];
    return w.slice(0, 2).toUpperCase();
  }

  const first = parts[0][0] || "";
  const last = parts[parts.length - 1][0] || "";
  return (first + last).toUpperCase();
}

function normalizeInitials(v) {
  const s = String(v || "").trim().toUpperCase();

  // blokujemy placeholdery/śmieci (dopasuj jeśli chcesz inne reguły)
  if (!s) return "";
  if (s === "XX") return "";

  // 2–5 znaków A-Z/0-9
  if (!/^[A-Z0-9]{2,5}$/.test(s)) return "";
  return s;
}

function show() {
  const bd = el("profileModalBackdrop");
  if (!bd) return;
  bd.style.display = "block";
}

function hide() {
  const bd = el("profileModalBackdrop");
  if (!bd) return;
  bd.style.display = "none";
}

export async function ensureUserProfile() {
  const settings = await getUserSettings();
  const profile = settings.profile || null;

  // jeśli mamy komplet profilu -> nie pokazujemy modala
  if (profile?.fullName && profile?.email && profile?.phone && profile?.initials) {
    return profile;
  }

  // pokaż modal i wypełnij jeśli coś jest
  show();

  const fullNameEl = el("profileFullName");
  const emailEl = el("profileEmail");
  const phoneEl = el("profilePhone");
  const initialsEl = el("profileInitials");
  const cancelBtn = el("profileCancelBtn");
  const saveBtn = el("profileSaveBtn");

  if (!fullNameEl || !emailEl || !phoneEl || !initialsEl || !cancelBtn || !saveBtn) {
    // jeśli modal nie istnieje w DOM, nie blokuj całej aplikacji bez jasnego błędu
    throw new Error("Brak elementów modala profilu w DOM (profileModalBackdrop / pola / przyciski).");
  }

  fullNameEl.value = profile?.fullName || "";
  emailEl.value = profile?.email || "";
  phoneEl.value = profile?.phone || "";

  // inicjały: najpierw to co w profilu, potem auto z nazwiska
  initialsEl.value = normalizeInitials(profile?.initials) || deriveInitials(profile?.fullName || "");

  // zabezpieczenie przed wielokrotnym podpinaniem listenerów
  if (!fullNameEl.dataset.boundInitials) {
    fullNameEl.dataset.boundInitials = "1";
    initialsEl.dataset.touched = "0";

    initialsEl.addEventListener("input", () => {
      initialsEl.dataset.touched = initialsEl.value.trim() ? "1" : "0";
    });

    fullNameEl.addEventListener("input", () => {
      // jeśli user ręcznie ustawił inicjały, nie nadpisuj
      if (initialsEl.dataset.touched === "1") return;
      initialsEl.value = deriveInitials(fullNameEl.value);
    });
  }

  return await new Promise((resolve) => {
    cancelBtn.onclick = async () => {
      // Na pierwszym uruchomieniu profil jest wymagany
      alert("Profil jest wymagany, aby aplikacja mogła nadawać numerację i uzupełniać dane.");
    };

    saveBtn.onclick = async () => {
      const fullName = fullNameEl.value.trim();
      const email = emailEl.value.trim();
      const phone = phoneEl.value.trim();

      // inicjały: z pola albo auto z nazwiska, ale po walidacji
      const initials = normalizeInitials(initialsEl.value) || normalizeInitials(deriveInitials(fullName));

      if (!fullName || !email || !phone || !initials) {
        alert("Uzupełnij: imię i nazwisko, e-mail, telefon oraz poprawne inicjały (np. JK).");
        return;
      }

      // 1) zapisz ustawienia
      await setUserSettings({
        profile: { fullName, email, phone, initials }
      });

      // 2) KLUCZ: wymuś re-read po zapisie (produkcja potrafi mieć inny timing)
      const fresh = await getUserSettings();
      const freshProfile = fresh?.profile || { fullName, email, phone, initials };

      hide();
      resolve(freshProfile);
    };
  });
}

export function applyProfileToForm(profile) {
  if (!profile) return;

  const nameEl = document.getElementById("creatorName");
  const emailEl = document.getElementById("creatorEmail");
  const phoneEl = document.getElementById("creatorPhone");

  if (nameEl && !nameEl.value.trim()) nameEl.value = profile.fullName;
  if (emailEl && !emailEl.value.trim()) emailEl.value = profile.email;
  if (phoneEl && !phoneEl.value.trim()) phoneEl.value = profile.phone;
}
