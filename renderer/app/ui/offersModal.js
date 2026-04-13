import { offersService } from "../offers/offersService.js";

const el = (id) => document.getElementById(id);
const show = () => (el("offersModalBackdrop").style.display = "block");
const hide = () => (el("offersModalBackdrop").style.display = "none");

function fmtWhen(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (x) => String(x).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function normalize(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function setBusy(state) {
  const b = el("btnOffersNew");
  if (b) b.disabled = !!state;
  const close = el("btnOffersClose");
  if (close) close.disabled = !!state;
}

function createActionButton({ className = "", text, title, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = text;
  if (title) btn.title = title;
  btn.onclick = onClick;
  return btn;
}

function createOfferRow(offer, { onOpen, onDuplicate, onDelete }) {
  const tr = document.createElement("tr");

  const tdNo = document.createElement("td");
  tdNo.className = "offer-no";
  tdNo.textContent = String(offer.offerNo || "—");

  const tdClient = document.createElement("td");
  tdClient.className = "offer-client";
  tdClient.textContent = String(offer.client || "");

  const tdUpdated = document.createElement("td");
  tdUpdated.className = "offer-updated";
  tdUpdated.textContent = fmtWhen(offer.updatedAt);

  const tdActions = document.createElement("td");
  tdActions.className = "offer-actions";

  tdActions.appendChild(
    createActionButton({
      className: "btnTiny",
      text: "Otwórz",
      title: "Otwórz",
      onClick: onOpen,
    })
  );
  tdActions.appendChild(
    createActionButton({
      className: "btnTiny secondary",
      text: "Duplikuj",
      title: "Duplikuj",
      onClick: onDuplicate,
    })
  );
  tdActions.appendChild(
    createActionButton({
      className: "btnTiny danger",
      text: "Usuń",
      title: "Usuń",
      onClick: onDelete,
    })
  );

  tr.appendChild(tdNo);
  tr.appendChild(tdClient);
  tr.appendChild(tdUpdated);
  tr.appendChild(tdActions);
  return tr;
}

function createEmptyRow() {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 4;
  td.className = "offers-empty";
  td.textContent = "Brak zapisanych ofert.";
  tr.appendChild(td);
  return tr;
}

export async function initOffersModal({ onOfferLoaded, onNewOffer }) {
  const tbody = el("offersListBody");
  const search = el("offersSearch");
  const badge = el("offersCountBadge");

  async function render(list) {
    if (badge) {
      const n = Array.isArray(list) ? list.length : 0;
      badge.textContent = n === 1 ? "1 oferta" : `${n} ofert`;
    }
    const q = normalize(search?.value || "");
    const rows = (Array.isArray(list) ? list : []).filter((o) => {
      if (!q) return true;
      const hay = normalize(`${o.offerNo} ${o.client} ${o.updatedAt}`);
      return hay.includes(q);
    });

    tbody.textContent = "";

    if (!rows.length) {
      tbody.appendChild(createEmptyRow());
      return;
    }

    rows.forEach((o) => {
      const row = createOfferRow(o, {
        onOpen: async () => {
          try {
            setBusy(true);
            const p = await offersService.open(o.id);
            await onOfferLoaded(p);
            hide();
          } finally {
            setBusy(false);
          }
        },
        onDuplicate: async () => {
          try {
            setBusy(true);
            const p = await offersService.duplicate(o.id);
            await onOfferLoaded(p);
            hide();
          } finally {
            setBusy(false);
          }
        },
        onDelete: async () => {
          const no = String(o.offerNo || "tę ofertę");
          if (!confirm(`Usunąć ${no}? Tej operacji nie można cofnąć.`)) return;
          try {
            setBusy(true);
            await offersService.delete(o.id);
            const fresh = await offersService.list();
            await render(fresh);
          } finally {
            setBusy(false);
          }
        },
      });

      tbody.appendChild(row);
    });
  }

  el("btnOffers")?.addEventListener("click", async () => {
    const list = await offersService.list();
    await render(list);
    show();
    setTimeout(() => search?.focus(), 50);
  });

  search?.addEventListener("input", async () => {
    const list = await offersService.list();
    await render(list);
  });

  el("btnOffersClose")?.addEventListener("click", hide);
  el("offersModalBackdrop")?.addEventListener("click", (e) => {
    if (e.target?.id === "offersModalBackdrop") hide();
  });

  el("btnOffersNew")?.addEventListener("click", async () => {
    try {
      setBusy(true);
      const p = await offersService.new();
      await onNewOffer?.(p);
      hide();
    } finally {
      setBusy(false);
    }
  });
}
