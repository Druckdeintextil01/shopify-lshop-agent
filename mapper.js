const products = require('./config/products.json');

// Vollständiges Mapping: Shopify Farbe -> L-Shop / Build Your Brand Farbe
var FARBEN = {
  // === SCHWARZ / GRAU ===
  "schwarz": "Black",
  "black": "Black",
  "black-carbon": "Black",
  "black-fuchsia": "Black",
  "black-light-grey": "Black",
  "black-lime-green": "Black",
  "black-orange": "Black",
  "black-red": "Black",
  "black-surf-blue": "Black",
  "black-white": "Black",
  "black-yellow": "Black",
  "carbon-black": "Black",
  "carbon": "Carbon",
  "magnet": "Magnet",
  "graphite-grey-black": "Graphite Grey",
  "graphite-grey": "Graphite Grey",
  "dark-grey": "Dark Grey",
  "dunkel grau": "Dark Grey",
  "dark-melange": "Dark Melange",
  "dusty-grey": "Dusty Grey",
  "grau": "Heather Grey",
  "grey": "Heather Grey",
  "heather-grey": "Heather Grey",
  "light-grey": "Light Grey",
  "light-melange": "Light Melange",
  "dark shadow": "Dark Shadow",
  "dark-shadow": "Dark Shadow",

  // === WEISS ===
  "weiß": "White",
  "weiss": "White",
  "white": "White",
  "white-carbon": "White",

  // === ROT / ORANGE ===
  "rot": "Red",
  "red": "Red",
  "red-white": "Red",
  "city-red": "City Red",
  "city red": "City Red",
  "dark-orange": "Dark Orange",
  "fluorescent-orange": "Fluorescent Orange",
  "orange": "Orange",
  "weinrot": "Wine Red",
  "burgundy": "Burgundy",
  "burgund": "Burgundy",
  "bordeaux": "Burgundy",
  "burgundy-light-grey": "Burgundy",
  "aubergine": "Aubergine",

  // === GELB ===
  "gelb": "Yellow",
  "yellow": "Yellow",
  "acid-yellow": "Acid Yellow",
  "fluorescent-yellow": "Fluorescent Yellow",
  "gold": "Gold",
  "gold-yellow": "Gold Yellow",
  "light-yellow": "Light Yellow",
  "taxi-yellow": "Taxi Yellow",
  "taxi yellow": "Taxi Yellow",
  "frozen-yellow": "Frozen Yellow",
  "frozen yellow": "Frozen Yellow",

  // === BLAU ===
  "navy": "Navy",
  "dunkel blau": "Navy",
  "marineblau": "Navy",
  "french-navy": "French Navy",
  "frnech-navy-white": "French Navy",
  "oxford-navy": "Oxford Navy",
  "royal-navy": "Navy",
  "dark-royal": "Dark Royal",
  "blau": "Royal Blue",
  "blue": "Royal Blue",
  "royal": "Royal Blue",
  "bright-royal": "Bright Royal",
  "bright-royal-white": "Bright Royal",
  "cobalt-blue": "Cobalt Blue",
  "cobalt blue": "Cobalt Blue",
  "dusty-blue": "Dusty Blue",
  "light-blue": "Light Blue",
  "pacific": "Pacific Blue",
  "baby blau": "Baby Blue",
  "babyblau": "Baby Blue",
  "airforce": "Airforce Blue",
  "carolina": "Carolina Blue",
  "ocean-blue": "Ocean Blue",
  "ocean blue": "Ocean Blue",
  "horizon-blue": "Horizon Blue",
  "horizon blue": "Horizon Blue",
  "beryl-blue": "Beryl Blue",
  "beryl blue": "Beryl Blue",
  "auqa": "Aqua",
  "turquoise": "Turquoise",
  "mint": "Mint",
  "neo-mint": "Neo Mint",
  "neo mint": "Neo Mint",

  // === GRÜN ===
  "gruen": "Bottle Green",
  "green": "Bottle Green",
  "bottle-green": "Bottle Green",
  "bottle green": "Bottle Green",
  "dark-green": "Dark Green",
  "dusty-green": "Dusty Green",
  "fern-green": "Fern Green",
  "irish-green": "Irish Green",
  "kelly-green": "Kelly Green",
  "lime-green": "Lime Green",
  "military-green": "Military Green",
  "olive": "Olive",
  "olive-green": "Olive Green",
  "olive-green-black": "Olive Green",
  "pure-green-white": "Pure Green",
  "forest-green": "Forest Green",
  "forest green": "Forest Green",
  "lime-punch-235": "Lime Punch 235",
  "lime punch 235": "Lime Punch 235",

  // === BEIGE / BRAUN ===
  "beige": "Beige",
  "biscuit": "Biscuit",
  "natural-stone": "Natural Stone",
  "oatmeal": "Oatmeal",
  "sand": "Sand",
  "stone": "Stone",
  "stone-black": "Stone",
  "walnut": "Walnut",
  "braun": "Brown",
  "brown": "Brown",
  "chocolate-caramel": "Chocolate",
  "schoko": "Chocolate",
  "bark": "Bark",
  "u. beige": "U. Beige",
  "union-beige": "U. Beige",
  "union beige": "U. Beige",

  // === PINK / LILA ===
  "lila": "Lilac",
  "lila-1": "Lilac",
  "lilac": "Lilac",
  "purple": "Purple",
  "ultraviolet": "Ultraviolett",
  "pink": "Pink",
  "rosa": "Rose",
  "dusky-pink": "Dusky Pink",
  "pastel-pink": "Pastel Pink",
  "hibiskus-pink": "Hibiskus Pink",
  "hibiskus pink": "Hibiskus Pink",
  "pink-marshmallow": "Pink Marshmallow",
  "pink marshmallow": "Pink Marshmallow",
  "peach": "Peach",

  // === SONSTIGE ===
  "light-asphalt": "Light Asphalt",
  "light asphalt": "Light Asphalt"
};

function mapColor(variantText) {
  if (!variantText) return '';
  // Farbe ist normalerweise der erste Teil vor dem "/"
  var colorPart = variantText.split('/')[0].trim();
  var lower = colorPart.toLowerCase().replace(/\s+/g, ' ');

  // 1. Exakter Match
  if (FARBEN[lower]) return FARBEN[lower];

  // 2. Mit Bindestrichen als Leerzeichen
  var withSpaces = lower.replace(/-/g, ' ');
  if (FARBEN[withSpaces]) return FARBEN[withSpaces];

  // 3. Partial match (nur bei kurzen Schlüsseln)
  for (var key in FARBEN) {
    if (key.length > 3 && (lower === key || lower.includes(key) || key.includes(lower))) {
      return FARBEN[key];
    }
  }

  // 4. Fallback: original zurückgeben
  console.log('Farbe nicht gemappt, nutze Original: ' + colorPart);
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

      var farbe = mapColor(variant);

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
