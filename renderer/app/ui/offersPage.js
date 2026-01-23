import { money, ymdToPL, escapeHtml, toNumber } from "../utils/format.js";
import { VAT_RATE } from "../config/constants.js";
import { itemNetAfterDiscount } from "../calc/pricing.js";
import { showToast, showToastAction } from "../ui/toast.js";

function pickOfferNo(row) {
  return (
    row?.meta?.offerNo ||
    row?.meta?.offerNumber ||
    row?.meta?.number ||
    row?.offerNo ||
    row?.offerNumber ||
    row?.number ||
    row?.no ||
    row?.fields?.offerNumber ||
    row?.fields?.offerNo ||
    row?.id ||
    "—"
  );
}
function pickClient(row) {
  return (
    row?.meta?.customerName ||
    row?.meta?.clientName ||
    row?.customer?.name ||
    row?.client?.name ||
    row?.client ||
    row?.customerName ||
    row?.clientName ||
    row?.fields?.custName ||
    row?.fields?.customerName ||
    row?.fields?.clientName ||
    "—"
  );
}
function pickUpdated(row) {
  const d =
    row?.meta?.updatedAt ||
    row?.updatedAt ||
    row?.updated ||
    row?.modifiedAt ||
    row?.ts ||
    row?.meta?.createdAt ||
    row?.createdAt;

  if (!d) return "—";

  try {
    if (typeof d === "number") {
      const iso = new Date(d).toISOString().slice(0, 10);
      return ymdToPL(iso);
    }
    const s = String(d);
    const iso = s.length >= 10 ? s.slice(0, 10) : s;
    return ymdToPL(iso);
  } catch {
    return "—";
  }
}
function pickGross(row) {
  const v =
    row?.gross ??
    row?.meta?.totals?.gross ??
    row?.meta?.sumGross ??
    row?.meta?.totalGross ??
    row?.meta?.gross ??
    row?.totals?.gross ??
    row?.gross ??
    row?.meta?.gross ??
    row?.sumGross ??
    row?.totalGross;

  const n = Number(v);
  return Number.isFinite(n) ? money(n) : "—";
}
function cloneTopbarHeader() {
  const offersPage = document.getElementById("offersPage");
  if (!offersPage) return;

  const already = offersPage.querySelector("[data-offers-cloned='1']");
  if (already) return;

  // próbujemy znaleźć topbar/header w głównym formularzu
  const topbar = document.getElementById("topbar") || document.querySelector("[data-role='topbar']");
  const header = document.getElementById("header") || document.querySelector("[data-role='header']");
  if (!topbar && !header) return;

  const wrap = document.createElement("div");
  wrap.dataset.offersCloned = "1";

  const safeClone = (node) => {
    const c = node.cloneNode(true);

    // ✅ klucz: usuń ID z całego poddrzewa (żeby getElementById nie wariował)
    c.removeAttribute("id");
    c.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));

    // opcjonalnie: wyłącz wszystkie inputy w sklonowanym nagłówku (żeby nie triggerowały eventów)
    c.querySelectorAll("input, select, textarea").forEach((n) => {
      n.disabled = true;
    });

    return c;
  };

  if (topbar) wrap.appendChild(safeClone(topbar));
  if (header) wrap.appendChild(safeClone(header));

  offersPage.prepend(wrap);
}

function qs(id) { return document.getElementById(id); }

function setCount(n) { qs("offersCount").textContent = String(n); }

function setEmpty(isEmpty) { qs("offersEmpty").style.display = isEmpty ? "block" : "none"; }

