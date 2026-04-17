const { chromium } = require('playwright');

const LSHOP_URL = 'https://shop.l-shop-team.de';

async function addItemsToLShopCart(mappedItems) {
  var validItems = mappedItems.filter(function(item) { return !item.error; });
  if (validItems.length === 0) return { success: false, error: 'Keine Artikel' };

  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  var context = await browser.newContext();
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
        console.log('Fehler bei ' + item.shopify_title + ': ' + err.message);
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
  await page.goto(LSHOP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  try {
    await page.locator('button:has-text("Akzeptieren"), #onetrust-accept-btn-handler').click({ timeout: 4000 });
    await page.waitForTimeout(1000);
  } catch (e) {}

  console.log('Klicke auf Anmelden Button...');
  await page.locator('a:has-text("Anmelden"), button:has-text("Anmelden"), .login-btn, [href*="login"]').first().click({ timeout: 8000 });
  await page.waitForTimeout(2000);

  console.log('Fulle Login-Formular aus...');
  await page.locator('input[placeholder*="E-Mail"], input[placeholder*="Kundennummer"], input[type="email"], input[name="email"]').first().fill(process.env.LSHOP_EMAIL, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.locator('input[type="password"], input[placeholder*="Passwort"]').first().fill(process.env.LSHOP_PASSWORD, { timeout: 8000 });
  await page.waitForTimeout(300);

  console.log('Klicke Anmelden...');
  await page.locator('button:has-text("Anmelden")').last().click({ timeout: 8000 });
  await page.waitForTimeout(4000);

  console.log('Login abgeschlossen. URL: ' + page.url());
}

async function addSingleItem(page, item) {
  var searchUrl = LSHOP_URL + '?cl=search&searchparam=' + encodeURIComponent(item.lshop_artikel);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  try {
    var productLink = page.locator('.product-item a, .productTitle a, h3 a, .title a').first();
    await productLink.click({ timeout: 6000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('Produktlink nicht gefunden, versuche direkte Suche');
  }

  try {
    var colorOption = page.locator('label:has-text("' + item.farbe_lshop + '"), [title="' + item.farbe_lshop + '"], option:has-text("' + item.farbe_lshop + '")').first();
    await colorOption.click({ timeout: 4000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Farbe nicht gefunden: ' + item.farbe_lshop);
  }

  try {
    var sizeOption = page.locator('label:has-text("' + item.groesse + '"), option:has-text("' + item.groesse + '"), [data-value="' + item.groesse + '"]').first();
    await sizeOption.click({ timeout: 4000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Groesse nicht gefunden: ' + item.groesse);
  }

  try {
    var qtyInput = page.locator('input[type="number"], input[name="am"]').first();
    await qtyInput.fill(String(item.quantity), { timeout: 3000 });
  } catch (e) {}

  await page.locator('button:has-text("In den Warenkorb"), button:has-text("Warenkorb"), button[name="wr"], input[name="wr"]').first().click({ timeout: 8000 });
  await page.waitForTimeout(2000);
  console.log('Artikel in Warenkorb: ' + item.lshop_artikel);
}

module.exports = { addItemsToLShopCart };
