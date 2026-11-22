// The kept list (CUL-2886): the one definition, in code, of what stays the PM's call.
//
// WHY ONE MODULE. Until this file the list of calls only the PM makes was written in at
// least six places that disagreed: CLAUDE.md § Backlog Protocol (twice, one copy without
// Storage, deletion and export), the groomer's step 12 (adding share links), dispatch's
// plan gate (adding Tier-2 spec edits, omitting money and App Store), dispatch's `auto`
// test (a keyword match on `copy`, `string`, `label`, `mock`, `frame` that caught most UI
// rows), /kickoff and /sweep's `rank.ts`. "Irreversible" had no test anywhere. Every
// caller now asks this module, and a change to the list is a change to this file.
//
// THE RULING (PM, 2026-11-21, typed in session): "Design and scope stay w me"; engineering
// calls are decided at once and logged weekly, no veto window. Evidence in CUL-2886: of 304
// paired rulings, the PM diverged from the team on taste and scope, never on engineering,
// CI, tooling or privacy. High stakes stay kept because a mistake there is expensive.
//
//   stakes  clinical and the two safety invariants; privacy, RLS, Storage, deletion,
//           export, share links; money and Pets > $; schema; App Store and legal;
//           irreversible ("a revert PR or a Linear edit cannot undo it").
//   taste   a visual or motion choice not already inside a mock round the PM ratified;
//           a reaction to a mock; brand.
//   scope   what is in or out of a project, priority between tracks, a spec (Tier-2 doc)
//           edit, and any change that takes a brief past its forecast.
//   none    everything else: a team call, made at once by the owning persona and logged
//           on the issue with a first line of `**Team call**`, the lens, and the option
//           not taken. Never filed to `Waiting on PM`. A persona conflict still escalates.
//
// HOW IT READS. Labels first, then paths, then text, and every hit counts: the answer is
// the most serious class any of them found (stakes, then taste, then scope). UNCERTAIN
// COUNTS AS KEPT: an input with nothing to read returns `stakes`, and a word in passing
// keeps the row. That errs loud (an extra ask), never quiet (a kept call made silently).
//
// Pure: no I/O, no clock. cli.ts is the shell for merge-check and the groomer.
//
// STATED BLIND SPOTS (C-38):
//   - Paths are what the caller passes. A row whose note names no file is read from its
//     text alone.
//   - The text test reads words, not meaning: "no clinical surface" still keeps the row.
//     That is the loud direction, by design.
//   - "Inside a ratified mock round" is the caller's claim (`ratifiedRound`, naming the
//     round). The module cannot check that the round was ratified, only that one is named;
//     a reaction to a mock and brand stay kept whatever round is named.

export type Kept = 'stakes' | 'taste' | 'scope' | 'none';
export const KEPT_ORDER: Kept[] = ['stakes', 'taste', 'scope', 'none'];

// The classes a team call is grouped by in the weekly digest (CUL-928 reads them).
export type TeamCallClass = 'engineering' | 'copy' | 'ux' | 'doc';

export type KeptInput = {
  labels?: string[];
  files?: string[]; // a diff's files, or the files a row's note names
  text?: string; // title, description, a row's What and build note
  migration?: boolean; // the caller already knows it adds a migration
  forecast?: { rows: number; built: number }; // a brief's forecast and the rows it has taken
  ratifiedRound?: string; // the mock round the PM ratified that this work sits inside
  backToKept?: TeamCallClass[]; // classes the reversal rule moved back (classesBackToKept)
};

export type KeptResult = { kept: Kept; reasons: string[] };

type Rule = { kept: Exclude<Kept, 'none'>; why: string };
type PathRule = Rule & { prefixes: string[] };
type TextRule = Rule & { re: RegExp; tasteVisual?: true };

// ---- labels -------------------------------------------------------------------------
// Matched on a normal form (case and spacing ignored), so `gate:clinical` still keeps.
// `Live harm` is deliberately unmapped: a harm is fixed now, never held for a ruling (that
// would delay the fix); its clinical or privacy part keeps by its own label or words.
// `Gate: device` is deliberately unmapped: it names a check only the PM's phone can run,
// not a call; the device sitting takes it. `Area: Copy/Voice` is copy, a team call inside
// nyx-voice (clinical wording is caught by the text).
const LABELS: Record<string, Rule> = {
  'gate:clinical': { kept: 'stakes', why: 'clinical (label Gate: clinical)' },
  'gate:privacy': { kept: 'stakes', why: 'privacy (label Gate: privacy)' },
  'area:privacy/rls': { kept: 'stakes', why: 'privacy (label Area: Privacy/RLS)' },
  'area:correctness': { kept: 'stakes', why: 'clinical honesty or data integrity (label Area: Correctness)' },
  'gate:deploy': { kept: 'stakes', why: 'a production write (label Gate: deploy)' },
  'gagate': { kept: 'scope', why: 'a go-live gate (label GA gate)' },
  'gate:design': { kept: 'taste', why: 'a design call (label Gate: design)' },
};
const labelKey = (l: string) => l.toLowerCase().replace(/\s+/g, '');

