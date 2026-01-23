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

  // Offers storage
  offersList: () => ipcRenderer.invoke("offers:list"),
  offersGetLast: () => ipcRenderer.invoke("offers:getLast"),
  offersNew: () => ipcRenderer.invoke("offers:new"),
  offersOpen: (id) => ipcRenderer.invoke("offers:open", id),
  offersSave: (payload) => ipcRenderer.invoke("offers:save", payload),
  offersDelete: (id) => ipcRenderer.invoke("offers:delete", id),
  offersDuplicate: (id) => ipcRenderer.invoke("offers:duplicate", id),

  // Optional: file operations already implemented in main.js
  fileSaveJson: (args) => ipcRenderer.invoke("file:saveJson", args),
  fileLoadJson: () => ipcRenderer.invoke("file:loadJson"),
  exportExcel: (args) => ipcRenderer.invoke("export:excel", args),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
  getNextOfferSeq: (initials, year, month) => ipcRenderer.invoke("offers:nextSeq", { initials, year, month }),
  updateDownload: () => ipcRenderer.invoke("upd:download"),
	updateQuitAndInstall: () => ipcRenderer.invoke("upd:quitAndInstall"),

	onUpdateAvailable: (cb) => ipcRenderer.on("upd:update-available", (_e, data) => cb(data)),
	onUpdateDownloaded: (cb) => ipcRenderer.on("upd:update-downloaded", (_e, data) => cb(data)),
	onUpdateError: (cb) => ipcRenderer.on("upd:update-error", (_e, data) => cb(data)),
	onUpdateProgress: (cb) => ipcRenderer.on("upd:download-progress", (_e, data) => cb(data))
});


