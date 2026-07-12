#!/usr/bin/env node
// Nyx/Culprit — 48-month cohort financial model (seed-stage VC prep, 2026-07-12)
// Companion to docs/nyx-financial-model-v1_0.md. Every parameter below is either
// sourced in that doc's Assumptions Register or tagged ASSUMPTION there.
// Run: node docs/financial-model/model.mjs   (writes cohorts-<scenario>.csv next to itself
// and prints the markdown summary tables embedded in the model doc)

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const MONTHS = 48;

// ---------------------------------------------------------------------------
// Scenario definitions. Each scenario is a coherent worldview, not ±20% on
// everything — see the model doc §5 for the story each one tells.
// ---------------------------------------------------------------------------

export const SCENARIOS = {
  bootstrap: {
    label: 'Bootstrap (solo founder — the operating plan)',
    launchMonth: 3,
    price: 4.99,
    annualPrice: 39.99,
    annualMix: 0.30,
    // Founder-led organic only: ASO + founder content (Reddit/TikTok/SEO), no spend
    organicStart: 400, organicGrowth: 0.06, organicCap: 12000,
    // Paid social is dead at this price point (LTV:CAC ~0.25) — $0 in every scenario
    paidSpend: () => 0,
    cpi: 2.5, // retained only for the CAC math in the doc; spend is zero
    // Vet channel starts with the founder's own GP (the Step-9 real-vet loop
    // already in flight), grows clinic-by-clinic on artifact quality
    vetStartOffset: 6,
    clinicSeed: 2, clinicGrowth: 0.12, clinicCap: 200,
    downloadsPerClinic: 25,
    activation: { organic: 0.40, paid: 0.28, vet: 0.55 },
    retention: { m1: 0.50, floor: 0.10, k: 0.35 },
    vetRetentionBonus: { m1: 0.08, floor: 0.05 },
    convEventual: 0.045, vetConvMult: 1.25,
    paidChurnMonthly: 0.05,
    cogsPerMAU: 0.11, onboardingBurst: 0.12, fixedInfra: 150,
    // No payroll: founder pay IS the profit line. Cash costs only.
    hires: [],
    tooling: (m) => (m < 13 ? 500 : 700), // Claude Code + Supabase + EAS + Apple + domain
    content: () => 0,                      // founder time, not spend
    miscMonthly: 150,                      // accounting/legal minimum
    // Clinics reprint a PDF QR insert themselves; occasional mailed kit only
    vetMaterialsPerClinic: 5,
  },

  conservative: {
    label: 'Funded-scale: Conservative',
    launchMonth: 6,            // App Store launch slips ~2 quarters past raise close
    price: 4.99,
    annualPrice: 39.99,
    annualMix: 0.20,           // share of subscribers on the annual plan
    // Organic (ASO + word of mouth + content)
    organicStart: 800, organicGrowth: 0.05, organicCap: 8000,
    // Paid social: $0 — structurally underwater at this price (doc §5); cpi kept for the CAC math only
    paidSpend: () => 0,
    cpi: 3.5,
    // Vet passive channel (QR on discharge sheets)
    vetStartOffset: 14,        // months after launch before first clinics distribute
    clinicSeed: 5, clinicGrowth: 0.12, clinicCap: 250,
    downloadsPerClinic: 18,
    // Funnel
    activation: { organic: 0.35, paid: 0.25, vet: 0.50 },
    // Retention of ACTIVATED users: r(m) = floor + (m1 - floor) * exp(-k*(m-1))
    retention: { m1: 0.42, floor: 0.06, k: 0.40 },
    vetRetentionBonus: { m1: 0.06, floor: 0.04 },
    // Free -> paid: eventual share of ACTIVATED cohort that ever converts
    convEventual: 0.025, vetConvMult: 1.25,
    paidChurnMonthly: 0.065,   // blended monthly+annual effective churn
    // COGS
    cogsPerMAU: 0.18, onboardingBurst: 0.15, fixedInfra: 400,
    // Opex
    hires: [
      { m: 1, cost: 22000, label: '2 founders' },
      { m: 9, cost: 15000, label: 'senior eng' },
      { m: 21, cost: 12000, label: 'growth' },
    ],
    tooling: (m) => (m < 13 ? 3000 : 4000),
    content: (m, launch) => (m >= launch ? 1500 : 0),
    vetMaterialsPerClinic: 25,
  },

  base: {
    label: 'Funded-scale: Base',
    launchMonth: 4,
    price: 4.99,
    annualPrice: 39.99,
    annualMix: 0.30,
    organicStart: 1500, organicGrowth: 0.08, organicCap: 30000,
    paidSpend: () => 0, // dead channel — see doc §5
    cpi: 2.5,
    vetStartOffset: 9,
    clinicSeed: 5, clinicGrowth: 0.20, clinicCap: 1000,
    downloadsPerClinic: 30,
    activation: { organic: 0.40, paid: 0.28, vet: 0.55 },
    retention: { m1: 0.50, floor: 0.10, k: 0.35 },
    vetRetentionBonus: { m1: 0.08, floor: 0.05 },
    convEventual: 0.045, vetConvMult: 1.25,
    paidChurnMonthly: 0.05,
    cogsPerMAU: 0.11, onboardingBurst: 0.12, fixedInfra: 400,
    hires: [
      { m: 1, cost: 22000, label: '2 founders' },
      { m: 4, cost: 6000, label: 'design (contract)' },
      { m: 7, cost: 15000, label: 'senior eng' },
      { m: 13, cost: 12000, label: 'growth' },
      { m: 19, cost: 15000, label: 'eng #2' },
      { m: 25, cost: 8000, label: 'support/ops' },
      { m: 31, cost: 15000, label: 'eng #3' },
    ],
    tooling: (m) => (m < 13 ? 4000 : m < 25 ? 6000 : 8000),
    content: (m, launch) => (m >= launch ? (m < 13 ? 2000 : 4000) : 0),
    vetMaterialsPerClinic: 25,
  },

  upside: {
    label: 'Funded-scale: Upside',
    launchMonth: 3,
    price: 4.99,
    annualPrice: 39.99,
    annualMix: 0.35,
    organicStart: 2500, organicGrowth: 0.10, organicCap: 60000,
    paidSpend: () => 0, // dead channel — see doc §5
    cpi: 2.2,
    vetStartOffset: 6,
    clinicSeed: 8, clinicGrowth: 0.25, clinicCap: 2500,
    downloadsPerClinic: 40,
    activation: { organic: 0.45, paid: 0.32, vet: 0.60 },
    retention: { m1: 0.58, floor: 0.16, k: 0.30 },
    vetRetentionBonus: { m1: 0.06, floor: 0.05 },
    convEventual: 0.065, vetConvMult: 1.25,
    paidChurnMonthly: 0.04,
    cogsPerMAU: 0.07, onboardingBurst: 0.10, fixedInfra: 400,
    hires: [
      { m: 1, cost: 22000, label: '2 founders' },
      { m: 3, cost: 6000, label: 'design (contract)' },
      { m: 5, cost: 15000, label: 'senior eng' },
      { m: 10, cost: 12000, label: 'growth' },
      { m: 14, cost: 15000, label: 'eng #2' },
      { m: 18, cost: 8000, label: 'support/ops' },
      { m: 22, cost: 15000, label: 'eng #3' },
      { m: 30, cost: 14000, label: 'vet-channel lead' },
    ],
    tooling: (m) => (m < 13 ? 4000 : m < 25 ? 7000 : 10000),
    content: (m, launch) => (m >= launch ? (m < 13 ? 3000 : 6000) : 0),
    vetMaterialsPerClinic: 25,
  },
};

