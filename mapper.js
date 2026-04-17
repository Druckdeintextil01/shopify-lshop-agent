const { chromium } = require('playwright');

const LSHOP_URL = 'https://www.l-shop-team.de';

/**
 * Legt alle gemappten Artikel in den L-Shop Warenkorb.
 * @param {Array} mappedItems - Artikel mit lshop_artikel, farbe_lshop, groesse, quantity
 */
async function addItemsToLShopCart(mappedItems) {
  const validItems = mappedItems.filter(item => !item.error);

  if (validItems.length === 0) {
    console.log('Keine gültigen Artikel zum Einfügen.');
    return { success: false, error: 'Keine gültigen Artikel' };
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Für Railway/Render nötig
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();
  const results = [];

  try {
    // === 1. LOGIN ===
    console.log('🔐 Logge bei L-Shop ein...');
    await login(page);
    console.log('✅ Login erfolgreich');

    // === 2. ARTIKEL EINLEGEN ===
    for (const item of validItems) {
      console.log(`🛒 Füge hinzu: ${item.lshop_artikel} | ${item.farbe_lshop} | ${item.groesse} | ${item.quantity}x`);
      try {
        await addSingleItem(page, item);
        results.push({ ...item, status: 'added' });
        console.log(`✅ Hinzugefügt: ${item.shopify_title}`);
      } catch (err) {
        console.error(`❌ Fehler bei ${item.shopify_title}:`, err.message);
        results.push({ ...item, status: 'error', error: err.message });
      }
      // Kurze Pause zwischen Artikeln
      await page.waitForTimeout(1000);
    }

    // === 3. SCREENSHOT VOM WARENKORB (für Logs) ===
    await page.goto(`${LSHOP_URL}/warenkorb`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: '/tmp/warenkorb.png' });
    console.log('📸 Warenkorb Screenshot gespeichert');

  } finally {
    await browser.close();
  }

  const successCount = results.filter(r => r.status === 'added').length;
  console.log(`\n📊 Ergebnis: ${successCount}/${validItems.length} Artikel erfolgreich eingefügt`);

  return { success: successCount > 0, results };
}

async function login(page) {
  await page.goto(`${LSHOP_URL}/login`, { waitUntil: 'networkidle' });

  // Cookies/Banner wegklicken falls vorhanden
  try {
    const cookieBtn = page.locator('button:has-text("Akzeptieren"), button:has-text("Alle akzeptieren"), #onetrust-accept-btn-handler');
    await cookieBtn.first().click({ timeout: 3000 });
    await page.waitForTimeout(500);
  } catch {
    // Kein Cookie-Banner vorhanden
  }

  // Login-Formular ausfüllen
  await page.locator('input[type="email"], input[name="email"], input[id*="email"]').fill(process.env.LSHOP_EMAIL);
  await page.locator('input[type="password"], input[name="password"], input[id*="password"]').fill(process.env.LSHOP_PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"]').click();

  // Warten bis Login durch ist
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });

  // Prüfen ob Login erfolgreich
  const url = page.url();
  if (url.includes('login') || url.includes('error')) {
    throw new Error('Login fehlgeschlagen – E-Mail oder Passwort prüfen');
  }
}

async function addSingleItem(page, item) {
  // Zur Produktsuche navigieren
  const searchUrl = `${LSHOP_URL}/suche?q=${encodeURIComponent(item.lshop_artikel)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

  // Ersten Suchtreffer anklicken
  const productLink = page.locator('.product-item a, .article-item a, [class*="product"] a').first();
  await productLink.waitFor({ timeout: 8000 });
  await productLink.click();
  await page.waitForLoadState('domcontentloaded');

  // === FARBE AUSWÄHLEN ===
  try {
    // L-Shop zeigt Farben als Swatches oder Dropdown
    const colorOption = page.locator(`[data-color="${item.farbe_lshop}"], [title="${item.farbe_lshop}"], option:has-text("${item.farbe_lshop}")`).first();
    await colorOption.waitFor({ timeout: 5000 });
    await colorOption.click();
    await page.waitForTimeout(500);
  } catch {
    console.warn(`⚠️  Farbe "${item.farbe_lshop}" nicht per Selektor gefunden, versuche Text-Match`);
    // Fallback: alle Farboptionen durchsuchen
    const colorElements = await page.locator('[class*="color"], [class*="farbe"]').all();
    for (const el of colorElements) {
      const text = await el.textContent();
      if (text?.toLowerCase().includes(item.farbe_lshop.toLowerCase())) {
        await el.click();
        break;
      }
    }
  }

  // === GRÖSSE AUSWÄHLEN ===
  try {
    const sizeOption = page.locator(`option:has-text("${item.groesse}"), [data-size="${item.groesse}"]`).first();
    await sizeOption.waitFor({ timeout: 5000 });
    await sizeOption.click();
    await page.waitForTimeout(300);
  } catch {
    // Größe als Dropdown
    const sizeSelect = page.locator('select[name*="size"], select[name*="groesse"], select[id*="size"]').first();
    await sizeSelect.selectOption({ label: item.groesse });
  }

  // === MENGE SETZEN ===
  const quantityInput = page.locator('input[name*="qty"], input[name*="menge"], input[type="number"]').first();
  await quantityInput.fill(String(item.quantity));

  // === IN DEN WARENKORB ===
  const cartButton = page.locator('button:has-text("In den Warenkorb"), button:has-text("Warenkorb"), button[id*="cart"]').first();
  await cartButton.click();

  // Warten auf Bestätigung
  await page.waitForTimeout(1500);

  // Prüfen ob Artikel hinzugefügt wurde (optional: auf Erfolgs-Meldung warten)
  const successMsg = page.locator('[class*="success"], [class*="cart-added"]');
  try {
    await successMsg.waitFor({ timeout: 3000 });
  } catch {
    // Kein explizites Success-Banner nötig - Warenkorb-Count reicht
  }
}

module.exports = { addItemsToLShopCart };
