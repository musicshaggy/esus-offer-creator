const { app, ipcMain, dialog, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Electron cancels beforeunload silently unless the host handles this event.
app.on("browser-window-created", (_event, window) => {
  window.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      title: "Niezapisane zmiany faktury",
      message: "Faktura zawiera niezapisane zmiany.",
      detail: "Zapisz wersję roboczą, jeśli chcesz zachować zmiany.",
      buttons: ["Kontynuuj edycję", "Odrzuć zmiany i zamknij"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    // Preventing this event explicitly overrides the renderer's close veto.
    if (choice === 1) event.preventDefault();
  });
});

function runInvoice(request) {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "invoice")
    : path.join(__dirname, "invoice");
  const python = app.isPackaged
    ? path.join(process.resourcesPath, "python", "python.exe")
    : path.join(__dirname, "runtime", "python", "python.exe");
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(python))
      return reject(new Error("Brakuje dołączonego środowiska Python."));
    const child = spawn(python, ["-I", path.join(root, "bridge.py")], {
      windowsHide: true,
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    const output = [];
    let length = 0;
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill();
      reject(new Error("Przekroczono czas oczekiwania na walidację faktury."));
    }, 180000);
    child.stdout.on("data", (data) => {
      length += data.length;
      if (length > 32 * 1024 * 1024) {
        failed = true;
        child.kill();
        clearTimeout(timer);
        reject(new Error("Odpowiedź modułu faktur jest zbyt duża."));
      } else output.push(data);
    });
    child.stderr.on("data", () => {});
    child.on("error", (error) => {
      failed = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failed) return;
      try {
        if (code !== 0)
          throw new Error(`Moduł faktur zakończył pracę (${code}).`);
        const answer = JSON.parse(Buffer.concat(output).toString("utf8"));
        if (!answer.ok) throw new Error(answer.error);
        resolve(answer.result);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(
      JSON.stringify({
        ...request,
        dataDir: path.join(app.getPath("userData"), "invoices"),
      }),
    );
  });
}

ipcMain.handle("invoice:request", async (event, input) => {
  if (
    !input ||
    ![
      "defaults",
      "importOrder",
      "import",
      "requirements",
      "saveSeller",
      "check",
      "export",
      "preview",
      "saveDraft",
      "loadDraft",
      "openSource",
    ].includes(input.action)
  )
    throw new Error("Nieznana operacja faktury.");
  const request = { ...input };
  const parent = BrowserWindow.fromWebContents(event.sender);
  if (request.action === "openSource") {
    const source = request.invoice?.source_file;
    if (
      typeof source !== "string" ||
      path.extname(source).toLowerCase() !== ".pdf" ||
      !fs.existsSync(source)
    )
      throw new Error("Nie znaleziono oryginalnego pliku PDF.");
    const error = await shell.openPath(source);
    if (error) throw new Error(error);
    return { opened: true };
  }
  if (request.action === "import" || request.action === "loadDraft") {
    const selected = await dialog.showOpenDialog(parent, {
      title:
        request.action === "import"
          ? "Importuj fakturę PDF"
          : "Otwórz wersję roboczą faktury",
      properties: ["openFile"],
      filters: [
        {
          name:
            request.action === "import" ? "Faktura PDF" : "Wersja robocza JSON",
          extensions: [request.action === "import" ? "pdf" : "json"],
        },
      ],
    });
    if (selected.canceled) return { canceled: true };
    request.path = selected.filePaths[0];
    if (request.action === "loadDraft") {
      const data = JSON.parse(fs.readFileSync(request.path, "utf8"));
      if (!data.seller || !data.buyer || !Array.isArray(data.lines))
        throw new Error("Nieprawidłowa wersja robocza faktury.");
      return data;
    }
  }
  if (request.action === "export" || request.action === "saveDraft") {
    const extension =
      request.action === "saveDraft"
        ? "json"
        : request.target === "XRechnung"
          ? "xml"
          : "pdf";
    const filename = String(request.invoice?.number || "Faktura").replace(
      /[^\p{L}\p{N}._-]/gu,
      "_",
    );
    const selected = await dialog.showSaveDialog(parent, {
      title:
        request.action === "saveDraft"
          ? "Zapisz wersję roboczą faktury"
          : "Eksportuj e-fakturę",
      defaultPath: filename + "." + extension,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (selected.canceled) return { canceled: true };
    request.path = selected.filePath.toLowerCase().endsWith("." + extension)
      ? selected.filePath
      : selected.filePath + "." + extension;
    if (request.action === "saveDraft") {
      fs.writeFileSync(
        request.path,
        JSON.stringify(request.invoice, null, 2),
        "utf8",
      );
      return { saved: true, path: request.path };
    }
  }
  const result = await runInvoice(request);
  return request.action === "export"
    ? { ...result, path: result.valid ? request.path : undefined }
    : result;
});

module.exports = { runInvoice };
