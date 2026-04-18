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
      if (isEmail) { inp.value = creds.email; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
      if (isPass) { inp.value = creds.password; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
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
  // SCHRITT 1: Startseite auf Deutsch
  await page.goto(LSHOP_URL + '/index.php?lang=0', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // SCHRITT 2: Artikelnummer tippen und Autocomplete-Link holen
  console.log('Suche: ' + item.lshop_artikel);
  var searchInput = page.locator('input[name="searchparam"], input[placeholder*="Artikel"], input[type="search"]').first();
  await searchInput.click({ timeout: 5000 });
  await searchInput.fill(item.lshop_artikel);
  await page.waitForTimeout(2500);

  // Hole den Produktlink direkt aus dem Autocomplete-DOM
  var productHref = await page.evaluate(function() {
    var links = document.querySelectorAll('.ui-autocomplete li a, .ui-autocomplete a');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href;
      if (href && href.includes('http')) return href;
    }
    return null;
  });

  if (productHref) {
    console.log('Produkt gefunden: ' + productHref);
    await page.goto(productHref, { waitUntil: 'networkidle', timeout: 20000 });
  } else {
    console.log('Kein Autocomplete - Enter');
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);
    try {
      await page.locator('.productTitle a, h3.title a, .product-item a').first().click({ timeout: 5000 });
    } catch (e) {
      throw new Error('Produkt nicht gefunden: ' + item.lshop_artikel);
    }
  }
  await page.waitForTimeout(2500);
  console.log('Produkt URL: ' + page.url());

  // SCHRITT 3: Alle verfügbaren Farben auf der Seite loggen, dann richtige anklicken
  var availableColors = await page.evaluate(function() {
    var colors = [];
    var allEls = Array.from(document.querySelectorAll('span, p, div, label, a'));
    allEls.forEach(function(el) {
      if (el.children.length === 0) {
        var text = (el.textContent || '').trim();
        if (text.length > 2 && text.length < 40) colors.push(text);
      }
    });
    return colors.slice(0, 50);
  });
  console.log('Gefundene Texte auf Seite (erste 50): ' + availableColors.join(' | '));

  console.log('Klicke Farbe: ' + item.farbe_lshop);
  var colorClicked = await page.evaluate(function(data) {
    var colorName = data.colorName.toLowerCase().trim();

    // Finde alle Textelemente und versuche exakten Match
    var allEls = Array.from(document.querySelectorAll('span, p, div, label, a, li'));
    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      if (el.children.length === 0) {
        var text = (el.textContent || '').trim().toLowerCase();
        if (text === colorName) {
          // Klicke Elternteil (Farbswatch-Container)
          var parent = el.parentElement;
          if (parent) { parent.click(); return 'parent:' + text; }
          el.click();
          return 'self:' + text;
        }
      }
    }

    // Partial match
    for (var j = 0; j < allEls.length; j++) {
      var el2 = allEls[j];
      if (el2.children.length === 0) {
        var text2 = (el2.textContent || '').trim().toLowerCase();
        if (text2.includes(colorName) || colorName.includes(text2)) {
          var parent2 = el2.parentElement;
          if (parent2) { parent2.click(); return 'partial-parent:' + text2; }
          el2.click();
          return 'partial-self:' + text2;
        }
      }
    }

    // Titel/Alt Attribute
    var titled = Array.from(document.querySelectorAll('[title], [alt]'));
    for (var k = 0; k < titled.length; k++) {
      var attr = (titled[k].title || titled[k].alt || '').trim().toLowerCase();
      if (attr === colorName || attr.includes(colorName)) {
        titled[k].click();
        return 'attr:' + attr;
      }
    }
    return false;
  }, { colorName: item.farbe_lshop });

  console.log('Farbe Ergebnis: ' + colorClicked);
  await page.waitForTimeout(2000);

  // SCHRITT 4: Runterscrollen
  await page.evaluate(function() { window.scrollBy(0, 500); });
  await page.waitForTimeout(1000);

  // SCHRITT 5: Größentabelle - Zeile finden und Menge setzen
  // Die Tabelle hat Zeilen mit: [farbiges Kästchen] [Größe] [Bestand] ... [−] [0] [+]
  console.log('Setze Menge ' + item.quantity + ' fuer Groesse ' + item.groesse);

  // Methode 1: Per Playwright direkt das Input-Feld in der richtigen Zeile füllen
  var quantitySet = false;
  try {
    var rows = page.locator('tr');
    var rowCount = await rows.count();
    console.log('Gefundene Tabellenzeilen: ' + rowCount);

    for (var r = 0; r < rowCount; r++) {
      var row = rows.nth(r);
      var rowText = await row.textContent();
      if (rowText && rowText.trim().match(new RegExp('\\b' + item.groesse + '\\b', 'i'))) {
        console.log('Groesse gefunden in Zeile ' + r + ': ' + rowText.substring(0, 50));
        var inputs = row.locator('input[type="text"], input[type="number"]');
        var inputCount = await inputs.count();
        if (inputCount > 0) {
          var inp = inputs.first();
          await inp.click({ timeout: 3000 });
          await inp.fill(String(item.quantity), { timeout: 3000 });
          await inp.press('Tab');
          quantitySet = true;
          console.log('Menge gesetzt: ' + item.quantity);
          break;
        }
      }
    }
  } catch (e) {
    console.log('Playwright Methode fehlgeschlagen: ' + e.message);
  }

  // Methode 2: JavaScript Fallback
  if (!quantitySet) {
    quantitySet = await page.evaluate(function(data) {
      var groesse = data.groesse.toLowerCase();
      var quantity = data.quantity;
      var rows = Array.from(document.querySelectorAll('tr'));
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if ((row.textContent || '').toLowerCase().match(new RegExp('\\b' + groesse + '\\b'))) {
          var inputs = row.querySelectorAll('input');
          for (var j = 0; j < inputs.length; j++) {
            inputs[j].value = '';
            inputs[j].focus();
            inputs[j].value = String(quantity);
            inputs[j].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[j].dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }, { groesse: item.groesse, quantity: item.quantity });
    console.log('JS Methode Menge gesetzt: ' + quantitySet);
  }

  if (!quantitySet) {
    throw new Error('Groesse ' + item.groesse + ' nicht gefunden. Farbe geklickt: ' + colorClicked);
  }

  await page.waitForTimeout(500);

  // SCHRITT 6: In den Warenkorb
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
