const products = require('./config/products.json');

async function mapProductsToLShop(lineItems) {
  return lineItems.map(function(item) {
    var title = (item.title || '').toLowerCase();
    var variant = (item.variant_title || '').toLowerCase();

    for (var i = 0; i < products.produkte.length; i++) {
      var p = products.produkte[i];
      var match = (p.shopify_keywords || []).some(function(kw) {
        return title.includes(kw);
      });
      if (!match) continue;

      // Farbe bestimmen
      var farbe = '';
      var cm = p.farben_mapping || {};
      for (var de in cm) {
        if (variant.includes(de.toLowerCase())) {
          farbe = cm[de];
          break;
        }
      }
      if (!farbe) {
        farbe = (item.variant_title || '').split('/')[0].trim();
      }

      // Größe bestimmen mit Übersetzungstabelle
      var groesse = 'M';
      var sizeMap = {
        '2XL': 'XXL',
        '3XL': '3XL',
        '4XL': '4XL',
        '5XL': '5XL',
        'XXXL': '3XL',
        'XXXXL': '4XL'
        'XXXXXL': '5XL'
      };
      var m = variant.match(/\b(XS|S|M|L|2XL|3XL|4XL|5XL|XL|XXL|XXXL|XXXXL)\b/i);
      if (m) {
        var rawSize = m[1].toUpperCase();
        groesse = sizeMap[rawSize] || rawSize;
      }

      console.log('Gemappt: ' + item.title + ' -> ' + p.lshop_artikel + ' | Farbe: ' + farbe + ' | Groesse: ' + groesse);

      return {
        shopify_title: item.title,
        lshop_artikel: p.lshop_artikel,
        lshop_name: p.lshop_name,
        lshop_url: p.lshop_url || null,
        farbe_lshop: farbe,
        groesse: groesse,
        quantity: item.quantity,
        mapped_by: 'config'
      };
    }

    console.log('Nicht gefunden: ' + item.title);
    return {
      shopify_title: item.title,
      error: 'Nicht gefunden',
      quantity: item.quantity
    };
  });
}

module.exports = { mapProductsToLShop };
