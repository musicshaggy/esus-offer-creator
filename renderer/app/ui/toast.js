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
    <div class="appToastActions"></div>
    <button type="button" class="appToastClose" aria-label="Zamknij">×</button>
  `;

  document.body.appendChild(el);

  el.querySelector(".appToastClose")?.addEventListener("click", hideToast);

  _toastEl = el;
  return el;
}

function clearTimer() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

export function showToast(message, { type = "info", ms = 3000 } = {}) {
  const toast = ensureToastEl();
  const textEl = toast.querySelector(".appToastText");
  const actions = toast.querySelector(".appToastActions");

  if (textEl) textEl.textContent = String(message ?? "");
  if (actions) actions.innerHTML = ""; // brak akcji

  toast.classList.toggle("is-error", type === "error");

  toast.style.display = "flex";
  toast.classList.remove("is-show");
  void toast.offsetWidth;
  toast.classList.add("is-show");

  clearTimer();
	  if (ms && ms > 0) {
	  _timer = setTimeout(hideToast, ms);
	}

}

/**
 * Toast z akcją (np. "Cofnij"). Nie blokuje UI.
 * actionLabel + onAction są opcjonalne (możesz zrobić tylko "OK").
 */
export function showToastAction(
  message,
  {
    type = "info",
    ms = 6000,
    actionLabel = "Cofnij",
    onAction = null,
    secondaryLabel = null,
    onSecondary = null,
    keepOpenOnAction = false,
  } = {}
) {
  const toast = ensureToastEl();
  const textEl = toast.querySelector(".appToastText");
  const actions = toast.querySelector(".appToastActions");

  if (textEl) textEl.textContent = String(message ?? "");

  if (actions) {
    actions.innerHTML = "";

    if (actionLabel && typeof onAction === "function") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "appToastBtn appToastBtnPrimary";
      btn.textContent = actionLabel;
      btn.addEventListener("click", async () => {
        try {
          await onAction();
        } finally {
          if (!keepOpenOnAction) hideToast();
        }
      });
      actions.appendChild(btn);
    }

    if (secondaryLabel && typeof onSecondary === "function") {
      const btn2 = document.createElement("button");
      btn2.type = "button";
      btn2.className = "appToastBtn";
      btn2.textContent = secondaryLabel;
      btn2.addEventListener("click", async () => {
        try {
          await onSecondary();
        } finally {
          hideToast();
        }
      });
      actions.appendChild(btn2);
    }
  }

  toast.classList.toggle("is-error", type === "error");

  toast.style.display = "flex";
  toast.classList.remove("is-show");
  void toast.offsetWidth;
  toast.classList.add("is-show");

  clearTimer();
  _timer = setTimeout(hideToast, ms);
}

export function hideToast() {
  const toast = _toastEl;
  if (!toast) return;

  const actions = toast.querySelector(".appToastActions");
  if (actions) actions.innerHTML = "";

  toast.style.display = "none";
  toast.classList.remove("is-show", "is-error");

  clearTimer();
}

export function updateToast(message) {
  const toast = ensureToastEl();
  const textEl = toast.querySelector(".appToastText");
  if (textEl) textEl.textContent = String(message ?? "");
}

// === Progress toast API ===
let _progress = { active: false };

export function showToastProgress(title, { type = "info" } = {}) {
  const toast = ensureToastEl();
  const textEl = toast.querySelector(".appToastText");
  const actions = toast.querySelector(".appToastActions");

  toast.classList.toggle("is-error", type === "error");

  // UI: title + progress
  if (textEl) {
    textEl.innerHTML = `
      <div class="appToastTitle">${String(title ?? "")}</div>
      <div class="appToastProgressRow">
        <div class="appToastProgressBar"><div class="appToastProgressFill" style="width:0%"></div></div>
        <div class="appToastProgressPct">0%</div>
      </div>
    `;
  }
  if (actions) actions.innerHTML = ""; // bez akcji w trakcie pobierania

  toast.style.display = "flex";
  toast.classList.remove("is-show");
  void toast.offsetWidth;
  toast.classList.add("is-show");

  // IMPORTANT: progress toast nie znika sam
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  _progress.active = true;
}

export function updateToastProgress(percent) {
  if (!_progress.active) return;
  const toast = ensureToastEl();
  const fill = toast.querySelector(".appToastProgressFill");
  const pctEl = toast.querySelector(".appToastProgressPct");

  const p = Math.max(0, Math.min(100, Math.round(Number(percent || 0))));
  if (fill) fill.style.width = `${p}%`;
  if (pctEl) pctEl.textContent = `${p}%`;
}

export function endToastProgress() {
  _progress.active = false;
}
