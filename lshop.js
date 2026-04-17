const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const LSHOP_URL = 'https://shop.l-shop-team.de';

async function addItemsToLShopCart(mappedItems) {
  var validItems = mappedItems.filter(function(item) { return !item.error; });
  if (validItems.length === 0) return { success: false, error: 'Keine Artikel' };

  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  var context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  var page = await context.newPage();
  var results = [];

  try {
    await login(page);
    for (var i = 0; i < validItems.length; i++) {
      var item = validItems[i];
      console.log('Fuege hinzu: ' + item.lshop_artikel + ' | ' + item.farbe_lshop + ' | ' + item.groesse + ' | ' + item.quantity + 'x');
      try {
        await addSingleItem(page, item);
        results.push({ status: 'added', title: item.shopify_title });
        console.log('Hinzugefuegt: ' + item.shopify_title);
      } catch (err) {
        results.push({ status: 'error', title: item.shopify_title, error: err.message });
        console.log('Fehler: ' + err.message);
      }
      await page.waitForTimeout(1500);
    }
  } finally {
    await browser.close();
  }

  var success = results.some(function(r) { return r.status === 'added'; });
  return { success: success, results: results };
}

async function login(page) {
  console.log('Oeffne L-Shop...');
  await page.goto(LSHOP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('Start URL: ' + page.url());

  try {
    await page.locator('button:has-text("Akzeptieren"), #onetrust-accept-btn-handler').click({ timeout: 4000 });
    await page.waitForTimeout(1000);
  } catch (e) {}

  console.log('Gehe zu Login...');
  await page.goto(LSHOP_URL + '/index.php?cl=user', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('Login URL: ' + page.url());

  await page.evaluate(function(creds) {
    var allInputs = Array.from(document.querySelectorAll('input'));
    allInputs.forEach(function(inp) {
      var isEmail = inp.type === 'email' || inp.name === 'lgn_usr' || inp.name === 'email' || inp.id === 'loginUser' || inp.id === 'email' || (inp.placeholder && (inp.placeholder.includes('Mail') || inp.placeholder.includes('Kunden')));
      var isPass = inp.type === 'password' || inp.name === 'lgn_pwd';
      if (isEmail) {
        inp.value = creds.email;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (isPass) {
        inp.value = creds.password;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, { email: process.env.LSHOP_EMAIL, password: process.env.LSHOP_PASSWORD });

  await page.waitForTimeout(500);
  await page.evaluate(function() {
    var btns = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"]'));
    if (btns.length > 0) btns[0].click();
  });

  await page.waitForTimeout(5000);
  console.log('Nach Login: ' + page.url());
}

async function addSingleItem(page, item) {
  var searchUrl = LSHOP_URL + '/index.php?cl=search&searchparam=' + encodeURIComponent(item.lshop_artikel);
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  console.log('Suche URL: ' + page.url());

  try {
    await page.locator('.productTitle a, h3 a, .title a, li.productItem a').first().click({ timeout: 6000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('Kein Produktlink');
  }

  try {
    await page.locator('label:has-text("' + item.farbe_lshop + '"), option:has-text("' + item.farbe_lshop + '")').first().click({ timeout: 4000 });
    await page.waitForTimeout(500);
  } catch (e) { console.log('Farbe nicht klickbar: ' + item.farbe_lshop); }

  try {
    await page.locator('label:has-text("' + item.groesse + '"), option:has-text("' + item.groesse + '")').first().click({ timeout: 4000 });
    await page.waitForTimeout(500);
  } catch (e) { console.log('Groesse nicht klickbar: ' + item.groesse); }

  try {
    await page.locator('input[type="number"], input[name="am"]').first().fill(String(item.quantity), { timeout: 3000 });
  } catch (e) {}

  await page.locator('button:has-text("In den Warenkorb"), button:has-text("Warenkorb"), button[name="wr"]').first().click({ timeout: 8000 });
  await page.waitForTimeout(2000);
}

module.exports = { addItemsToLShopCart };
