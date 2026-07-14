const fs = require("fs");
const path = require("path");

const WORKER_ARG = "--idosell-questions-worker";
const DEFAULT_INTERVAL_MINUTES = 10;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 1440;

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toIso(value = Date.now()) {
  return new Date(value).toISOString();
}

function defaultQuestionsWorkerSettings() {
  return {
    enabled: false,
    notificationsEnabled: true,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    startWithSystem: false,
  };
}

function normalizeQuestionsWorkerSettings(raw) {
  const defaults = defaultQuestionsWorkerSettings();
  const next = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: next.enabled === true,
    notificationsEnabled: next.notificationsEnabled !== false,
    intervalMinutes: clampInt(
      next.intervalMinutes,
      MIN_INTERVAL_MINUTES,
      MAX_INTERVAL_MINUTES,
      defaults.intervalMinutes
    ),
    startWithSystem: next.startWithSystem === true,
  };
}

function resolveQuestionsWorkerPaths(userDataPath) {
  const baseDir = path.join(String(userDataPath || ""), "idosell-questions-worker");
  return {
    baseDir,
    statePath: path.join(baseDir, "state.json"),
    logPath: path.join(baseDir, "worker.log"),
  };
}

function defaultQuestionsWorkerState() {
  return {
    version: 1,
    pid: 0,
    mode: "stopped",
    enabled: false,
    notificationsEnabled: true,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    startWithSystem: false,
    startedAt: "",
    lastHeartbeatAt: "",
    lastCheckAt: "",
    lastSuccessAt: "",
    lastExitAt: "",
    lastNotificationAt: "",
    nextCheckAt: "",
    lastError: "",
    lastMessage: "Worker nie byl jeszcze uruchomiony.",
    apiStatus: "idle",
    endpointUrl: "",
    apiVersion: "",
    resultsNumberAll: 0,
    sampleQuestionIds: [],
    lastSeenQuestionId: "",
    lastQuestionCount: 0,
  };
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readQuestionsWorkerState(statePath) {
  try {
    if (!fs.existsSync(statePath)) return defaultQuestionsWorkerState();
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    return {
      ...defaultQuestionsWorkerState(),
      ...(parsed || {}),
    };
  } catch {
    return defaultQuestionsWorkerState();
  }
}

function writeQuestionsWorkerState(statePath, patch) {
  const next = {
    ...readQuestionsWorkerState(statePath),
    ...(patch || {}),
  };
  ensureParentDir(statePath);
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function appendQuestionsWorkerLog(logPath, message) {
  const line = `[${toIso()}] ${String(message || "").trim()}\n`;
  ensureParentDir(logPath);
  fs.appendFileSync(logPath, line, "utf-8");
}

function isProcessRunning(pid) {
  const numericPid = Number(pid || 0);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch {
    return false;
  }
}

function evaluateQuestionsProbe(settings, hasApiKey) {
  const idosell = settings?.integrations?.idosell || {};

  if (idosell.enabled === false) {
    return {
      mode: "paused",
      apiStatus: "idosell_disabled",
      message: "Integracja IdoSell jest wylaczona. Worker czeka na ponowne wlaczenie.",
      items: [],
      cursor: "",
    };
  }

  if (!String(idosell.baseUrl || "").trim() || !hasApiKey) {
    return {
      mode: "waiting_config",
      apiStatus: "missing_config",
      message: "Brak pelnej konfiguracji IdoSell. Ustaw Base URL i klucz API.",
      items: [],
      cursor: "",
    };
  }

  return {
    mode: "running",
    apiStatus: "placeholder",
    message: "Worker dziala. API pytan od klientow nie jest jeszcze podpiete.",
    items: [],
    cursor: "",
  };
}

function createQuestionsWorkerRuntime(options) {
  const {
    readSettings,
    readApiKey,
    statePath,
    logPath,
    notify,
    probeQuestions,
    onExitRequested,
  } = options || {};

  let stopped = false;
  let tickTimer = null;
  let heartbeatTimer = null;

  function scheduleNext(minutes) {
    const safeMinutes = clampInt(
      minutes,
      MIN_INTERVAL_MINUTES,
      MAX_INTERVAL_MINUTES,
      DEFAULT_INTERVAL_MINUTES
    );
    const dueAt = Date.now() + safeMinutes * 60 * 1000;
    writeQuestionsWorkerState(statePath, {
      nextCheckAt: toIso(dueAt),
    });
    clearTimeout(tickTimer);
    tickTimer = setTimeout(runCycle, safeMinutes * 60 * 1000);
  }

  async function runCycle() {
    if (stopped) return;

    const settings = await Promise.resolve(readSettings?.());
    const workerSettings = normalizeQuestionsWorkerSettings(
      settings?.integrations?.idosell?.customerQuestions
    );
    const now = toIso();
    const previousState = readQuestionsWorkerState(statePath);

    if (!workerSettings.enabled) {
      writeQuestionsWorkerState(statePath, {
        pid: process.pid,
        mode: "disabled",
        enabled: false,
        notificationsEnabled: workerSettings.notificationsEnabled,
        intervalMinutes: workerSettings.intervalMinutes,
        startWithSystem: workerSettings.startWithSystem,
        lastHeartbeatAt: now,
        lastExitAt: now,
        lastMessage: "Worker zostal wylaczony w ustawieniach aplikacji.",
        nextCheckAt: "",
      });
      appendQuestionsWorkerLog(logPath, "Worker disabled in settings, exiting.");
      onExitRequested?.("disabled");
      return;
    }

    let probe;
    try {
      if (typeof probeQuestions === "function") {
        probe = await Promise.resolve(
          probeQuestions({
            settings,
            apiKey: String(readApiKey?.() || "").trim(),
            previousState,
          })
        );
      } else {
        probe = evaluateQuestionsProbe(settings, !!readApiKey?.());
      }
    } catch (error) {
      probe = {
        mode: "error",
        apiStatus: "runtime_error",
        message: "Nie udalo sie sprawdzic pytan IdoSell.",
        error: String(error?.message || error || "Nieznany blad."),
        items: [],
        cursor: previousState.lastSeenQuestionId || "",
      };
    }

    const questionCount = Array.isArray(probe?.items) ? probe.items.length : 0;
    const totalQuestionCount = Number.isFinite(Number(probe?.totalQuestions))
      ? Number(probe.totalQuestions)
      : questionCount;
    const lastError = String(probe?.error || "").trim();
    const nextState = {
      pid: process.pid,
      mode: probe?.mode || "running",
      enabled: true,
      notificationsEnabled: workerSettings.notificationsEnabled,
      intervalMinutes: workerSettings.intervalMinutes,
      startWithSystem: workerSettings.startWithSystem,
      startedAt: previousState.startedAt || now,
      lastHeartbeatAt: now,
      lastCheckAt: now,
      lastSuccessAt: lastError ? previousState.lastSuccessAt || "" : now,
      lastError,
      lastMessage: probe?.message || "Sprawdzenie workera zakonczone.",
      apiStatus: probe?.apiStatus || "ok",
      endpointUrl: String(probe?.endpointUrl || previousState.endpointUrl || "").trim(),
      apiVersion: String(probe?.apiVersion || previousState.apiVersion || "").trim(),
      resultsNumberAll: Number(probe?.resultsNumberAll || 0) || 0,
      sampleQuestionIds: Array.isArray(probe?.sampleQuestionIds)
        ? probe.sampleQuestionIds.slice(0, 5)
        : [],
      lastQuestionCount: totalQuestionCount,
      lastSeenQuestionId: probe?.cursor || previousState.lastSeenQuestionId || "",
    };

    if (questionCount > 0 && workerSettings.notificationsEnabled) {
      const title = String(probe?.notificationTitle || "Nowe pytania od klientow");
      const body = String(
        probe?.notificationBody || `W module IdoSell wykryto ${questionCount} nowych pytan.`
      );
      notify?.({ title, body });
      nextState.lastNotificationAt = now;
    }

    writeQuestionsWorkerState(statePath, nextState);
    scheduleNext(workerSettings.intervalMinutes);
  }

  async function start() {
    const now = toIso();
    appendQuestionsWorkerLog(logPath, `Worker booted with pid=${process.pid}.`);
    writeQuestionsWorkerState(statePath, {
      pid: process.pid,
      mode: "starting",
      startedAt: now,
      lastHeartbeatAt: now,
      lastMessage: "Uruchamianie workera pytan klientow...",
      nextCheckAt: "",
    });

    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (stopped) return;
      writeQuestionsWorkerState(statePath, {
        pid: process.pid,
        lastHeartbeatAt: toIso(),
      });
    }, 60 * 1000);

    await runCycle();
  }

  function stop(reason = "stopped") {
    if (stopped) return;
    stopped = true;
    clearTimeout(tickTimer);
    clearInterval(heartbeatTimer);
    const now = toIso();
    writeQuestionsWorkerState(statePath, {
      pid: 0,
      mode: "stopped",
      lastExitAt: now,
      lastHeartbeatAt: now,
      lastMessage: reason,
      nextCheckAt: "",
    });
    appendQuestionsWorkerLog(logPath, `Worker stopped: ${reason}`);
  }

  return {
    start,
    stop,
  };
}

module.exports = {
  WORKER_ARG,
  DEFAULT_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  defaultQuestionsWorkerSettings,
  normalizeQuestionsWorkerSettings,
  resolveQuestionsWorkerPaths,
  defaultQuestionsWorkerState,
  readQuestionsWorkerState,
  writeQuestionsWorkerState,
  appendQuestionsWorkerLog,
  isProcessRunning,
  createQuestionsWorkerRuntime,
};
