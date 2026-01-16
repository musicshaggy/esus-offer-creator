import { el, escapeHtml, toNumber, money } from "../utils/format.js";
import { store, removeItem, updateItem } from "../state/store.js";
import { itemNetAfterDiscount, calcRowProfitAndMargin } from "../calc/pricing.js";

export function updateRowCalcUI(tr, it) {
  if (!tr) return;

  const { profitLine, marginPct } = calcRowProfitAndMargin(it);

  const profitEl = tr.querySelector(".js-profitValue");
  const marginEl = tr.querySelector(".js-marginValue");

  if (profitEl) {
    profitEl.textContent = money(profitLine);
    profitEl.classList.toggle("negative", profitLine < 0);
  }
  if (marginEl) {
    marginEl.textContent = marginPct.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%";
  }
}

export function renderItems({ onTotalsChanged, onStateChanged } = {}) {
  const tbody = el("itemsBody");
  tbody.innerHTML = "";

  store.items.forEach((it, idx) => {
    const qty = Math.max(1, parseInt(it.qty || 1, 10));
    const sellNetAfter = itemNetAfterDiscount(it);
    const buyNet = Math.max(0, toNumber(it.buyNet));
    const revenueLine = sellNetAfter * qty;
    const costLine = buyNet * qty;
    const profitLine = revenueLine - costLine;
    const marginLine = revenueLine > 0 ? (profitLine / revenueLine) * 100 : 0;

    const profitText = money(profitLine);
    const marginText = marginLine.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "%";
    const profitClass = profitLine < 0 ? "calcCell negative" : "calcCell";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <label class="mini">Opis pozycji</label>
        <input class="descInput" data-k="desc" data-i="${idx}" placeholder="Np. Dell PowerEdge / RAM / SSD..." value="${escapeHtml(it.desc)}" />
      </td>
	<td>
	  <label class="mini">Zakup NETTO</label>

	  <div class="input-money">
		  <input
			data-k="buyNet"
			data-i="${idx}"
			type="number"
			min="0"
			step="0.01"
			value="${toNumber(it.buyNet)}"
		  />

		  <button
			type="button"
			class="input-money__ccyBtn js-ccyBtn"
			data-ccy="PLN"
			aria-haspopup="listbox"
			aria-expanded="false"
			title="Wybierz walutę"
		  >
			PLN
		  </button>

		  <div class="ccyMenu js-ccyMenu" role="listbox" aria-hidden="true">
			<button type="button" class="ccyOpt" data-ccy="PLN">PLN</button>
			<button type="button" class="ccyOpt" data-ccy="USD">USD</button>
			<button type="button" class="ccyOpt" data-ccy="EUR">EUR</button>
		  </div>
		</div>
	</td>

      <td>
        <label class="mini">Netto (PLN)</label>
        <input data-k="net" data-i="${idx}" type="number" min="0" step="0.01" value="${toNumber(it.net)}" />
      </td>
      <td>
        <label class="mini">Rabat (%)</label>
        <input data-k="discount" data-i="${idx}" type="number" min="0" max="100" step="0.01" value="${toNumber(it.discount)}" />
      </td>
      <td>
        <label class="mini">Ilość</label>
        <input data-k="qty" data-i="${idx}" type="number" min="1" step="1" value="${Math.max(1, parseInt(it.qty || 1, 10))}" />
      </td>
      <td class="td-actions">
        <button class="btnTiny danger" title="Usuń" data-del="${idx}">🗑</button>
      </td>
	<td class="profitCell">
	  <div class="profitWrap">
		<div class="${profitClass} js-profitValue">${profitText}</div>
		<div class="mini js-marginValue">${marginText}</div>
	  </div>
	</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("input").forEach((ctrl) => {
    ctrl.addEventListener("input", (e) => {
      const i = parseInt(e.target.getAttribute("data-i"), 10);
      const k = e.target.getAttribute("data-k");
      if (!Number.isFinite(i) || !k) return;

      if (k === "qty") updateItem(i, { [k]: Math.max(1, parseInt(e.target.value || "1", 10)) });
      else if (k === "desc") updateItem(i, { [k]: e.target.value });
      else updateItem(i, { [k]: toNumber(e.target.value) });

      onTotalsChanged?.();
      updateRowCalcUI(e.target.closest("tr"), store.items[i]);
      onStateChanged?.();
    });
  });

  tbody.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-del"), 10);
      removeItem(idx);
      renderItems({ onTotalsChanged, onStateChanged });
      onTotalsChanged?.();
      onStateChanged?.();
    });
  });
}
