# Release 2.1.0

This release versions the reviewed integration without changing its document or
invoice functionality. Source publishing configuration remains upstream-oriented;
the fork installer uses a build-only override for the fork update channel.

The release installer is rebuilt from the versioned source, then checked using the
Node package comparison and packaged Electron integration test. Earlier 2.0.0
integration results below remain historical evidence for the same functional
source; the final release artifact hashes identify the distributed binaries.

# Upstream integration verification

Date: 2026-10-28. Branch: `codex/integrate-upstream-2.0`.

## Scope

Merge upstream 2.0.0 (`ad4742e`) into the reviewed fork (`00542c0`), preserving
German document templates and all e-invoicing features. PL/EN/HU offer and order
renderers are copied from upstream rather than reconstructed. Retain upstream
sidebar/editor changes, IAI-ID lookup, PM reports and exports.

## Current checks

- Reviewed German template and invoice backend files match their pinned fork
  versions; the shared German design data and fonts remain unchanged.
- Source parity checks 5,776 files against upstream 2.0.0, explicitly removing only
  the documented German/e-invoice integration adapters before comparison.
- Node suite after packaging: 7 tests passed, 0 failures, 0 skipped, including
  the comparison of the actual Windows package against the integration source.
- Python invoice suite: 47 tests passed.
- The author's unmodified `scripts/ui-smoke.cjs`: passed, including 24 preserved
  fields, offer workflows, report export, classic/modern PDFs, Excel export and
  independent saved document options.
- Extended invoice Electron checks: passed for PDF import, Polish UI, XRechnung,
  English ZUGFeRD, original offer persistence and IdoSell draft handoff.
- Nine offer PDF cases cover German shipping (none/net/gross) and upstream
  classic/modern PL/EN/HU output. Language-dependent controls and invoice sidebar
  navigation are also checked.

The former all-language shipping assertion was replaced with distinct documented
expectations: German totals include the shipping line; upstream classic foreign
output shows goods totals with separate delivery terms, and upstream modern output
includes delivery in its final amount. The upstream code itself is unchanged.

The Windows x64 integration package was built from `a599a70` using the existing
electron-builder/NSIS workflow with publishing disabled. Packaged Electron
integration checks passed for PDF import, XRechnung, English ZUGFeRD, offer
persistence, nine offer PDF cases, sidebar navigation and IdoSell draft handoff.
The setup executable is intended for manual acceptance; the installation process
has not been exercised automatically. The earlier package results below refer to
1.8.0 only. Live shop/PDF comparison remains pending.

## Earlier 1.8.0 verification (historical)

### Verification and change scope – Version 1.8.0

Date: 2026-10-28. The comparison baseline is the fork's last published feature
branch commit (`b3489df`). Its existing e-invoicing integration is extended;
PDF import, requirements checks and both export formats remain available.

## Changes since the last push

- Shared German layouts for offers, order confirmations, delivery notes, IAI
  invoices and ZUGFeRD PDFs; centralized design values, bundled Inter fonts and
  consistent complete footers. Foreign-language company profiles are retained.
- Revised addresses, metadata, tables, totals, page breaks and closing text.
  Offer shipping is included as a calculated line; delivery notes exclude shipping.
- Delivery notes show the IdoSell order number, optional customer purchase-order
  number and delivery date. Additional document fields can be edited manually.
- IdoSell product names follow the selected DE/PL/EN/HU document language, with a
  cache and fallback to original names when translations are unavailable.
- Orders can open directly as drafts in the existing e-invoicing workspace.
  Billing details, order lines and prices are mapped; unverified invoice, tax and
  payment details remain for review. Manual PDF import stays available.
- ZUGFeRD improvements include two-decimal PDF prices with full XML unit-price
  precision, corrected supplier identifiers, payment text, and clearer payment,
  tracking-number and customer-note placement.
- Version 1.8.0, matching installer resources and additional checks without new
  npm dependencies.

## Automated verification

```powershell
npm.cmd test
.\runtime\python\python.exe -X utf8 -m unittest discover -s invoice -p 'test_*.py'
```

Node tests cover official resource hashes including the Git index, explicitly
allowed changes against the original 1.7.3 source, dependency and package
preservation, and localized product-text requests. Python tests cover imports,
order drafts, required fields, numeric precision, XML output and PDF behavior.
The package comparison requires an existing local build; otherwise it is
explicitly skipped.

`tests/electron-smoke.cjs` uses isolated test storage and controlled order data.
It checks offer workflows, navigation, languages, PDF import, XML/ZUGFeRD export,
shipping totals and order handoff, including cancel/confirm when replacing a
draft. Its entry point is `tests/smoke-app`; `--package-test` also checks the local
Windows package. Required local PDF samples are not published.

The most recent complete verification before publication passed 47 Python tests,
6 Node tests and Electron integration checks against source and the Windows
package. The commit-time rerun is also reported in the pull request. A synthetic,
reviewed order draft was checked with the official XRechnung/CII validators.

## Limits

Source parity explicitly permits the authorized layout, shipping, document-field
and integration changes. It does not claim every file is unchanged or every
original workflow has been manually exercised.

An end-to-end comparison of the same live shop order against its PDF invoice
remains outstanding. Product text and order mapping have been checked with
controlled responses. Missing values and supported tax cases still require
review after import. Tests do not constitute general DIN or legal certification.

## Packaging and Git

Windows setup uses the existing electron-builder/NSIS workflow and contains the
private invoice resources. Installer binaries, runtimes, node_modules, credentials,
user settings and sample invoices are excluded from source commits. Component and
build details are documented in `ARCHITEKTUR.md`.

## Integration test installer

Source commit: a599a70. Windows x64 setup, version 2.0.0.
SHA256: 92CC52F250F4F9D3EE17D6DCF7C292FCA35FBAF984B7D465BB5E33F7BFD73407
Local test artifact only; not published as a GitHub release.


## Release 2.1.0 artifact verification

Built from source commit 2741b81. All 7 Node tests passed with no skips, including
the source/package comparison. Packaged Electron integration passed. Installer
SHA512 matches latest.yml; bundled update configuration targets the fork.
Installer SHA256: 9971674EE768105BE9C53CB09CD2DF4897A6A8DA2F5B368F00CF169947AA1056

