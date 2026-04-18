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
      console.log('--- ' + item.lshop_artikel + ' | ' + item.farbe_lshop + ' | ' + item.groesse + ' | ' + item.quantity + 'x');
      try {
        await addSingleItem(page, item);
        results.push({ status: 'added', title: item.shopify_title });
        console.log('OK: ' + item.shopify_title);
      } catch (err) {
        results.push({ status: 'error', title: item.shopify_title, error: err.message });
        console.log('FEHLER: ' + err.message);
      }
      await page.waitForTimeout(2000);
    }
  } finally {
    await browser.close();
  }

  return { success: results.some(function(r) { return r.status === 'added'; }), results: results };
}

async function login(page) {
  console.log('Login...');
  await page.goto(LSHOP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  try {
    await page.locator('button:has-text("Akzeptieren"), #onetrust-accept-btn-handler').click({ timeout: 4000 });
    await page.waitForTimeout(1000);
  } catch (e) {}

  await page.goto(LSHOP_URL + '/index.php?cl=user', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.evaluate(function(creds) {
    document.querySelectorAll('input').forEach(function(inp) {
      var isEmail = inp.type === 'email' || inp.name === 'lgn_usr' || inp.name === 'email' || inp.id === 'email' || inp.id === 'loginUser' || (inp.placeholder && inp.placeholder.includes('Mail'));
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
    var btns = document.querySelectorAll('button[type="submit"], input[type="submit"]');
    if (btns.length > 0) btns[0].click();
  });
  await page.waitForTimeout(5000);
  console.log('Nach Login: ' + page.url());
}

async function addSingleItem(page, item) {
  // SCHRITT 1: Startseite auf Deutsch laden
  await page.goto(LSHOP_URL + '/index.php?lang=0', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // SCHRITT 2: Artikelnummer ins Suchfeld tippen
  console.log('Suche: ' + item.lshop_artikel);
  var searchInput = page.locator('input[name="searchparam"], input[placeholder*="Artikel"], input[type="search"], #searchInput, .search-input').first();
  await searchInput.click({ timeout: 5000 });
  await searchInput.fill(item.lshop_artikel);
  await page.waitForTimeout(2000);

  // SCHRITT 3: Autocomplete-Vorschlag anklicken
  var dropdownSelectors = [
    '.ui-autocomplete li',
    '.autocomplete-suggestion',
    '.search-suggestion',
    '[class*="suggest"] a',
    '[class*="autocomplete"] a',
    '.tt-suggestion',
    '.dropdown-menu li a'
  ];
  var dropdownClicked = false;
  for (var d = 0; d < dropdownSelectors.length; d++) {
    try {
      await page.locator(dropdownSelectors[d]).first().click({ timeout: 3000 });
      dropdownClicked = true;
      console.log('Dropdown geklickt');
      break;
    } catch (e) {}
  }
  if (!dropdownClicked) {
    console.log('Kein Dropdown - druecke Enter');
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);
    var resultSelectors = ['.productTitle a', 'h3.title a', '.product-item a', 'li.productItem a'];
    for (var r = 0; r < resultSelectors.length; r++) {
      try {
        await page.locator(resultSelectors[r]).first().click({ timeout: 4000 });
        console.log('Suchergebnis geklickt');
        break;
      } catch (e) {}
    }
  }
  await page.waitForTimeout(2500);
  console.log('Produkt URL: ' + page.url());

  // SCHRITT 4: Farbe anklicken
  console.log('Waehle Farbe: ' + item.farbe_lshop);
  var colorClicked = await page.evaluate(function(data) {
    var colorName = data.colorName;
    var allEls = Array.from(document.querySelectorAll('div, span, label, li, a, p'));
    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      if (el.children.length > 3) continue;
      var text = (el.textContent || '').trim();
      if (text.toLowerCase() === colorName.toLowerCase()) {
        el.click();
        return true;
      }
    }
    var titled = Array.from(document.querySelectorAll('[title], [alt]'));
    for (var j = 0; j < titled.length; j++) {
      var attr = (titled[j].title || titled[j].alt || '').trim();
      if (attr.toLowerCase() === colorName.toLowerCase()) {
        titled[j].click();
        return true;
      }
    }
    return false;
  }, { colorName: item.farbe_lshop });
  console.log('Farbe geklickt: ' + colorClicked);
  await page.waitForTimeout(1500);

  // SCHRITT 5: Runterscrollen zur Groessen-Tabelle
  await page.evaluate(function() { window.scrollBy(0, 600); });
  await page.waitForTimeout(1000);

  // SCHRITT 6: Menge in der richtigen Groessen-Zeile eintragen
  console.log('Setze Menge ' + item.quantity + ' fuer Groesse ' + item.groesse);
  var quantitySet = await page.evaluate(function(data) {
    var groesse = data.groesse;
    var quantity = data.quantity;
    var rows = Array.from(document.querySelectorAll('tr'));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var tds = Array.from(row.querySelectorAll('td'));
      var hasSize = tds.some(function(td) {
        return (td.textContent || '').trim().toLowerCase() === groesse.toLowerCase();
      });
      if (hasSize) {
        var inputs = row.querySelectorAll('input[type="text"], input[type="number"]');
        for (var j = 0; j < inputs.length; j++) {
          inputs[j].value = '';
          inputs[j].focus();
          inputs[j].value = String(quantity);
          inputs[j].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[j].dispatchEvent(new Event('change', { bubbles: true }));
          inputs[j].dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          return true;
        }
      }
    }
    return false;
  }, { groesse: item.groesse, quantity: item.quantity });
  console.log('Menge gesetzt: ' + quantitySet);
  await page.waitForTimeout(500);

  // SCHRITT 7: In den Warenkorb klicken
  console.log('Klicke In den Warenkorb...');
  var cartSelectors = [
    'button:has-text("In den Warenkorb")',
    'button:has-text("Warenkorb")',
    'input[value*="Warenkorb"]',
    'button[name="wr"]',
    'input[name="wr"]',
    '.btn-basket',
    '#toBasket'
  ];
  for (var k = 0; k < cartSelectors.length; k++) {
    try {
      await page.locator(cartSelectors[k]).first().click({ timeout: 5000 });
      console.log('Warenkorb geklickt!');
      await page.waitForTimeout(2000);
      return;
    } catch (e) {}
  }
  throw new Error('Warenkorb-Button nicht gefunden');
}

module.exports = { addItemsToLShopCart };
