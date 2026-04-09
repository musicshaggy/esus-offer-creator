// main.js
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { autoUpdater } = require("electron-updater");

app.setPath("userData", path.join(os.homedir(), "AppData", "Local", "ESUS-Quote"));

let splashWin = null;
let win = null;
const idosellOpenApiCache = new Map();

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

function defaultUserSettings() {
  return {
    initials: "",
    offerSeq: {},
    profile: null,
    docDefaults: { offerCcy: "PLN", lang: "pl", vatCode: "23" },
    integrations: {
      idosell: {
        baseUrl: "",
        apiKey: "",
      },
    },
  };
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

function mergeUserSettings(current, patch) {
  const defaults = defaultUserSettings();
  return {
    ...defaults,
    ...(current || {}),
    ...(patch || {}),
    offerSeq: { ...(defaults.offerSeq || {}), ...(current?.offerSeq || {}), ...(patch?.offerSeq || {}) },
    profile: patch?.profile
      ? { ...(defaults.profile || {}), ...(current?.profile || {}), ...patch.profile }
      : current?.profile ?? defaults.profile,
    docDefaults: patch?.docDefaults
      ? { ...(defaults.docDefaults || {}), ...(current?.docDefaults || {}), ...patch.docDefaults }
      : current?.docDefaults || defaults.docDefaults,
    integrations: {
      ...(defaults.integrations || {}),
      ...(current?.integrations || {}),
      ...(patch?.integrations || {}),
      idosell: {
        ...(defaults.integrations?.idosell || {}),
        ...(current?.integrations?.idosell || {}),
        ...(patch?.integrations?.idosell || {}),
      },
    },
  };
}

function normalizeExternalBaseUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  return url.origin;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}

    return { response, text, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildMfGovSearchUrl(nip, date) {
  const normalizedNip = normalizeNip(nip);
  const d = String(date || todayYMD()).trim();
  const url = new URL(`https://wl-api.mf.gov.pl/api/search/nip/${normalizedNip}`);
  url.searchParams.set("date", d);
  return url.toString();
}

function pickIdoSellDocCandidates(baseUrl) {
  return ["7", "6"].map((version) => ({
    version,
    url: new URL(`/api/doc/admin/v${version}/json`, baseUrl).toString(),
  }));
}

function hasRequiredNonPathParams(parameters = []) {
  return parameters.some((param) => {
    if (!param || !param.required) return false;
    return String(param.in || "").toLowerCase() !== "path";
  });
}

function buildServerCandidates(spec, baseUrl) {
  const base = normalizeExternalBaseUrl(baseUrl);
  const origin = new URL(base).origin;
  const rawServers = Array.isArray(spec?.servers) ? spec.servers : [];
  const servers = rawServers
    .map((server) => String(server?.url || "").trim())
    .filter(Boolean)
    .map((url) => {
      try {
        return new URL(url, base).toString();
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const fallbackServers = [
    `${origin}/api/admin/v7/`,
    `${origin}/api/admin/v6/`,
    `${base}/`,
  ];

  return Array.from(new Set([...servers, ...fallbackServers]));
}

function buildOperationUrl(serverBase, pathKey, baseUrl) {
  const trimmedPath = String(pathKey || "").trim();
  if (!trimmedPath) return null;

  try {
    if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath;
    if (trimmedPath.startsWith("/api/")) return new URL(trimmedPath, baseUrl).toString();

    const normalizedServer = String(serverBase || "").trim() || `${normalizeExternalBaseUrl(baseUrl)}/`;
    const base = normalizedServer.endsWith("/") ? normalizedServer : `${normalizedServer}/`;
    return new URL(trimmedPath.replace(/^\/+/, ""), base).toString();
  } catch {
    return null;
  }
}

function pickIdoSellTestOperations(spec, baseUrl) {
  const paths = spec?.paths && typeof spec.paths === "object" ? Object.entries(spec.paths) : [];
  const serverCandidates = buildServerCandidates(spec, baseUrl);
  const picks = [];

  for (const [pathKey, pathConfig] of paths) {
    const getOp = pathConfig?.get;
    if (!getOp || pathKey.includes("{")) continue;

    const allParams = [
      ...(Array.isArray(pathConfig?.parameters) ? pathConfig.parameters : []),
      ...(Array.isArray(getOp?.parameters) ? getOp.parameters : []),
    ];

    if (hasRequiredNonPathParams(allParams)) continue;

    for (const serverBase of serverCandidates) {
      const url = buildOperationUrl(serverBase, pathKey, baseUrl);
      if (!url) continue;
      picks.push({
        path: pathKey,
        url,
        summary: getOp.summary || getOp.operationId || "",
      });
    }
  }

  return picks.slice(0, 8);
}

async function testIdoSellConnection({ baseUrl, apiKey }) {
  const normalizedBaseUrl = normalizeExternalBaseUrl(baseUrl);
  const key = String(apiKey || "").trim();

  if (!normalizedBaseUrl) {
    return { ok: false, message: "Podaj Base URL do panelu IdoSell." };
  }

  if (!key) {
    return { ok: false, message: "Podaj klucz Admin API." };
  }

  let docSpec = null;
  let docVersion = "";
  let docUrl = "";

  for (const candidate of pickIdoSellDocCandidates(normalizedBaseUrl)) {
    try {
      const { response, json } = await fetchJsonWithTimeout(candidate.url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok || !json?.paths) continue;

      docSpec = json;
      docVersion = candidate.version;
      docUrl = candidate.url;
      break;
    } catch {}
  }

  if (!docSpec) {
    return {
      ok: false,
      message: "Nie udało się pobrać dokumentacji Admin API z podanego Base URL.",
      baseUrl: normalizedBaseUrl,
    };
  }

  const operations = pickIdoSellTestOperations(docSpec, normalizedBaseUrl);
  if (!operations.length) {
    return {
      ok: false,
      message: "Nie znaleziono prostego endpointu GET do testu połączenia w OpenAPI IdoSell.",
      baseUrl: normalizedBaseUrl,
      version: docVersion,
      docUrl,
    };
  }

  const authHeaders = {
    Accept: "application/json",
    "X-API-KEY": key,
  };

  let lastFailure = null;
  for (const operation of operations) {
    try {
      const { response, text, json } = await fetchJsonWithTimeout(operation.url, {
        headers: authHeaders,
      });

      if (response.ok) {
        return {
          ok: true,
          message: `Połączenie z IdoSell działa. Zweryfikowano klucz przez ${operation.path}.`,
          baseUrl: normalizedBaseUrl,
          version: docVersion,
          endpoint: operation.path,
          endpointUrl: operation.url,
          status: response.status,
          docUrl,
          responseHint: json?.message || json?.status || text?.slice(0, 160) || "",
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          message: "IdoSell odrzucił klucz API. Sprawdź X-API-KEY i jego uprawnienia.",
          baseUrl: normalizedBaseUrl,
          version: docVersion,
          endpoint: operation.path,
          endpointUrl: operation.url,
          status: response.status,
          docUrl,
        };
      }

      lastFailure = {
        ok: false,
        message: `API odpowiedziało statusem ${response.status} podczas testu ${operation.path}.`,
        baseUrl: normalizedBaseUrl,
        version: docVersion,
        endpoint: operation.path,
        endpointUrl: operation.url,
        status: response.status,
        docUrl,
      };
    } catch (error) {
      lastFailure = {
        ok: false,
        message: `Nie udało się połączyć z ${operation.path}: ${String(error?.message || error)}`,
        baseUrl: normalizedBaseUrl,
        version: docVersion,
        endpoint: operation.path,
        endpointUrl: operation.url,
        docUrl,
      };
    }
  }

  return lastFailure || {
    ok: false,
    message: "Nie udało się zweryfikować połączenia z IdoSell.",
    baseUrl: normalizedBaseUrl,
    version: docVersion,
    docUrl,
  };
}

async function loadIdoSellOpenApi(baseUrl) {
  const normalizedBaseUrl = normalizeExternalBaseUrl(baseUrl);
  const cached = idosellOpenApiCache.get(normalizedBaseUrl);
  if (cached?.spec) return cached;

  for (const candidate of pickIdoSellDocCandidates(normalizedBaseUrl)) {
    try {
      const { response, json } = await fetchJsonWithTimeout(candidate.url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok || !json?.paths) continue;

      const next = {
        baseUrl: normalizedBaseUrl,
        version: candidate.version,
        docUrl: candidate.url,
        spec: json,
      };
      idosellOpenApiCache.set(normalizedBaseUrl, next);
      return next;
    } catch {}
  }

  return null;
}

function buildIdoSellAdminUrl(baseUrl, endpoint) {
  const normalizedBaseUrl = normalizeExternalBaseUrl(baseUrl);
  return new URL(`/api/admin/v7/${String(endpoint || "").replace(/^\/+/, "")}`, normalizedBaseUrl).toString();
}

function getIdoSellIntegrationSettings() {
  const settings = mergeUserSettings(readJsonSafe(getSettingsPath(), defaultUserSettings()), {});
  const idosell = settings?.integrations?.idosell || {};
  return {
    baseUrl: normalizeExternalBaseUrl(idosell?.baseUrl || ""),
    apiKey: String(idosell?.apiKey || "").trim(),
  };
}

async function callIdoSellJson(url, { method = "GET", apiKey, body } = {}) {
  const options = {
    method,
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
  };

  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  return await fetchJsonWithTimeout(url, options);
}

function getOperationParameters(pathConfig, operation) {
  return [
    ...(Array.isArray(pathConfig?.parameters) ? pathConfig.parameters : []),
    ...(Array.isArray(operation?.parameters) ? operation.parameters : []),
  ];
}

function isSearchLikeParamName(name) {
  return /(^|_|-)(nip|tax|vat|tin|search|query|filter)(_|-|$)/i.test(String(name || ""));
}

function isClientLikeText(value) {
  return /(client|customer|contractor|company|buyer|customeraccount|clientaccount|partner|contractahent|kontrahent)/i.test(String(value || ""));
}

function isNipLikeParamName(name) {
  return /(^|_|-)(nip|tax|vat|tin)(_|-|$)/i.test(String(name || ""));
}

function buildSearchRequestUrl(baseUrl, serverBase, pathKey, params, nip) {
  const urlString = buildOperationUrl(serverBase, pathKey, baseUrl);
  if (!urlString) return null;

  const url = new URL(urlString);
  let hasSearchParam = false;

  for (const param of params) {
    if (!param || String(param.in || "").toLowerCase() !== "query") continue;

    const name = String(param.name || "").trim();
    if (!name) continue;

    if (isNipLikeParamName(name)) {
      url.searchParams.set(name, nip);
      hasSearchParam = true;
      continue;
    }

    if (isSearchLikeParamName(name) && isClientLikeText(`${pathKey} ${param.description || ""}`)) {
      url.searchParams.set(name, nip);
      hasSearchParam = true;
      continue;
    }

    if (!param.required) continue;

    if (/^(page|pageNumber|page_no)$/i.test(name)) {
      url.searchParams.set(name, "1");
      continue;
    }
    if (/^(limit|pageSize|perPage|per_page|resultsLimit|size)$/i.test(name)) {
      url.searchParams.set(name, "1");
      continue;
    }
    if (/^(sort|orderBy|order_by)$/i.test(name)) {
      continue;
    }

    return null;
  }

  return hasSearchParam ? url.toString() : null;
}

function scoreIdoSellClientLookup(pathKey, operation, params) {
  const text = [pathKey, operation?.summary, operation?.operationId, operation?.description]
    .filter(Boolean)
    .join(" ");

  let score = 0;
  if (isClientLikeText(text)) score += 20;
  if (/\/(clients|customers|contractors|companies|buyers)\b/i.test(pathKey)) score += 24;

  for (const param of params) {
    if (String(param?.in || "").toLowerCase() !== "query") continue;
    const name = String(param?.name || "");
    if (isNipLikeParamName(name)) score += 30;
    else if (isSearchLikeParamName(name)) score += 8;
  }

  if (!pathKey.includes("{")) score += 4;
  if (/search|list|index|find/i.test(text)) score += 5;
  return score;
}

function pickIdoSellClientLookupRequests(spec, baseUrl, nip) {
  const paths = spec?.paths && typeof spec.paths === "object" ? Object.entries(spec.paths) : [];
  const serverCandidates = buildServerCandidates(spec, baseUrl);
  const picks = [];

  for (const [pathKey, pathConfig] of paths) {
    const getOp = pathConfig?.get;
    if (!getOp) continue;

    const params = getOperationParameters(pathConfig, getOp);
    const score = scoreIdoSellClientLookup(pathKey, getOp, params);
    if (score <= 0) continue;

    for (const serverBase of serverCandidates) {
      const url = buildSearchRequestUrl(baseUrl, serverBase, pathKey, params, nip);
      if (!url) continue;

      picks.push({
        path: pathKey,
        url,
        score,
        summary: getOp.summary || getOp.operationId || "",
      });
    }
  }

  return picks
    .sort((a, b) => b.score - a.score)
    .filter((item, index, arr) => arr.findIndex((x) => x.url === item.url) === index)
    .slice(0, 12);
}

function pickObjectValue(obj, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function hasOwnAny(obj, keys) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return keys.some((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function buildClientAddress(candidate) {
  const directAddress = pickObjectValue(candidate, [
    "address",
    "fullAddress",
    "streetAddress",
    "addressLine1",
    "clientAddress",
  ]);
  if (directAddress) return directAddress;

  const nestedAddress =
    (candidate?.address && typeof candidate.address === "object" && candidate.address) ||
    (candidate?.billingAddress && typeof candidate.billingAddress === "object" && candidate.billingAddress) ||
    (candidate?.mainAddress && typeof candidate.mainAddress === "object" && candidate.mainAddress) ||
    (candidate?.clientAddress && typeof candidate.clientAddress === "object" && candidate.clientAddress) ||
    null;

  const source = nestedAddress || candidate;
  const street = pickObjectValue(source, [
    "street",
    "streetName",
    "street1",
    "line1",
    "address1",
    "clientStreet",
  ]);
  const number = pickObjectValue(source, [
    "houseNumber",
    "buildingNumber",
    "streetNumber",
    "number",
    "streetNo",
  ]);
  const unit = pickObjectValue(source, ["flatNumber", "apartmentNumber", "unitNumber", "flatNo"]);
  const zip = pickObjectValue(source, [
    "zipCode",
    "postalCode",
    "postcode",
    "zip",
    "postCode",
    "clientZipCode",
  ]);
  const city = pickObjectValue(source, ["city", "town", "cityName", "clientCity"]);
  const streetAndNumber = pickObjectValue(source, ["streetAndNumber", "street_with_number"]);

  if (streetAndNumber) {
    const cityLine = [zip, city].filter(Boolean).join(" ").trim();
    return [streetAndNumber, cityLine].filter(Boolean).join(", ").trim();
  }

  const streetLine = [street, number, unit ? `/${unit}` : ""].filter(Boolean).join(" ").trim();
  const cityLine = [zip, city].filter(Boolean).join(" ").trim();
  return [streetLine, cityLine].filter(Boolean).join(", ").trim();
}

function isOrderLikeCandidate(candidate) {
  return hasOwnAny(candidate, [
    "orderId",
    "order_id",
    "orderSerialNumber",
    "orderName",
    "orderStatus",
    "purchaseDate",
    "paymentStatus",
    "deliveryStatus",
    "orderDetails",
    "basket",
    "products",
  ]);
}

function hasClientLikeIdentity(candidate) {
  return hasOwnAny(candidate, [
    "clientId",
    "client_id",
    "clientName",
    "clientCompanyName",
    "clientFirstName",
    "clientLastName",
    "customerName",
    "companyName",
    "contractorName",
    "company",
    "firm",
    "email",
    "emailAddress",
    "phone",
    "phoneNumber",
    "telephone",
    "firstName",
    "lastName",
    "address",
    "billingAddress",
    "mainAddress",
    "deliveryAddress",
  ]);
}

function mapRemoteClientCandidate(candidate, nip, options = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  if (isOrderLikeCandidate(candidate)) return null;

  const candidateNip = normalizeNip(
    pickObjectValue(candidate, [
      "clientNip",
      "nip",
      "taxIdentificationNumber",
      "taxNumber",
      "taxId",
      "taxID",
      "vatNumber",
      "vatId",
      "companyTaxId",
    ])
  );

  const trustedNip = options?.allowFallbackNip ? normalizeNip(nip) : "";
  const effectiveNip = candidateNip || trustedNip;
  if (!effectiveNip || effectiveNip !== normalizeNip(nip)) return null;
  if (!candidateNip && !hasClientLikeIdentity(candidate)) return null;

  const name = pickObjectValue(candidate, [
    "clientFirm",
    "clientCompanyName",
    "companyName",
    "contractorName",
    "firm",
    "company",
    "name",
  ]);

  const firstName = pickObjectValue(candidate, ["firstName", "firstname", "name1", "clientFirstName"]);
  const lastName = pickObjectValue(candidate, ["lastName", "lastname", "surname", "clientLastName"]);
  const fallbackPersonName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const effectiveName = name || fallbackPersonName;

  const email = pickObjectValue(candidate, [
    "clientEmail",
    "email",
    "emailAddress",
    "mail",
    "email1",
    "email2",
  ]);
  const contact = email;
  const addr = buildClientAddress(candidate);
  if (!effectiveName && !addr && !contact) return null;

  return normalizeClientRecord({
    nip: effectiveNip,
    name: effectiveName,
    addr,
    contact,
    source: "idosell",
  });
}

function findClientIdInPayload(payload, nip) {
  const normalizedNip = normalizeNip(nip);
  const preferredCollections = [
    payload?.clientsResults,
    payload?.results,
    payload?.clients,
    payload?.items,
    payload?.data?.clientsResults,
    payload?.data?.results,
    payload?.data?.clients,
    payload?.data?.items,
  ].filter(Array.isArray);

  for (const collection of preferredCollections) {
    for (const item of collection) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      if (isOrderLikeCandidate(item)) continue;

      const maybeNip = normalizeNip(
        pickObjectValue(item, [
          "clientNip",
          "nip",
          "taxIdentificationNumber",
          "taxNumber",
          "taxId",
          "taxID",
          "vatNumber",
          "vatId",
          "companyTaxId",
        ])
      );

      if (maybeNip !== normalizedNip) continue;

      const maybeId = pickObjectValue(item, [
        "clientId",
        "client_id",
        "id",
        "clientAccountId",
        "clientAccount_id",
        "customerId",
      ]);
      if (maybeId) return maybeId;
    }
  }

  const visited = new Set();
  const queue = [payload];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (!Array.isArray(current)) {
      const maybeNip = normalizeNip(
        pickObjectValue(current, [
          "nip",
          "taxIdentificationNumber",
          "taxNumber",
          "taxId",
          "taxID",
          "vatNumber",
          "vatId",
        ])
      );

      if (maybeNip === normalizedNip) {
        const maybeId = pickObjectValue(current, [
          "clientId",
          "client_id",
          "id",
          "clientAccountId",
          "clientAccount_id",
          "customerId",
        ]);
        if (maybeId) return maybeId;
      }
    }

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    Object.values(current).forEach((value) => {
      if (value && typeof value === "object") queue.push(value);
    });
  }

  return "";
}

function findClientCandidateInPayload(payload, nip, options = {}) {
  const preferredCollections = [
    payload?.clientsResults,
    payload?.results,
    payload?.clients,
    payload?.items,
    payload?.data?.clientsResults,
    payload?.data?.results,
    payload?.data?.clients,
    payload?.data?.items,
  ].filter(Array.isArray);

  for (const collection of preferredCollections) {
    for (const item of collection) {
      const mapped = mapRemoteClientCandidate(item, nip, options);
      if (mapped) return mapped;
    }
  }

  const visited = new Set();
  const queue = [payload];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const mapped = mapRemoteClientCandidate(current, nip, options);
    if (mapped) return mapped;

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    Object.values(current).forEach((value) => {
      if (value && typeof value === "object") queue.push(value);
    });
  }

  return null;
}

function describePayloadShape(payload) {
  if (Array.isArray(payload)) return `array(${payload.length})`;
  if (!payload || typeof payload !== "object") return typeof payload;
  const keys = Object.keys(payload).slice(0, 8);
  const resultItem =
    Array.isArray(payload?.clientsResults) && payload.clientsResults.length && payload.clientsResults[0] && typeof payload.clientsResults[0] === "object"
      ? Object.keys(payload.clientsResults[0]).slice(0, 8)
      :
    Array.isArray(payload?.results) && payload.results.length && payload.results[0] && typeof payload.results[0] === "object"
      ? Object.keys(payload.results[0]).slice(0, 8)
      : [];
  const resultLabel = Array.isArray(payload?.clientsResults) ? "clientsResults[0]" : "results[0]";
  const resultHint = resultItem.length ? `; ${resultLabel}: ${resultItem.join(", ")}` : "";
  return keys.length ? `keys: ${keys.join(", ")}${resultHint}` : "object(without enumerable keys)";
}

function mapMfGovSubjectToClient(subject, nip) {
  if (!subject || typeof subject !== "object") return null;

  const normalizedNip = normalizeNip(subject?.nip || nip);
  if (!normalizedNip) return null;

  const representativeCompanyName = Array.isArray(subject?.representatives)
    ? String(subject.representatives.find((item) => String(item?.companyName || "").trim())?.companyName || "").trim()
    : "";
  const partnerCompanyName = Array.isArray(subject?.partners)
    ? String(subject.partners.find((item) => String(item?.companyName || "").trim())?.companyName || "").trim()
    : "";
  const name = String(
    subject?.companyName ||
      representativeCompanyName ||
      partnerCompanyName ||
      subject?.name ||
      ""
  ).trim();
  const addr = String(subject?.workingAddress || subject?.residenceAddress || "").trim();
  if (!name && !addr) return null;

  return normalizeClientRecord({
    nip: normalizedNip,
    name,
    addr,
    contact: "",
    source: "mf",
  });
}

async function fetchClientFromMfGovByNip(nip) {
  const normalizedNip = normalizeNip(nip);
  if (normalizedNip.length !== 10) return null;

  const attempts = [todayYMD()];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  attempts.push(`${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`);

  for (const date of Array.from(new Set(attempts))) {
    try {
      const { response, json } = await fetchJsonWithTimeout(buildMfGovSearchUrl(normalizedNip, date), {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) continue;

      const subject = json?.result?.subject || null;
      const client = mapMfGovSubjectToClient(subject, normalizedNip);
      if (client) return saveClientRecord({ ...client, source: "mf" });
    } catch {}
  }

  return null;
}

function saveClientRecord(input) {
  const next = normalizeClientRecord(input);
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
    source: input?.source || prev?.source || "local",
  };

  db.byNip = { ...(db.byNip || {}), [merged.nip]: merged };
  writeClientsDb(db);
  return merged;
}

async function fetchClientFromIdoSellByNip(nip) {
  const diagnostics = [];
  const note = (message) => diagnostics.push(String(message || ""));
  const normalizedNip = normalizeNip(nip);
  const nipVariants = buildNipSearchVariants(normalizedNip);
  if (normalizedNip.length !== 10) {
    note(`NIP "${normalizedNip}" nie ma 10 cyfr.`);
    return { client: null, diagnostics };
  }

  const idosell = getIdoSellIntegrationSettings();
  if (!idosell.baseUrl || !idosell.apiKey) {
    note("Brak skonfigurowanego Base URL albo klucza API IdoSell.");
  }

  if (idosell.baseUrl && idosell.apiKey) {
    note(`Start lookupu IdoSell dla NIP ${normalizedNip}.`);

  const clientsGetUrl = buildIdoSellAdminUrl(idosell.baseUrl, "clients/clients");
  const crmSearchUrl = buildIdoSellAdminUrl(idosell.baseUrl, "clients/crm/search");

  const directGetQueryCandidates = nipVariants.flatMap((nipVariant) => [
    { clientNip: nipVariant },
    { nip: nipVariant },
    { taxIdentificationNumber: nipVariant },
    { taxId: nipVariant },
    { vatNumber: nipVariant },
  ]);

  for (const query of directGetQueryCandidates) {
    try {
      const url = new URL(clientsGetUrl);
      Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
      const { response, json } = await callIdoSellJson(url.toString(), {
        apiKey: idosell.apiKey,
      });
      note(`GET clients/clients ${url.search} -> HTTP ${response.status}`);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          note("IdoSell odrzucił klucz API przy clients/clients.");
          break;
        }
        continue;
      }

      const directClient = findClientCandidateInPayload(json, normalizedNip);
      if (directClient) {
        note("Znaleziono klienta bezpośrednio przez clients/clients.");
        return {
          client: saveClientRecord({ ...directClient, source: "idosell" }),
          diagnostics,
        };
      }
    } catch (error) {
      note(`GET clients/clients zakończone błędem: ${String(error?.message || error)}`);
    }
  }

  const searchBodyCandidates = nipVariants.flatMap((nipVariant) => [
    { clientNip: nipVariant },
    { clientNip: nipVariant, resultsLimit: 1 },
    { clientNip: nipVariant, resultsLimit: 1, resultsPage: 1 },
    { searchParameters: { clientNip: nipVariant } },
    { searchParameters: { clientNip: nipVariant }, resultsLimit: 1, resultsPage: 1 },
  ]);

  for (const body of searchBodyCandidates) {
    try {
      const { response, json } = await callIdoSellJson(crmSearchUrl, {
        method: "POST",
        apiKey: idosell.apiKey,
        body,
      });
      note(`POST clients/crm/search ${JSON.stringify(body)} -> HTTP ${response.status}`);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          note("IdoSell odrzucił klucz API przy clients/crm/search.");
          break;
        }
        continue;
      }

      const matchedClient = findClientCandidateInPayload(json, normalizedNip);
      if (matchedClient) {
        note("Znaleziono klienta bezpośrednio w odpowiedzi clients/crm/search.");
        return {
          client: saveClientRecord({ ...matchedClient, source: "idosell" }),
          diagnostics,
        };
      }

      const clientId = findClientIdInPayload(json, normalizedNip);
      if (!clientId) {
        note(`clients/crm/search nie zwrócił klienta ani clientId dla tego NIP (${describePayloadShape(json)}).`);
        continue;
      }

      note(`clients/crm/search zwrócił clientId=${clientId}.`);

      const detailsQueryCandidates = [
        { clientId },
        { client_id: clientId },
        { id: clientId },
      ];

      for (const query of detailsQueryCandidates) {
        try {
          const url = new URL(clientsGetUrl);
          Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
          const details = await callIdoSellJson(url.toString(), {
            apiKey: idosell.apiKey,
          });
          note(`GET clients/clients po ID ${url.search} -> HTTP ${details.response.status}`);

          if (!details.response.ok) continue;

          const clientFromDetails = findClientCandidateInPayload(details.json, normalizedNip, {
            allowFallbackNip: true,
          });
          if (clientFromDetails) {
            note("Znaleziono klienta po dociągnięciu szczegółów clients/clients.");
            return {
              client: saveClientRecord({ ...clientFromDetails, source: "idosell" }),
              diagnostics,
            };
          }

          note(`clients/clients po ID nie dał pełnego mapowania (${describePayloadShape(details.json)}).`);
        } catch (error) {
          note(`GET clients/clients po ID zakończone błędem: ${String(error?.message || error)}`);
        }
      }
    } catch (error) {
      note(`POST clients/crm/search zakończone błędem: ${String(error?.message || error)}`);
    }
  }

  const apiContext = await loadIdoSellOpenApi(idosell.baseUrl);
  if (!apiContext?.spec) {
    note("Nie udało się pobrać OpenAPI IdoSell do fallbacku.");
    note("Pomijam fallback OpenAPI i przechodzę do bazy MF.");
  }

  if (apiContext?.spec) {
  const requests = pickIdoSellClientLookupRequests(apiContext.spec, apiContext.baseUrl, normalizedNip);
  if (!requests.length) {
    note("Fallback OpenAPI nie znalazł sensownych endpointów wyszukiwania klienta.");
    note("Brak sensownych endpointów w OpenAPI, przechodzę do bazy MF.");
  }

  for (const request of requests) {
    try {
      const { response, json } = await fetchJsonWithTimeout(request.url, {
        headers: {
          Accept: "application/json",
          "X-API-KEY": idosell.apiKey,
        },
      });
      note(`Fallback ${request.path} -> HTTP ${response.status}`);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          note("IdoSell odrzucił klucz API przy fallbacku OpenAPI.");
          break;
        }
        continue;
      }

      const client = findClientCandidateInPayload(json, normalizedNip);
      if (!client) continue;

      note(`Fallback ${request.path} zwrócił klienta.`);
      return {
        client: saveClientRecord({ ...client, source: "idosell" }),
        diagnostics,
      };
    } catch (error) {
      note(`Fallback ${request.path} zakończony błędem: ${String(error?.message || error)}`);
    }
  }
  }
  }

  const mfClient = await fetchClientFromMfGovByNip(normalizedNip);
  if (mfClient) {
    note("Znaleziono klienta w wykazie podatników VAT MF.");
    return {
      client: mfClient,
      diagnostics,
    };
  }

  note("Lookup IdoSell zakończył się bez dopasowania klienta.");
  return { client: null, diagnostics };
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

