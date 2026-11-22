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
// COUNTS AS KEPT, and since two adversarial passes (2026-11-22) that is structural, not a
// word list: product code (lib, store, hooks, app, components, constants, supabase,
// widgets) keeps unless it is on a short list of UI mechanics; a script outside the named
// tooling folders keeps; an input that names no file keeps; a file named without its
// folder keeps. Stems and wording only add the reasons.
// That errs loud (an extra ask), never quiet (a kept call made silently).
//
// Pure: no I/O, no clock. cli.ts is the shell for merge-check and the groomer.
//
// STATED BLIND SPOTS (C-38):
//   - Paths are what the caller passes, or what `pathsIn` finds in a note. A path split by
//     a line break reads as its folder (`lib/`), which keeps.
//   - The text test reads words, not meaning: "no clinical surface" still keeps the row.
//     That is the loud direction, by design.
//   - "Inside a ratified mock round" is the caller's claim (`ratifiedRound`, which must
//     name a round: `R-3`, `round 2`). The module cannot check that the PM ratified it; a
//     reaction to a mock and brand stay kept whatever round is named.

export type Kept = 'stakes' | 'taste' | 'scope' | 'none';
export const KEPT_ORDER: Kept[] = ['stakes', 'taste', 'scope', 'none'];

// The classes a team call is grouped by in the weekly digest (CUL-928 reads them).
export type TeamCallClass = 'engineering' | 'copy' | 'ux' | 'doc';

export type KeptInput = {
  labels?: string[];
  files?: string[]; // a diff's files, or the files a row's note names (pathsIn)
  text?: string; // title, description, a row's What and build note
  migration?: boolean; // the caller already knows it adds a migration
  forecast?: { rows: number; built: number }; // a brief's forecast and the rows it has taken
  ratifiedRound?: string; // the mock round the PM ratified that this work sits inside
  backToKept?: TeamCallClass[]; // classes the reversal rule moved back (classesBackToKept)
};

export type KeptResult = { kept: Kept; reasons: string[] };

type Rule = { kept: Exclude<Kept, 'none'>; why: string };
type TextRule = Rule & { re: RegExp; tasteVisual?: true };

const UNCERTAIN = '(uncertain counts as kept)';

// ---- labels -------------------------------------------------------------------------
// Matched on a normal form (case and spacing ignored), so `gate:clinical` still keeps.
// `Live harm` is deliberately unmapped: a harm is fixed now, never held for a ruling (that
// would delay the fix); its clinical or privacy part keeps by its own label or words.
// `Gate: device` is deliberately unmapped: it names a check only the PM's phone can run,
// not a call; the device sitting takes it.
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
const PRODUCT = /^(lib|store|hooks|app|components|constants|supabase|widgets)(\/|$)/;
// UI mechanics: product code that holds no health data, money or copy. A file here is a
// team call; every other product file keeps. Add a file only with the reason it is safe.
const UI_MECHANICS = new Set([
  'lib/utils.ts', 'lib/haptics.ts', 'lib/textWidth.ts', 'lib/a11yFocus.ts', 'lib/fonts.ts', 'lib/tapTarget.ts',
  'lib/measureNode.ts', 'lib/layoutCaps.ts', 'lib/revealInScroll.ts', 'lib/screenOrientation.ts', 'lib/rateContrast.ts',
  'lib/fabFootprint.ts', 'lib/network.ts', 'lib/appInfo.ts', 'hooks/useReducedMotion.ts', 'hooks/useLayoutClass.ts',
  'hooks/useLiveRegionAnnouncement.ts', 'hooks/useAppActive.ts', 'hooks/useSubmitGuard.ts', 'hooks/useIsOnline.ts',
  'store/reducedMotionStore.ts', 'store/uiStore.ts', 'store/snackbarStore.ts',
]);
// The team's own tooling under scripts/. Every other script keeps: many read or write
// production data (backfills, exports, replays).
const TOOLING_SCRIPTS = /^scripts\/(dispatch|sweep|kept|groom|ci|repo-hygiene|how-we-work|layout-probe|design-critique|mockup-theme|web-capture)\/|^scripts\/render-mockup\.mjs$/;
// Folders that hold no product code: a file here keeps only by a rule below.
const TOOLING_ROOTS = /^(guards|\.claude|\.github|\.githooks|docs|e2e|\.maestro|patches)\/|^(CLAUDE|STATUS|README)\.md$|^(package(-lock)?\.json|tsconfig\.json|jest[\w.]*\.js|babel\.config\.js|\.gitignore|\.eslintrc[\w.]*)$/;

