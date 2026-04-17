const { chromium } = require('playwright');

const LSHOP_URL = 'https://shop.l-shop-team.de';

async function addItemsToLShopCart(mappedItems) {
  var validItems = mappedItems.filter(function(item) { return !item.error; });
  if (validItems.length === 0) return { success: false, error: 'Keine Artikel' };

  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  var context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

async function waitForValidation(page) {
  var maxWait = 15000;
  var waited = 0;
  while (page.url().includes('validation.php') && waited < maxWait) {
    console.log('Warte auf Weiterleitung von validation.php...');
    await page.waitForTimeout(2000);
    waited += 2000;
  }
  console.log('URL nach Warten: ' + page.url());
}

async function login(page) {
  console.log('Oeffne L-Shop...');
  await page.goto(LSHOP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('validation.php')) {
    await waitForValidation(page);
  }

  try {
    await page.locator('button:has-text("Akzeptieren"), #onetrust-accept-btn-handler').click({ timeout: 4000 });
    await page.waitForTimeout(1000);
  } catch (e) {}

  console.log('Navigiere zu Login-Seite...');
  await page.goto(LSHOP_URL + '/index.php?cl=user', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('validation.php')) {
    await waitForValidation(page);
    await page.goto(LSHOP_URL + '/index.php?cl=user', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  console.log('Login URL: ' + page.url());

  await page.evaluate(function(creds) {
    var allInputs = Array.from(document.querySelectorAll('input'));
    allInputs.forEach(function(inp) {
      var isEmail = inp.type === 'email' || inp.name === 'lgn_usr' || inp.name === 'email' || inp.id === 'loginUser' || inp.id === 'email' || (inp.placeholder && (inp.placeholder.includes('Mail') || inp.placeholder.includes('Kunden')));
      var isPassword = inp.type === 'password' || inp.name === 'lgn_pwd' || inp.name === 'password';
      if (isEmail) {
        inp.value = creds.email;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Email gesetzt: ' + (inp.name || inp.id));
      }
      if (isPassword) {
        inp.value = creds.password;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Passwort gesetzt');
      }
    });
  }, { email: process.env.LSHOP_EMAIL, password: process.env.LSHOP_PASSWORD });

  await page.waitForTimeout(1000);

  await page.evaluate(function() {
    var submitBtns = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button[name="lgn_cook"]'));
    if (submitBtns.length > 0) {
      submitBtns[0].click();
    } else {
      var forms = Array.from(document.querySelectorAll('form'));
      if (forms.length > 0) forms[0].submit();
    }
  });

  await page.waitForTimeout(5000);

  if (page.url().includes('validation.php')) {
    await waitForValidation(page);
  }

  console.log('Nach Login: ' + page.url());
  var isLoggedIn = !page.url().includes('cl=user') && !page.url().includes('login');
  console.log('Eingeloggt: ' + isLoggedIn);
}

async function addSingleItem(page, item) {
  var searchUrl = LSHOP_URL + '/index.php?cl=search&searchparam=' + encodeURIComponent(item.lshop_artikel);
  console.log('Suche: ' + searchUrl);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  if (page.url().includes('validation.php')) {
    await waitForValidation(page);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
  }

  try {
    var productLink = page.locator('a.product-item, .productTitle a, h3 a, .title a, li.productItem a, .product a').first();
    await productLink.click({ timeout: 6000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('Kein Produktlink in Suchergebnissen');
  }

  try {
    var colorOption = page.locator('label:has-text("' + item.farbe_lshop + '"), [title*="' + item.farbe_lshop + '"], option:has-text("' + item.farbe_lshop + '")').first();
    await colorOption.click({ timeout: 4000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Farbe nicht klickbar: ' + item.farbe_lshop);
  }

  try {
    var sizeOption = page.locator('label:has-text("' + item.groesse + '"), option:has-text("' + item.groesse + '"), [data-value="' + item.groesse + '"]').first();
    await sizeOption.click({ timeout: 4000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Groesse nicht klickbar: ' + item.groesse);
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
