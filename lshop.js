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
    viewport: { width: 1280, height: 900 }
  });
  var page = await context.newPage();
  var results = [];

  try {
    // SCHRITT 1+2: L-Shop öffnen und einloggen
    await login(page);

    for (var i = 0; i < validItems.length; i++) {
      var item = validItems[i];
      console.log('Verarbeite: ' + item.lshop_artikel + ' | ' + item.farbe_lshop + ' | ' + item.groesse + ' | ' + item.quantity + 'x');
      try {
        await addSingleItem(page, item);
        results.push({ status: 'added', title: item.shopify_title });
        console.log('Erfolgreich: ' + item.shopify_title);
      } catch (err) {
        results.push({ status: 'error', title: item.shopify_title, error: err.message });
        console.log('Fehler: ' + err.message);
      }
    }
  } finally {
    await browser.close();
  }

  return { success: results.some(function(r) { return r.status === 'added'; }), results: results };
}

async function login(page) {
  // Schritt 1: L-Shop öffnen
  console.log('Oeffne L-Shop...');
  await page.goto(LSHOP_URL + '/index.php?lang=0', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Cookie-Banner wegklicken falls vorhanden
  try {
    await page.locator('button:has-text("Akzeptieren"), #onetrust-accept-btn-handler').click({ timeout: 3000 });
    await page.waitForTimeout(1000);
  } catch (e) {}

  // Schritt 2: Anmelden
  console.log('Melde an...');
  await page.goto(LSHOP_URL + '/index.php?cl=user&lang=0', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Login-Felder ausfüllen
  await page.evaluate(function(creds) {
    document.querySelectorAll('input').forEach(function(inp) {
      var name = (inp.name || '').toLowerCase();
      var id = (inp.id || '').toLowerCase();
      var placeholder = (inp.placeholder || '').toLowerCase();
      var isEmail = inp.type === 'email' || name === 'lgn_usr' || name === 'email' || id === 'email' || id === 'loginuser' || placeholder.includes('mail') || placeholder.includes('kunden');
      var isPass = inp.type === 'password' || name === 'lgn_pwd' || name === 'password';
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
    var btns = document.querySelectorAll('button[type="submit"], input[type="submit"]');
    if (btns.length > 0) btns[0].click();
  });
  await page.waitForTimeout(4000);
  console.log('Eingeloggt. URL: ' + page.url());
}

async function addSingleItem(page, item) {
  // Schritt 3: Artikelnummer in Suchfeld eingeben
  console.log('Suche Artikel: ' + item.lshop_artikel);
  var searchInput = page.locator('input[name="searchparam"], input[placeholder*="Artikel"], input[type="search"]').first();
  await searchInput.click({ timeout: 5000 });
  await searchInput.fill('');
  await searchInput.type(item.lshop_artikel, { delay: 100 });
  await page.waitForTimeout(2000);

  // Schritt 4: Ersten Dropdown-Vorschlag anklicken
  console.log('Klicke Dropdown...');
  var productUrl = await page.evaluate(function() {
    // Hole href aus dem Autocomplete
    var links = document.querySelectorAll('.ui-autocomplete li a, .ui-autocomplete a');
    if (links.length > 0 && links[0].href) return links[0].href;
    return null;
  });

  if (productUrl) {
    console.log('Gehe zu Produkt: ' + productUrl);
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 20000 });
  } else {
    // Fallback: Enter und ersten Treffer anklicken
    console.log('Kein Autocomplete, druecke Enter...');
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);
    var firstProduct = page.locator('a').filter({ hasText: new RegExp(item.lshop_artikel, 'i') }).first();
    try {
      await firstProduct.click({ timeout: 5000 });
    } catch (e) {
      await page.locator('.productTitle a, h3 a').first().click({ timeout: 5000 });
    }
  }
  await page.waitForTimeout(2500);
  console.log('Produkt URL: ' + page.url());

  // Schritt 5: Farbe auswählen
  console.log('Waehle Farbe: ' + item.farbe_lshop);

  // Logge alle Farbtexte zur Diagnose
  var colorTexts = await page.evaluate(function() {
    var texts = [];
    document.querySelectorAll('span, p, div').forEach(function(el) {
      if (el.children.length === 0) {
        var t = (el.textContent || '').trim();
        if (t.length > 2 && t.length < 35) texts.push(t);
      }
    });
    return texts;
  });
  console.log('Farben auf Seite: ' + colorTexts.join(', '));

  // Farbe anklicken: Text finden → Elternteil klicken
  var colorResult = await page.evaluate(function(data) {
    var target = data.colorName.toLowerCase().trim();
    var allSpans = Array.from(document.querySelectorAll('span, p, div, label'));
    for (var i = 0; i < allSpans.length; i++) {
      var el = allSpans[i];
      if (el.children.length > 0) continue;
      var text = (el.textContent || '').trim().toLowerCase();
      if (text === target) {
        var parent = el.parentElement;
        if (parent) { parent.click(); return 'OK:' + text; }
        el.click();
        return 'OK-direct:' + text;
      }
    }
    // Partial match
    for (var j = 0; j < allSpans.length; j++) {
      var el2 = allSpans[j];
      if (el2.children.length > 0) continue;
      var text2 = (el2.textContent || '').trim().toLowerCase();
      if (text2.includes(target) || target.includes(text2)) {
        var parent2 = el2.parentElement;
        if (parent2) { parent2.click(); return 'PARTIAL:' + text2; }
        el2.click();
        return 'PARTIAL-direct:' + text2;
      }
    }
    return 'NICHT GEFUNDEN';
  }, { colorName: item.farbe_lshop });
  console.log('Farbe Ergebnis: ' + colorResult);
  await page.waitForTimeout(2000);

  // Nach unten scrollen zur Größentabelle
  await page.evaluate(function() { window.scrollBy(0, 500); });
  await page.waitForTimeout(1000);

  // Schritt 6: Richtige Größe finden und + Button klicken (so oft wie die Menge)
  console.log('Setze Menge ' + item.quantity + ' fuer Groesse ' + item.groesse);

  // Zuerst alle Zeilen loggen
  var tableInfo = await page.evaluate(function() {
    var rows = Array.from(document.querySelectorAll('tr'));
    return rows.map(function(r) { return (r.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 80); });
  });
  console.log('Tabelle: ' + tableInfo.join(' | '));

  // Playwright: Zeile mit Größe finden, + Button klicken
  var rows = page.locator('tr');
  var rowCount = await rows.count();
  var sizeFound = false;

  for (var r = 0; r < rowCount; r++) {
    var row = rows.nth(r);
    var rowText = await row.textContent();
    var cleanText = (rowText || '').replace(/\s+/g, ' ').trim();

    // Exakter Match für die Größe in der ersten Spalte
    var firstTd = row.locator('td').first();
    var tdText = '';
    try { tdText = (await firstTd.textContent() || '').trim(); } catch (e) {}

    // Prüfe ob diese Zeile die gesuchte Größe ist
    var sizeMatch = tdText.toUpperCase() === item.groesse.toUpperCase() ||
      cleanText.match(new RegExp('^' + item.groesse + '\\b', 'i'));

    if (sizeMatch) {
      console.log('Groesse gefunden: ' + cleanText.substring(0, 60));

      // + Button in dieser Zeile finden und quantity-mal klicken
      var plusBtn = row.locator('button:has-text("+"), [class*="plus"], [class*="increment"]').first();
      try {
        for (var q = 0; q < item.quantity; q++) {
          await plusBtn.click({ timeout: 3000 });
          await page.waitForTimeout(200);
        }
        console.log('+ Button ' + item.quantity + 'x geklickt');
        sizeFound = true;
        break;
      } catch (e) {
        // Fallback: Input direkt füllen
        var inputField = row.locator('input').first();
        try {
          await inputField.click({ timeout: 2000 });
          await inputField.fill(String(item.quantity), { timeout: 2000 });
          await inputField.press('Tab');
          console.log('Input direkt gefuellt: ' + item.quantity);
          sizeFound = true;
          break;
        } catch (e2) {
          console.log('Input auch fehlgeschlagen: ' + e2.message);
        }
      }
    }
  }

  if (!sizeFound) {
    throw new Error('Groesse ' + item.groesse + ' nicht gefunden. Farbe: ' + colorResult);
  }

  await page.waitForTimeout(500);

  // Schritt 7: In den Warenkorb klicken
  console.log('Klicke In den Warenkorb...');
  var cartSelectors = [
    'button:has-text("In den Warenkorb")',
    'button:has-text("Warenkorb")',
    'button[name="wr"]',
    'input[name="wr"]',
    'input[value*="Warenkorb"]',
    '.btn-basket',
    '#toBasket'
  ];
  for (var k = 0; k < cartSelectors.length; k++) {
    try {
      await page.locator(cartSelectors[k]).first().click({ timeout: 5000 });
      console.log('In den Warenkorb geklickt!');
      await page.waitForTimeout(2000);
      return;
    } catch (e) {}
  }
  throw new Error('Warenkorb-Button nicht gefunden');
}

module.exports = { addItemsToLShopCart };