function renderRows(rows, { onOpen, onDuplicate, onDelete }) {
  const tbody = qs("offersTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!rows || rows.length === 0) {
    setCount(0);
    setEmpty(true);
    return;
  }
  setEmpty(false);
  setCount(rows.length);

  for (const row of rows) {
    const rowId = row?.id || row?.key || row?.offerId || row?.offerUID || row?.offerUuid || row?.meta?.id || row?.meta?.offerId || null;
    const offerNo = escapeHtml(pickOfferNo(row));
    const client = escapeHtml(pickClient(row));
    const updated = escapeHtml(pickUpdated(row));
    const gross = escapeHtml(pickGross(row));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="num">${offerNo}</td>
      <td>${client}</td>
      <td class="muted">${updated}</td>
      <td class="right">${gross}</td>
      <td class="right">
        <div class="row-actions">
          <button class="btn2 primary" data-act="open">Otwórz</button>
          <button class="btn2" data-act="dup">Duplikuj</button>
          <button class="btn2 danger" data-act="del">Usuń</button>
        </div>
      </td>
    `;

    tr.querySelector('[data-act="open"]')?.addEventListener("click", () => onOpen(row, rowId));
    tr.querySelector('[data-act="dup"]')?.addEventListener("click", () => onDuplicate(row, rowId));
    tr.querySelector('[data-act="del"]')?.addEventListener("click", () => onDelete(row, rowId));
    tbody.appendChild(tr);
  }
}

function computeTotalsFromPayload(p) {
  const items = Array.isArray(p?.items) ? p.items : [];
  const sumNet = items.reduce((acc, it) => {
    const qty = Math.max(1, parseInt(it?.qty || 1, 10));
    return acc + (itemNetAfterDiscount(it) * qty);
  }, 0);

  const shipNet = toNumber(p?.fields?.shippingNet ?? p?.fields?.shipNet ?? p?.meta?.shippingNet ?? 0);
  const netTotal = sumNet + shipNet;
  const grossTotal = netTotal * (1 + VAT_RATE);

  return { net: netTotal, gross: grossTotal };
}

async function offersOpen(id) {
  if (!window.esusAPI) throw new Error("Brak window.esusAPI (preload)");
  if (typeof window.esusAPI.offersOpen === "function") return await window.esusAPI.offersOpen(id);
  if (window.esusAPI.offers && typeof window.esusAPI.offers.open === "function") return await window.esusAPI.offers.open(id);
  throw new Error("Brak metody offersOpen()");
}

async function enrichOffers(list) {
  // offers:list zwraca skrócony index (id/offerNo/client/updatedAt) bez sum.
  // Dociągamy payload dla każdej oferty i uzupełniamy klienta oraz kwoty.
  const rows = Array.isArray(list) ? list.slice() : [];
  const concurrency = 4;
  let idx = 0;

  async function worker() {
    while (idx < rows.length) {
      const i = idx++;
      const r = rows[i];
      const id = r?.id || r?.key || r?.offerId || r?.offerNo || r?.offerNumber || r?.number;
      if (!id) continue;

      try {
        const p = await offersOpen(id);
        // client
        if (!r.client) r.client = p?.fields?.custName || p?.meta?.client || p?.client || "";
        // totals (nie ufamy 100% zapisanym totals — w razie braku lub rozjazdu liczymy z items)
        const grossSaved = p?.totals?.gross ?? p?.totals?.sumGross ?? p?.totals?.totalGross;
        const netSaved = p?.totals?.net ?? p?.totals?.sumNet ?? p?.totals?.totalNet;

        const calc = computeTotalsFromPayload(p);
        // jeśli oferta nie ma pozycji, użyj zapisanych totals
        const hasItems = Array.isArray(p?.items) && p.items.length > 0;
        if (hasItems) {
          r.gross = calc.gross;
          r.net = calc.net;
        } else {
          if (grossSaved != null) r.gross = grossSaved;
          if (netSaved != null) r.net = netSaved;
        }
        // offerNo
        r.offerNo = r.offerNo && r.offerNo !== "—" ? r.offerNo : (p?.meta?.offerNo || p?.offerNo || r.offerNo);
        // updatedAt
        r.updatedAt = r.updatedAt || p?.meta?.updatedAt || p?.meta?.createdAt || "";
      } catch (e) {
        // ignore per-row errors
        console.warn("enrich offer failed", id, e);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, () => worker());
  await Promise.all(workers);
  return rows;
}

async function loadOffers() {
  // API (preload.js) exposes flat methods: offersList/offersOpen/offersDelete/offersDuplicate
  if (!window.esusAPI) throw new Error("Brak window.esusAPI (preload)");
  let list;
  if (typeof window.esusAPI.offersList === "function") list = await window.esusAPI.offersList();
  else if (window.esusAPI.offers && typeof window.esusAPI.offers.list === "function") list = await window.esusAPI.offers.list();
  else throw new Error("Brak metody offersList()");

  // uzupełnij klienta i kwoty (brutto/netto) na podstawie pełnego payloadu
  return await enrichOffers(list);
}

export function initOffersSubpage({ onBack, onOpenOfferLoaded, onNewOffer } = {}) {
  const searchEl = qs("offersSearch");
  const btnRefresh = qs("btnOffersRefresh");
  const btnBack = qs("btnOffersBack");
  const btnNew = qs("btnOffersNew");

  cloneTopbarHeader();

  let all = [];

  async function refresh() {
    all = await loadOffers();
    applyFilter();
  }

  function applyFilter() {
    const q = (searchEl?.value || "").trim().toLowerCase();
    const rows = !q
      ? all
      : all.filter((r) => {
          const a = String(pickOfferNo(r)).toLowerCase();
          const b = String(pickClient(r)).toLowerCase();
          return a.includes(q) || b.includes(q);
        });

    renderRows(rows, {
      onOpen: async (row, rowId) => {
        const id = rowId || row?.id || row?.key || row?.offerId;
        if (!id) {
          showToast("Nie udało się otworzyć oferty (brak ID).", { type: "error", ms: 3500 });
          return;
        }
        try {
          const offer = await offersOpen(id);
          await onOpenOfferLoaded?.(offer);
          onBack?.(); // wróć do głównego ekranu po otwarciu
        } catch (e) {
          console.error(e);
          showToast("Nie udało się otworzyć oferty. Sprawdź konsolę.", { type: "error", ms: 3500 });
        }
      },

      onDuplicate: async (row, rowId) => {
        const id = rowId || row?.id || row?.key || row?.offerId;
        if (!id) {
          showToast("Nie udało się zduplikować oferty (brak ID).", { type: "error", ms: 3500 });
          return;
        }
        try {
          await window.esusAPI.offersDuplicate(id);
          await refresh();
          showToast("Utworzono duplikat oferty.", { type: "info", ms: 2500 });
        } catch (e) {
          console.error(e);
          showToast("Nie udało się zduplikować oferty. Sprawdź konsolę.", { type: "error", ms: 3500 });
        }
      },

      onDelete: async (row, rowId) => {
        const id = rowId || row?.id || row?.key || row?.offerId;
        const no = pickOfferNo(row);

        if (!id) {
          showToast("Nie udało się usunąć oferty (brak ID).", { type: "error", ms: 3500 });
          return;
        }

        // ✅ ZAMIANA confirm() -> toastAction (bez psucia focusu)
        showToastAction(`Usunąć ofertę ${no}?`, {
          type: "error",
          ms: 8000,
          actionLabel: "Usuń",
          secondaryLabel: "Anuluj",
          onSecondary: async () => {},

          onAction: async () => {
            try {
              await window.esusAPI.offersDelete(id);
              await refresh();
              showToast("Oferta usunięta.", { type: "info", ms: 2500 });
            } catch (e) {
              console.error(e);
              showToast("Nie udało się usunąć oferty. Sprawdź konsolę.", { type: "error", ms: 3500 });
            }
          },
        });
      },
    });
  }

  btnRefresh?.addEventListener("click", refresh);
  btnBack?.addEventListener("click", () => onBack?.());
  btnNew?.addEventListener("click", () => onNewOffer?.());
  searchEl?.addEventListener("input", applyFilter);

  return { refresh };
}
