// renderer/app/ui/toast.js
// Unified toast system (replaces alert/confirm) with support for:
// - info/error toasts
// - action toasts (primary/secondary buttons)
// - progress bar updates

let _toastEl = null;
let _timer = null;
let _progressActive = false;

function ensureToastEl() {
  if (_toastEl) return _toastEl;

  const el = document.createElement("div");
  el.id = "appToast";
  el.className = "appToast";
  el.style.display = "none";

  const body = document.createElement("div");
  body.className = "appToastBody";

  const text = document.createElement("div");
  text.className = "appToastText";
  body.appendChild(text);

  const progress = document.createElement("div");
  progress.className = "appToastProgress";
  progress.style.display = "none";

  const progressBar = document.createElement("div");
  progressBar.className = "appToastProgressBar";

  const progressFill = document.createElement("div");
  progressFill.className = "appToastProgressFill";
  progressFill.style.width = "0%";
  progressBar.appendChild(progressFill);

  const progressPct = document.createElement("div");
  progressPct.className = "appToastProgressPct";
  progressPct.textContent = "0%";

  progress.appendChild(progressBar);
  progress.appendChild(progressPct);
  body.appendChild(progress);

  const actions = document.createElement("div");
  actions.className = "appToastActions";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "appToastClose";
  closeBtn.setAttribute("aria-label", "Zamknij");
  closeBtn.textContent = "×";

  el.appendChild(body);
  el.appendChild(actions);
  el.appendChild(closeBtn);

  document.body.appendChild(el);
  closeBtn.addEventListener("click", hideToast);

  _toastEl = el;
  return el;
}

function clearTimer() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

function restartAnim(toast) {
  toast.classList.remove("is-show");
  void toast.offsetWidth;
  toast.classList.add("is-show");
}

export function showToast(message, { type = "info", ms = 3000 } = {}) {
  const toast = ensureToastEl();
  const textEl = toast.querySelector(".appToastText");
  const actionsEl = toast.querySelector(".appToastActions");
  const progEl = toast.querySelector(".appToastProgress");

  _progressActive = false;
  if (progEl) progEl.style.display = "none";
  if (actionsEl) actionsEl.textContent = "";

  if (textEl) textEl.textContent = String(message ?? "");

  toast.classList.toggle("is-error", type === "error");
  toast.style.display = "flex";
  restartAnim(toast);

  clearTimer();
  if (ms && ms > 0) {
    _timer = setTimeout(hideToast, ms);
  }
}

export function showToastAction(
  message,
  {
    type = "info",
    ms = 6000,
    actionLabel = null,
    onAction = null,
    secondaryLabel = null,
    onSecondary = null,
    keepOpenOnAction = false,
  } = {}
) {
  const toast = ensureToastEl();
  const textEl = toast.querySelector(".appToastText");
  const actionsEl = toast.querySelector(".appToastActions");
  const progEl = toast.querySelector(".appToastProgress");

  _progressActive = false;
  if (progEl) progEl.style.display = "none";

  if (textEl) {
    textEl.textContent = String(message ?? "");
  }

  if (actionsEl) {
    actionsEl.textContent = "";

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
      actionsEl.appendChild(btn);
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
      actionsEl.appendChild(btn2);
    }
  }

  toast.classList.toggle("is-error", type === "error");
  toast.style.display = "flex";
  restartAnim(toast);

  clearTimer();
  if (ms && ms > 0) {
    _timer = setTimeout(hideToast, ms);
  }
}

export function showToastProgress(title, { type = "info" } = {}) {
  const toast = ensureToastEl();
  const textEl = toast.querySelector(".appToastText");
  const actionsEl = toast.querySelector(".appToastActions");
  const progEl = toast.querySelector(".appToastProgress");
  const fill = toast.querySelector(".appToastProgressFill");
  const pct = toast.querySelector(".appToastProgressPct");

  if (actionsEl) actionsEl.textContent = "";
  if (textEl) textEl.textContent = String(title ?? "");

  if (progEl) progEl.style.display = "flex";
  if (fill) fill.style.width = "0%";
  if (pct) pct.textContent = "0%";

  _progressActive = true;
  toast.classList.toggle("is-error", type === "error");
  toast.style.display = "flex";
  restartAnim(toast);

  clearTimer();
}

export function updateToastProgress(percent) {
  if (!_progressActive) return;
  const toast = ensureToastEl();
  const fill = toast.querySelector(".appToastProgressFill");
  const pct = toast.querySelector(".appToastProgressPct");
  const p = Math.max(0, Math.min(100, Math.round(Number(percent ?? 0))));

  if (fill) fill.style.width = `${p}%`;
  if (pct) pct.textContent = `${p}%`;
}

export function endToastProgress() {
  _progressActive = false;
}

export function hideToast() {
  const toast = _toastEl;
  if (!toast) return;

  const actionsEl = toast.querySelector(".appToastActions");
  const progEl = toast.querySelector(".appToastProgress");

  if (actionsEl) actionsEl.textContent = "";
  if (progEl) progEl.style.display = "none";

  toast.style.display = "none";
  toast.classList.remove("is-show", "is-error");

  _progressActive = false;
  clearTimer();
}