// Stems, matched against the start of each word of every folder and the file's name
// (`app/vet-visits/[id].tsx` reads as app · vet · visits · id). They name the reason; the
// default for product code keeps a file they miss.
const NAME_STEMS: { kept: Exclude<Kept, 'none'>; why: string; stems: string[] }[] = [
  {
    kept: 'stakes',
    why: 'clinical surface',
    stems: ['signal', 'trial', 'diet', 'protein', 'symptom', 'intake', 'vomit', 'stool', 'incident', 'floor', 'emergency', 'analy', 'may', 'call', 'look', 'episode', 'med', 'dose', 'weight', 'feeding', 'fed', 'meal', 'care', 'vet', 'report', 'ask', 'pattern', 'read', 'verdict', 'tier', 'finding', 'exam', 'ready', 'event', 'safety', 'masking', 'rundown', 'duplicate', 'warn', 'gap', 'en', 'engine', 'detect'],
  },
  {
    kept: 'stakes',
    why: 'privacy, Storage, deletion, export or share links',
    stems: ['consent', 'auth', 'account', 'secure', 'session', 'storage', 'attachment', 'photo', 'upload', 'transient', 'local', 'db', 'schema', 'export', 'pdf', 'share', 'link', 'send', 'supabase', 'analytics', 'crash', 'delete', 'removal', 'sign', 'password', 'recovery', 'owner', 'widget', 'record', 'sync', 'hydrat', 'undo', 'discard', 'loss', 'archive', 'inbox', 'capture', 'paperwork', 'document', 'file', 'email', 'notification', 'pet', 'profile'],
  },
  { kept: 'stakes', why: 'money or Pets > $', stems: ['monetization', 'entitlement', 'paywall', 'premium', 'beta', 'flag', 'config', 'purchase', 'price', 'pricing'] },
  { kept: 'stakes', why: 'App Store or legal', stems: ['legal'] },
];

