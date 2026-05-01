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
  try {
    await page.locator('button:has-text("Akzeptieren"), #onetrust-accept-btn-handler').click({ timeout: 3000 });
    await page.waitForTimeout(1000);
  } catch (e) {}
  await page.evaluate(function(creds) {
    document.querySelectorAll('input').forEach(function(inp) {
      var isEmail = inp.type === 'email' || inp.name === 'lgn_usr' || inp.name === 'email' || inp.id === 'email' || inp.id === 'loginUser' || (inp.placeholder && (inp.placeholder.includes('Mail') || inp.placeholder.includes('Kunden')));
      var isPass = inp.type === 'password' || inp.name === 'lgn_pwd';
      if (isEmail) { inp.value = creds.email; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new Event('change', {bubbles:true})); }
      if (isPass) { inp.value = creds.password; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new Event('change', {bubbles:true})); }
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
  var productUrl = item.lshop_url || null;
  if (productUrl) {
    console.log('Navigiere zu: ' + productUrl);
  } else {
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
        if (links[i].href && links[i].href.includes('shop.l-shop-team.de')) return links[i].href;
      }
      return null;
    });
    if (!productUrl) throw new Error('Kein Link fuer: ' + item.lshop_artikel);
  }

  await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('Produkt URL: ' + page.url());

  // Farbe auswaehlen - NUR exakter Match auf kurzen Texten
  console.log('Waehle Farbe: ' + item.farbe_lshop);
  var colorResult = await page.evaluate(function(data) {
    var target = data.colorName.toLowerCase().trim();

    var allEls = Array.from(document.querySelectorAll('span, div, label, li, a, p'));
    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      if (el.children.length > 0) continue;
      var text = (el.textContent || '').trim();
      // Nur kurze Texte pruefen (max 30 Zeichen) - verhindert Treffer in langen Beschreibungen
      if (text.length > 30) continue;
      if (text.toLowerCase() === target) {
        var p = el.parentElement;
        if (p) { p.click(); return 'OK: ' + text; }
        el.click();
        return 'OK-direct: ' + text;
      }
    }

    // Partial match - nur wenn Farbe im Text vorkommt UND Text kurz ist
    for (var j = 0; j < allEls.length; j++) {
      var el2 = allEls[j];
      if (el2.children.length > 0) continue;
      var text2 = (el2.textContent || '').trim();
      if (text2.length > 30) continue; // Keine langen Texte!
      if (text2.toLowerCase().includes(target)) {
        var p2 = el2.parentElement;
        if (p2) { p2.click(); return 'PARTIAL: ' + text2; }
      }
    }

    return 'NICHT GEFUNDEN';
  }, { colorName: item.farbe_lshop });
  console.log('Farbe: ' + colorResult);
  await page.waitForTimeout(2500);

  // Groesse und Menge setzen
  console.log('Groesse: ' + item.groesse + ' | Menge: ' + item.quantity);
  var sizeFound = await page.evaluate(function(data) {
    var groesse = data.groesse.toUpperCase();
    var quantity = data.quantity;
    var rows = Array.from(document.querySelectorAll('tr'));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var tds = Array.from(row.querySelectorAll('td'));
      var sizeMatch = tds.some(function(td) {
        return (td.textContent || '').trim().toUpperCase() === groesse;
      });
      if (!sizeMatch) continue;

      var inputs = Array.from(row.querySelectorAll('input[type="text"], input[type="number"]'));
      for (var j = 0; j < inputs.length; j++) {
        var inp = inputs[j];
        var style = window.getComputedStyle(inp);
        if (style.display !== 'none' && style.visibility !== 'hidden' && inp.offsetParent !== null) {
          inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
          inp.focus();
          inp.value = '';
          inp.value = String(quantity);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          inp.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
          inp.blur();
          return true;
        }
      }
      var btns = Array.from(row.querySelectorAll('button'));
      for (var k = 0; k < btns.length; k++) {
        if ((btns[k].textContent || '').trim() === '+') {
          btns[k].scrollIntoView({ behavior: 'smooth', block: 'center' });
          for (var q = 0; q < quantity; q++) { btns[k].click(); }
          return true;
        }
      }
    }
    return false;
  }, { groesse: item.groesse, quantity: item.quantity });

  console.log('Menge gesetzt: ' + sizeFound);
  if (!sizeFound) throw new Error('Groesse ' + item.groesse + ' nicht gefunden. Farbe war: ' + colorResult);
  await page.waitForTimeout(1000);

  // In den Warenkorb
  console.log('In den Warenkorb...');
  var cartSelectors = [
    'button:has-text("In den Warenkorb")',
    'button:has-text("Warenkorb")',
    'button[name="wr"]',
    'input[name="wr"]',
    '.btn-basket',
    '#toBasket'
  ];
  for (var k = 0; k < cartSelectors.length; k++) {
    try {
      var el = page.locator(cartSelectors[k]).first();
      if (await el.count() > 0) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await el.click({ timeout: 5000 });
        console.log('Warenkorb geklickt!');
        await page.waitForTimeout(2000);
        return;
      }
    } catch (e) {}
  }
  throw new Error('Warenkorb-Button nicht gefunden');
}

module.exports = { addItemsToLShopCart };
