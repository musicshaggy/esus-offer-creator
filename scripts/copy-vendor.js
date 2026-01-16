const fs = require("fs");
const path = require("path");

function copy(src, dst) {
  const dir = path.dirname(dst);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dst);
  console.log("Copied:", src, "->", dst);
}

const root = path.resolve(__dirname, "..");

// jsPDF UMD
copy(
  path.join(root, "node_modules", "jspdf", "dist", "jspdf.umd.min.js"),
  path.join(root, "renderer", "vendor", "jspdf.umd.min.js")
);

// AutoTable plugin
copy(
  path.join(root, "node_modules", "jspdf-autotable", "dist", "jspdf.plugin.autotable.min.js"),
  path.join(root, "renderer", "vendor", "jspdf.plugin.autotable.min.js")
);

// ExcelJS browser bundle
// (w exceljs 4.x zwykle jest: dist/exceljs.min.js)
copy(
  path.join(root, "node_modules", "exceljs", "dist", "exceljs.min.js"),
  path.join(root, "renderer", "vendor", "exceljs.min.js")
);
