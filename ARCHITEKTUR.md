# Architecture – ESUS IT Offer Generator 2.1.0

## Baseline and integration boundaries

This integration combines the reviewed fork state (`00542c0`, application 1.8.0)
with the author's 2.0.0 master (`ad4742ef0b1921b6ea31c055705d62640e682c46`).
The integration branch is `codex/integrate-upstream-2.0`. The release version is 2.1.0, combining upstream 2.0.0 with the reviewed German
document and e-invoicing extensions.

The author's new sidebar, offer editor, IAI-ID product search, PM reports, charts,
settings and classic/modern offer templates are imported directly from upstream.
German document layouts and the invoice backend remain unchanged from the reviewed
fork. Small integration adapters connect those features to the new interface.

`tests/parity.test.cjs` compares 5,776 upstream files against the pinned 2.0.0
commit, accounting explicitly for German/invoice hooks. Another test compares
reviewed German templates and invoice backend files against the fork commit.
These checks protect source boundaries; they do not guarantee every possible
workflow or replace review of real invoice data.

## Electron, user interface and storage

- `main.js`: existing application, IdoSell requests, settings and PDF printing.
- `preload.js`: IPC interfaces between the renderer and main process.
- `renderer/app/ui/iaiOrders.js`: order selection, document preview, editable
  document metadata, language selection and handoff to the e-invoicing workspace.
- `renderer/app/invoices.js`: Polish e-invoicing interface for PDF and order
  imports, review, corrections, validation and export. Other application areas
  remain mounted when switching modules.
- `invoice-ipc.js`: file dialogs, private Python processes and protection against
  losing unsaved invoice changes when closing the application.

Additional document fields use the existing user settings under
`modulePrefs.iaiOrders.documentDrafts`; no separate database is introduced.
User settings, credentials, imported invoices and generated documents do not belong
in Git.

## Document layouts

`renderer/assets/document-design.json` defines shared colors, page dimensions,
address positioning and the German GmbH company profile. Inter Regular/Bold and
their OFL license are bundled in `renderer/assets/fonts`; no runtime font download
is required.

`renderer/app/config/documentDesign.js` exposes these values to JavaScript.
`offer-layout.js` renders German offers with jsPDF/AutoTable.
`document-layout.js` styles German IAI invoices, order confirmations and delivery
notes for the existing HTML-to-PDF flow. `invoice/pdf_layout.py` renders the German
visible ZUGFeRD invoice using ReportLab. These adapters follow the existing PDF
engines and share design data. Installer resources provide the same design and
font files to Python.

German documents use the GmbH profile. Existing company profiles for other
languages are retained. PL/EN/HU offers use the author's 2.0.0 classic/modern renderers without our previous
footer or shipping modifications. Foreign order document renderers and footer
helpers are copied directly from upstream as well.

German documents share blue accents, normal-weight address, metadata and item
text, and dark bold final totals. Quantities are centered and prices aligned
right; numeric column widths account for formatted values. Repeated table headers
and reserved footer space support multiple pages. The address area targets
standard DIN-long/C5 window envelopes. This is not a general DIN certification.

German offer shipping is a calculated line item. Alternative products remain excluded
from the main total. Delivery notes contain goods only, use a plain document title,
and show the IdoSell order number plus an optional customer purchase-order number.
Delivery dates and conditions are not repeated. Editable document fields supplement
missing API values.

Technical references and electronic endpoints remain in ZUGFeRD XML but are not
repeated in the German PDF. The buyer VAT ID appears directly with the address.
Recognized tracking numbers appear below an unambiguously identified shipping
line; remaining customer notes are displayed separately. Original notes remain
in XML. The visible payment caption uses “Kauf auf Rechnung” for the corresponding
“Handelskredit” payment case. PDF unit prices show two decimals, while XML unit
prices retain their precision.

## Product text by document language

`background/idosellProductTexts.js` uses existing API helpers for read-only calls
to `products/products/search`. It requests `lang_data`, passes the document language
through `productSearchingLangId`, and selects the corresponding entry from
`productDescriptionsLangData`. The lookup helper supports DE, PL, EN and HU; order-document integration requests
translations only for German. Other order documents retain upstream product names.

Requests accept up to 100 product IDs. A five-minute cache is scoped by shop,
language and product. Additional names are stored under `documentNames`; original
order names, identifiers and prices are preserved. Missing translations or API
errors fall back to the original name with a warning. Preview and export use the
same document language.

## Two sources, one e-invoicing workflow

