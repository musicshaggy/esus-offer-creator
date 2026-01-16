import { offersService } from "../offers/offersService.js";

const el = id=>document.getElementById(id);
const show=()=>el("offersModalBackdrop").style.display="block";
const hide=()=>el("offersModalBackdrop").style.display="none";

function fmtWhen(iso){
  if(!iso) return "";
  try{
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (x)=>String(x).padStart(2,"0");
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{ return ""; }
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function normalize(s){
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function setBusy(state){
  const b = el("btnOffersNew");
  if (b) b.disabled = !!state;
  const close = el("btnOffersClose");
  if (close) close.disabled = !!state;
}

export async function initOffersModal({onOfferLoaded,onNewOffer}){
  const tbody = el("offersListBody");
  const search = el("offersSearch");
  const badge = el("offersCountBadge");

  async function render(list){
    if (badge) {
      const n = Array.isArray(list) ? list.length : 0;
      badge.textContent = n === 1 ? "1 oferta" : `${n} ofert`;
    }
    const q = normalize(search?.value || "");
    const rows = (Array.isArray(list) ? list : [])
      .filter(o => {
        if(!q) return true;
        const hay = normalize(`${o.offerNo} ${o.client} ${o.updatedAt}`);
        return hay.includes(q);
      });

    tbody.innerHTML = rows.length
      ? rows.map(o=>{
          const when = fmtWhen(o.updatedAt);
          const client = escapeHtml(o.client || "");
          const no = escapeHtml(o.offerNo || "—");
          return `
            <tr>
              <td class="offer-no">${no}</td>
              <td class="offer-client">${client}</td>
              <td class="offer-updated">${escapeHtml(when)}</td>
              <td class="offer-actions">
                <button class="btnTiny" data-open="${o.id}" title="Otwórz">Otwórz</button>
                <button class="btnTiny secondary" data-dup="${o.id}" title="Duplikuj">Duplikuj</button>
                <button class="btnTiny danger" data-del="${o.id}" title="Usuń">Usuń</button>
              </td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="4" class="offers-empty">Brak zapisanych ofert.</td></tr>`;

    // actions
    tbody.querySelectorAll("[data-open]").forEach(b=>{
      b.onclick = async()=>{
        try{
          setBusy(true);
          const p = await offersService.open(b.dataset.open);
          await onOfferLoaded(p);
          hide();
        }finally{ setBusy(false); }
      };
    });
    tbody.querySelectorAll("[data-dup]").forEach(b=>{
      b.onclick = async()=>{
        try{
          setBusy(true);
          const p = await offersService.duplicate(b.dataset.dup);
          await onOfferLoaded(p);
          hide();
        }finally{ setBusy(false); }
      };
    });
    tbody.querySelectorAll("[data-del]").forEach(b=>{
      b.onclick = async()=>{
        const id = b.dataset.del;
        const row = b.closest("tr");
        const no = row?.querySelector(".offer-no")?.textContent?.trim() || "tę ofertę";
        if(!confirm(`Usunąć ${no}? Tej operacji nie można cofnąć.`)) return;
        try{
          setBusy(true);
          await offersService.delete(id);
          const fresh = await offersService.list();
          await render(fresh);
        }finally{ setBusy(false); }
      };
    });
  }

  el("btnOffers")?.addEventListener("click", async ()=>{
    const list = await offersService.list();
    await render(list);
    show();
    // autofocus search (nice UX)
    setTimeout(()=>search?.focus(), 50);
  });

  search?.addEventListener("input", async()=>{
    const list = await offersService.list();
    await render(list);
  });

  el("btnOffersNew")?.addEventListener("click", async()=>{
    try{
      setBusy(true);
      await onNewOffer();
      hide();
    }finally{ setBusy(false); }
  });

  el("btnOffersClose")?.addEventListener("click", hide);
}
