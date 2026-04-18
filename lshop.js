const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const LSHOP_URL = 'https://shop.l-shop-team.de';

async function addItemsToLShopCart(mappedItems) {
  var validItems = mappedItems.filter(function(item) { return !item.error; });
  if (validItems.length === 0) return { success: false, error: 'Keine Artikel' };

  var browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  var context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  var page = await context.newPage();
  var results = [];

  try {
    await login(page);
    for (var i = 0; i < validItems.length; i++) {
      var item = validItems[i];
      console.log('Verarbeite: ' + item.lshop_artikel + ' | ' + item.farbe_lshop + ' | ' + item.groesse + ' | ' + item.quantity + 'x');
      try {
        await addSingleItem(page, item);
        results.push({ status: 'added', title: item.shopify_title });
        console.log('ERFOLGREICH: ' + item.shopify_title);
      } catch (err) {
        results.push({ status: 'error', title: item.shopify_title, error: err.message });
        console.log('FEHLER: ' + err.message);
      }
    }
  } finally {
    await browser.close();
  }
  return { success: results.some(function(r) { return r.status === 'added'; }), results: results };
}

async function login(page) {
  console.log('Login...');
  await page.goto(LSHOP_URL + '/index.php?cl=user&lang=0', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  try { await page.locator('button:has-text("Akzeptieren"), #onetrust-accept-btn-handler').click({ timeout: 3000 }); await page.waitForTimeout(1000); } catch (e) {}

  await page.evaluate(function(creds) {
    document.querySelectorAll('input').forEach(function(inp) {
      var isEmail = inp.type === 'email' || inp.name === 'lgn_usr' || inp.name === 'email' || inp.id === 'email' || inp.id === 'loginUser' || (inp.placeholder && (inp.placeholder.includes('Mail') || inp.placeholder.includes('Kunden')));
      var isPass = inp.type === 'password' || inp.name === 'lgn_pwd';
      if (isEmail) { inp.value = creds.email; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new Event('change', {bubbles:true})); }
      if (isPass) { inp.value = creds.password; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new Event('change', {bubbles:true})); }
    });
  }, { email: process.env.LSHOP_EMAIL, password: process.env.LSHOP_PASSWORD });

  await page.waitForTimeout(500);
  await page.evaluate(function() { var btns = document.querySelectorAll('button[type="submit"], input[type="submit"]'); if (btns.length > 0) btns[0].click(); });
  await page.waitForTimeout(4000);
  console.log('Eingeloggt. URL: ' + page.url());
}

async function addSingleItem(page, item) {
  // Direkte URL nutzen wenn vorhanden
  var productUrl = item.lshop_url || null;

  if (productUrl) {
    console.log('Nutze direkten Link: ' + productUrl);
  } else {
    // Fallback: Autocomplete Suchfeld
    console.log('Suche via Suchfeld: ' + item.lshop_artikel);
    await page.goto(LSHOP_URL + '/index.php?lang=0', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    var searchInput = page.locator('input[name="searchparam"], input[placeholder*="Artikel"], input[type="search"]').first();
    await searchInput.click({ timeout: 5000 });
    await searchInput.fill('');
    for (var ch of item.lshop_artikel) {
      await searchInput.type(ch, { delay: 150 });
    }
    await page.waitForTimeout(2500);

    productUrl = await page.evaluate(function() {
      var links = document.querySelectorAll('.ui-autocomplete li a, .ui-autocomplete a');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].href;
        if (href && href.includes('shop.l-shop-team.de')) return href;
      }
      return null;
    });

    if (!productUrl) throw new Error('Kein Link gefunden fuer: ' + item.lshop_artikel + '. Bitte URL in products.json eintragen.');
  }

  // Zur Produktseite navigieren
  await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2500);
  console.log('Produkt URL: ' + page.url());

  // Farbe auswählen
  console.log('Waehle Farbe: ' + item.farbe_lshop);
  var colorResult = await page.evaluate(function(data) {
    var target = data.colorName.toLowerCase().trim();
    var allEls = Array.from(document.querySelectorAll('span, p, div, label, a, li'));
    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      if (el.children.length > 0) continue;
      var text = (el.textContent || '').trim().toLowerCase();
      if (text === target) {
        var p = el.parentElement;
        if (p) { p.click(); return 'OK: ' + text; }
        el.click(); return 'OK-direct: ' + text;
      }
    }
    // Partial match
    for (var j = 0; j < allEls.length; j++) {
      var el2 = allEls[j];
      if (el2.children.length > 0) continue;
      var text2 = (el2.textContent || '').trim().toLowerCase();
      if (text2.length > 2 && (text2.includes(target) || target.includes(text2))) {
        var p2 = el2.parentElement;
        if (p2) { p2.click(); return 'PARTIAL: ' + text2; }
      }
    }
    return 'NICHT GEFUNDEN';
  }, { colorName: item.farbe_lshop });
  console.log('Farbe: ' + colorResult);
  await page.waitForTimeout(2000);

  // Runterscrollen zur Größentabelle
  await page.evaluate(function() { window.scrollBy(0, 500); });
  await page.waitForTimeout(1000);

  // Größe finden und + Button klicken
  console.log('Groesse: ' + item.groesse + ' | Menge: ' + item.quantity);
  var rows = page.locator('tr');
  var rowCount = await rows.count();
  var sizeFound = false;

  for (var r = 0; r < rowCount; r++) {
    var row = rows.nth(r);
    var cells = row.locator('td');
    var cellCount = await cells.count();
    for (var c = 0; c < Math.min(cellCount, 3); c++) {
      var cellText = '';
      try { cellText = (await cells.nth(c).textContent() || '').trim(); } catch (e) { continue; }
      if (cellText.toUpperCase() === item.groesse.toUpperCase()) {
        console.log('Groesse ' + item.groesse + ' gefunden in Zeile ' + r);
        var plusBtn = row.locator('button:has-text("+")').first();
        if (await plusBtn.count() > 0) {
          for (var q = 0; q < item.quantity; q++) {
            await plusBtn.click({ timeout: 3000 });
            await page.waitForTimeout(300);
          }
          console.log('+ geklickt ' + item.quantity + 'x');
        } else {
          var input = row.locator('input').first();
          await input.click({ timeout: 2000 });
          await input.fill(String(item.quantity));
          await input.press('Tab');
          console.log('Input gesetzt: ' + item.quantity);
        }
        sizeFound = true; break;
      }
    }
    if (sizeFound) break;
  }

  if (!sizeFound) throw new Error('Groesse ' + item.groesse + ' nicht gefunden. Farbe: ' + colorResult);
  await page.waitForTimeout(500);

  // In den Warenkorb
  console.log('In den Warenkorb...');
  var cartSelectors = ['button:has-text("In den Warenkorb")', 'button:has-text("Warenkorb")', 'button[name="wr"]', 'input[name="wr"]', '.btn-basket', '#toBasket'];
  for (var k = 0; k < cartSelectors.length; k++) {
    try {
      if (await page.locator(cartSelectors[k]).count() > 0) {
        await page.locator(cartSelectors[k]).first().click({ timeout: 5000 });
        console.log('Warenkorb geklickt!');
        await page.waitForTimeout(2000);
        return;
      }
    } catch (e) {}
  }
  throw new Error('Warenkorb-Button nicht gefunden');
}

module.exports = { addItemsToLShopCart };
