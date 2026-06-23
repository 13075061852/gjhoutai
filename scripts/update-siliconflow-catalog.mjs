import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MODELS_URL = 'https://siliconflow.cn/models';
const PRICING_URL = 'https://siliconflow.cn/pricing';
const OUTPUT_PATH = path.resolve('src/legacy/data/siliconflow-model-catalog.ts');

const decodeEscapedText = (value) => {
  let text = String(value || '');
  for (let i = 0; i < 3; i += 1) {
    text = text
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\\\/g, '\\');
  }
  return text;
};

const extractScalar = (text, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stringMatch = text.match(new RegExp(`"${escaped}"\\s*:\\s*"([^"]*)"`, 'i'));
  if (stringMatch) return stringMatch[1];
  const numberMatch = text.match(new RegExp(`"${escaped}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
  if (numberMatch) return numberMatch[1];
  const boolMatch = text.match(new RegExp(`"${escaped}"\\s*:\\s*(true|false)`, 'i'));
  if (boolMatch) return boolMatch[1];
  return '';
};

const extractPricing = (text) => {
  const pricing = [];
  const match = text.match(/"pricing"\s*:\s*\[([\s\S]*?)\](?:\s*,\s*"|})/i);
  if (!match) return pricing;
  const pricingText = match[1];
  const itemMatches = pricingText.matchAll(/\{([\s\S]*?)\}/g);
  for (const itemMatch of itemMatches) {
    const itemText = itemMatch[1];
    const price = extractScalar(itemText, 'price');
    const specification = extractScalar(itemText, 'specification');
    const unitOfGood = extractScalar(itemText, 'unitOfGood');
    if (price || specification || unitOfGood) {
      pricing.push({ price, specification, unitOfGood });
    }
  }
  return pricing;
};

const normalizePrice = (value) => {
  const amount = Number.parseFloat(String(value || '').replace(/[,￥¥]/g, '').trim());
  return Number.isFinite(amount) ? amount : null;
};

const decodeHtmlEntities = (value) => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#x2F;/g, '/')
  .replace(/&#x27;/g, "'");

const pickPrice = (pricing, specification) => {
  const item = pricing.find((entry) => String(entry.specification || '').toLowerCase() === specification);
  return normalizePrice(item?.price);
};

const findModelBlocks = (text) => {
  const blocks = [];
  const marker = '"modelName"';
  let cursor = 0;

  while (cursor < text.length) {
    const markerIndex = text.indexOf(marker, cursor);
    if (markerIndex < 0) break;

    const start = text.lastIndexOf('{', markerIndex);
    const nextMarker = text.indexOf(marker, markerIndex + marker.length);
    const searchEnd = nextMarker < 0 ? Math.min(text.length, markerIndex + 20000) : nextMarker;
    let end = text.lastIndexOf('}', searchEnd);
    if (start >= 0 && end > start) {
      const block = text.slice(start, end + 1);
      if (block.includes('"contextLen"') || block.includes('"pricing"') || block.includes('"inputPrice"')) {
        blocks.push(block);
      }
    }

    cursor = markerIndex + marker.length;
  }

  return blocks;
};

const normalizeModel = (block) => {
  const id = extractScalar(block, 'modelName');
  if (!id || !id.includes('/')) return null;

  const pricing = extractPricing(block);
  const inputPrice = normalizePrice(extractScalar(block, 'inputPrice')) ?? pickPrice(pricing, 'prompt');
  const outputPrice = normalizePrice(extractScalar(block, 'outputPrice'))
    ?? normalizePrice(extractScalar(block, 'price'))
    ?? pickPrice(pricing, 'completion');
  const cachedInputPrice = pickPrice(pricing, 'cached-input');
  const contextLength = Number.parseInt(extractScalar(block, 'contextLen'), 10);

  return {
    id,
    name: extractScalar(block, 'DisplayName') || id,
    provider: extractScalar(block, 'mf'),
    targetModelName: extractScalar(block, 'targetModelName'),
    type: extractScalar(block, 'type'),
    subType: extractScalar(block, 'subType'),
    contextLength: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : null,
    inputCnyPerMillion: inputPrice,
    outputCnyPerMillion: outputPrice,
    cachedInputCnyPerMillion: cachedInputPrice,
  };
};

const extractPricingCenterRows = (html) => {
  const rows = new Map();
  const titlePattern = /title="([^"]+\/[^"]+)"/g;
  let match;

  while ((match = titlePattern.exec(html))) {
    const id = decodeHtmlEntities(match[1]);
    const window = html.slice(match.index, match.index + 2600);
    const priceMatches = [...window.matchAll(/¥\s*([0-9]+(?:\.[0-9]+)?)/g)].map((item) => normalizePrice(item[1]));
    const prices = priceMatches.filter((value) => value != null).slice(0, 3);
    if (prices.length >= 2 && !rows.has(id)) {
      rows.set(id, {
        inputCnyPerMillion: prices[0],
        outputCnyPerMillion: prices[1],
        cachedInputCnyPerMillion: prices[2] ?? null,
      });
    }
  }

  return rows;
};

const applyPricingCenter = (models, pricingRows) => models.map((model) => {
  const row = pricingRows.get(model.id) || pricingRows.get(model.targetModelName);
  if (!row) return model;
  return {
    ...model,
    inputCnyPerMillion: row.inputCnyPerMillion ?? model.inputCnyPerMillion,
    outputCnyPerMillion: row.outputCnyPerMillion ?? model.outputCnyPerMillion,
    cachedInputCnyPerMillion: row.cachedInputCnyPerMillion ?? model.cachedInputCnyPerMillion,
  };
});

const dedupeModels = (models) => {
  const map = new Map();
  for (const model of models) {
    const current = map.get(model.id);
    if (!current || (!current.inputCnyPerMillion && model.inputCnyPerMillion != null)) {
      map.set(model.id, model);
    }
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
};

const renderValue = (value) => value == null || value === '' ? 'undefined' : JSON.stringify(value);

const renderCatalog = (models) => `// Generated by scripts/update-siliconflow-catalog.mjs from ${MODELS_URL} and ${PRICING_URL}
// Do not edit individual model prices by hand. Re-run the script to refresh official data.

export const SILICONFLOW_MODEL_CATALOG = [
${models.map((model) => `  {
    id: ${JSON.stringify(model.id)},
    name: ${JSON.stringify(model.name)},
    provider: ${renderValue(model.provider)},
    targetModelName: ${renderValue(model.targetModelName)},
    type: ${renderValue(model.type)},
    subType: ${renderValue(model.subType)},
    contextLength: ${renderValue(model.contextLength)},
    pricing: {
      inputCnyPerMillion: ${renderValue(model.inputCnyPerMillion)},
      outputCnyPerMillion: ${renderValue(model.outputCnyPerMillion)},
      cachedInputCnyPerMillion: ${renderValue(model.cachedInputCnyPerMillion)},
    },
  }`).join(',\n')},
] as const;
`;

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (compatible; gjhoutai catalog updater)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  return response.text();
};

const html = await fetchText(MODELS_URL);
const pricingHtml = await fetchText(PRICING_URL);

const decoded = decodeEscapedText(html);
const models = dedupeModels(applyPricingCenter(
  findModelBlocks(decoded).map(normalizeModel).filter(Boolean),
  extractPricingCenterRows(pricingHtml),
));

if (models.length < 20) {
  throw new Error(`Only extracted ${models.length} SiliconFlow models; page structure may have changed.`);
}

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, renderCatalog(models), 'utf8');

console.log(`Wrote ${models.length} SiliconFlow models to ${OUTPUT_PATH}`);