// Conversion realization curve: cumulative share of a cohort's EVENTUAL converts
// realized by month-of-life. Anchored to "converts after seeing value" — first
// Signal / first vet report — not at install (B-265 placement question).
const CONV_CURVE = [0, 0.25, 0.55, 0.75, 0.9, 0.97, 1.0]; // index = months since activation

function convRealized(age) {
  if (age <= 0) return 0;
  if (age >= CONV_CURVE.length - 1) return 1;
  return CONV_CURVE[age];
}

function retentionAt(m, { m1, floor, k }) {
  if (m <= 0) return 0;
  return floor + (m1 - floor) * Math.exp(-k * (m - 1));
}

// ---------------------------------------------------------------------------
// Core simulation
// ---------------------------------------------------------------------------

export function simulate(p, months = MONTHS) {
  const rows = [];
  const cohorts = []; // { month, channel, activated, retention: {m1, floor, k}, convEventual }
  let payingStock = 0;
  let cumBurn = 0, minCash = 0, cumDownloads = 0, cumPaidSpend = 0, cumPaidSubsFromPaid = 0;
  const grossRevHistory = [];

  const blendedGrossARPU =
    (1 - p.annualMix) * p.price + p.annualMix * p.annualPrice / 12;

  for (let m = 1; m <= months; m++) {
    const launched = m >= p.launchMonth;
    const sinceLaunch = m - p.launchMonth; // 0 at launch month

    // --- Acquisition ---
    const organicDl = launched
      ? Math.min(p.organicCap, p.organicStart * Math.pow(1 + p.organicGrowth, sinceLaunch))
      : 0;
    const spend = launched ? p.paidSpend(m, p.launchMonth) : 0;
    const paidDl = spend / p.cpi;
    const vetStart = p.launchMonth + p.vetStartOffset;
    const clinics = m >= vetStart
      ? Math.min(p.clinicCap, p.clinicSeed * Math.pow(1 + p.clinicGrowth, m - vetStart))
      : 0;
    const vetDl = clinics * p.downloadsPerClinic;
    const downloads = organicDl + paidDl + vetDl;
    cumDownloads += downloads;
    cumPaidSpend += spend;

    // --- Activation -> cohorts ---
    const baseRet = p.retention;
    const vetRet = {
      m1: Math.min(0.85, baseRet.m1 + p.vetRetentionBonus.m1),
      floor: baseRet.floor + p.vetRetentionBonus.floor,
      k: baseRet.k,
    };
    const newCohorts = [
      { channel: 'organic', activated: organicDl * p.activation.organic, ret: baseRet, conv: p.convEventual },
      { channel: 'paid', activated: paidDl * p.activation.paid, ret: baseRet, conv: p.convEventual },
      { channel: 'vet', activated: vetDl * p.activation.vet, ret: vetRet, conv: p.convEventual * p.vetConvMult },
    ].filter((c) => c.activated > 0);
    for (const c of newCohorts) cohorts.push({ month: m, ...c });
    const activations = newCohorts.reduce((s, c) => s + c.activated, 0);

    // --- MAU (cohort retention) ---
    let mau = 0;
    for (const c of cohorts) mau += c.activated * retentionAt(m - c.month + 1, c.ret);

    // --- Paying subscribers ---
    // Conversion increments are gated by the cohort's retention at that age
    // (relative to month 1): only users still active can convert. This couples
    // the conversion assumption to the retention assumption — a cohort that
    // churns out fast also converts less, so `convEventual` is the ceiling
    // conditional on staying active, not a guaranteed harvest.
    let convAdds = 0;
    for (const c of cohorts) {
      const age = m - c.month; // months since activation month
      const activeGate = age >= 1 ? retentionAt(age, c.ret) / retentionAt(1, c.ret) : 0;
      const inc = c.activated * c.conv * (convRealized(age) - convRealized(age - 1)) * activeGate;
      convAdds += inc;
      if (c.channel === 'paid') cumPaidSubsFromPaid += inc;
    }
    payingStock = payingStock * (1 - p.paidChurnMonthly) + convAdds;

    // --- Revenue (App Store Small Business Program: 15% below $1M trailing-12
    //     gross, 30% above — simplification of the calendar-year rule) ---
    const grossRev = payingStock * blendedGrossARPU;
    grossRevHistory.push(grossRev);
    const trailing12 = grossRevHistory.slice(-12).reduce((a, b) => a + b, 0);
    const storeFee = trailing12 > 1_000_000 ? 0.30 : 0.15;
    const netRev = grossRev * (1 - storeFee);

    // --- COGS (free users carry real AI COGS — Pets > $ means the free tier
    //     is not zero-marginal-cost) ---
    const cogs = mau * p.cogsPerMAU + activations * p.onboardingBurst + p.fixedInfra;
    const grossProfit = netRev - cogs;

    // --- Opex ---
    const payroll = p.hires.filter((h) => h.m <= m).reduce((s, h) => s + h.cost, 0);
    const vetMaterials = clinics * p.vetMaterialsPerClinic;
    const marketing = spend + p.content(m, p.launchMonth) + vetMaterials;
    const opex = payroll + p.tooling(m) + marketing + (p.miscMonthly ?? 3000); // legal/accounting/misc
    const netBurn = grossProfit - opex; // negative = burning
    cumBurn += netBurn;
    minCash = Math.min(minCash, cumBurn);

    rows.push({
      m, downloads, organicDl, paidDl, vetDl, clinics, activations, mau,
      payingStock, convAdds, grossRev, storeFee, netRev, cogs, grossProfit,
      payroll, marketing, opex, netBurn, cumBurn,
      grossMarginPaid: netRev > 0 ? (netRev - (payingStock * p.cogsPerMAU)) / netRev : 0,
      blendedMargin: netRev > 0 ? grossProfit / netRev : -1,
      arrRunRate: grossRev * 12,
      netArrRunRate: netRev * 12,
      cumDownloads,
    });
  }

  return {
    rows,
    peakCumBurn: -minCash,
    cumPaidSpend,
    cumPaidSubsFromPaid,
    blendedGrossARPU,
    ltv(p_) {
      const netARPU = blendedGrossARPU * 0.85; // at small-business-program fee
      const marginalMargin = (netARPU - (p.cogsPerMAU)) / netARPU;
      return netARPU * marginalMargin * (1 / p.paidChurnMonthly);
    },
  };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const f0 = (n) => Math.round(n).toLocaleString('en-US');
const f$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
const fk = (n) => (Math.abs(n) >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(2) + 'M' : '$' + Math.round(n / 1000) + 'k');

function csv(rows) {
  const cols = ['m', 'downloads', 'organicDl', 'paidDl', 'vetDl', 'clinics', 'activations',
    'mau', 'payingStock', 'convAdds', 'grossRev', 'storeFee', 'netRev', 'cogs',
    'grossProfit', 'payroll', 'marketing', 'opex', 'netBurn', 'cumBurn', 'arrRunRate', 'cumDownloads'];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => (typeof r[c] === 'number' ? r[c].toFixed(2) : r[c])).join(','));
  return lines.join('\n') + '\n';
}