// ---- paths --------------------------------------------------------------------------
// Two tests. Prefixes for whole trees and named files; then, for app code, the file's own
// name read word by word against stems, so a file added next month is read too (the
// adversarial pass found 30 health, privacy and money files a hand list had missed).
const PATHS: PathRule[] = [
  // Every Edge Function reads health data with the service role and deploys on merge.
  { kept: 'stakes', why: 'server code over health data (supabase/functions/)', prefixes: ['supabase/functions/'] },
  { kept: 'stakes', why: 'clinical surface', prefixes: ['.claude/skills/clinical-guardrails/'] },
  { kept: 'stakes', why: 'schema (a migration)', prefixes: ['supabase/migrations/'] },
  { kept: 'stakes', why: 'irreversible (SQL against a database)', prefixes: ['scripts/export-pet-timeline.sql'] },
  { kept: 'stakes', why: 'money or Pets > $', prefixes: ['docs/monetization'] },
  { kept: 'stakes', why: 'App Store or legal', prefixes: ['app.json', 'eas.json', 'app.config.', 'docs/legal/', 'scripts/store-screenshots/', 'ios/'] },
  { kept: 'stakes', why: 'privacy (the widget shows health data outside the app)', prefixes: ['widgets/'] },
  { kept: 'taste', why: 'brand or a visual system file', prefixes: ['assets/', 'constants/theme', 'components/brand/', 'docs/culprit-icon-brand-direction.md'] },
];

const CODE_DIRS = /^(lib|store|constants|hooks|app|components)\//;
// Stems, matched against the start of each word of a file's name (`freeFedIntake` reads as
// free · fed · intake). Loud by design: a name that only sounds clinical still keeps.
const NAME_STEMS: { kept: Exclude<Kept, 'none'>; why: string; stems: string[] }[] = [
  {
    kept: 'stakes',
    why: 'clinical surface (by file name)',
    stems: ['signal', 'trial', 'diet', 'protein', 'symptom', 'intake', 'vomit', 'stool', 'incident', 'floor', 'emergency', 'analysis', 'may', 'call', 'look', 'episode', 'med', 'dose', 'weight', 'feeding', 'fed', 'meal', 'care', 'vet', 'report', 'ask', 'pattern', 'read', 'verdict', 'tier', 'finding', 'exam', 'ready', 'event', 'safety', 'masking'],
  },
  {
    kept: 'stakes',
    why: 'privacy, Storage, deletion, export or share links (by file name)',
    stems: ['consent', 'auth', 'account', 'secure', 'session', 'storage', 'attachment', 'photo', 'upload', 'transient', 'local', 'db', 'schema', 'export', 'pdf', 'share', 'link', 'send', 'supabase', 'analytics', 'crash', 'delete', 'removal', 'sign', 'password', 'recovery', 'owner', 'widget', 'record', 'sync', 'undo', 'discard', 'loss', 'notification'],
  },
  { kept: 'stakes', why: 'money or Pets > $ (by file name)', stems: ['monetization', 'entitlement', 'paywall', 'premium', 'beta', 'flag', 'config', 'purchase', 'price', 'pricing'] },
  { kept: 'stakes', why: 'App Store or legal (by file name)', stems: ['legal'] },
];