`invoice/bridge.py` routes seller-profile, PDF-import, order-import, requirements,
validation and export actions. `invoice/model.py` remains the shared invoice model.
Monetary arithmetic uses Decimal, with decimal strings passed between processes.

1. PDF import: the existing importer reads digital IdoSell invoices. The original
   PDF remains available for comparison.
2. Order import: an action in the IAI order dialog opens the same invoice workspace.
   `invoice/order_import.py` maps billing details, items, order prices, language,
   currency and control totals. Replacing an existing draft requires confirmation.
   This source has no original PDF preview.

An order import creates a reviewable draft, not an issued invoice. Order and
invoice numbers stay separate. Invoice number, actual issue/delivery dates and
unverified payment details must be completed or confirmed. Customer purchase-order
references are not interpreted as Leitweg IDs. Fee tax rates are not guessed;
discount, rounding and total discrepancies produce notes rather than silent
balancing. Zero tax is not automatically treated as an intra-community supply.

Both sources use the existing checks and exporters. The existing scope for EUR,
German 19% VAT and reviewed intra-community supplies is not silently extended to
other tax cases.

## XML, PDF/A and official validation

The existing XRechnung exporter produces XML. `invoice/zugferd.py` generates CII XML
and a PDF/A-3 invoice with embedded XML. Supplier identifiers are serialized as a
single identifier; existing payment text can be included with the payment means.
Unit codes such as C62 are structured codes rather than visible product labels.

Validation uses pinned official XRechnung/CII resources and veraPDF for PDF/A.
`invoice/validation/manifest.json` and `.gitattributes` protect resource bytes.
Valid structure does not replace the user's confirmation of actual invoice data.

## Development, packaging and publishing

```powershell
npm.cmd ci
npm.cmd test
npm.cmd start
npm.cmd run dist -- --win nsis --x64 --publish never
```

`scripts/prepare-invoice.ps1`, invoked through existing npm lifecycle hooks,
prepares pinned private Python/Java runtimes and invoice resources. End users
install the Windows setup executable and do not need a Node/Python development
environment.

Release manifest version: 2.1.0. Existing dependency versions are retained. The automatic
update source in `package.json` still points to the original repository,
`musicshaggy/esus-offer-creator`. Pushing or merging the fork does not distribute
an installer or change an installed executable. A separate fork release/update
channel would require an explicit decision. Installer binaries belong in GitHub
release assets, not source commits.

## Integration behavior at language boundaries

`renderer/app/export/pdf.js` retains the upstream offer implementation, with its
entry function renamed locally. The public entry dispatches German to the reviewed
German renderer and all other languages to the upstream implementation. The
German wrapper supplies the buyer tax identifier directly; upstream customer
formatting remains unchanged.

For German offers, the upstream template picker and version-date toggle are
hidden: the reviewed layout already has its own actual offer date and no duplicate
version-date caption. Stored upstream options remain intact for PL/EN/HU.

The e-invoice navigation button is placed beside IAI in the new sidebar. Its
workspace reserves the sidebar width; navigation can leave the workspace without
discarding the invoice draft. The author's ERP layout code is not rewritten.

The upstream classic offer totals summarize goods and list shipping separately in
the conditions; the modern template includes shipping in its final amount. German
offers retain the reviewed shipping line and inclusive totals. These differences
are deliberate preservation of upstream behavior, not a common recalculation.

## Fork release packaging

The source `package.json` retains the original author's publishing configuration.
Fork binaries override only the build-time publishing target, so their bundled
`app-update.yml` points to `lucaabz/esus-offer-creator`. This avoids publishing to
upstream and keeps the source suitable for an upstream contribution.

To reproduce the fork installer in PowerShell after preparing dependencies:

```powershell
New-Item -ItemType Directory -Force runtime/setup | Out-Null
$forkBuild = (Get-Content package.json -Raw | ConvertFrom-Json).build
$forkBuild.publish = @(@{provider='github'; owner='lucaabz'; repo='esus-offer-creator'; releaseType='release'})
$forkBuild | ConvertTo-Json -Depth 30 | Set-Content -Encoding utf8 runtime/setup/fork-release-config.json
npm.cmd run dist -- --config runtime/setup/fork-release-config.json --win nsis --x64 --publish never
```

Use a pull request to merge the tested release branch into the fork's master.
Create the GitHub release as a draft at the exact merged commit, upload the setup
EXE, its blockmap, `latest.yml` and SHA256 checksums, then publish the completed
release. Binaries are release assets, not Git source files. Existing installations
that still use the original update target need the fork installer manually once.
The upstream pull request is submitted manually by the maintainer of this fork.
