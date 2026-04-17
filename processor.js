require('dotenv').config();
const { mapProductsToLShop } = require('./mapper');
const { addItemsToLShopCart } = require('./lshop');

async function processOrder(order) {
  const orderId = order.id || order.order_number;
  console.log(`\n Neue Bestellung #${orderId}`);

  for (const item of order.line_items || []) {
    console.log(`  - ${item.quantity}x ${item.title} | ${item.variant_title || ''}`);
  }

  console.log('\n Mappe Produkte...');
  const mappedItems = await mapProductsToLShop(order.line_items || []);

  for (const item of mappedItems) {
    if (item.error) {
      console.log(`  Fehler: ${item.shopify_title}: ${item.error}`);
    } else {
      console.log(`  OK: ${item.shopify_title} -> ${item.lshop_artikel} | ${item.farbe_lshop} | ${item.groesse} | ${item.quantity}x`);
    }
  }

  const validItems = mappedItems.filter(i => !i.error);
  if (validItems.length === 0) {
    console.log('Keine Artikel gemappt.');
    return;
  }

  console.log(`\n Lege ${validItems.length} Artikel in L-Shop Warenkorb...`);
  const result = await addItemsToLShopCart(mappedItems);

  if (result.success) {
    console.log(`Bestellung #${orderId} erfolgreich verarbeitet!`);
  } else {
    console.error(`Fehler bei Bestellung #${orderId}:`, result.error);
  }
}

module.exports = { processOrder };
