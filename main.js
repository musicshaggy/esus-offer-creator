// main.js
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { autoUpdater } = require("electron-updater");

app.setPath("userData", path.join(os.homedir(), "AppData", "Local", "ESUS-Quote"));

let splashWin = null;
let win = null;

function closeSplash() {
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.destroy();
  }
  splashWin = null;
}

function showMain() {
  if (win && !win.isDestroyed() && !win.isVisible()) {
    win.show();
  }
}

let splashClosed = false;
function closeSplashOnce() {
  if (splashClosed) return;
  splashClosed = true;
  closeSplash();
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function createSplash() {
  splashWin = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    show: true,
    center: true,
    backgroundColor: "#0b1020",
  });

  splashWin.loadFile(path.join(__dirname, "renderer", "splash.html"));
  splashWin.on("closed", () => (splashWin = null));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    show: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0b1220",
    icon: path.join(__dirname, "renderer", "assets", "favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.webContents.on("did-finish-load", () => {
    closeSplashOnce();
    showMain();
  });

  win.once("ready-to-show", () => {
    closeSplashOnce();
    showMain();
  });

  setTimeout(() => {
    closeSplashOnce();
    showMain();
  }, 8000);
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "user-settings.json");
}

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function deleteFileIfExists(p) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ===== Clients persistence (in userData/clients.json) =====
function clientsPath() {
  return path.join(app.getPath("userData"), "clients.json");
}

function readClientsDb() {
  return readJsonSafe(clientsPath(), { byNip: {} });
}

function writeClientsDb(db) {
  writeJsonSafe(clientsPath(), db);
}

function normalizeNip(nip) {
  return String(nip || "").replace(/\D+/g, "");
}

function normalizeClientRecord(input) {
  const nip = normalizeNip(input?.nip);
  if (!nip) return null;

  return {
    nip,
    name: String(input?.name || "").trim(),
    addr: String(input?.addr || "").trim(),
    contact: String(input?.contact || "").trim(),
    updatedAt: new Date().toISOString(),
  };
}

function maybeSaveClientFromOffer(payload) {
  const fields = payload?.fields || {};
  const next = normalizeClientRecord({
    nip: fields.custNip,
    name: fields.custName,
    addr: fields.custAddr,
    contact: fields.custContact,
  });

  if (!next) return null;
  if (!next.name && !next.addr && !next.contact) return null;

  const db = readClientsDb();
  const prev = db?.byNip?.[next.nip] || null;
  const merged = {
    nip: next.nip,
    name: next.name || prev?.name || "",
    addr: next.addr || prev?.addr || "",
    contact: next.contact || prev?.contact || "",
    updatedAt: next.updatedAt,
  };

  db.byNip = { ...(db.byNip || {}), [merged.nip]: merged };
  writeClientsDb(db);
  return merged;
}

function searchClients(query) {
  const q = String(query || "").trim().toLowerCase();
  const db = readClientsDb();
  const rows = Object.values(db?.byNip || {});

  const filtered = !q
    ? rows
    : rows.filter((row) => {
        const nip = String(row?.nip || "").toLowerCase();
        const name = String(row?.name || "").toLowerCase();
        const addr = String(row?.addr || "").toLowerCase();
        const contact = String(row?.contact || "").toLowerCase();
        return nip.includes(q) || name.includes(q) || addr.includes(q) || contact.includes(q);
      });

  return filtered
    .sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")))
    .slice(0, 12);
}

function clearAllOffersData() {
  const dir = offersDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    fs.unlinkSync(path.join(dir, f));
  }
  writeOffersIndex({ ids: [] });
  return { ok: true, deleted: files.length };
}

