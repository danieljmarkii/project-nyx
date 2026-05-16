#!/usr/bin/env node
// OPFF coverage spike — grocery-aisle weighted.
// Run from repo root:  node scripts/opff-coverage-spike.mjs
// Outputs: scripts/opff-coverage-results.csv  +  console summary.
//
// Rubric (agreed with Dr. Chen + Data Scientist):
//   0 — not found
//   1 — brand + product name only
//   2 — + format derivable (wet/dry/treat) from categories_tags
//   3 — + ordered, tokenizable ingredient list  ← PASS LINE
//   4 — + multi-language ingredients OR AAFCO/nutritional adequacy statement
//
// Pass/fail for the source:
//   ≥80% of mainstream grocery rows ≥3  → ship OPFF as seed
//   60–79%                              → OPFF + hand-fill top misses
//   <60%                                → walk away, hand-curate top 200

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'opff-coverage-results.csv');
const API = 'https://world.openpetfoodfacts.org/api/v2/search';
const UA = 'nyx-mvp-coverage-spike/0.1 (research; contact: pm@projectnyx.app)';

// Segment weights matter for the final go/no-go.
const SKUS = [
  // ── Cat wet — grocery aisle staples ─────────────────────────────
  ['Fancy Feast Classic Pate Chicken Feast',     'cat-wet-grocery'],
  ['Fancy Feast Classic Pate Turkey & Giblets',  'cat-wet-grocery'],
  ['Fancy Feast Classic Pate Tender Beef',       'cat-wet-grocery'],
  ['Fancy Feast Classic Pate Savory Salmon',     'cat-wet-grocery'],
  ['Fancy Feast Classic Pate Ocean Whitefish',   'cat-wet-grocery'],
  ['Fancy Feast Gravy Lovers Chicken',           'cat-wet-grocery'],
  ['Fancy Feast Chunky Chicken',                 'cat-wet-grocery'],
  ['Fancy Feast Medleys White Meat Chicken',     'cat-wet-grocery'],
  ['Fancy Feast Flaked Fish & Shrimp',           'cat-wet-grocery'],
  ['Friskies Pate Mariners Catch',               'cat-wet-grocery'],
  ['Friskies Pate Country Style Dinner',         'cat-wet-grocery'],
  ['Friskies Pate Mixed Grill',                  'cat-wet-grocery'],
  ['Friskies Pate Salmon Dinner',                'cat-wet-grocery'],
  ['Friskies Shreds with Chicken in Gravy',      'cat-wet-grocery'],
  ['Friskies Prime Filets Chicken & Tuna',       'cat-wet-grocery'],
  ['9Lives Tuna & Egg Pate',                     'cat-wet-grocery'],
  ['9Lives Chicken & Tuna Pate',                 'cat-wet-grocery'],
  ['Meow Mix Tender Favorites Chicken',          'cat-wet-grocery'],
  ['Sheba Perfect Portions Cuts in Gravy Chicken', 'cat-wet-grocery'],

  // ── Cat dry — grocery aisle ─────────────────────────────────────
  ['Friskies Surfin and Turfin Favorites',       'cat-dry-grocery'],
  ['Friskies Seafood Sensations',                'cat-dry-grocery'],
  ['Friskies Indoor Delights',                   'cat-dry-grocery'],
  ['9Lives Daily Essentials',                    'cat-dry-grocery'],
  ['9Lives Indoor Complete',                     'cat-dry-grocery'],
  ['Meow Mix Original Choice',                   'cat-dry-grocery'],
  ['Meow Mix Tender Centers',                    'cat-dry-grocery'],
  ['Purina ONE Tender Selects Chicken',          'cat-dry-grocery'],
  ['Purina ONE Indoor Advantage',                'cat-dry-grocery'],
  ['Purina ONE Sensitive Skin & Stomach',        'cat-dry-grocery'],
  ['Purina Cat Chow Complete',                   'cat-dry-grocery'],
  ['Purina Cat Chow Indoor',                     'cat-dry-grocery'],
  ['Iams ProActive Health Indoor Weight & Hairball', 'cat-dry-grocery'],
  ['Special Kitty Original Cat Food',            'cat-dry-grocery'],

  // ── Dog wet — grocery aisle ─────────────────────────────────────
  ['Pedigree Chopped Ground Dinner Beef',        'dog-wet-grocery'],
  ['Pedigree Choice Cuts in Gravy Country Stew', 'dog-wet-grocery'],
  ['Cesar Classics Filet Mignon',                'dog-wet-grocery'],
  ['Cesar Filets in Sauce Beef',                 'dog-wet-grocery'],
  ['Purina ONE SmartBlend Tender Cuts Chicken',  'dog-wet-grocery'],
  ['Beneful Chopped Blends Beef',                'dog-wet-grocery'],
  ['Alpo Chop House Originals',                  'dog-wet-grocery'],

  // ── Dog dry — grocery aisle ─────────────────────────────────────
  ['Pedigree Adult Complete Nutrition Roasted Chicken Rice & Vegetable', 'dog-dry-grocery'],
  ['Purina ONE SmartBlend Chicken & Rice',       'dog-dry-grocery'],
  ['Purina ONE SmartBlend Lamb & Rice',          'dog-dry-grocery'],
  ['Purina Dog Chow Complete Adult',             'dog-dry-grocery'],
  ['Beneful Originals with Real Beef',           'dog-dry-grocery'],
  ['Beneful IncrediBites Real Beef',             'dog-dry-grocery'],
  ['Iams ProActive Health Adult MiniChunks',     'dog-dry-grocery'],
  ['Kibbles n Bits Original Savory Beef & Chicken', 'dog-dry-grocery'],
  ['Ol Roy Complete Nutrition Adult Dog Food',   'dog-dry-grocery'],
  ['Rachael Ray Nutrish Real Chicken & Veggies', 'dog-dry-grocery'],

  // ── Treats — checkout shelf ─────────────────────────────────────
  ['Temptations Classic Tasty Chicken',          'treat-grocery'],
  ['Temptations Seafood Medley',                 'treat-grocery'],
  ['Friskies Party Mix Original Crunch',         'treat-grocery'],
  ['Greenies Feline Dental Treats',              'treat-grocery'],
  ['Greenies Original Dental Dog Treats',        'treat-grocery'],
  ['Milk-Bone Original Biscuits',                'treat-grocery'],
  ['Milk-Bone Soft & Chewy',                     'treat-grocery'],
  ['Pup-Peroni Original Beef',                   'treat-grocery'],
  ['Beggin Strips Original Bacon',               'treat-grocery'],

  // ── Prescription — smaller subset ───────────────────────────────
  ['Royal Canin Gastrointestinal HP',            'rx'],
  ['Royal Canin Hydrolyzed Protein HP',          'rx'],
  ['Hills Prescription Diet i/d',                'rx'],
  ['Hills Prescription Diet z/d',                'rx'],
  ['Purina Pro Plan Veterinary HA Hydrolyzed',   'rx'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function deriveFormat(categoriesTags = []) {
  const t = categoriesTags.join(' ').toLowerCase();
  if (/treat|biscuit|chew/.test(t)) return 'treat';
  if (/wet|pate|gravy|canned|pouch/.test(t)) return 'wet';
  if (/dry|kibble/.test(t)) return 'dry';
  return null;
}

function ingredientsAreOrderedList(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (clean.length < 8) return false;
  // Heuristic: ≥3 comma-separated tokens, first token short (an ingredient name not a paragraph)
  const tokens = clean.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (tokens.length < 3) return false;
  if (tokens[0].length > 40) return false; // freeform paragraph, not a list
  return true;
}

function multiProtein(text) {
  if (!text) return false;
  const proteins = ['chicken', 'beef', 'lamb', 'turkey', 'salmon', 'tuna', 'duck', 'pork', 'fish', 'whitefish'];
  const head = text.toLowerCase().split(/[,;]/).slice(0, 3).join(' ');
  const hits = new Set();
  for (const p of proteins) if (head.includes(p)) hits.add(p);
  return hits.size >= 2;
}

function hasAafcoOrMultilang(product) {
  const blob = [
    product.nutrition_data_per,
    product.nutriments?.text,
    product.generic_name,
    product.generic_name_en,
    product.ingredients_text_en,
    product.ingredients_text_fr,
    product.ingredients_text_de,
    product.ingredients_text_es,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/aafco|nutritional adequacy|complete and balanced/.test(blob)) return true;
  const langCount = ['en','fr','de','es','it','nl'].filter(
    (l) => (product[`ingredients_text_${l}`] || '').trim().length > 10
  ).length;
  return langCount >= 2;
}

async function searchOne(query) {
  const params = new URLSearchParams({
    search_terms: query,
    fields: [
      'code','product_name','brands','categories_tags','countries_tags',
      'ingredients_text','ingredients_text_en','ingredients_text_fr',
      'ingredients_text_de','ingredients_text_es','ingredients_text_it','ingredients_text_nl',
      'generic_name','last_modified_t','completeness'
    ].join(','),
    page_size: '5',
    json: '1',
  });
  const url = `${API}?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for "${query}"`);
  const json = await res.json();
  return json.products || [];
}

function scoreProduct(product) {
  if (!product) return { score: 0, notes: ['not_found'] };
  const notes = [];
  const name = product.product_name || '';
  const brand = product.brands || '';
  if (!name && !brand) return { score: 0, notes: ['empty_row'] };

  let score = 1;
  const format = deriveFormat(product.categories_tags);
  if (format) { score = 2; notes.push(`format=${format}`); }

  const ing = product.ingredients_text_en || product.ingredients_text || '';
  if (ingredientsAreOrderedList(ing)) {
    score = 3;
    if (multiProtein(ing)) notes.push('multi_protein');
    if (hasAafcoOrMultilang(product)) score = 4;
  } else if (ing) {
    notes.push('ingredients_unparseable');
  }

  if (product.last_modified_t) {
    const ageDays = (Date.now() / 1000 - product.last_modified_t) / 86400;
    if (ageDays > 730) notes.push(`stale_${Math.round(ageDays)}d`);
  }
  const us = (product.countries_tags || []).some((t) => /united-states|en:us/.test(t));
  if (us) notes.push('us');

  return { score, notes };
}

async function main() {
  console.log(`Querying OPFF for ${SKUS.length} grocery-weighted SKUs…\n`);
  const rows = [['query','segment','score','match_brand','match_name','code','notes']];
  const bySegment = {};

  for (const [query, segment] of SKUS) {
    bySegment[segment] ??= { total: 0, pass: 0, scores: [] };
    bySegment[segment].total++;
    let row = [query, segment, 0, '', '', '', 'not_found'];
    try {
      const products = await searchOne(query);
      // Pick the highest-scoring of the top 5 hits (best plausible match).
      let best = null, bestScored = { score: 0, notes: ['not_found'] };
      for (const p of products) {
        const s = scoreProduct(p);
        if (s.score > bestScored.score) { bestScored = s; best = p; }
      }
      if (best) {
        row = [
          query, segment, bestScored.score,
          (best.brands || '').split(',')[0].trim(),
          best.product_name || '',
          best.code || '',
          bestScored.notes.join('|'),
        ];
      }
      bySegment[segment].scores.push(bestScored.score);
      if (bestScored.score >= 3) bySegment[segment].pass++;
      const flag = bestScored.score >= 3 ? '✓' : bestScored.score === 0 ? '✗' : '~';
      console.log(`${flag} [${bestScored.score}] ${query}  →  ${row[3]} / ${row[4]}`);
    } catch (err) {
      console.error(`  ! error on "${query}": ${err.message}`);
      row = [query, segment, 'ERR', '', '', '', err.message];
    }
    rows.push(row);
    await sleep(250); // be polite to the public API
  }

  // CSV out
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  writeFileSync(OUT, csv);

  // Summary
  console.log('\n──────── SEGMENT SUMMARY ────────');
  let totalAll = 0, passAll = 0;
  const mainstreamSegments = Object.keys(bySegment).filter((s) => s !== 'rx');
  let mainTotal = 0, mainPass = 0;
  for (const seg of Object.keys(bySegment).sort()) {
    const s = bySegment[seg];
    const pct = ((s.pass / s.total) * 100).toFixed(0);
    console.log(`${seg.padEnd(20)}  ${s.pass}/${s.total}  (${pct}% ≥3)`);
    totalAll += s.total; passAll += s.pass;
    if (seg !== 'rx') { mainTotal += s.total; mainPass += s.pass; }
  }
  const mainPct = ((mainPass / mainTotal) * 100).toFixed(0);
  console.log('─────────────────────────────────');
  console.log(`MAINSTREAM (grocery only)  ${mainPass}/${mainTotal}  (${mainPct}% ≥3)  ← decision metric`);
  console.log(`ALL (incl. rx)             ${passAll}/${totalAll}  (${((passAll/totalAll)*100).toFixed(0)}% ≥3)`);
  console.log(`\nCSV written → ${OUT}`);
  console.log('\nDecision rule:');
  console.log('  ≥80% mainstream  → ship OPFF as seed');
  console.log('  60–79%           → OPFF + hand-fill top misses');
  console.log('  <60%             → walk away from OPFF');
}

main().catch((e) => { console.error(e); process.exit(1); });