function summarize(name, p, sim) {
  const pick = (m) => sim.rows[m - 1];
  const marks = [12, 24, 36, 48].map(pick);
  console.log(`\n### ${p.label} scenario — key milestones\n`);
  console.log('| Month | Downloads/mo | Clinics | MAU | Paying subs | Gross MRR | ARR run-rate | Net burn/mo | Cum. burn |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of marks) {
    console.log(`| M${r.m} | ${f0(r.downloads)} | ${f0(r.clinics)} | ${f0(r.mau)} | ${f0(r.payingStock)} | ${f$(r.grossRev)} | ${fk(r.arrRunRate)} | ${fk(r.netBurn)} | ${fk(r.cumBurn)} |`);
  }
  console.log(`\nPeak out-of-pocket cash: ${fk(sim.peakCumBurn)} · Blended gross ARPU: $${sim.blendedGrossARPU.toFixed(2)} · LTV (paid sub): ${f$(sim.ltv(p))}`);
  // Breakeven: first month of sustained (3+ consecutive) positive net cash flow
  let be = null;
  for (let i = 0; i < sim.rows.length - 2; i++) {
    if (sim.rows[i].netBurn > 0 && sim.rows[i + 1].netBurn > 0 && sim.rows[i + 2].netBurn > 0) { be = sim.rows[i].m; break; }
  }
  const m48 = sim.rows[47];
  console.log(`Sustained cash-flow breakeven: ${be ? 'M' + be : 'not within 48 months'} · M48 monthly net cash flow ("founder take" when no payroll): ${fk(m48.netBurn)} · M48 cumulative cash position: ${fk(m48.cumBurn)}`);
}

