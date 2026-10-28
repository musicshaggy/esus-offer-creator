const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
require(path.join(root, 'main.js'));
const data = path.join(__dirname, 'desktop-data', 'close-test');
fs.mkdirSync(data, { recursive: true });
app.setPath('userData', data);
fs.writeFileSync(path.join(data, 'user-settings.json'), JSON.stringify({
  initials: 'QA',
  profile: { fullName: 'Close Test', email: 'test@example.org', phone: '030123456', initials: 'QA' },
  modulePrefs: { visibility: { pmReport: true, iaiOrders: true, invoicesDe: true } },
}));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const keepAlive = new BrowserWindow({ show: false });
  try {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://api.nbp.pl/*'] }, (_details, callback) => callback({ cancel: true }));
    await wait(1400);
    const dirty = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/renderer/index.html'));
    assert.ok(dirty);
    await dirty.webContents.executeJavaScript(`document.querySelector('#btnOffersInvoices').click()`);
    await wait(1000);
    await dirty.webContents.executeJavaScript(`const input=document.querySelector('[data-field="number"]');input.value='UNSAVED';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#btnWinClose').click()`);
    await wait(250);
    assert.equal(await dirty.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog').hidden`), false);
    assert.equal(dirty.isDestroyed(), false, 'Continue editing keeps the app open');
    await dirty.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog__cancel').click()`);
    await wait(100);
    assert.equal(await dirty.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog').hidden`), true);
    await dirty.webContents.executeJavaScript(`document.querySelector('#btnWinClose').click()`);
    await wait(100);
    await dirty.webContents.executeJavaScript(`document.querySelector('.invoiceAppDialog__confirm').click()`);
    await wait(300);
    assert.ok(dirty.isDestroyed(), 'Discard closes the app');
    console.log('PASS: app-styled dirty dialog preserves or closes the window');
    keepAlive.destroy();
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
