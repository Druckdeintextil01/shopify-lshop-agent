const { chromium } = require('playwright');

const LSHOP_URL = 'https://www.l-shop-team.de';

async function addItemsToLShopCart(mappedItems) {
  const validItems = mappedItems.filter(item => !item.error);
  if (validItems.length === 0) return { success: false, error: 'Keine Artikel' };

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newContext().then(c => c.newPage());
  const results = [];

  try {
    await login(page);
    for (const item of validItems) {
      console.log(`Füge hinzu: ${item.lshop_artikel} | ${item.farbe_lshop} | ${item.groesse} | ${item.quantity}x`);
      try {
        await addSingleItem(page, item);
        results.push({ ...item, status: 'added' });
      } catch (err) {
        console.error(`Fehler bei ${item.shopify_title}:`, err.message);
        results.push({ ...item, status: 'error', error: err.message });
      }
      await page.waitForTimeout(1000);
    }
  } finally {
    await browser.close();
  }

  return { success: results.some(r => r.status === 'added'), results };
}

async function login(page) {
  await page.goto(`${LSHOP_URL}/login`, { waitUntil: 'networkidle' });
  try {
    await page.locator('button:has-text("Akzeptieren")').click({ timeout: 3000 });
  } catch {}
    await page.locator('input[id="email"]:visible, input[name="email"]:visible, input[type="email"]:visible').first().fill(process.env.LSHOP_EMAIL, { force: true });
await page.locator('input[type="password"]:visible, input[name="password"]:visible').first().fill(process.env.LSHOP_PASSWORD, { force: true });
await page.locator('button[type="submit"]:visible, button:has-text("Anmelden"):visible, button:has-text("Login"):visible').first().click({ force: true });
await page.waitForTimeout(3000);
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
}

async function addSingleItem(page, item) {
  await page.goto(`${LSHOP_URL}/suche?q=${encodeURIComponent(item.lshop_artikel)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.product-item a, .article-item a').first().click();
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.locator(`[data-color="${item.farbe_lshop}"], [title="${item.farbe_lshop}"]`).first().click({ timeout: 4000 });
  } catch {}
  try {
    await page.locator('select').first().selectOption({ label: item.groesse });
  } catch {}
  await page.locator('input[type="number"]').first().fill(String(item.quantity));
  await page.locator('button:has-text("Warenkorb"), button:has-text("warenkorb")').first().click();
  await page.waitForTimeout(1500);
}

module.exports = { addItemsToLShopCart };
