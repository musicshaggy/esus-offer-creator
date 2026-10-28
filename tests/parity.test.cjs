const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const appRoot = path.join(__dirname, "..");
const baseline = "ad4742ef0b1921b6ea31c055705d62640e682c46";
const additions = {
  "scripts/release_publish.cmd": "call npm run invoice:prepare\nif errorlevel 1 exit /b 1\n",
  ".gitignore":
    "\n# Local invoice runtime, generated tests and user data\nruntime/\ninvoice/vendor/\ninvoice/tools/\n**/__pycache__/\ninvoice/data/\ntests/desktop-data/\ntests/pdf-samples/\ntests/*.png\n",
  "main.js": 'require("./invoice-ipc");\n',
  "preload.js":
    'contextBridge.exposeInMainWorld("invoiceAPI", {\n  request: (input) => ipcRenderer.invoke("invoice:request", input),\n});\n',
  "renderer/index.html": [
    '  <link rel="stylesheet" href="./css/50_invoices.css" />\n',
    '<script type="module" src="./app/invoices.js"></script>\n',
  ],
};
function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: appRoot,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}
function originalFiles() {
  const entries = git(["ls-tree", "-rz", "--full-tree", baseline])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const [header, filename] = entry.split("\t");
      const [, type, object] = header.split(" ");
      assert.equal(type, "blob", filename);
      return { filename, object };
    });
  const output = git(["cat-file", "--batch"], {
    input: entries.map((entry) => entry.object).join("\n") + "\n",
  });
  let offset = 0;
  return new Map(
    entries.map((entry) => {
      const end = output.indexOf(10, offset);
      const [object, type, length] = output
        .subarray(offset, end)
        .toString("utf8")
        .split(" ");
      assert.equal(object, entry.object);
      assert.equal(type, "blob");
      offset = end + 1;
      const contents = output.subarray(offset, offset + Number(length));
      offset += Number(length) + 1;
      return [entry.filename, contents];
    }),
  );
}
const original = originalFiles();
test("Reviewed German layouts and invoice backend remain unchanged during upstream integration", () => {
  const reviewed = "00542c060d50dd74983c3e3c0d1d3fad93dbdd93";
  const files = [
    "renderer/app/export/offer-layout.js", "renderer/app/export/document-layout.js",
    "renderer/assets/document-design.json", "renderer/assets/fonts/Inter-Regular.ttf",
    "renderer/assets/fonts/Inter-Bold.ttf", "invoice/pdf_layout.py", "invoice/zugferd.py",
    "invoice/xrechnung.py", "invoice/model.py", "invoice/bridge.py", "invoice/order_import.py",
    "invoice/checks.py", "invoice/importer.py", "invoice/seller-defaults.json",
  ];
  for (const filename of files) {
    assert.deepEqual(normalizeCheckout(fs.readFileSync(path.join(appRoot,filename))),
      normalizeCheckout(git(["show",reviewed + ":" + filename])),filename);
  }
});
function normalizeCheckout(contents) {
  const text = contents.toString("utf8");
  // Windows checkouts can change text line endings. Binary files remain exact.
  if (contents.includes(0) || !Buffer.from(text, "utf8").equals(contents)) return contents;
  return Buffer.from(text.replace(/\r\n/g, "\n"), "utf8");
}
test("Official validation resources preserve their manifest hashes in Git", () => {
  const crypto = require("node:crypto");
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "invoice/validation/manifest.json")));
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const filename = "invoice/validation/" + relative;
    const attribute = git(["check-attr", "text", "--", filename]).toString().trim();
    assert.ok(attribute.endsWith(": text: unset"), filename);
    const staged = git(["show", ":" + filename]);
    assert.equal(crypto.createHash("sha256").update(staged).digest("hex"), expected, filename);
  }
});
test("Original 2.0.0 files match upstream except documented German and invoice hooks", () => {
  let checked = 0;
  for (const [filename, before] of original) {
    if (["package.json", "package-lock.json"].includes(filename)) continue;
    let after = fs.readFileSync(path.join(appRoot, filename));
    if (filename === "preload.js") after = Buffer.from(after.toString("utf8").replace(/  idosellProductTexts:[^\n]*\r?\n/, ""));
    if (filename === "renderer/app/export/pdf.js") {
      // The German renderer is additive; the legacy renderer must remain exact.
      const current = after.toString("utf8").replace(/\r\n/g, "\n");
      const marker = "// The new document family is introduced in German first.";
      assert.ok(current.includes(marker), "German offer entry point missing");
      assert.ok(current.includes('if (getPdfLang() !== "de") return generateLegacyPdf(options);'));
      let legacy = current.slice(0, current.indexOf(marker)).trimEnd() + "\n";
      const expected = before.toString("utf8").replace(/\r\n/g,"\n").trimEnd() + "\n";
      legacy = legacy.replace('import { renderGermanOffer } from "./offer-layout.js";\n', "")
        .replace("async function generateLegacyPdf(", "export async function generatePdf(");
      assert.equal(legacy,expected,"Upstream classic/modern offer renderers must remain unchanged");
    } else if (filename === "renderer/app/state/offerDocumentOptions.js") {
      const current = after.toString("utf8").replace(/\r\n/g,"\n");
      const marker = "// German documents use the reviewed local layout;";
      assert.ok(current.includes(marker));
      const upstreamPart = current.slice(0,current.indexOf(marker)).trimEnd().replace("  syncGermanDocumentControls();\n", "") + "\n";
      assert.equal(upstreamPart,before.toString("utf8").replace(/\r\n/g,"\n"));
    } else if (filename === "renderer/app/ui/iaiOrders.js" || filename === "main.js") {
      let current = after.toString("utf8").replace(/\r\n/g, "\n");
      current=current.replace(/(?:  )?\/\/ BEGIN document product languages[\s\S]*?(?:  )?\/\/ END document product languages\n\n/g, "")
        .replaceAll(/productDocumentName\(product, (?:lang|currentLang)\)/g,"pickProductName(product)")
        .replaceAll("      await ensureProductTexts(order); // document product languages\n", "")
        .replace("      if (previewOrder) { await ensureProductTexts(previewOrder); renderPreview(previewOrder); } // document product languages", "      if (previewOrder) renderPreview(previewOrder);");
      current=current.replace(/    \/\/ BEGIN order invoice handoff[\s\S]*?    \/\/ END order invoice handoff\n/g, "");
      const remove = (pattern) => { assert.match(current, pattern, filename); current = current.replace(pattern, ""); };
      if (filename === "main.js") {
        remove(/      if \(isPlainObject\(patch\.modulePrefs\.iaiOrders\.documentDrafts\)\) \{[\s\S]*?        next\.modulePrefs\.iaiOrders\.documentDrafts = documentDrafts;\n      \}\n/);
        remove(/    if \(String\(html \|\| ""\)\.includes\('name="esus-document-style" content="unified"'\)\) \{[\s\S]*?\n    \}\n/);
        remove(/      \.\.\.\(String\(html \|\| ""\)[\s\S]*?      \} : \{\}\),\n/);
        remove(/require\("\.\/invoice-ipc"\);\n/);
      } else {
        remove(/import \{ buildBusinessDocumentHtml, documentFieldsMarkup \} from "\.\.\/export\/document-layout\.js";\n/);
        remove(/export function buildGermanOrderDocument\([\s\S]*?\n\}\n\n(?=function sameOrder)/);
        remove(/  let documentSave = Promise\.resolve\(\);[\s\S]*?\n  \}\n(?=\n  function getOrderSerialsDraft)/);
        remove(/    if \(currentLang === "de"\) \{\n      const type = normalizeIaiOrdersDocumentType[\s\S]*?\n    \}\n/);
        remove(/    if \(currentLang === "de"\) return buildBusinessDocumentHtml[^\n]*\n/);
        remove(/        await documentSave;\n/);
        remove(/      if \(currentLang === "de"\) \{\n        const data = buildGermanOrderDocument[\s\S]*?\n      \}\n/);
        remove(/    if \(previewOrder && currentLang === "de"\) \{[\s\S]*?\n    \}\n/);
        remove(/  modalBody\?\.addEventListener\("change", \(event\) => \{\n    const field = event.target;[\s\S]*?\n  \}\);\n/);
        remove(/    if \(documentUpdates\) return;\n/);
        current = current.replace('modalDocType?.addEventListener("change", async (event)', 'modalDocType?.addEventListener("change", (event)');
      }
      const expected = before.toString("utf8").replace(/\r\n/g,"\n");
      assert.equal(current.length, expected.length, filename + " length");
      const mismatch = [...current].findIndex((character,index) => character !== expected[index]);
      assert.equal(mismatch, -1, filename + ": " + JSON.stringify(current.slice(Math.max(0,mismatch-80),mismatch+160)));
    } else if (additions[filename]) {
      let text = after.toString("utf8").replace(/\r\n/g, "\n");
      for (const addition of [].concat(additions[filename])) {
        assert.ok(
          text.includes(addition),
          "Missing integration hook: " + filename,
        );
        text = text.replace(addition, "");
      }
      const expected = before.toString("utf8").replace(/\r\n/g, "\n");
      assert.equal(
        filename === ".gitignore" ? text.trimEnd() : text,
        filename === ".gitignore" ? expected.trimEnd() : expected,
        filename,
      );
    } else assert.equal(Buffer.compare(normalizeCheckout(before), normalizeCheckout(after)), 0, filename);
    checked++;
  }
  assert.ok(checked > 5000);
  console.log(`Compared ${checked} original files against ${baseline}`);
});
test("Existing dependency versions, scripts and update configuration are preserved", () => {
  const expected = JSON.parse(original.get("package.json"));
  expected.version = "2.1.0";
  expected.scripts.test = "node --test tests/*.test.cjs";
  expected.scripts["invoice:prepare"] = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-invoice.ps1";
  for (const hook of ["prestart", "prepack", "predist"]) expected.scripts[hook] = "npm run invoice:prepare";
  expected.build.files.push("invoice-ipc.js");
  expected.build.extraResources = [
    {
      from: "invoice",
      to: "invoice",
      filter: ["**/*", "!test_*.py", "!__pycache__/**/*"],
    },
    { from: "runtime/python", to: "python" },
    { from: "renderer/assets/document-design.json", to: "invoice/document-design.json" },
    { from: "renderer/assets/fonts", to: "invoice/fonts", filter: ["Inter-*"] },
    { from: "renderer/assets/logo_1_big.png", to: "invoice/logo_1_big.png" },
  ];
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"))),
    expected,
  );
  const lock = JSON.parse(original.get("package-lock.json"));
  lock.version = "2.1.0";
  lock.packages[""].version = "2.1.0";
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(appRoot, "package-lock.json"))),
    lock,
  );
});
const packaged = path.join(appRoot, "dist/win-unpacked/resources/app");
const archive = path.join(appRoot, "dist/win-unpacked/resources/app.asar");
test(
  "Local Windows package contains the audited source and current integration",
  { skip: (!fs.existsSync(packaged) && !fs.existsSync(archive)) ||
      (fs.existsSync(archive) && JSON.parse(require("@electron/asar").extractFile(archive,"package.json")).version !== JSON.parse(fs.readFileSync(path.join(appRoot,"package.json"))).version
        ? "No matching-version Windows package; rebuild before package verification" : false) },
  () => {
    const files = [...original.keys()].filter(
      (filename) =>
        ["main.js", "preload.js", "package.json"].includes(filename) ||
        filename.startsWith("renderer/") ||
        filename.startsWith("background/"),
    );
    files.push(
      "invoice-ipc.js",
      "background/idosellProductTexts.js",
      "renderer/app/invoices.js",
      "renderer/app/invoice-ui-pl.js",
      "renderer/css/50_invoices.css",
      "renderer/app/config/documentDesign.js",
      "renderer/app/export/offer-layout.js",
      "renderer/app/export/document-layout.js",
      "renderer/assets/document-design.json",
      "renderer/assets/fonts/Inter-Regular.ttf",
      "renderer/assets/fonts/Inter-Bold.ttf",
      "renderer/assets/fonts/Inter-LICENSE.txt",
    );
    for (const filename of files) {
      if (filename === "package.json" && fs.existsSync(archive)) {
        // electron-builder strips build-only metadata from the runtime manifest.
        const expected = JSON.parse(fs.readFileSync(path.join(appRoot, filename)));
        for (const key of ["build", "scripts", "devDependencies"]) delete expected[key];
        assert.deepEqual(JSON.parse(require("@electron/asar").extractFile(archive, filename.split("/").join(path.sep))), expected);
        continue;
      }
      assert.equal(
        Buffer.compare(
          normalizeCheckout(fs.readFileSync(path.join(appRoot, filename))),
          normalizeCheckout(fs.existsSync(archive)
            ? require("@electron/asar").extractFile(archive, filename.split("/").join(path.sep))
            : fs.readFileSync(path.join(packaged, filename))),
        ),
        0,
        filename,
      );
    }
    const resources = path.join(appRoot,"dist/win-unpacked/resources");
    for (const filename of ["pdf_layout.py","zugferd.py","order_import.py","bridge.py"]) {
      assert.deepEqual(fs.readFileSync(path.join(resources,"invoice",filename)),fs.readFileSync(path.join(appRoot,"invoice",filename)));
    }
    for (const filename of ["document-design.json","fonts/Inter-Regular.ttf","fonts/Inter-Bold.ttf","logo_1_big.png"]) {
      assert.deepEqual(fs.readFileSync(path.join(resources,"invoice",filename)),fs.readFileSync(path.join(appRoot,"renderer/assets",filename)));
    }
  },
);
