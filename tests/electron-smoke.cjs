const { app, BrowserWindow, dialog, session } = require("electron");
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
app.on("browser-window-created", (_event, window) => {
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) console.error("Renderer:", message);
  });
});
if (process.argv.includes("--package-test")) {
  const resources = path.join(__dirname, "../dist/win-unpacked/resources");
  Object.defineProperty(app, "isPackaged", { value: true });
  Object.defineProperty(process, "resourcesPath", { value: resources });
  const packagedApp = path.join(resources, fs.existsSync(path.join(resources, "app.asar")) ? "app.asar" : "app");
  require(
    path.join(packagedApp, "node_modules/electron-updater"),
  ).autoUpdater.checkForUpdates = async () => null;
  require(path.join(packagedApp, "main.js"));
} else require("../main.js");
const testData = path.join(__dirname, "desktop-data");
fs.mkdirSync(testData, { recursive: true });
app.setPath("userData", testData);
fs.writeFileSync(
  path.join(testData, "user-settings.json"),
  JSON.stringify({
    initials: "QA",
    profile: {
      fullName: "Integration Test",
      email: "test@example.org",
      phone: "030123456",
      initials: "QA",
    },
  }),
);
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [process.env.ESUS_TEST_PDF || path.join(app.getPath("downloads"), "FV_8_DE_2610.pdf")],
});
dialog.showSaveDialog = async (_parent, options) => ({
  canceled: false,
  filePath: path.join(testData, options.defaultPath),
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  try {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["https://api.nbp.pl/*"] },
      (_details, callback) => callback({ cancel: true }),
    );
    await wait(1800);
    const win = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().endsWith("/renderer/index.html"),
    );
    assert.ok(win, "Main window loaded");
    await win.webContents.executeJavaScript(
      `document.querySelector('#btnOffersNew').click()`,
    );
    await wait(400);
    await win.webContents.executeJavaScript(
      `const input=document.querySelector('#custName');input.value='Navigation Test';input.dispatchEvent(new Event('input',{bubbles:true}))`,
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('#btnOffers').click()`,
    );
    await wait(450);
    const offerBeforeInvoices = await win.webContents.executeJavaScript(
      `(async()=>window.esusAPI.offersOpen(await window.esusAPI.offersGetLast()))()`,
    );
    assert.ok(
      !["invoiceTarget", "invoiceLanguage", "invoiceLineSelect"].some(key => Object.hasOwn(offerBeforeInvoices.fields, key)),
      "Invoice selectors must not leak into saved offer fields",
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('#btnOffersInvoices').hidden`,
      ),
      true,
    );
    await win.webContents.executeJavaScript(`(async()=>{const settings=await window.esusAPI.settingsSet({modulePrefs:{visibility:{pmReport:true,iaiOrders:true,invoicesDe:true}}});window.dispatchEvent(new CustomEvent('esus:settingsChanged',{detail:{settings}}));})()`);
    await wait(150);
    assert.equal(
      await win.webContents.executeJavaScript(`document.querySelector('#btnOffersInvoices').hidden`),
      false,
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('#btnOffersInvoices').click()`,
    );
    for (let i = 0; i < 50; i++) {
      if (await win.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-field="seller.endpoint"]')?.value)`,
      )) break;
      await wait(200);
    }
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="seller.endpoint"]').value`,
      ),
      "verkauf@esus-it.de",
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-action="import"]').click()`,
    );
    for (let i = 0; i < 30; i++) {
      await wait(300);
      if (
        await win.webContents.executeJavaScript(
          `document.querySelector('#invoiceStatus').textContent.includes('Faktura została wczytana')`,
        )
      )
        break;
    }
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('#invoicePreviewImage').hidden`,
      ),
      false,
    );
    assert.ok(
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="number"]').value.length>0`,
      ),
    );
    for (let i = 0; i < 50; i++) {
      if (await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="buyer_reference"]').getAttribute('aria-required') === 'true'`,
      )) break;
      await wait(200);
    }
    const polishLayout = await win.webContents.executeJavaScript(`(() => {
      const source = document.querySelector('[data-field="payment_text"]');
      const method = document.querySelector('[data-field="payment_code"]');
      const controls = [...document.querySelectorAll('#invoiceWorkspace [data-field]')];
      return {
        language: document.querySelector('#invoiceWorkspace').lang,
        tabs: [...document.querySelectorAll('.invoice-tabs button')].map(button => button.textContent),
        fieldCount: controls.length,
        uniqueCount: new Set(controls.map(input => input.dataset.field)).size,
        adjacentPayment: source.closest('label').nextElementSibling === method.closest('label'),
        fullWidthPayment: source.closest('label').classList.contains('invoice-field-wide') && method.closest('label').classList.contains('invoice-field-wide'),
        required: document.querySelector('[data-field="buyer_reference"]').getAttribute('aria-required'),
        requiredLabel: document.querySelector('[data-requirement="buyer_reference"]').textContent,
        optionalLabel: document.querySelector('[data-requirement="purchase_order"]').textContent,
        sourceLabel: document.querySelector('[data-requirement="payment_text"]').textContent,
        taxValue: document.querySelector('[data-field="tax_case"]').value,
        taxLabel: document.querySelector('[data-field="tax_case"]').selectedOptions[0].textContent,
        notes: document.querySelector('#invoiceReport').textContent,
        originalPayment: source.value,
      };
    })()`);
    assert.equal(polishLayout.language, "pl");
    assert.deepEqual(polishLayout.tabs, [
      "Faktura",
      "Sprzedawca",
      "Nabywca",
      "VAT / uwagi",
      "Pozycje",
      "Walidacja",
    ]);
    assert.equal(polishLayout.fieldCount, 56);
    assert.equal(polishLayout.uniqueCount, 56);
    assert.ok(polishLayout.adjacentPayment && polishLayout.fullWidthPayment);
    assert.equal(polishLayout.required, "true");
    assert.equal(polishLayout.requiredLabel, "Wymagane");
    assert.equal(polishLayout.optionalLabel, "Opcjonalne");
    assert.equal(polishLayout.sourceLabel, "Dane z PDF");
    assert.equal(polishLayout.taxValue, "19 % Deutschland");
    assert.equal(polishLayout.taxLabel, "VAT 19% (Niemcy)");
    assert.ok(polishLayout.originalPayment.startsWith("Handelskredit"));
    assert.ok(!/Käufer|Rechnungsdatum|Zahlungsart/.test(polishLayout.notes));
    const emptyFields = await win.webContents.executeJavaScript(`({
      reference:document.querySelector('[data-field="buyer_reference"]').getAttribute('aria-invalid'),
      method:document.querySelector('[data-field="payment_code"]').getAttribute('aria-invalid'),
      optional:document.querySelector('[data-field="purchase_order"]').getAttribute('aria-invalid'),
      zero:document.querySelector('[data-field="paid"]').getAttribute('aria-invalid'),
      missingCount:document.querySelectorAll('#invoiceMissingFields button').length,
      notesCount:document.querySelectorAll('.invoice-import-notes li').length
    })`);
    assert.equal(emptyFields.reference, "true");
    assert.equal(emptyFields.method, "true");
    assert.equal(emptyFields.optional, null);
    assert.equal(emptyFields.zero, null);
    assert.equal(emptyFields.missingCount, 2);
    assert.ok(emptyFields.notesCount > 0);
    await win.webContents.executeJavaScript(
      `document.querySelector('#invoiceTab-report').click();document.querySelector('#invoiceWorkspace').scrollTop=0`,
    );
    await wait(150);
    fs.writeFileSync(
      path.join(__dirname, "invoice-before-validation-ui.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('#invoiceMissingFields button')].find(button=>button.textContent.includes('Referencja nabywcy')).click()`,
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.activeElement.dataset.field`,
      ),
      "buyer_reference",
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-action="check"]').click()`,
    );
    for (let i = 0; i < 30; i++) {
      await wait(200);
      if (
        await win.webContents.executeJavaScript(
          `!document.querySelector('[data-action="check"]').disabled`,
        )
      )
        break;
    }
    const missingReport = await win.webContents.executeJavaScript(
      `document.querySelector('#invoiceReport').textContent`,
    );
    assert.ok(missingReport.includes("Brak: Referencja nabywcy"));
    assert.ok(missingReport.includes("Metoda płatności"));
    assert.ok(!missingReport.includes("Fehlt:"));
    await win.webContents.executeJavaScript(
      `{ document.querySelector('#invoiceTab-general').click();const target=document.querySelector('[data-invoice-control=invoiceTarget]');target.value='ZUGFeRD EN16931';target.dispatchEvent(new Event('change')); }`,
    );
    for (let i = 0; i < 50; i++) {
      if (await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="buyer_reference"]').getAttribute('aria-required') === 'false'`,
      )) break;
      await wait(200);
    }
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="buyer_reference"]').getAttribute('aria-required')`,
      ),
      "false",
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="buyer_reference"]').getAttribute('aria-invalid')`,
      ),
      null,
    );
    await win.webContents.executeJavaScript(
      `{ const target=document.querySelector('[data-invoice-control=invoiceTarget]');target.value='XRechnung';target.dispatchEvent(new Event('change')); }`,
    );
    for (let i = 0; i < 50; i++) {
      if (await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="buyer_reference"]').getAttribute('aria-required') === 'true'`,
      )) break;
      await wait(200);
    }
    await win.webContents.executeJavaScript(
      `document.querySelector('#appToast')?.remove()`,
    );
    await wait(150);
    fs.writeFileSync(
      path.join(__dirname, "invoice-ui.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      `const field=document.querySelector('[data-field="payment_text"]');const workspace=document.querySelector('#invoiceWorkspace');workspace.scrollTop += field.getBoundingClientRect().top - workspace.getBoundingClientRect().top - 75;`,
    );
    await wait(150);
    fs.writeFileSync(
      path.join(__dirname, "invoice-payment-ui.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('#invoiceWorkspace').scrollTop=0`,
    );
    const before = await win.webContents.executeJavaScript(
      `document.querySelector('[data-field="number"]').value`,
    );
    await win.webContents.executeJavaScript(`document.querySelector('#invoiceBack').click()`);
    await wait(100);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog').hidden`), false);
    await win.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog__cancel').click()`);
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="number"]').value`,
      ),
      before,
    );
    await win.webContents.executeJavaScript(`document.querySelector('#invoiceBack').click()`);
    await wait(100);
    await win.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog__confirm').click()`);
    await wait(100);
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('#invoiceWorkspace').hidden`,
      ),
      true,
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('#custName').value`,
      ),
      "Navigation Test",
    );
    await wait(150);
    fs.writeFileSync(
      path.join(__dirname, "offers-ui.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('#btnOffersInvoices').click();for(const [field,text] of [['buyer_reference','TEST'],['payment_code','58']]){const input=document.querySelector('[data-field="'+field+'"]');input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('[data-action="export"]').click()`,
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="buyer_reference"]').getAttribute('aria-invalid')`,
      ),
      null,
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-field="payment_code"]').getAttribute('aria-invalid')`,
      ),
      null,
    );
    for (let i = 0; i < 100; i++) {
      await wait(200);
      if (
        await win.webContents.executeJavaScript(
          `!document.querySelector('[data-action="export"]').disabled`,
        )
      )
        break;
    }
    console.log("Export status:", await win.webContents.executeJavaScript(`document.querySelector('#invoiceStatus').textContent`));
    assert.ok(
      await win.webContents.executeJavaScript(
        `document.querySelector('#invoiceStatus').textContent.includes('Zapisano eksport')`,
      ),
      "UI XRechnung export passed",
    );
    await win.webContents.executeJavaScript(
      `const target=document.querySelector('[data-invoice-control=invoiceTarget]');target.value='ZUGFeRD EN16931';target.dispatchEvent(new Event('change'));document.querySelector('[data-invoice-control=invoiceLanguage]').value='en';document.querySelector('[data-action="export"]').click()`,
    );
    for (let i = 0; i < 100; i++) {
      await wait(200);
      if (
        await win.webContents.executeJavaScript(
          `!document.querySelector('[data-action="export"]').disabled`,
        )
      )
        break;
    }
    assert.ok(
      await win.webContents.executeJavaScript(
        `document.querySelector('#invoiceStatus').textContent.includes('Zapisano eksport')`,
      ),
      "UI English ZUGFeRD export passed",
    );
    console.log(
      "PASS: Polish UI, grouped fields, payment order, dynamic required markers, localized preflight, source values preserved, navigation, XRechnung and English ZUGFeRD exports",
    );
    await wait(800);
    const offerAfterInvoices = await win.webContents.executeJavaScript(
      `window.esusAPI.offersOpen(${JSON.stringify(offerBeforeInvoices.id)})`,
    );
    assert.deepEqual(
      offerAfterInvoices,
      offerBeforeInvoices,
      "Invoice editing and exports must leave saved offer data unchanged",
    );
    const duplicated = await win.webContents.executeJavaScript(
      `window.esusAPI.offersDuplicate(${JSON.stringify(offerBeforeInvoices.id)})`,
    );
    assert.notEqual(duplicated.id, offerBeforeInvoices.id);
    assert.notEqual(duplicated.meta.offerNo, offerBeforeInvoices.meta.offerNo);
    assert.deepEqual(duplicated.items, offerBeforeInvoices.items);
    assert.equal(
      duplicated.fields.custName,
      offerBeforeInvoices.fields.custName,
    );
    await win.webContents.executeJavaScript(
      `window.esusAPI.offersDelete(${JSON.stringify(duplicated.id)})`,
    );
    const remaining = await win.webContents.executeJavaScript(
      `window.esusAPI.offersList()`,
    );
    assert.ok(remaining.some((row) => row.id === offerBeforeInvoices.id));
    assert.ok(!remaining.some((row) => row.id === duplicated.id));
    console.log(
      "PASS: original offer save/open/duplicate/delete; invoice controls and edits do not affect offer persistence",
    );
    const offerPdfs = await win.webContents.executeJavaScript(String.raw`(async()=>{
      const {store}=await import('./app/state/store.js');
      const {generatePdf}=await import('./app/export/pdf.js');
      const ids=['offerLang','offerCurrency','offerVat','shippingAmount','shippingModeGross','custName','custAddr','custNip','estimateDays','pdfTemplate'];
      const fields=ids.map(id=>{const el=document.getElementById(id);return {el,value:el.value,checked:el.checked};});
      const previousItems=store.items, previousSave=window.jspdf.jsPDF.API.save;
      const files=[];
      window.jspdf.jsPDF.API.save=function(){files.push(this.output('datauristring').split(',')[1]);};
      try{
        store.items=[{desc:'Versand-Regression: Artikel',qty:2,net:100,discount:0}];
        document.getElementById('offerCurrency').value='EUR';
        document.getElementById('offerVat').value='19';
        document.getElementById('custName').value='Fensterkunde GmbH';
        document.getElementById('custAddr').value='Teststraße 1\n12345 Berlin';
        document.getElementById('custNip').value='DE123456789';
        document.getElementById('estimateDays').value='2';
        const cases=[['de','0',false],['de','10',false],['de','11.90',true],['pl','10',false],['en','10',false],['hu','10',false],['pl','10',false,'modern'],['en','10',false,'modern'],['hu','10',false,'modern']];
        for(const [lang,amount,gross,template] of cases){
          document.getElementById('pdfTemplate').value=template || 'classic';
          document.getElementById('offerLang').value=lang;
          document.getElementById('shippingAmount').value=amount;
          document.getElementById('shippingModeGross').checked=gross;
          await generatePdf();
        }
        return files;
      }finally{
        store.items=previousItems;window.jspdf.jsPDF.API.save=previousSave;
        for(const {el,value,checked} of fields){el.value=value;el.checked=checked;}
      }
    })()`);
    assert.equal(offerPdfs.length,9);
    const {execFileSync}=require('node:child_process');
    const python=app.isPackaged ? path.join(process.resourcesPath,'python/python.exe') : path.join(__dirname,'../runtime/python/python.exe');
    const texts=offerPdfs.map(pdf=>execFileSync(python,['-I','-X','utf8','-c',"import sys;from io import BytesIO;from pypdf import PdfReader;print('\\n'.join(p.extract_text() for p in PdfReader(BytesIO(sys.stdin.buffer.read())).pages))"],{input:Buffer.from(pdf,'base64'),encoding:'utf8'}));
    assert.ok(!texts[0].includes('Versandkosten'));
    assert.match(texts[0],/238[,.]00/);
    for(const text of texts.slice(1,3)) assert.match(text,/249[,.]90/,'German totals include shipping');
    for(const text of texts.slice(3,6)) assert.match(text,/238[,.]00/,'Foreign classic output preserves upstream item totals');
    for(const text of texts.slice(6)) assert.match(text,/249[,.]90/,'Foreign modern output preserves upstream shipping total');
    assert.ok(texts[1].includes('Versandkosten') && texts[2].includes('Versandkosten'));
    assert.ok(texts[1].includes('USt-IdNr.') && !texts[1].includes('NIP:'));
    assert.ok(texts[1].includes('Waldsiedlung Fichtendamm 4'));
    assert.ok(texts[1].includes('Voraussichtliche Lieferzeit: 2 Werktage.'));
    const navigation = await win.webContents.executeJavaScript(`(() => {
      const lang=document.getElementById('offerLang'), template=document.getElementById('pdfTemplate');
      const previous=lang.value;
      lang.value='de';lang.dispatchEvent(new Event('change',{bubbles:true}));
      const germanHidden=getComputedStyle(template.parentElement).display==='none';
      lang.value='pl';lang.dispatchEvent(new Event('change',{bubbles:true}));
      const polishVisible=getComputedStyle(template.parentElement).display!=='none';
      lang.value=previous;lang.dispatchEvent(new Event('change',{bubbles:true}));
      const entry=document.getElementById('btnOffersInvoices');entry.click();
      const selected=entry.getAttribute('aria-current')==='page' && entry.closest('.erp-nav-items')!==null;
      document.getElementById('btnOffers').click();
      const closed=document.getElementById('invoiceWorkspace').hidden;
      return {germanHidden,polishVisible,selected,closed};
    })()`);
    assert.deepEqual(navigation,{germanHidden:true,polishVisible:true,selected:true,closed:true});
    console.log('PASS: German PDF totals and layout; upstream classic/modern PL/EN/HU PDFs; language-specific controls and invoice sidebar navigation');
    const orderDraft={orderId:"customer_login",orderSerialNumber:54321,
      clientResult:{clientBillingAddress:{clientFirm:"API Kunde",clientStreet:"Teststraße 1",clientZipCode:"10317",clientCity:"Berlin",clientCountryId:"DE",clientEmail:"kunde@example.org"}},
      productsResults:[{productName:"Original",documentNames:{de:"Deutscher Artikel"},productQuantity:"3",productOrderPriceNet:"100",productOrderPrice:"119",productVat:"19"}],
      orderDetails:{payments:{orderCurrency:{currencyId:"EUR",orderProductsCost:"357",orderDeliveryCost:0,orderPayformCost:0,orderInsuranceCost:0}}}};
    await win.webContents.executeJavaScript(`document.querySelector('#btnOffersInvoices').click();{const field=document.querySelector('[data-field="number"]');field.value='PRESERVE-ME';field.dispatchEvent(new Event('input',{bubbles:true}));}void 0`);
    const transfer = async () => win.webContents.executeJavaScript(`new Promise(resolve=>window.dispatchEvent(new CustomEvent('esus:invoice-from-order',{detail:{order:${JSON.stringify(orderDraft)},language:'de',purchaseOrder:'PO-42',resolve}})))`);
    const canceledTransfer = transfer();
    await wait(100);
    await win.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog__cancel').click()`);
    assert.equal(await canceledTransfer,false);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-field="number"]').value`),'PRESERVE-ME');
    const acceptedTransfer = transfer();
    await wait(100);
    await win.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog__confirm').click()`);
    assert.equal(await acceptedTransfer,true);
    const transferred=await win.webContents.executeJavaScript(`({number:document.querySelector('[data-field="number"]').value,source:document.querySelector('[data-field="source_order"]').value,net:document.querySelector('[data-field="net_total"]').value,po:document.querySelector('[data-field="purchase_order"]').value,pdfImport:!!document.querySelector('[data-action="import"]'),imageHidden:document.querySelector('#invoicePreviewImage').hidden,open:!document.querySelector('#invoiceWorkspace').hidden})`);
    assert.deepEqual(transferred,{number:'',source:'54321',net:'300.00',po:'PO-42',pdfImport:true,imageHidden:true,open:true});
    fs.writeFileSync(path.join(__dirname,'invoice-order-ui.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS: IdoSell draft handoff, dirty cancel/confirm, decimal amounts, shared editor and preserved PDF importer');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
