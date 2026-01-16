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
    // jeśli ktoś wpisał tylko jedno słowo, bierzemy 2 pierwsze litery
    const w = parts[0];
    return (w.slice(0, 2)).toUpperCase();
  }

  const first = parts[0][0] || "";
  const last = parts[parts.length - 1][0] || "";
  return (first + last).toUpperCase();
}

function show() {
  el("profileModalBackdrop").style.display = "block";
}
function hide() {
  el("profileModalBackdrop").style.display = "none";
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

  el("profileFullName").value = profile?.fullName || "";
  el("profileEmail").value = profile?.email || "";
  el("profilePhone").value = profile?.phone || "";
  el("profileInitials").value = profile?.initials || deriveInitials(profile?.fullName || "");

  // auto inicjały przy wpisywaniu imienia/nazwiska
  el("profileFullName").addEventListener("input", () => {
    const auto = deriveInitials(el("profileFullName").value);
    // nie nadpisuj jeśli user już wpisał ręcznie coś innego i nie jest puste
    if (!el("profileInitials").value.trim()) el("profileInitials").value = auto;
  }, { once: false });
  
  let initialsTouched = false;

	el("profileInitials").addEventListener("input", () => {
	  initialsTouched = !!el("profileInitials").value.trim();
	});

	el("profileFullName").addEventListener("input", () => {
	  if (initialsTouched) return; // user ręcznie ustawił inicjały
	  el("profileInitials").value = deriveInitials(el("profileFullName").value);
	});

  return await new Promise((resolve) => {
    el("profileCancelBtn").onclick = async () => {
      // jeśli cancel na pierwszym uruchomieniu – zostawiamy modal (nie da się pracować bez profilu)
      // możesz zmienić na "zamknij aplikację" jeśli wolisz twardo
      alert("Profil jest wymagany, aby aplikacja mogła nadawać numerację i uzupełniać dane.");
    };

    el("profileSaveBtn").onclick = async () => {
      const fullName = el("profileFullName").value.trim();
      const email = el("profileEmail").value.trim();
      const phone = el("profilePhone").value.trim();
      const initials = (el("profileInitials").value.trim() || deriveInitials(fullName)).toUpperCase();

      if (!fullName || !email || !phone || !initials) {
        alert("Uzupełnij: imię i nazwisko, e-mail, telefon oraz inicjały.");
        return;
      }

      const next = await setUserSettings({
        profile: { fullName, email, phone, initials }
      });

      hide();
      resolve(next.profile);
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

