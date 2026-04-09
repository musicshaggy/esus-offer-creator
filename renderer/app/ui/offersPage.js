import { money, ymdToPL, escapeHtml, toNumber } from "../utils/format.js";
import { VAT_RATE } from "../config/constants.js";
import { itemNetAfterDiscount } from "../calc/pricing.js";
import { showToast, showToastAction } from "../ui/toast.js";
import { getExchange } from "../state/store.js";

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

function pickUpdatedAt(row) {
  return (
    row?.meta?.updatedAt ||
    row?.updatedAt ||
    row?.updated ||
    row?.modifiedAt ||
    row?.ts ||
    row?.meta?.createdAt ||
    row?.createdAt ||
    ""
  );
}

function pickCreatedAt(row) {
  return (
    row?.meta?.createdAt ||
    row?.createdAt ||
    row?.meta?.updatedAt ||
    row?.updatedAt ||
    ""
  );
}

function dateScore(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function pickOfferCcy(row) {
  return String(row?.offerCcy || row?.meta?.offerCcy || "PLN").toUpperCase();
}

function pickGross(row) {
  const v =
    row?.gross ??
    row?.meta?.totals?.gross ??
    row?.meta?.sumGross ??
    row?.meta?.totalGross ??
    row?.meta?.gross ??
    row?.totals?.gross ??
    row?.sumGross ??
    row?.totalGross;

  const n = Number(v);
  const ccy = pickOfferCcy(row);
  return Number.isFinite(n) ? money(n, ccy) : "—";
}

function grossScorePln(row) {
  const gross = Number(row?.gross ?? 0);
  if (!Number.isFinite(gross)) return 0;

  const ccy = pickOfferCcy(row);
  if (ccy === "PLN") return gross;

  const ex = getExchange();
  const rate = Number(ex?.rates?.[ccy]);
  return Number.isFinite(rate) ? gross * rate : gross;
}

function compareNumber(a, b, dir = "asc") {
  const left = Number(a || 0);
  const right = Number(b || 0);
  return dir === "asc" ? left - right : right - left;
}

function compareText(a, b, dir = "asc") {
  const cmp = String(a || "").localeCompare(String(b || ""), "pl", { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function cloneTopbarHeader() {
  const offersPage = document.getElementById("offersPage");
  if (!offersPage) return;

  const already = offersPage.querySelector("[data-offers-cloned='1']");
  if (already) return;

  const topbar = document.getElementById("topbar") || document.querySelector("[data-role='topbar']");
  const header = document.getElementById("header") || document.querySelector("[data-role='header']");
  if (!topbar && !header) return;

  const wrap = document.createElement("div");
  wrap.dataset.offersCloned = "1";

  const safeClone = (node) => {
    const c = node.cloneNode(true);
    c.removeAttribute("id");
    c.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
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

function resetOffersTableScroll() {
  const wrap = qs("offersTableWrap");
  if (!wrap) return;

  wrap.scrollLeft = 0;
  wrap.scrollTop = 0;

  requestAnimationFrame(() => {
    wrap.scrollLeft = 0;
  });
}

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
    const rowId =
      row?.id || row?.key || row?.offerId || row?.offerUID || row?.offerUuid ||
      row?.meta?.id || row?.meta?.offerId || null;

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

// ✅ NEW: wyciągnij stawkę VAT z payloadu oferty (meta/fields)
function getVatRateFromPayload(p) {
  // ✅ NAJPIERW fields (to jest realny wybór z UI zapisany autosave)
  const raw =
    p?.fields?.offerVat ??
    p?.fields?.offerVatCode ??
    p?.fields?.vatCode ??
    p?.meta?.vatCode ??
    p?.vatCode ??
    p?.meta?.vat?.code ??
    null;

  if (raw == null) return VAT_RATE;

  const s = String(raw).trim().toUpperCase();

  // 0% (WDT/EX lub label typu "0% (WDT)")
  if (s.includes("WDT")) return 0;
  if (s === "EX" || s.includes("0EX")) return 0;
  if (s.startsWith("0")) return 0; // "0", "0%", "0_WDT", "0_EX", itd.

  const num = parseInt(s.replace("%", ""), 10);
  if (Number.isFinite(num)) return num / 100;

  return VAT_RATE;
}

function computeTotalsFromPayload(p) {
  const items = Array.isArray(p?.items) ? p.items : [];
  const sumNet = items.reduce((acc, it) => {
    const qty = Math.max(1, parseInt(it?.qty || 1, 10));
    return acc + (itemNetAfterDiscount(it) * qty);
  }, 0);

  const shipNet = toNumber(p?.fields?.shippingNet ?? p?.fields?.shipNet ?? p?.meta?.shippingNet ?? 0);
  const netTotal = sumNet + shipNet;

  const vatRate = getVatRateFromPayload(p);   // ✅ TU
  const grossTotal = netTotal * (1 + vatRate);

  return { net: netTotal, gross: grossTotal };
}

async function offersOpen(id) {
  if (!window.esusAPI) throw new Error("Brak window.esusAPI (preload)");
  if (typeof window.esusAPI.offersOpen === "function") return await window.esusAPI.offersOpen(id);
  if (window.esusAPI.offers && typeof window.esusAPI.offers.open === "function") return await window.esusAPI.offers.open(id);
  throw new Error("Brak metody offersOpen()");
}

async function enrichOffers(list) {
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

        // waluta oferty (żeby lista nie spadała do PLN)
        const ccy = String(p?.meta?.offerCcy || r?.offerCcy || r?.meta?.offerCcy || "PLN").toUpperCase();
        r.offerCcy = ccy;
        r.meta = { ...(r.meta || {}), offerCcy: ccy };

        // client
        if (!r.client) r.client = p?.fields?.custName || p?.meta?.client || p?.client || "";

        // totals
        const grossSaved = p?.totals?.gross ?? p?.totals?.sumGross ?? p?.totals?.totalGross;
        const netSaved = p?.totals?.net ?? p?.totals?.sumNet ?? p?.totals?.totalNet;

        const calc = computeTotalsFromPayload(p);

        const hasItems = Array.isArray(p?.items) && p.items.length > 0;
        if (hasItems) {
          // ✅ teraz brutto liczy się wg stawki VAT oferty (w tym 0%)
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
        r.createdAt = r.createdAt || p?.meta?.createdAt || r.updatedAt || "";
      } catch (e) {
        console.warn("enrich offer failed", id, e);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, () => worker());
  await Promise.all(workers);
  return rows;
}

async function loadOffers() {
  if (!window.esusAPI) throw new Error("Brak window.esusAPI (preload)");
  let list;
  if (typeof window.esusAPI.offersList === "function") list = await window.esusAPI.offersList();
  else if (window.esusAPI.offers && typeof window.esusAPI.offers.list === "function") list = await window.esusAPI.offers.list();
  else throw new Error("Brak metody offersList()");

  return await enrichOffers(list);
}

export function initOffersSubpage({ onBack, onOpenOfferLoaded, onNewOffer } = {}) {
  const searchEl = qs("offersSearch");
  const btnRefresh = qs("btnOffersRefresh");
  const btnBack = qs("btnOffersBack");
  const btnNew = qs("btnOffersNew");
  const sortButtons = Array.from(document.querySelectorAll(".offers-sort-btn"));

  cloneTopbarHeader();

  let all = [];
  let sortState = { key: "created", dir: "desc" };

  async function refresh() {
    all = await loadOffers();
    applyFilter();
    resetOffersTableScroll();
  }

  function syncSortUi() {
    for (const btn of sortButtons) {
      const active = btn.dataset.sortKey === sortState.key;
      btn.classList.toggle("is-active", active);
      const indicator = btn.querySelector(".offers-sort-indicator");
      if (!indicator) continue;
      indicator.textContent = active ? (sortState.dir === "asc" ? "↑" : "↓") : "↕";
    }
  }

  function sortRows(rows) {
    const copy = Array.isArray(rows) ? rows.slice() : [];

    copy.sort((a, b) => {
      if (sortState.key === "client") {
        const clientCmp = compareText(pickClient(a), pickClient(b), sortState.dir);
        if (clientCmp !== 0) return clientCmp;
        return compareNumber(dateScore(pickCreatedAt(a)), dateScore(pickCreatedAt(b)), "desc");
      }

      if (sortState.key === "updated") {
        const updatedCmp = compareNumber(dateScore(pickUpdatedAt(a)), dateScore(pickUpdatedAt(b)), sortState.dir);
        if (updatedCmp !== 0) return updatedCmp;
        return compareNumber(dateScore(pickCreatedAt(a)), dateScore(pickCreatedAt(b)), "desc");
      }

      if (sortState.key === "gross") {
        const grossCmp = compareNumber(grossScorePln(a), grossScorePln(b), sortState.dir);
        if (grossCmp !== 0) return grossCmp;
        return compareNumber(dateScore(pickCreatedAt(a)), dateScore(pickCreatedAt(b)), "desc");
      }

      const createdCmp = compareNumber(dateScore(pickCreatedAt(a)), dateScore(pickCreatedAt(b)), sortState.dir);
      if (createdCmp !== 0) return createdCmp;
      return compareNumber(dateScore(pickUpdatedAt(a)), dateScore(pickUpdatedAt(b)), "desc");
    });

    return copy;
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

    const sortedRows = sortRows(rows);
    syncSortUi();

    renderRows(sortedRows, {
      onOpen: async (row, rowId) => {
        const id = rowId || row?.id || row?.key || row?.offerId;
        try {
          const offer = await offersOpen(id);
          await onOpenOfferLoaded?.(offer);
          onBack?.();
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

        showToastAction(`Usunąć ofertę ${no}?`, {
          type: "error",
          ms: 8000,
          actionLabel: "Usuń",
          secondaryLabel: "Anuluj",
          onSecondary: async () => {},

          onAction: async () => {
            try {
              await window.esusAPI.offersDelete(id);
              window.dispatchEvent(new CustomEvent("esus:offerDeleted", { detail: { id } }));
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

    resetOffersTableScroll();
  }

  btnRefresh?.addEventListener("click", refresh);
  btnBack?.addEventListener("click", () => onBack?.());
  btnNew?.addEventListener("click", () => onNewOffer?.());
  searchEl?.addEventListener("input", applyFilter);
  sortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = String(btn.dataset.sortKey || "created");
      if (sortState.key === key) {
        sortState = { key, dir: sortState.dir === "asc" ? "desc" : "asc" };
      } else {
        sortState = {
          key,
          dir: key === "client" ? "asc" : "desc",
        };
      }
      applyFilter();
    });
  });

  window.addEventListener("resize", resetOffersTableScroll);

  return { refresh };
}