const wordsOf = (f: string) =>
  (f.split('/').pop() ?? '')
    .replace(/\.[\w.]+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// A mock is taste wherever it sits; a spec is scope. Session records are the archive.
function pathRules(f: string): Rule[] {
  const out: Rule[] = [];
  for (const r of PATHS) if (r.prefixes.some((p) => f.startsWith(p))) out.push(r);
  if (CODE_DIRS.test(f)) {
    const words = wordsOf(f);
    for (const n of NAME_STEMS) if (words.some((w) => n.stems.some((st) => w.startsWith(st)))) out.push(n);
  }
  if (/^docs\/.*mock.*\.html$/i.test(f) || /^docs\/mocks?\//.test(f)) out.push({ kept: 'taste', why: 'a mock' });
  if (/^docs\/.+\.md$/.test(f) && !f.startsWith('docs/sessions/')) out.push({ kept: 'scope', why: 'a Tier-2 doc edit' });
  return out;
}

// ---- text ---------------------------------------------------------------------------
// Case-insensitive, stem-based. Every word here was either on the spec or found by the
// adversarial pass in wording a real issue would use.
const TEXT: TextRule[] = [
  {
    kept: 'stakes',
    why: 'clinical',
    re: /\bclinical\b|\bsafety invariants?\b|intake is not preference|n=1 never reassures|adversarial-reviewer|clinical-guardrails|\bvet[- ]reports?\b|\bescalat\w*|\breassur\w*|\bpicky\b|\bsoften\w*|\bwarn(s|ed|ing|ings)?\b|\bred[- ]flags?\b|\bthresholds?\b|\bappetite\b|\banorexi\w*|\blipidosis\b|\bvomit\w*|\bstools?\b|\bdiarrh\w*|\blethargi?\w*|\bsymptoms?\b|\bintake\b|\brefus\w*|\bdiet[- ]trials?\b|\bdoses?\b|\bmedications?\b|\bdetect(or|ion)s?\b|\bhealth flags?\b/i,
  },
  {
    kept: 'stakes',
    why: 'privacy, RLS, Storage, deletion, export or share links',
    re: /\bRLS\b|\bpolic(y|ies)\b|\bstorage\b|\bbuckets?\b|\bdelet\w*|\bexport\w*|rls-privacy-reviewer|\bprivacy\b|\bshare[- ]?(links?|tokens?)\b|\b(visit|report) links?\b|\bsigned URLs?\b|\bservice[- ]role\b|\bconsent\w*|\bhealth (data|photos?)\b|\bpersonal data\b/i,
  },
  {
    kept: 'stakes',
    why: 'money or Pets > $',
    re: /Pets > \$|\b(paywalls?|entitlements?|premium|pric(e|es|ing)|subscriptions?|in-app purchases?|purchases?|ai_usage|money|monetiz\w*|revenuecat|throttl\w*|app_config)\b|\b(pets?|ai|usage|free|daily|monthly) caps?\b|\bcap (on|of)\b|\b(free|pro|paid) tiers?\b|\btier limits?\b/i,
  },
  { kept: 'stakes', why: 'schema', re: /\bschema\b|\bmigrations?\b|supabase\/migrations\/|\bALTER TABLE\b|\b(add|drop|rename)\w* (a |an |the )?(new )?(column|table|index|constraint)s?\b|\bnew (column|table)s?\b/i },
  { kept: 'stakes', why: 'App Store or legal', re: /\bApp[- ]?Store\b|\bApp Review\b|\bTestFlight (submission|review)\b|\bstore listing\b|\bdocs\/legal\b|\bterms of service\b|\bprivacy policy\b|\blegal\b/i },
  {
    kept: 'stakes',
    why: 'irreversible (a revert PR or a Linear edit cannot undo it)',
    re: /\birreversible\b|\b(cannot|can't|can not) be undone\b|\bapply_migration\b|\bexecute_sql\b|\bpurge\w*|\bwip(e|es|ed|ing)\b|\bhard[- ]delet\w*|\bdrop (the )?(table|column|bucket)s?\b|\bTRUNCATE\b|\bforce[- ]push\w*|\bbackfill\w*|\brotat\w* (the |a )?(\w+ )?(keys?|secrets?|tokens?)\b|\bsecrets? set\b|\bsend(s|ing)? (an? |the )?(emails?|push(es)?|notifications?)\b|\b(notify|email|message|push to) (all|every)\b|\b(publish|release)\w* to (production|prod)\b|\bremov\w* (the |a )?buckets?\b/i,
  },
  { kept: 'taste', why: 'a reaction to a mock', re: /\breactions?\b|\bR-\d+\b/ },
  { kept: 'taste', why: 'brand', re: /\bbrand(ing)?\b/i },
  { kept: 'taste', why: 'a visual or motion choice', re: /\bmock(s|-?ups?|\s+rounds?)?\b|\bvisual\b|\bmotion\b|\blayout\b|\bframes?\b|\bicons?\b|\bcolou?rs?\b|\btypefaces?\b|\bfonts?\b/i, tasteVisual: true },
  {
    kept: 'scope',
    why: 'scope (in or out of a project, priority between tracks, a spec edit)',
    re: /\b(in|out of) scope\b|\bscope (change|creep|cut)\b|\bdescop\w*|\bnew scope\b|\bpriority between tracks\b|\breprioriti[sz]\w*|\bwhich track\b|\bnew project\b|\bpast (its|the) forecast\b|\bTier[- ]2\b/i,
  },
];

// The reversal rule moves a class back to kept: copy and UX are taste, engineering and
// docs are scope (the PM saying what gets built), never stakes, which they were not.
const BACK_TO: Record<TeamCallClass, Exclude<Kept, 'none'>> = { copy: 'taste', ux: 'taste', engineering: 'scope', doc: 'scope' };

export function keptOf(input: KeptInput): KeptResult {
  // Blank entries are no input: `{ labels: [''] }` is nothing to read, never `none`.
  const labels = (input.labels ?? []).map((l) => l.trim()).filter(Boolean);
  const files = (input.files ?? []).map((f) => f.trim()).filter(Boolean);
  const text = input.text ?? '';
  const hits: Rule[] = [];
  const add = (r: Rule) => {
    if (!hits.some((h) => h.kept === r.kept && h.why === r.why)) hits.push(r);
  };
  const ratified = !!input.ratifiedRound?.trim();

  for (const l of labels) {
    const r = LABELS[labelKey(l)];
    if (r && !(ratified && labelKey(l) === 'gate:design')) add(r);
  }
  if (input.migration) add({ kept: 'stakes', why: 'schema (a migration)' });
  for (const f of files) for (const r of pathRules(f)) if (!(ratified && r.why === 'a mock')) add(r);
  for (const r of TEXT) {
    if (ratified && r.tasteVisual) continue;
    if (r.re.test(text)) add(r);
  }
  if (input.forecast && input.forecast.built > input.forecast.rows) {
    add({ kept: 'scope', why: `past its forecast (${input.forecast.built} rows against ${input.forecast.rows})` });
  }
  if (input.backToKept?.length) {
    const cls = teamCallClass(input);
    if (input.backToKept.includes(cls)) add({ kept: BACK_TO[cls], why: `${cls} calls returned to kept by the reversal rule` });
  }
  if (!labels.length && !files.length && !text.trim() && !input.migration) {
    add({ kept: 'stakes', why: 'nothing to read (uncertain counts as kept)' });
  }

  if (!hits.length) return { kept: 'none', reasons: [] };
  const kept = KEPT_ORDER.find((k) => hits.some((h) => h.kept === k)) as Kept;
  return { kept, reasons: hits.sort((a, b) => KEPT_ORDER.indexOf(a.kept) - KEPT_ORDER.indexOf(b.kept)).map((h) => `${h.kept}: ${h.why}`) };
}

// Which digest group a team call belongs to: copy by its label or words, docs by a
// docs-only diff, UX by a UI path, engineering otherwise.
export function teamCallClass(input: Pick<KeptInput, 'labels' | 'files' | 'text'>): TeamCallClass {
  const files = input.files ?? [];
  if ((input.labels ?? []).includes('Area: Copy/Voice') || /\bnyx-voice\b|\bcopy\b|\bwording\b/i.test(input.text ?? '')) return 'copy';
  if (files.length && files.every((f) => f.startsWith('docs/') || f.endsWith('.md'))) return 'doc';
  if (files.some((f) => /^(app|components|hooks)\//.test(f)) || (input.labels ?? []).includes('Area: UX polish')) return 'ux';
  return 'engineering';
}

// ---- the reversal rule (CUL-2886 item 3) --------------------------------------------
// The weekly digest lists the week's team calls by class; a PM reply reverses one. A class
// whose reversals pass 10% over the last four weeks returns to kept, and the sentence says
// so. The digest (CUL-928) supplies the calls and keeps the record of what moved.

export const REVERSAL_LIMIT = 0.1;
export const REVERSAL_WINDOW_DAYS = 28;

export type TeamCall = { issue: string; cls: TeamCallClass; at: string; reversed: boolean };
export type BackToKept = { cls: TeamCallClass; calls: number; reversed: number; sentence: string };

export function classesBackToKept(calls: TeamCall[], now: string): BackToKept[] {
  const from = new Date(now).getTime() - REVERSAL_WINDOW_DAYS * 86_400_000;
  const by = new Map<TeamCallClass, { calls: number; reversed: number }>();
  for (const c of calls) {
    const t = new Date(c.at).getTime();
    if (!(t >= from && t <= new Date(now).getTime())) continue;
    const s = by.get(c.cls) ?? { calls: 0, reversed: 0 };
    s.calls += 1;
    if (c.reversed) s.reversed += 1;
    by.set(c.cls, s);
  }
  const out: BackToKept[] = [];
  for (const [cls, s] of by) {
    if (s.reversed / s.calls > REVERSAL_LIMIT) {
      const pct = Math.round((100 * s.reversed) / s.calls);
      out.push({ cls, ...s, sentence: `${cls} calls return to kept: the PM reversed ${s.reversed} of ${s.calls} (${pct}%) in the last four weeks, over the 10% line.` });
    }
  }
  return out.sort((a, b) => a.cls.localeCompare(b.cls));
}
