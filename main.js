const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

app.setPath("userData", path.join(os.homedir(), "AppData", "Local", "ESUS-Quote"));

let splashWin = null;
let win = null;

function closeSplash() {
  if (splashWin && !splashWin.isDestroyed()) {
    // destroy() jest pewniejsze niż close() dla frameless/alwaysOnTop/closable:false
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

  // (opcjonalnie) na wszelki wypadek:
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
      nodeIntegration: false
    }
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
  // userData jest per użytkownik Windows
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

function offerKey(initials) {
  const now = new Date();
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  return `${y}-${m}_${initials}`;
}

function buildOfferNo(seq, initials) {
  const now = new Date();
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const lp = pad2(Math.max(1, seq));
  return `${lp}/${initials}/${m}/${y}`;
}


app.whenReady().then(() => {
  splashClosed = false;
  createSplash();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ===== IPC: user settings =====
ipcMain.handle("settings:get", async () => {
  const p = getSettingsPath();
  return readJsonSafe(p, { initials: "", offerSeq: {}, profile: null });
});

ipcMain.handle("settings:set", async (_evt, patch) => {
  const p = getSettingsPath();
  const current = readJsonSafe(p, { initials: "", offerSeq: {}, profile: null });
  const next = {
    ...current,
    ...patch,
    // merge offerSeq if provided
    offerSeq: { ...(current.offerSeq || {}), ...(patch?.offerSeq || {}) },
    profile: patch?.profile ? { ...(current.profile || {}), ...patch.profile } : (current.profile || null),
  };
  writeJsonSafe(p, next);
  return next;
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
      updatedAt: payload?.meta?.updatedAt || payload?.meta?.createdAt || "",
    });
  }
  return list;
});

ipcMain.handle("offers:getLast", async () => {
  const idx = readOffersIndex();
  return (idx.ids && idx.ids[0]) ? idx.ids[0] : null;
});

ipcMain.handle("offers:open", async (_evt, id) => {
  const p = offerFilePath(id);
  if (!fs.existsSync(p)) throw new Error("Oferta nie istnieje");
  return readJsonSafe(p, null);
});


async function createFreshOfferPayload() {
  // create fresh payload with auto numbering based on settings
  const settings = readJsonSafe(getSettingsPath(), { initials: "XX", offerSeq: {}, profile: null });
  const initials = (settings?.profile?.initials || settings?.initials || "XX").trim().toUpperCase() || "XX";
  const key = offerKey(initials);
  const currentSeq = (settings.offerSeq && settings.offerSeq[key]) ? settings.offerSeq[key] : 1;
  const offerNo = buildOfferNo(currentSeq, initials);

  // bump seq for next offer
  settings.offerSeq = { ...(settings.offerSeq || {}), [key]: currentSeq + 1 };
  settings.initials = initials;
  writeJsonSafe(getSettingsPath(), settings);

  const id = makeId();
  const payload = {
    id,
    meta: {
      offerNo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    fields: {},
    items: [],
    totals: null,
  };

  // persist immediately so it appears on the list
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
  const next = {
    ...payload,
    id,
    meta: {
      ...(payload.meta || {}),
      updatedAt: new Date().toISOString(),
    },
  };
  writeJsonSafe(offerFilePath(id), next);

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

ipcMain.handle("offers:duplicate", async (_evt, id) => {
  const srcPath = offerFilePath(id);
  if (!fs.existsSync(srcPath)) throw new Error("Oferta nie istnieje");
  const src = readJsonSafe(srcPath, null);
  const fresh = await createFreshOfferPayload();
  // Keep the new offerNo, but copy content
  const payload = {
    ...fresh,
    fields: src.fields || {},
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
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };

  fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), "utf-8");
  return { ok: true, path: res.filePath };
});

ipcMain.handle("file:loadJson", async () => {
  const res = await dialog.showOpenDialog({
    title: "Wczytaj ofertę (JSON)",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
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
    filters: [{ name: "Excel", extensions: ["xlsx"] }]
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };

  fs.writeFileSync(res.filePath, Buffer.from(buffer));
  return { ok: true, path: res.filePath };
});

ipcMain.handle("window:minimize", (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  win?.minimize();
});

ipcMain.handle("window:toggleMaximize", (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (!win) return { maximized: false };

  if (win.isMaximized()) win.unmaximize();
  else win.maximize();

  return { maximized: win.isMaximized() };
});

ipcMain.handle("window:close", (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  win?.close();
});

ipcMain.handle("window:isMaximized", (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  return { maximized: !!win?.isMaximized() };
});

