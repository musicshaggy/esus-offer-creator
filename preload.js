const { contextBridge, ipcRenderer } = require("electron");

// Minimal, stable API surface for the renderer.
// Renderer code expects window.esusAPI.*
contextBridge.exposeInMainWorld("esusAPI", {
  // Window controls
  winMinimize: () => ipcRenderer.invoke("window:minimize"),
  winToggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
  winClose: () => ipcRenderer.invoke("window:close"),
  winIsMaximized: () => ipcRenderer.invoke("window:isMaximized"),

  // User settings (profile, initials, offer sequencing)
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (patch) => ipcRenderer.invoke("settings:set", patch),
  settingsResetCounter: () => ipcRenderer.invoke("settings:resetCounter"),
  settingsClearAllData: () => ipcRenderer.invoke("settings:clearAllData"),

  // Offers storage
  offersList: () => ipcRenderer.invoke("offers:list"),
  offersGetLast: () => ipcRenderer.invoke("offers:getLast"),
  offersNew: () => ipcRenderer.invoke("offers:new"),
  offersOpen: (id) => ipcRenderer.invoke("offers:open", id),
  offersSave: (payload) => ipcRenderer.invoke("offers:save", payload),
  offersDelete: (id) => ipcRenderer.invoke("offers:delete", id),
  offersDeleteAll: () => ipcRenderer.invoke("offers:deleteAll"),
  offersDuplicate: (id) => ipcRenderer.invoke("offers:duplicate", id),

  // Clients suggestions
  clientsSuggest: (query) => ipcRenderer.invoke("clients:suggest", query),
  clientGetByNip: (nip) => ipcRenderer.invoke("clients:getByNip", nip),

  // Optional: file operations already implemented in main.js
  fileSaveJson: (args) => ipcRenderer.invoke("file:saveJson", args),
  fileLoadJson: () => ipcRenderer.invoke("file:loadJson"),
  exportExcel: (args) => ipcRenderer.invoke("export:excel", args),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),

  // Offer sequencing (gap-filling)
  getNextOfferSeq: (initials, year, month) =>
    ipcRenderer.invoke("offers:nextSeq", { initials, year, month }),

  // Auto-update (electron-updater)
  updateDownload: () => ipcRenderer.invoke("upd:download"),
  updateQuitAndInstall: () => ipcRenderer.invoke("upd:quitAndInstall"),
  updateGetStatus: () => ipcRenderer.invoke("upd:getStatus"),

  onUpdateAvailable: (cb) => ipcRenderer.on("upd:update-available", (_e, d) => cb(d)),
  onUpdateProgress: (cb) => ipcRenderer.on("upd:download-progress", (_e, d) => cb(d)),
  onUpdateDownloaded: (cb) => ipcRenderer.on("upd:update-downloaded", (_e, d) => cb(d)),
  onUpdateError: (cb) => ipcRenderer.on("upd:update-error", (_e, d) => cb(d)),
});