const wordsOf = (f: string) =>
  f
    .replace(/\.[\w.]+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Files at the repo root are placed paths, not bare names.
const ROOT_FILES = /^(app\.json|eas\.json|app\.config\.\w+|package(-lock)?\.json|tsconfig\.json|babel\.config\.js|jest[\w.]*\.js|metro\.config\.js|index\.ts|App\.tsx|CLAUDE\.md|STATUS\.md|README\.md)$/;
const isBare = (f: string) => !f.includes('/') && !ROOT_FILES.test(f);

function pathRules(f: string, ratified: boolean): Rule[] {
  const out: Rule[] = [];
  const push = (kept: Exclude<Kept, 'none'>, why: string) => out.push({ kept, why });
  const base = f.replace(/\.test(\.[\w]+)$/, '$1');

  // Whole trees and file kinds.
  if (f.startsWith('supabase/migrations/')) push('stakes', 'schema (a migration)');
  else if (f.startsWith('supabase/')) push('stakes', 'server code over health data (supabase/)');
  if (/\.sql$/.test(f)) push('stakes', 'irreversible (SQL against a database)');
  if (/backfill/i.test(f)) push('stakes', 'irreversible (a backfill)');
  if (/^\.github\/workflows\/.*(deploy|release|submit|eas|store|testflight|prod)/i.test(f) || /^scripts\/(deploy|edge-deploy)/.test(f)) push('stakes', 'a deploy or release path');
  if (/^(\.claude\/hooks\/|\.claude\/settings|scripts\/steward\/)/.test(f)) push('stakes', 'the production gate');
  if (/^(app\.json|eas\.json|app\.config\.|docs\/legal\/|scripts\/store-screenshots\/|ios\/|android\/)/.test(f)) push('stakes', 'App Store or legal');
  if (f.startsWith('widgets/')) push('stakes', 'privacy (the widget shows health data outside the app)');
  if (f.startsWith('.claude/skills/clinical-guardrails/')) push('stakes', 'clinical surface');
  if (f.startsWith('docs/monetization')) push('stakes', 'money or Pets > $');
  if (/^(assets\/|constants\/theme|components\/brand\/|docs\/culprit-icon-brand-direction\.md)/.test(f)) push('taste', 'brand or a visual system file');
  if (/^docs\/.*mock.*\.html$/i.test(f) || /^docs\/mocks?\//.test(f)) push('taste', 'a mock');
  if (/^docs\/.+\.md$/.test(f) && !f.startsWith('docs/sessions/') && !f.startsWith('docs/legal/')) push('scope', 'a Tier-2 doc edit');

  // Product code: stems name the reason; anything they miss still keeps.
  if (PRODUCT.test(f) && !UI_MECHANICS.has(base)) {
    const words = wordsOf(f);
    const before = out.length;
    for (const n of NAME_STEMS) if (words.some((w) => n.stems.some((st) => w.startsWith(st)))) push(n.kept, `${n.why} (by name)`);
    if (out.length === before && !out.some((r) => r.kept === 'stakes')) {
      // A screen or component is the PM's taste until a ratified round covers it; other
      // product code keeps as stakes.
      if (/^(app|components)\//.test(f)) {
        if (!ratified) push('taste', `a screen or component outside a named mock round ${UNCERTAIN}`);
      } else push('stakes', `product code the list cannot place ${UNCERTAIN}`);
    }
  } else if (f.startsWith('scripts/') && !TOOLING_SCRIPTS.test(f) && !out.length) {
    push('stakes', `a script outside the tooling folders ${UNCERTAIN}`);
  } else if (!isBare(f) && !PRODUCT.test(f) && !TOOLING_ROOTS.test(f) && !f.startsWith('scripts/') && !out.length && !/^(assets|docs)\//.test(f)) {
    push('stakes', `a path the list does not know ${UNCERTAIN}`);
  }
  return out;
}

// The repo paths a piece of text names, for a caller that has a note, not a diff. Splits
// on whitespace, then strips the markdown and punctuation around each token (backticks,
// `**`, `_`, quotes, brackets, `!?.,;:…—`, a `#L42` anchor, a leading `./`), so a path in
// any of the shapes the second adversarial pass tried is found.
const ROOT_NAMES = /^(lib|store|hooks|app|components|constants|supabase|widgets|scripts|guards|docs|\.github|\.githooks|\.claude|assets|ios|android|patches|e2e|\.maestro)\//;
// Leading marks never include `.`, which starts `.github/` and `./`.
const WRAP = /^[\s*_`'"<>()[\]{}|!?,;:…—–]+|[\s*_`'"<>()[\]{}|!?.,;:…—–]+$/g;
export function pathsIn(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    let t = raw.replace(/#L\d+(-L?\d+)?/g, '');
    let prev = '';
    while (prev !== t) {
      prev = t;
      t = t.replace(WRAP, '');
    }
    t = t.replace(/^\.\//, '');
    // Brackets that close inside the token are part of the path (`[id].tsx`, `(tabs)/`).
    if (!t) continue;
    if (ROOT_NAMES.test(t) || /^[\w-]+\/$/.test(t) && ROOT_NAMES.test(t)) out.add(t);
    else if (!t.includes('/') && /^[\w.-]+\.(tsx?|jsx?|mjs|sql|sh|ya?ml|json|swift)$/.test(t)) out.add(t);
  }
  return [...out];
}

// ---- text ---------------------------------------------------------------------------
// Case-insensitive, stem-based. Every word here was either on the spec or found by one of
// the two adversarial passes in wording a real issue would use.
const TEXT: TextRule[] = [
  {
    kept: 'stakes',
    why: 'clinical',
    re: /\bclinical\b|\bsafety invariants?\b|intake is not preference|\bn ?= ?1\b|adversarial-reviewer|clinical-guardrails|\bvet\b|\bvet[- ]reports?\b|\bescalat\w*|\breassur\w*|\bpicky\b|\bsoften\w*|\bwarn(s|ed|ing|ings)?\b|\bred[- ]flags?\b|\bthresholds?\b|\bappetite\b|\banorexi\w*|\blipidosis\b|\bvomit\w*|\bthrow\w* up\b|\bregurgitat\w*|\bstools?\b|\bpoop\w*|\blitter\b|\bblood\b|\bdiarrh\w*|\blethargi?\w*|\bsymptoms?\b|\bintake\b|\brefus\w*|\bdeclin\w*|\b(eat|eats|eating|eaten|ate)\b|\bskip\w* meals?\b|\bleft in the bowl\b|\bdiet[- ]trials?\b|\bfood trials?\b|\belimination\b|\bdoses?\b|\bmedications?\b|\bdetect(or|ion)s?\b|\bhealth flags?\b|\ball[- ]clear\b|\blooks? normal\b|\bno concerns?\b|\bcalm read\b|\bsingle[- ]sample\b|\bweight\b|\bseizures?\b|\bnausea\b|\bCKD\b|\bkidney\w*|\brenal\b|thyroid\w*|\bemergenc\w*|\burgent\w*|\balerts?\b|\bsignals?\b|\btiers? fires?\b|\bsignal tiers?\b|\bcorrelation\b|\bMcNemar\b|\bfalse[- ](positive|negative)s?\b|\bdiagnos\w*|\bsick\w*|\billness\b|\bpain\b|\bfever\b|\ballerg\w*/i,
  },
  {
    kept: 'stakes',
    why: 'privacy, RLS, Storage, deletion, export or share links',
    re: /\bRLS\b|\brow[- ]level security\b|\bpolic(y|ies)\b|\bstorage\b|\bbuckets?\b|\bdelet\w*|\berase\w*|\bremov\w* (the |an |my |a )?(account|pet)s?\b|\barchiv\w* (the |a )?pets?\b|\bexport\w*|\bPDFs?\b|rls-privacy-reviewer|\bprivacy\b|\bshare[- ]?(links?|tokens?|sheets?)\b|\b(visit|report) links?\b|\bsigned URLs?\b|\bservice[- ]role\b|\banon key\b|\bconsent\w*|\bhealth (data|photos?)\b|\bpersonal data\b|\bphotos?\b|\buploads?\b|\bauth\w*|\bsign[- ]?(in|out|up)\b|\bpasswords?\b|\bleak\w*|\bGDPR\b|\bCCPA\b|\bHIPAA\b|\bretention\b|\bemail address\w*/i,
  },
  {
    kept: 'stakes',
    why: 'money or Pets > $',
    re: /Pets > \$|\b(paywalls?|entitlements?|premium|pric(e|es|ing)|subscriptions?|in-app purchases?|purchases?|IAP|ai_usage|money|monetiz\w*|revenuecat|stripe|refunds?|billing|throttl\w*|app_config)\b|\b(pets?|ai|usage|free|daily|monthly) caps?\b|\bcap (on|of)\b|\b(free|pro|paid) (tiers?|plans?)\b|\btier limits?\b|\bfree trials?\b|\bpro plan\b/i,
  },
  {
    kept: 'stakes',
    why: 'schema',
    re: /\bschema\b|\bmigrations?\b|supabase\/migrations\/|\bALTER TABLE\b|\b(add|drop|rename)\w* (a |an |the )?(new |nullable )?(`?\w+`? )?(column|table|index|constraint)s?\b|\bnew (column|table)s?\b|\bcolumns?\b|\bnullable\b|\benum (value|type)s?\b|\bnew enum\b|\bforeign key\b|\bprimary key\b|\b(db|database|sql|postgres) triggers?\b/i,
  },
  { kept: 'stakes', why: 'App Store or legal', re: /\bApp[- ]?Store\b|\bApp Review\b|\bTestFlight (submission|review)\b|\bstore listing\b|\bdocs\/legal\b|\bterms of service\b|\bprivacy policy\b|\blegal\b|\bEULA\b|\bdisclaimer\b|\blicen[cs]e\w*/i },
  {
    kept: 'stakes',
    why: 'irreversible (a revert PR or a Linear edit cannot undo it)',
    re: /\birreversible\b|\b(cannot|can't|can not) be undone\b|\bapply_migration\b|\bexecute_sql\b|\bpurge\w*|\bwip(e|es|ed|ing)\b|\bhard[- ]delet\w*|\bdrop (the )?(table|column|bucket)s?\b|\bTRUNCATE\b|\bforce[- ]push\w*|\bbackfill\w*|\brotat\w* (the |a )?(\w+ )?(keys?|secrets?|tokens?)\b|\bsecrets? set\b|\bsend(s|ing)? (an? |the )?(emails?|push(es)?|notifications?)\b|\bpush notifications?\b|\b(notify|email|message|push to) (all|every)\b|\b(publish|release|deploy)\w* to (production|prod)\b|\bproduction (write|data|database|db)\b|\bremov\w* (the |a )?buckets?\b/i,
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

// A ratified round is named, never assumed: `R-3`, `round 2`, `Round 4`.
const ROUND = /\b(R-\d+|round\s*\d+)\b/i;

export function keptOf(input: KeptInput): KeptResult {
  // Blank entries are no input: `{ labels: [''] }` is nothing to read, never `none`.
  const labels = (input.labels ?? []).map((l) => l.trim()).filter(Boolean);
  const files = (input.files ?? []).map((f) => f.trim()).filter(Boolean);
  const text = input.text ?? '';
  const hits: Rule[] = [];
  const add = (r: Rule) => {
    if (!hits.some((h) => h.kept === r.kept && h.why === r.why)) hits.push(r);
  };
  const ratified = ROUND.test(input.ratifiedRound ?? '');

  for (const l of labels) {
    const r = LABELS[labelKey(l)];
    if (r && !(ratified && labelKey(l) === 'gate:design')) add(r);
  }
  if (input.migration) add({ kept: 'stakes', why: 'schema (a migration)' });
  for (const f of files) {
    if (isBare(f) && !/\.(sql|sh)$/.test(f)) {
      // A file named without its folder cannot be placed, so it keeps.
      add({ kept: 'stakes', why: `a file named without its folder ${UNCERTAIN}` });
      continue;
    }
    for (const r of isBare(f) ? [{ kept: 'stakes' as const, why: 'irreversible (SQL or a shell script)' }] : pathRules(f, ratified)) {
      if (!(ratified && r.why === 'a mock')) add(r);
    }
  }
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
    add({ kept: 'stakes', why: `nothing to read ${UNCERTAIN}` });
  } else if (!files.length && !input.migration) {
    add({ kept: 'stakes', why: `no files named, so the surface is unread ${UNCERTAIN}` });
  }

  if (!hits.length) return { kept: 'none', reasons: [] };
  const kept = KEPT_ORDER.find((k) => hits.some((h) => h.kept === k)) as Kept;
  return { kept, reasons: hits.sort((a, b) => KEPT_ORDER.indexOf(a.kept) - KEPT_ORDER.indexOf(b.kept)).map((h) => `${h.kept}: ${h.why}`) };
}

// Which digest group a team call belongs to: copy by its label or its own words, docs by
// a docs-only diff, UX by a UI path, engineering otherwise.
export function teamCallClass(input: Pick<KeptInput, 'labels' | 'files' | 'text'>): TeamCallClass {
  const files = input.files ?? [];
  const labels = (input.labels ?? []).map(labelKey);
  if (labels.includes('area:copy/voice') || /\bnyx-voice\b|\bwording\b|\bowner-facing copy\b|\bcopy (change|edit|fix|pass|line|string)s?\b/i.test(input.text ?? '')) return 'copy';
  if (files.length && files.every((f) => f.startsWith('docs/') || f.endsWith('.md'))) return 'doc';
  if (files.some((f) => /^(app|components|hooks)\//.test(f)) || labels.includes('area:uxpolish')) return 'ux';
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
