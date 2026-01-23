// renderer/app/ui/toast.js
let _toastEl = null;
let _timer = null;

function ensureToastEl() {
  if (_toastEl) return _toastEl;

  const el = document.createElement("div");
  el.id = "appToast";
  el.className = "appToast";
  el.style.display = "none";

  el.innerHTML = `
    <span class="appToastText"></span>
    <button type="button" class="appToastClose" aria-label="Zamknij">×</button>
  `;

  document.body.appendChild(el);

  const closeBtn = el.querySelector(".appToastClose");
  closeBtn?.addEventListener("click", hideToast);

  _toastEl = el;
  return el;
}

export function showToast(message, { type = "info", ms = 3000 } = {}) {
  const toast = ensureToastEl();
  const textEl = toast.querySelector(".appToastText");

  if (textEl) textEl.textContent = String(message ?? "");

  toast.classList.toggle("is-error", type === "error");

  toast.style.display = "flex";
  toast.classList.remove("is-show");
  // restart animacji
  void toast.offsetWidth;
  toast.classList.add("is-show");

  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(hideToast, ms);
}

export function hideToast() {
  const toast = _toastEl;
  if (!toast) return;

  toast.style.display = "none";
  toast.classList.remove("is-show", "is-error");

  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}
