require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { processOrder } = require('./processor');

const app = express();

// Raw body für Shopify Signatur-Verifikation
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// =============================================
// SHOPIFY WEBHOOK: Neue Bestellung
// =============================================
app.post('/webhook/orders/create', async (req, res) => {
  // 1. Signatur prüfen (Sicherheit)
  if (!verifyShopifyWebhook(req)) {
    console.warn('⚠️  Ungültige Webhook-Signatur abgewiesen');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 2. Sofort 200 an Shopify zurückgeben (Shopify wartet max. 5 Sek.)
  res.status(200).json({ received: true });

  // 3. Bestellung asynchron verarbeiten
  const order = req.body;
  processOrder(order).catch(err => {
    console.error('🔥 Kritischer Fehler bei Bestellverarbeitung:', err);
  });
});

// =============================================
// HEALTH CHECK (Railway/Render brauchen das)
// =============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'shopify-lshop-agent',
    timestamp: new Date().toISOString()
  });
});

// =============================================
// TEST-ENDPUNKT (nur für Entwicklung)
// =============================================
app.post('/test/order', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const testOrder = req.body || {
    id: 'TEST-001',
    order_number: 'TEST-001',
    billing_address: { first_name: 'Test', last_name: 'Kunde' },
    line_items: [
      {
        title: 'T-Shirt',
        variant_title: 'Weiß / M',
        quantity: 5,
        sku: ''
      },
      {
        title: 'Hoodie',
        variant_title: 'Schwarz / XL',
        quantity: 2,
        sku: ''
      }
    ]
  };

  res.json({ message: 'Test-Bestellung wird verarbeitet...', order: testOrder });
  processOrder(testOrder).catch(console.error);
});

// =============================================
// SERVER STARTEN
// =============================================
function verifyShopifyWebhook(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('⚠️  SHOPIFY_WEBHOOK_SECRET nicht gesetzt – Verifikation übersprungen');
    return true; // Im Dev-Modus überspringen
  }

  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) return false;

  const hash = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🤖 Shopify → L-Shop Agent läuft     ║
║   Port: ${PORT}                           ║
║   Webhook: POST /webhook/orders/create ║
╚════════════════════════════════════════╝
  `);
});
