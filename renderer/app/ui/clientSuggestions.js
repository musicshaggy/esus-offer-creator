import { showToast } from "./toast.js";

function el(id) {
  return document.getElementById(id);
}

function normalizeNip(value) {
  return String(value || "").replace(/\D+/g, "");
}

function debounce(fn, wait = 180) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function setLookupLoading(active) {
  el("custNipLoading")?.classList.toggle("is-active", !!active);
}

function clearClientFields() {
  const nameEl = el("custName");
  const addrEl = el("custAddr");
  const contactEl = el("custContact");

  [nameEl, addrEl, contactEl].forEach((node) => {
    if (!node) return;
    node.value = "";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function applyClientToForm(client) {
  if (!client) return;

  const nameEl = el("custName");
  const nipEl = el("custNip");
  const addrEl = el("custAddr");
  const contactEl = el("custContact");

  if (nipEl) nipEl.value = client.nip || "";
  if (nameEl) nameEl.value = client.name || "";
  if (addrEl) addrEl.value = client.addr || "";
  if (contactEl) contactEl.value = client.contact || "";

  [nameEl, nipEl, addrEl, contactEl].forEach((node) => {
    if (!node) return;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function renderSuggestions(clients) {
  const listEl = el("clientsNipSuggestions");
  if (!listEl) return;

  listEl.innerHTML = "";
  for (const client of clients || []) {
    const option = document.createElement("option");
    option.value = client.nip || "";
    option.label = [client.name, client.addr].filter(Boolean).join(" - ");
    listEl.appendChild(option);
  }
}

export function initClientSuggestions({ onStateChanged } = {}) {
  const nipEl = el("custNip");
  const deleteBtn = el("btnDeleteClientCache");
  if (!nipEl || !window.esusAPI?.clientsSuggest || !window.esusAPI?.clientGetByNip) return;

  let lastAppliedNip = "";
  let lastAutofilled = null;
  let lookupToken = 0;

  const refreshSuggestions = debounce(async () => {
    const raw = String(nipEl.value || "").trim();
    const query = normalizeNip(raw) || raw;
    const rows = await window.esusAPI.clientsSuggest(query);
    renderSuggestions(rows);
  });

  function maybeClearPreviousAutofill(nextNip) {
    const normalizedNext = normalizeNip(nextNip);
    if (!lastAutofilled?.nip) return;
    if (!normalizedNext || normalizedNext === lastAutofilled.nip) return;

    const nameEl = el("custName");
    const addrEl = el("custAddr");
    const contactEl = el("custContact");

    if (nameEl && String(nameEl.value || "") === String(lastAutofilled.name || "")) nameEl.value = "";
    if (addrEl && String(addrEl.value || "") === String(lastAutofilled.addr || "")) addrEl.value = "";
    if (contactEl && String(contactEl.value || "") === String(lastAutofilled.contact || "")) contactEl.value = "";

    [nameEl, addrEl, contactEl].forEach((node) => {
      if (!node) return;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });

    lastAutofilled = null;
    lastAppliedNip = "";
  }

  async function tryApplyKnownClient({ notify = false } = {}) {
    const normalized = normalizeNip(nipEl.value);
    if (!normalized || normalized.length !== 10) {
      lastAppliedNip = "";
      setLookupLoading(false);
      return;
    }

    const currentToken = ++lookupToken;
    setLookupLoading(true);

    try {
      const lookup = window.esusAPI?.clientLookupByNip
        ? await window.esusAPI.clientLookupByNip(normalized)
        : { client: await window.esusAPI.clientGetByNip(normalized), diagnostics: [] };

      if (currentToken !== lookupToken) return;

      const client = lookup?.client || null;

      if (!client) {
        lastAppliedNip = "";
        if (notify) {
          showToast("Nie znaleziono klienta w bazie danych.", { type: "error", ms: 3200 });
        }
        return;
      }

      if (lastAppliedNip !== client.nip) {
        applyClientToForm(client);
        lastAppliedNip = client.nip;
        lastAutofilled = {
          nip: client.nip || "",
          name: client.name || "",
          addr: client.addr || "",
          contact: client.contact || "",
        };
        onStateChanged?.();
        if (notify) {
          const sourceLabel =
            client?.source === "idosell"
              ? " z IdoSell"
              : client?.source === "mf"
                ? " z bazy MF"
                : "";
          showToast(`Uzupelniono dane klienta${sourceLabel}: ${client.name || client.nip}.`, {
            type: "info",
            ms: 2200,
          });
        }
      }
    } finally {
      if (currentToken === lookupToken) setLookupLoading(false);
    }
  }

  nipEl.addEventListener("focus", refreshSuggestions);
  nipEl.addEventListener("input", async () => {
    maybeClearPreviousAutofill(nipEl.value);
    lastAppliedNip = "";
    refreshSuggestions();
    await tryApplyKnownClient();
  });
  nipEl.addEventListener("change", async () => {
    maybeClearPreviousAutofill(nipEl.value);
    await tryApplyKnownClient({ notify: true });
  });
  nipEl.addEventListener("blur", async () => {
    await tryApplyKnownClient({ notify: true });
  });

  deleteBtn?.addEventListener("click", async () => {
    const normalized = normalizeNip(nipEl.value);
    if (!normalized || normalized.length !== 10) {
      showToast("Wpisz pełny NIP klienta, którego chcesz usunąć z lokalnej bazy.", {
        type: "error",
        ms: 2800,
      });
      return;
    }

    try {
      const result = await window.esusAPI?.clientDeleteByNip?.(normalized);
      if (result?.deleted) {
        if (lastAutofilled?.nip === normalized) {
          clearClientFields();
          lastAutofilled = null;
          lastAppliedNip = "";
        }
        renderSuggestions(await window.esusAPI.clientsSuggest(normalized));
        showToast("Usunięto klienta z lokalnej bazy.", { type: "info", ms: 2400 });
        onStateChanged?.();
      } else {
        showToast("Nie znaleziono tego klienta w lokalnej bazie.", { type: "error", ms: 2800 });
      }
    } catch (error) {
      console.warn("Delete client cache failed:", error);
      showToast("Nie udało się usunąć klienta z lokalnej bazy.", { type: "error", ms: 3000 });
    }
  });
}
