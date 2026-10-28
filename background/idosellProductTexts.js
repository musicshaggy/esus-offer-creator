"use strict";
const languages = {de:["ger","deu","de"],pl:["pol","pl"],en:["eng","en"],hu:["hun","hu"]};
function createProductTextLookup({settings, url, request}) {
  const cache = new Map();
  return async ({productIds = [], language = "pl"} = {}) => {
    if (!languages[language]) throw new Error("Unsupported document language");
    const ids = [...new Set(productIds.map(String).filter(id => /^\d+$/.test(id)))];
    if (ids.length > 100) throw new Error("At most 100 products per request");
    const config = settings();
    const now = Date.now(), texts = {};
    const missing = ids.filter(id => {
      const entry = cache.get(`${config.baseUrl}:${language}:${id}`);
      if (entry && now-entry.time < 300000) { texts[id]=entry.text; return false; }
      return true;
    });
    if (missing.length) {
      if (!config.enabled || !config.apiKey || !config.baseUrl) throw new Error("IdoSell integration is not configured");
      const {response,json} = await request(url(config.baseUrl,"products/products/search"), {
        method:"POST", apiKey:config.apiKey, timeoutMs:25000,
        body:{params:{productIndexes:missing.map(productIndex=>({productIndex})),
          productSearchingLangId:languages[language][0], returnElements:["lang_data"], resultsLimit:100}}
      });
      if (!response.ok) throw new Error(`IdoSell product texts: HTTP ${response.status}`);
      for (const product of Array.isArray(json?.results) ? json.results : []) {
        const id=String(product.productId);
        if (!missing.includes(id)) continue;
        const entry=(product.productDescriptionsLangData || []).find(item=>languages[language].includes(String(item.langId).toLowerCase()));
        const text=String(entry?.productName || "").trim();
        if (text) { texts[id]=text; cache.set(`${config.baseUrl}:${language}:${id}`,{time:now,text}); }
      }
    }
    return {texts, missing:ids.filter(id=>!texts[id])};
  };
}
module.exports={createProductTextLookup};
