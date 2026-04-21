const products = require('./config/products.json');

// Komplette Shopify -> L-Shop Farb-Übersetzung
var FARBEN = {
  "schwarz": "Black", "black": "Black", "black-carbon": "Black",
  "black-fuchsia": "Black", "black-light-grey": "Black", "black-lime-green": "Black",
  "black-orange": "Black", "black-red": "Black", "black-surf-blue": "Black",
  "black-white": "Black", "black-yellow": "Black", "carbon-black": "Black",
  "magnet": "Magnet", "carbon": "Carbon",
  "graphite-grey-black": "Graphite Grey",
  "weiß": "White", "weiss": "White", "white": "White", "white-carbon": "White",
  "grau": "Sport Grey", "grey": "Sport Grey", "sport grey": "Sport Grey",
  "dark-grey": "Dark Grey", "dark grey": "Dark Grey",
  "dunkel grau": "Dark Grey", "dark-melange": "Dark Melange",
  "dusty-grey": "Dusty Grey", "graphite-grey": "Graphite Grey",
  "heather-grey": "Heather Grey", "light-grey": "Light Grey",
  "light-melange": "Light Melange",
  "rot": "Red", "red": "Red", "red-white": "Red",
  "dark-orange": "Dark Orange", "fluorescent-orange": "Fluorescent Orange",
  "orange": "Orange",
  "gelb": "Yellow", "yellow": "Yellow", "acid-yellow": "Acid Yellow",
  "fluorescent-yellow": "Fluorescent Yellow", "gold": "Gold",
  "gold-yellow": "Gold Yellow", "light-yellow": "Light Yellow",
  "navy": "Navy", "dunkel blau": "Navy", "marineblau": "Navy",
  "french-navy": "French Navy", "frnech-navy-white": "French Navy",
  "oxford-navy": "Oxford Navy", "royal-navy": "Navy", "dark-royal": "Dark Royal",
  "blau": "Royal Blue", "blue": "Royal Blue",
  "bright-royal": "Bright Royal", "bright-royal-white": "Bright Royal",
  "cobalt-blue": "Cobalt Blue", "cobalt blue": "Cobalt Blue",
  "dusty-blue": "Dusty Blue", "light-blue": "Light Blue",
  "pacific": "Pacific Blue", "royal": "Royal Blue",
  "baby blau": "Baby Blue", "babyblau": "Baby Blue",
  "airforce": "Airforce Blue", "carolina": "Carolina Blue",
  "auqa": "Aqua", "turquoise": "Turquoise", "mint": "Mint",
  "gruen": "Bottle Green", "green": "Bottle Green",
  "bottle-green": "Bottle Green", "bottle green": "Bottle Green",
  "dark-green": "Dark Green", "dusty-green": "Dusty Green",
  "fern-green": "Fern Green", "irish-green": "Irish Green",
  "kelly-green": "Kelly Green", "lime-green": "Lime Green",
  "military-green": "Military Green", "olive": "Olive",
  "olive-green": "Olive Green", "olive-green-black": "Olive Green",
  "pure-green-white": "Pure Green", "lime-punch-235": "Lime Punch 235",
  "lime punch 235": "Lime Punch 235",
  "beige": "Beige", "biscuit": "Biscuit", "natural-stone": "Natural Stone",
  "oatmeal": "Oatmeal", "sand": "Sand", "stone": "Stone",
  "stone-black": "Stone", "walnut": "Walnut",
  "braun": "Brown", "brown": "Brown", "chocolate-caramel": "Chocolate",
  "schoko": "Chocolate",
  "lila": "Purple", "purple": "Purple", "lila-1": "Purple",
  "aubergine": "Aubergine",
  "pink": "Pink", "dusky-pink": "Dusky Pink", "pastel-pink": "Pastel Pink",
  "rosa": "Rose",
  "bordeaux": "Burgundy", "burgund": "Burgundy", "burgundy": "Burgundy",
  "burgundy-light-grey": "Burgundy", "weinrot": "Wine Red",
  "peach": "Peach"
};

function mapColor(variantText) {
  if (!variantText) return '';
  // Farbe ist normalerweise der erste Teil vor dem "/"
  var colorPart = variantText.split('/')[0].trim();
  var lower = colorPart.toLowerCase().replace(/\s+/g, ' ');

  // Exakter Match
  if (FARBEN[lower]) return FARBEN[lower];

  // Match mit Bindestrichen als Leerzeichen
  var withSpaces = lower.replace(/-/g, ' ');
  if (FARBEN[withSpaces]) return FARBEN[withSpaces];

  // Partial match
  for (var key in FARBEN) {
    if (lower.includes(key) || key.includes(lower)) {
      return FARBEN[key];
    }
  }

  // Fallback: original zurückgeben (L-Shop Farbe direkt)
  return colorPart;
}

async function mapProductsToLShop(lineItems) {
  return lineItems.map(function(item) {
    var title = (item.title || '').toLowerCase();
    var variant = (item.variant_title || '');

    for (var i = 0; i < products.produkte.length; i++) {
      var p = products.produkte[i];
      var match = (p.shopify_keywords || []).some(function(kw) {
        return title.includes(kw);
      });
      if (!match) continue;

      // Farbe bestimmen
      var farbe = mapColor(variant);

      // Größe bestimmen
      var groesse = 'M';
      var sizeMap = {
        '2XL': 'XXL', '3XL': '3XL', '4XL': '4XL', '5XL': '5XL',
        'XXXL': '3XL', 'XXXXL': '4XL', 'XXXXXL': '5XL'
      };
      var m = (variant || '').match(/\b(XS|S|M|L|2XL|3XL|4XL|5XL|XL|XXL|XXXL|XXXXL|XXXXXL)\b/i);
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
    return { shopify_title: item.title, error: 'Nicht gefunden', quantity: item.quantity };
  });
}

module.exports = { mapProductsToLShop };
