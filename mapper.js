const Anthropic = require('@anthropic-ai/sdk');
const products = require('./config/products.json');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function mapProductsToLShop(lineItems) {
  const mappedItems = [];
  for (const item of lineItems) {
    const directMatch = tryDirectMapping(item);
    if (directMatch) { mappedItems.push(directMatch); continue; }
    const aiMatch = await mapWithAI(item);
    mappedItems.push(aiMatch || { shopify_title: item.title, error: 'Nicht gefunden', quantity: item.quantity });
  }
  return mappedItems;
}

function tryDirectMapping(item) {
  const title = (item.title || '').toLowerCase();
  const variant = (item.variant_title || '').toLowerCase();
  for (const product of products.produkte) {
    if (!(product.shopify_keywords || []).some(kw => title.includes(kw))) continue;
    return {
      shopify_title: item.title,
      lshop_artikel: product.lshop_artikel,
      lshop_name: product.lshop_name,
      farbe_lshop: extractColor(variant, product.farben_mapping),
      groesse: extractSize(variant),
      quantity: item.quantity,
      mapped_by: 'config'
    };
  }
  return null;
}

async function mapWithAI(item) {
  const productList = products.produkte.map(p =>
    `- Artikelnummer: ${p.lshop_artikel}, Name: ${p.lshop_name}, Keywords: ${p.shopify_keywords.join(', ')}`
  ).join('\n');
  const prompt = `Du bist Assistent für ein Textildruck-Unternehmen. Ordne diesen Shopify-Artikel einem L-Shop Artikel zu.
Shopify: ${item.title} | Variante: ${item.variant_title || 'ke