function buildNipSearchVariants(nip) {
  const normalized = normalizeNip(nip);
  if (!normalized) return [];

  const variants = [normalized];
  if (normalized.length === 10) {
    variants.push(`${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6, 8)}-${normalized.slice(8, 10)}`);
  }

  return Array.from(new Set(variants));
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

function canonicalizeOfferItemForVersion(item) {
  const warranty = item?.warranty && typeof item.warranty === "object" ? item.warranty : {};
  return {
    desc: String(item?.desc || "").trim(),
    net: Number(item?.net ?? 0),
    discount: Number(item?.discount ?? 0),
    qty: Math.max(1, parseInt(item?.qty ?? 1, 10) || 1),
    warranty: {
      months: Math.max(0, parseInt(warranty?.months ?? 0, 10) || 0),
      nbd: !!warranty?.nbd,
      lifetime: !!warranty?.lifetime,
    },
  };
}

function didOfferItemsVersionChange(previousItems, nextItems) {
  const prev = Array.isArray(previousItems) ? previousItems.map(canonicalizeOfferItemForVersion) : [];
  const next = Array.isArray(nextItems) ? nextItems.map(canonicalizeOfferItemForVersion) : [];
  return JSON.stringify(prev) !== JSON.stringify(next);
}

function maybeSaveClientFromOffer(payload) {
  const fields = payload?.fields || {};
  return saveClientRecord({
    nip: fields.custNip,
    name: fields.custName,
    addr: fields.custAddr,
    contact: fields.custContact,
    source: "local",
  });
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

function deleteClientByNip(nip) {
  const normalized = normalizeNip(nip);
  if (!normalized) return { ok: false, deleted: false };

  const db = readClientsDb();
  if (!db?.byNip?.[normalized]) return { ok: true, deleted: false };

  const next = { ...(db.byNip || {}) };
  delete next[normalized];
  db.byNip = next;
  writeClientsDb(db);
  return { ok: true, deleted: true };
}

function shouldRefreshCachedIdoSellClient(client) {
  if (!client || client.source !== "idosell") return false;
  return !String(client.contact || "").trim();
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
  if (!m.lastItemsEditedAt) m.lastItemsEditedAt = m.updatedAt || m.createdAt || new Date().toISOString();

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
  return mergeUserSettings(readJsonSafe(p, defaultUserSettings()), {});
});

ipcMain.handle("settings:set", async (_evt, patch) => {
  const p = getSettingsPath();
  const current = readJsonSafe(p, defaultUserSettings());

  const next = mergeUserSettings(current, patch);
    // ✅ merge docDefaults (jeśli renderer zacznie to zapisywać)

  writeJsonSafe(p, next);
  return next;
});

ipcMain.handle("settings:resetCounter", async () => {
  const p = getSettingsPath();
  const current = readJsonSafe(p, defaultUserSettings());

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
  return defaultUserSettings();
});

ipcMain.handle("settings:testIdoSellConnection", async (_evt, payload) => {
  return await testIdoSellConnection(payload || {});
});

// ===== IPC: clients =====
ipcMain.handle("clients:suggest", async (_evt, query) => {
  return searchClients(query);
});

ipcMain.handle("clients:getByNip", async (_evt, nip) => {
  const normalized = normalizeNip(nip);
  if (!normalized) return null;

  const db = readClientsDb();
  const localClient = db?.byNip?.[normalized] || null;
  if (localClient && !shouldRefreshCachedIdoSellClient(localClient)) return localClient;

  const lookup = await fetchClientFromIdoSellByNip(normalized);
  return lookup?.client || localClient || null;
});

ipcMain.handle("clients:lookupByNip", async (_evt, nip) => {
  const normalized = normalizeNip(nip);
  if (!normalized) return { client: null, diagnostics: ["Brak NIP do wyszukania."] };

  const db = readClientsDb();
  const localClient = db?.byNip?.[normalized] || null;
  if (localClient && !shouldRefreshCachedIdoSellClient(localClient)) {
    return {
      client: localClient,
      diagnostics: ["Klient znaleziony w lokalnej bazie aplikacji."],
    };
  }

  const lookup = await fetchClientFromIdoSellByNip(normalized);
  if (lookup?.client) return lookup;
  if (localClient) {
    return {
      client: localClient,
      diagnostics: [
        "Klient znaleziony w lokalnej bazie aplikacji.",
        "Rekord lokalny nie miał pełnego kontaktu, ale odświeżenie z IdoSell nie zwróciło lepszych danych.",
      ],
    };
  }

  return lookup;
});

ipcMain.handle("clients:deleteByNip", async (_evt, nip) => {
  return deleteClientByNip(nip);
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
    ...defaultUserSettings(),
    initials: "XX",
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
        lastItemsEditedAt: new Date().toISOString(),

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
  const itemsChanged = didOfferItemsVersionChange(existing?.items, payload?.items);
  const nowIso = new Date().toISOString();

  const next = {
    ...(existing || {}), // zachowaj ewentualne brakujące rzeczy z pliku
    ...payload, // renderer ma pierwszeństwo dla fields/items/totals
    id,
    meta: normalizeOfferMeta(
      {
        ...(existingMeta || {}),
        ...(payload.meta || {}),
        updatedAt: nowIso,
        lastItemsEditedAt: itemsChanged
          ? nowIso
          : (payload?.meta?.lastItemsEditedAt || existingMeta?.lastItemsEditedAt || existingMeta?.updatedAt || existingMeta?.createdAt || nowIso),
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
        lastItemsEditedAt: new Date().toISOString(),
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