// ---------------------------------------------------------------------------
// Run scenarios
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const sims = {};
  for (const [name, p] of Object.entries(SCENARIOS)) {
    const sim = simulate(p);
    sims[name] = sim;
    writeFileSync(join(OUT_DIR, `cohorts-${name}.csv`), csv(sim.rows));
    summarize(name, p, sim);
  }

  // --- Sensitivity: one-way sweeps on the base scenario ---
  console.log('\n### Sensitivity (base scenario, one variable at a time) — ARR run-rate @ M36 / M48, peak cumulative burn\n');
  console.log('| Variable | Low | Base | High |');
  console.log('|---|---|---|---|');

  const sweep = (label, mutations) => {
    const cells = mutations.map(({ tag, mut }) => {
      const p = structuredClone !== undefined ? cloneScenario(SCENARIOS.base) : null;
      mut(p);
      const s = simulate(p);
      const a36 = s.rows[35].arrRunRate, a48 = s.rows[47].arrRunRate;
      return `${tag}: ${fk(a36)} / ${fk(a48)} · burn ${fk(s.peakCumBurn)}`;
    });
    console.log(`| ${label} | ${cells.join(' | ')} |`);
  };

  function cloneScenario(p) {
    // functions can't be structuredCloned — shallow copy + own the mutated fields
    return { ...p, activation: { ...p.activation }, retention: { ...p.retention }, vetRetentionBonus: { ...p.vetRetentionBonus }, hires: p.hires.map((h) => ({ ...h })) };
  }

  sweep('Free→paid ceiling (of activated)', [
    { tag: '2.5%', mut: (p) => (p.convEventual = 0.025) },
    { tag: '4.5%', mut: () => {} },
    { tag: '6.5%', mut: (p) => (p.convEventual = 0.065) },
  ]);
  sweep('Retention floor (long-tail MAU)', [
    { tag: '6%', mut: (p) => (p.retention = { ...p.retention, floor: 0.06 }) },
    { tag: '10%', mut: () => {} },
    { tag: '16%', mut: (p) => (p.retention = { ...p.retention, floor: 0.16 }) },
  ]);
  sweep('Vet channel start (months post-launch)', [
    { tag: '+15mo', mut: (p) => (p.vetStartOffset = 15) },
    { tag: '+9mo', mut: () => {} },
    { tag: '+6mo', mut: (p) => (p.vetStartOffset = 6) },
  ]);
  sweep('Vet channel scale (clinic cap)', [
    { tag: '400', mut: (p) => (p.clinicCap = 400) },
    { tag: '1,000', mut: () => {} },
    { tag: '2,000', mut: (p) => (p.clinicCap = 2000) },
  ]);
  sweep('Paid churn (monthly)', [
    { tag: '6.5%', mut: (p) => (p.paidChurnMonthly = 0.065) },
    { tag: '5.0%', mut: () => {} },
    { tag: '3.5%', mut: (p) => (p.paidChurnMonthly = 0.035) },
  ]);

  // --- Bootstrap sensitivity: what has to be true for this to pay a salary ---
  console.log('\n### Bootstrap sensitivity — monthly net cash flow ("founder take") @ M36 / M48, sustained breakeven month\n');
  console.log('| Variable | Low | Bootstrap | High |');
  console.log('|---|---|---|---|');
  const bootSweep = (label, mutations) => {
    const cells = mutations.map(({ tag, mut }) => {
      const p = cloneScenario(SCENARIOS.bootstrap);
      mut(p);
      const s = simulate(p);
      let be = null;
      for (let i = 0; i < s.rows.length - 2; i++) {
        if (s.rows[i].netBurn > 0 && s.rows[i + 1].netBurn > 0 && s.rows[i + 2].netBurn > 0) { be = s.rows[i].m; break; }
      }
      return `${tag}: ${fk(s.rows[35].netBurn)} / ${fk(s.rows[47].netBurn)} · BE ${be ? 'M' + be : '>48'}`;
    });
    console.log(`| ${label} | ${cells.join(' | ')} |`);
  };
  bootSweep('Organic growth /mo', [
    { tag: '4%', mut: (p) => (p.organicGrowth = 0.04) },
    { tag: '6%', mut: () => {} },
    { tag: '8%', mut: (p) => (p.organicGrowth = 0.08) },
  ]);
  bootSweep('Free→paid ceiling (of activated)', [
    { tag: '2.5%', mut: (p) => (p.convEventual = 0.025) },
    { tag: '4.5%', mut: () => {} },
    { tag: '6.5%', mut: (p) => (p.convEventual = 0.065) },
  ]);
  bootSweep('Clinic adoption /mo', [
    { tag: '8%', mut: (p) => (p.clinicGrowth = 0.08) },
    { tag: '12%', mut: () => {} },
    { tag: '16%', mut: (p) => (p.clinicGrowth = 0.16) },
  ]);
  bootSweep('Retention floor (chronic long tail)', [
    { tag: '6%', mut: (p) => (p.retention = { ...p.retention, floor: 0.06 }) },
    { tag: '10%', mut: () => {} },
    { tag: '16%', mut: (p) => (p.retention = { ...p.retention, floor: 0.16 }) },
  ]);

  // --- Pricing sensitivity (with conversion elasticity assumption) ---
  console.log('\n### Pricing sensitivity (base scenario; conversion elasticity is an ASSUMPTION)\n');
  console.log('| Price | Conv. multiplier | Paying @ M48 | ARR run-rate @ M48 | Peak cum. burn |');
  console.log('|---|---|---|---|---|');
  const priceRuns = [
    { price: 2.99, annual: 24.99, mult: 1.35 },
    { price: 4.99, annual: 39.99, mult: 1.0 },
    { price: 7.99, annual: 59.99, mult: 0.65 },
  ];
  for (const { price, annual, mult } of priceRuns) {
    const p = clonePricing(SCENARIOS.base, price, annual, mult);
    const s = simulate(p);
    const r = s.rows[47];
    console.log(`| $${price.toFixed(2)}/mo | ×${mult} | ${f0(r.payingStock)} | ${fk(r.arrRunRate)} | ${fk(s.peakCumBurn)} |`);
  }
  function clonePricing(base, price, annual, mult) {
    return { ...base, activation: { ...base.activation }, retention: { ...base.retention }, vetRetentionBonus: { ...base.vetRetentionBonus }, hires: base.hires.map((h) => ({ ...h })), price, annualPrice: annual, convEventual: base.convEventual * mult };
  }

  console.log('\nCSV files written to docs/financial-model/cohorts-{bootstrap,conservative,base,upside}.csv');
}