// ===== Offers persistence (in userData/offers) =====
function offersDir() {
  const dir = path.join(app.getPath("userData"), "offers");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function offersIndexPath() {
  return path.join(offersDir(), "offers-index.json");
}

function readOffersIndex() {
  return readJsonSafe(offersIndexPath(), { ids: [] });
}

function writeOffersIndex(index) {
  writeJsonSafe(offersIndexPath(), index);
}

function offerFilePath(id) {
  return path.join(offersDir(), `${id}.json`);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pad2(x) {
  return String(x).padStart(2, "0");
}

function buildOfferNo(seq, initials) {
  const now = new Date();
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const lp = pad2(Math.max(1, seq));
  return `${lp}/${initials}/${m}/${y}`;
}

/**
 * Compute next offer sequence number for given initials and year/month (1-12)
 * using "smallest missing positive integer" among existing offers.
 */
function computeNextSeqFromOffers(initials, year, month) {
  const y = String(year);
  const m = pad2(month);
  const ini = String(initials || "XX").trim().toUpperCase() || "XX";

  const used = new Set();
  const dir = offersDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  for (const f of files) {
    const p = path.join(dir, f);
    const payload = readJsonSafe(p, null);
    const no = payload?.meta?.offerNo || payload?.offerNo || "";
    const m2 = String(no).match(/^0?(\d+)\/([A-Z0-9]{2,5})\/(\d{2})\/(\d{4})$/);
    if (!m2) continue;

    const seq = parseInt(m2[1], 10);
    const iniNo = m2[2];
    const mm = m2[3];
    const yy = m2[4];

    if (yy === y && mm === m && iniNo === ini && Number.isFinite(seq) && seq > 0) {
      used.add(seq);
    }
  }

  let next = 1;
  while (used.has(next)) next += 1;
  return next;
}

/** ===== Offer meta normalization (NEW) =====
 *  Zapewnia, że meta zawsze ma podstawowe ustawienia dokumentu
 *  (waluta oferty / język / VAT code), nawet jeśli renderer ich nie dośle.
 */
function normalizeOfferMeta(meta, fallbackMeta) {
  const m = { ...(fallbackMeta || {}), ...(meta || {}) };

  // defaults (ważne dla wstecznej kompatybilności starych ofert)
  if (!m.offerCcy) m.offerCcy = "PLN"; // PLN | EUR | USD
  if (!m.lang) m.lang = "pl"; // pl | en | de | hu
  if (!m.vatCode) m.vatCode = "23"; // "23" | "19" | "27" | "0_wdt" | "0_ex" | etc.

  // ustandaryzuj format
  m.offerCcy = String(m.offerCcy).toUpperCase();
  m.lang = String(m.lang).toLowerCase();

  return m;
}

app.whenReady().then(() => {
  splashClosed = false;
  createSplash();
  createWindow();

  initAutoUpdater(win);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ===== IPC: user settings =====
ipcMain.handle("settings:get", async () => {
  const p = getSettingsPath();
  return readJsonSafe(p, {
    initials: "",
    offerSeq: {},
    profile: null,
    // ✅ globalne preferencje dokumentu (fallback dla nowych ofert)
    docDefaults: { offerCcy: "PLN", lang: "pl", vatCode: "23" },
  });
});

ipcMain.handle("settings:set", async (_evt, patch) => {
  const p = getSettingsPath();
  const current = readJsonSafe(p, {
    initials: "",
    offerSeq: {},
    profile: null,
    docDefaults: { offerCcy: "PLN", lang: "pl", vatCode: "23" },
  });

  const next = {
    ...current,
    ...patch,
    offerSeq: { ...(current.offerSeq || {}), ...(patch?.offerSeq || {}) },
    profile: patch?.profile
      ? { ...(current.profile || {}), ...patch.profile }
      : current.profile || null,

    // ✅ merge docDefaults (jeśli renderer zacznie to zapisywać)
    docDefaults: patch?.docDefaults
      ? { ...(current.docDefaults || {}), ...patch.docDefaults }
      : current.docDefaults || { offerCcy: "PLN", lang: "pl", vatCode: "23" },
  };

  writeJsonSafe(p, next);
  return next;
});

ipcMain.handle("settings:resetCounter", async () => {
  const p = getSettingsPath();
  const current = readJsonSafe(p, {
    initials: "",
    offerSeq: {},
    profile: null,
    docDefaults: { offerCcy: "PLN", lang: "pl", vatCode: "23" },
  });

  const next = {
    ...current,
    offerSeq: {},
  };

  writeJsonSafe(p, next);
  return next;
});

ipcMain.handle("settings:clearAllData", async () => {
  deleteFileIfExists(getSettingsPath());
  deleteFileIfExists(clientsPath());
  return {
    initials: "",
    offerSeq: {},
    profile: null,
    docDefaults: { offerCcy: "PLN", lang: "pl", vatCode: "23" },
  };
});

// ===== IPC: clients =====
ipcMain.handle("clients:suggest", async (_evt, query) => {
  return searchClients(query);
});

ipcMain.handle("clients:getByNip", async (_evt, nip) => {
  const normalized = normalizeNip(nip);
  if (!normalized) return null;

  const db = readClientsDb();
  return db?.byNip?.[normalized] || null;
});

// ===== IPC: offers CRUD =====
ipcMain.handle("offers:list", async () => {
  const idx = readOffersIndex();
  const list = [];
  for (const id of idx.ids || []) {
    const p = offerFilePath(id);
    if (!fs.existsSync(p)) continue;
    const payload = readJsonSafe(p, null);
    if (!payload) continue;
    list.push({
      id,
      offerNo: payload?.meta?.offerNo || payload?.offerNo || "—",
      client: payload?.fields?.custName || payload?.meta?.client || "",
      createdAt: payload?.meta?.createdAt || "",
      updatedAt: payload?.meta?.updatedAt || payload?.meta?.createdAt || "",
    });
  }
  return list;
});

ipcMain.handle("offers:getLast", async () => {
  const idx = readOffersIndex();
  return idx.ids && idx.ids[0] ? idx.ids[0] : null;
});

ipcMain.handle("offers:open", async (_evt, id) => {
  const p = offerFilePath(id);
  if (!fs.existsSync(p)) throw new Error("Oferta nie istnieje");
  const payload = readJsonSafe(p, null);

  // ✅ w razie starych ofert: dopnij brakujące meta ustawienia
  if (payload && payload.meta) payload.meta = normalizeOfferMeta(payload.meta, null);

  return payload;
});

async function createFreshOfferPayload() {
  const settings = readJsonSafe(getSettingsPath(), {
    initials: "XX",
    offerSeq: {},
    profile: null,
    docDefaults: { offerCcy: "PLN", lang: "pl", vatCode: "23" },
  });

  const initials = (settings?.profile?.initials || settings?.initials || "XX")
    .trim()
    .toUpperCase() || "XX";

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const nextSeq = computeNextSeqFromOffers(initials, year, month);
  const offerNo = buildOfferNo(nextSeq, initials);

  settings.initials = initials;
  writeJsonSafe(getSettingsPath(), settings);

  const id = makeId();

  // ✅ doc defaults z user-settings.json (fallback na stałe wartości)
  const dd = settings?.docDefaults || {};
  const payload = {
    id,
    meta: normalizeOfferMeta(
      {
        offerNo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        offerCcy: dd.offerCcy || "PLN",
        lang: dd.lang || "pl",
        vatCode: dd.vatCode || "23",
      },
      null
    ),
    fields: {
      offerDate: todayYMD(),
      paymentMethod: "invoice",
      invoiceDays: 14,
      shippingNet: 0,
    },
    items: [],
    totals: null,
  };

  writeJsonSafe(offerFilePath(id), payload);

  const idx = readOffersIndex();
  const ids = Array.isArray(idx.ids) ? idx.ids : [];
  if (!ids.includes(id)) ids.unshift(id);
  writeOffersIndex({ ids });

  return payload;
}

ipcMain.handle("offers:new", async () => {
  return await createFreshOfferPayload();
});

ipcMain.handle("offers:save", async (_evt, payload) => {
  if (!payload || typeof payload !== "object") throw new Error("Nieprawidłowy payload");

  const id = payload.id || makeId();
  const filePath = offerFilePath(id);

  // ✅ merge z istniejącą ofertą, żeby nie zgubić meta ustawień (waluta/język/VAT)
  const existing = fs.existsSync(filePath) ? readJsonSafe(filePath, null) : null;
  const existingMeta = existing?.meta || null;

  const next = {
    ...(existing || {}), // zachowaj ewentualne brakujące rzeczy z pliku
    ...payload, // renderer ma pierwszeństwo dla fields/items/totals
    id,
    meta: normalizeOfferMeta(
      {
        ...(existingMeta || {}),
        ...(payload.meta || {}),
        updatedAt: new Date().toISOString(),
      },
      null
    ),
  };

  writeJsonSafe(filePath, next);
  maybeSaveClientFromOffer(next);

  const idx = readOffersIndex();
  const ids = Array.isArray(idx.ids) ? idx.ids : [];
  const without = ids.filter((x) => x !== id);
  without.unshift(id);
  writeOffersIndex({ ids: without });

  return next;
});

ipcMain.handle("offers:delete", async (_evt, id) => {
  const p = offerFilePath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  const idx = readOffersIndex();
  const ids = (idx.ids || []).filter((x) => x !== id);
  writeOffersIndex({ ids });
  return { ok: true };
});

ipcMain.handle("offers:deleteAll", async () => {
  return clearAllOffersData();
});

ipcMain.handle("offers:duplicate", async (_evt, id) => {
  const srcPath = offerFilePath(id);
  if (!fs.existsSync(srcPath)) throw new Error("Oferta nie istnieje");

  const src = readJsonSafe(srcPath, null);
  const fresh = await createFreshOfferPayload();

  const srcMeta = src?.meta || {};
  const keepSettingsMeta = {
    offerCcy: srcMeta.offerCcy,
    lang: srcMeta.lang,
    vatCode: srcMeta.vatCode,
  };

  // ✅ FIELDS: skopiuj, ale ustaw ważność na dziś
  const fields = { ...(src?.fields || {}) };
  fields.validUntil = todayYMD();

  // (opcjonalnie) jeśli chcesz czyścić "Dodatkowe ustalenia" przy duplikacji, odkomentuj:
  // fields.termsExtra = "";

  const payload = {
    ...fresh,
    meta: normalizeOfferMeta(
      {
        ...fresh.meta,
        ...keepSettingsMeta,
        updatedAt: new Date().toISOString(),
      },
      null
    ),
    fields,
    items: src.items || [],
    totals: src.totals || null,
  };

  writeJsonSafe(offerFilePath(payload.id), payload);

  const idx = readOffersIndex();
  const ids = Array.isArray(idx.ids) ? idx.ids : [];
  const without = ids.filter((x) => x !== payload.id);
  without.unshift(payload.id);
  writeOffersIndex({ ids: without });

  return payload;
});

// ===== IPC: zapisywanie/odczyt stanu (JSON) =====
ipcMain.handle("file:saveJson", async (_evt, { defaultName, data }) => {
  const res = await dialog.showSaveDialog({
    title: "Zapisz ofertę (JSON)",
    defaultPath: defaultName || "oferta.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };

  fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), "utf-8");
  return { ok: true, path: res.filePath };
});

ipcMain.handle("file:loadJson", async () => {
  const res = await dialog.showOpenDialog({
    title: "Wczytaj ofertę (JSON)",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (res.canceled || !res.filePaths?.[0]) return { ok: false, canceled: true };

  const content = fs.readFileSync(res.filePaths[0], "utf-8");
  return { ok: true, path: res.filePaths[0], data: JSON.parse(content) };
});

// ===== IPC: placeholder pod eksport Excel/PDF =====
ipcMain.handle("export:excel", async (_evt, { defaultName, buffer }) => {
  const res = await dialog.showSaveDialog({
    title: "Zapisz Excel",
    defaultPath: defaultName || "ESUS.xlsx",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };

  fs.writeFileSync(res.filePath, Buffer.from(buffer));
  return { ok: true, path: res.filePath };
});

ipcMain.handle("window:minimize", (evt) => {
  const w = BrowserWindow.fromWebContents(evt.sender);
  w?.minimize();
});

ipcMain.handle("app:getVersion", () => {
  return app.getVersion();
});

ipcMain.handle("window:toggleMaximize", (evt) => {
  const w = BrowserWindow.fromWebContents(evt.sender);
  if (!w) return { maximized: false };

  if (w.isMaximized()) w.unmaximize();
  else w.maximize();

  return { maximized: w.isMaximized() };
});

ipcMain.handle("window:close", (evt) => {
  const w = BrowserWindow.fromWebContents(evt.sender);
  w?.close();
});

ipcMain.handle("window:isMaximized", (evt) => {
  const w = BrowserWindow.fromWebContents(evt.sender);
  return { maximized: !!w?.isMaximized() };
});

ipcMain.handle("offers:nextSeq", async (_evt, { initials, year, month }) => {
  const ini = String(initials || "XX").trim().toUpperCase() || "XX";
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  return computeNextSeqFromOffers(ini, y, m);
});

// ===== Auto-update (electron-updater) =====
let _updaterInited = false;
function initAutoUpdater(mainWin) {
  if (_updaterInited || !mainWin) return;
  _updaterInited = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const updState = {
    available: null,
    downloaded: null,
    error: null,
  };

  autoUpdater.on("update-available", (info) => {
    updState.available = { version: info?.version };
    mainWin.webContents.send("upd:update-available", updState.available);
  });

  autoUpdater.on("download-progress", (p) => {
    mainWin.webContents.send("upd:download-progress", {
      percent: Math.round(p?.percent ?? 0),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updState.downloaded = { version: info?.version };
    mainWin.webContents.send("upd:update-downloaded", updState.downloaded);
  });

  autoUpdater.on("error", (err) => {
    updState.error = { message: String(err?.message || err) };
    mainWin.webContents.send("upd:update-error", updState.error);
  });

  mainWin.webContents.on("did-finish-load", () => {
    if (updState.available) mainWin.webContents.send("upd:update-available", updState.available);
    if (updState.downloaded) mainWin.webContents.send("upd:update-downloaded", updState.downloaded);
    if (updState.error) mainWin.webContents.send("upd:update-error", updState.error);
  });

  ipcMain.handle("upd:getStatus", async () => updState);
  ipcMain.handle("upd:download", async () => {
    await autoUpdater.downloadUpdate();
    return true;
  });
  ipcMain.handle("upd:quitAndInstall", async () => {
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  autoUpdater.checkForUpdates();
}
