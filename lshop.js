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
  console.log('Oeffne L-Shop Login-Seite direkt...');
  await page.goto(LSHOP_URL + '/index.php?cl=user', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  try {
    await page.locator('button:has-text("Akzeptieren"), #onetrust-accept-btn-handler, .cookie-accept').click({ timeout: 4000 });
    await page.waitForTimeout(1000);
  } catch (e) {}

  console.log('Aktuelle URL: ' + page.url());

  var email = process.env.LSHOP_EMAIL;
  var password = process.env.LSHOP_PASSWORD;

  var filled = await page.evaluate(function(creds) {
    var filled = false;
    var allInputs = Array.from(document.querySelectorAll('input'));
    allInputs.forEach(function(inp) {
      var isEmail = inp.type === 'email' || inp.name === 'lgn_usr' || inp.name === 'email' || inp.id === 'loginUser' || (inp.placeholder && inp.placeholder.includes('Mail'));
      var isPassword = inp.type === 'password' || inp.name === 'lgn_pwd';
      if (isEmail) {
        inp.value = creds.email;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        filled = true;
        console.log('Email-Feld gefunden: ' + inp.name + ' / ' + inp.id);
      }
      if (isPassword) {
        inp.value = creds.password;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Passwort-Feld gefunden: ' + inp.name + ' / ' + inp.id);
      }
    });
    return filled;
  }, { email: email, password: password });

  console.log('Felder ausgefuellt: ' + filled);
  await page.waitForTimeout(500);

  await page.evaluate(function() {
    var submitBtns = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button[name="lgn_cook"]'));
    if (submitBtns.length > 0) {
      submitBtns[0].click();
      return;
    }
    var forms = Array.from(document.querySelectorAll('form'));
    forms.forEach(function(form) { form.submit(); });
  });

  await page.waitForTimeout(4000);
  console.log('Nach Login URL: ' + page.url());
}

async function addSingleItem(page, item) {
  var searchUrl = LSHOP_URL + '/index.php?cl=search&searchparam=' + encodeURIComponent(item.lshop_artikel);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  try {
    var productLink = page.locator('.product-item a, .productTitle a, h3 a, .title a, li.productItem a').first();
    await productLink.click({ timeout: 6000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('Kein Produktlink gefunden');
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

  await page.locator('button:has-text("In den Warenkorb"), button:has-text("Warenkorb"), button[name="wr"], input[name="wr"], button[type="submit"]').first().click({ timeout: 8000 });
  await page.waitForTimeout(2000);
  console.log('Artikel in Warenkorb: ' + item.lshop_artikel);
}

module.exports = { addItemsToLShopCart };
