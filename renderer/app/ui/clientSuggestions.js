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

function applyClientToForm(client) {
  if (!client) return;

  const nameEl = el("custName");
  const nipEl = el("custNip");
  const addrEl = el("custAddr");
  const contactEl = el("custContact");

  if (nipEl) nipEl.value = client.nip || "";
  if (nameEl && !String(nameEl.value || "").trim()) nameEl.value = client.name || "";
  if (addrEl && !String(addrEl.value || "").trim()) addrEl.value = client.addr || "";
  if (contactEl && !String(contactEl.value || "").trim()) contactEl.value = client.contact || "";

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
  if (!nipEl || !window.esusAPI?.clientsSuggest || !window.esusAPI?.clientGetByNip) return;

  let lastAppliedNip = "";

  const refreshSuggestions = debounce(async () => {
    const raw = String(nipEl.value || "").trim();
    const query = normalizeNip(raw) || raw;
    const rows = await window.esusAPI.clientsSuggest(query);
    renderSuggestions(rows);
  });

  async function tryApplyKnownClient({ notify = false } = {}) {
    const normalized = normalizeNip(nipEl.value);
    if (!normalized) {
      lastAppliedNip = "";
      return;
    }

    const client = await window.esusAPI.clientGetByNip(normalized);
    if (!client) {
      lastAppliedNip = "";
      return;
    }

    if (lastAppliedNip !== client.nip) {
      applyClientToForm(client);
      lastAppliedNip = client.nip;
      onStateChanged?.();
      if (notify) {
        showToast(`Uzupełniono dane klienta: ${client.name || client.nip}.`, { type: "info", ms: 2200 });
      }
      return;
    }
  }

  nipEl.addEventListener("focus", refreshSuggestions);
  nipEl.addEventListener("input", async () => {
    lastAppliedNip = "";
    refreshSuggestions();
    await tryApplyKnownClient();
  });
  nipEl.addEventListener("change", async () => {
    await tryApplyKnownClient({ notify: true });
  });
  nipEl.addEventListener("blur", async () => {
    await tryApplyKnownClient();
  });
}
