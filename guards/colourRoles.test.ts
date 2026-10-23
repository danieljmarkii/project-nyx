// The colour guard: a raw hue reaches a screen only through a role (CUL-2175, PR-06e;
// row 3 of CUL-1898's D4, ruled (a) 2026-10-23: "roles and mock; migration; guard").
//
// WHY THIS FILE EXISTS. `colorRoles` (constants/theme.ts, PR-06) names a colour by its
// JOB and its GROUND, so whether a mark is readable where it sits is decided once and
// pinned in theme.contrast.test.ts. The walk (PR-06b to PR-06d) moved the light ground
// teal glyphs onto it. Nothing stopped the next screen drawing `theme.colorAccent` again,
// which is how the 51 faint sites CUL-1666 walked by hand built up: a rule in prose,
// re-opened for free by every new file.
//
// WHAT IT CHECKS. Under app/, components/ and hooks/ (comments blanked, test files
// skipped), every use of a GUARDED hue's name in code, in any position: a `color:` key,
// a fill, a border, a `color={…}` prop, a tint map value, an alpha suffix, a fallback.
// The name itself is the site, so `theme.colorAccent`, `theme['colorAccent']` and a
// destructured `colorAccent` all count. A site not in REGISTRY reds the build: reach the
// colour through `colorRoles` instead.
//
// THE GUARDED SET. The bright teal under every name it goes by (derived from the theme
// by value, as guards/accentOnLight.test.ts does, so a new alias is caught by value), and
// the tokens that exist only as role values and are never to be named at a call site:
// `colorAction` (indigo, "reached through colorRoles.action, never by name"),
// `colorAccentGlyph` (positive.glyphOnLight) and `colorMoonlitTeal` (positive.onNight).
// The other tokens the roles resolve are listed in NOT_GUARDED_YET with the reason, and
// the split is pinned against the source of `colorRoles`: a role leaf added later turns
// a test red until someone decides which list it joins.
//
// THE REGISTRY IS THE EXEMPTION LIST (C-32). One entry per surviving site, in file
// order, each naming its style key and its ground: a night or dark ground where the
// teal reads (with its ratio), the brand mark (a logo, outside WCAG 1.4.11), a tint map
// exported with its ground and pinned in theme.contrast.test.ts, or the issue that owns
// moving it (CUL-2161 choices and fields, CUL-2160 trend lines, CUL-2178 fills and edges
// on light grounds, for which the roles have no leaf yet). Per file, the entry count
// must EQUAL the site count, so a new site reds and a removed site whose entry stays
// reds too.
//
// A RATCHET, both directions (the styleLiteralBudget shape, CUL-2138). The registry's
// total is pinned in REGISTRY_CEILING: never raise it to go green. When a site moves
// onto a role, delete its entry and lower the ceiling in the same PR.
//
// SCOPE BOUNDARY (stated, because an undocumented blind spot reads as coverage): it reads
// names, not values, so a hand typed '#00C2A8' is styleLiteralBudget's colour count, not
// this guard's; a site's entry is matched by count per file, so swapping one registered
// site for a new one in the same file with nothing else changed is invisible (the entry
// text then lies, and review is the check); it does not read lib/, store/, constants/ or
// widgets/. The inks, washes and the symptom, medication, destructive and attention hues
// are not guarded yet (NOT_GUARDED_YET says why).
//
// THE OVERLAP WITH accentOnLight.test.ts, LEFT ON PURPOSE. That guard asks a different
// question of a subset: a `color:` text key in the teal must carry a per site marker
// naming its dark ground, and it also scans lib/ and store/. Folding it in would trade
// its per site marker (one marker, one site, within ten lines) for this file's per file
// count, which is the weaker of the two. A text site on a night ground sits in both.

import * as fs from 'fs';
import * as path from 'path';

import { colorRoles, theme } from '../constants/theme';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks'];

/** The bright teal's names, derived by value so a new alias cannot pass unseen. */
const ACCENT_NAMES: readonly string[] = Object.entries(theme)
  .filter(([, v]) => typeof v === 'string' && v.toUpperCase() === theme.colorAccent.toUpperCase())
  .map(([k]) => k)
  .sort();

/** Tokens that exist only to be reached through a role. */
const ROLE_ONLY = ['colorAccentGlyph', 'colorAction', 'colorMoonlitTeal'] as const;

export const GUARDED: readonly string[] = [...ACCENT_NAMES, ...ROLE_ONLY].sort();

/**
 * The tokens `colorRoles` resolves that a call site may still name, and why. Widening
 * the guard to any of them is its own walk with its own registry, not a line here.
 */
const NOT_GUARDED_YET: Record<string, string> = {
  colorAccentInk: 'the teal text ink, the correct half on light (161 sites); accentOnLight steers onto it',
  colorAccentLight: 'the teal wash, a ground, not a mark',
  colorMoonlight: 'the night ground action and the whorl ridge; night only by construction',
  colorTextOnDark: 'a neutral, the label on any solid fill',
  colorTextOnNight: 'a neutral, the night text (and the selected wash)',
  colorTextOnNightMuted: 'a neutral',
  colorTextPrimary: 'a neutral',
  colorTextSecondary: 'a neutral',
  colorEventSymptom: 'the concern glyph, already its role on light; concern keeps its own rules',
  colorEventSymptomInk: 'the concern ink, the correct half on light',
  colorEventSymptomLight: 'the concern wash',
  colorEventSymptomOnNight: 'the concern on night, night only by name',
  colorEventMedication: 'the medication glyph, already its role on light',
  colorEventMedicationInk: 'the medication ink, the correct half on light',
  colorEventMedicationLight: 'the medication wash',
  colorEventMedicationOnNight: 'the medication on night, night only by name',
  colorAttentionInk: 'the attention text, the correct half on light',
  colorAttentionLight: 'the attention wash',
  colorAttentionRail: 'the attention rail',
  colorDestructive: 'the destructive red, its role on white',
  colorDestructiveOnDark: 'the destructive red on dark, by name',
  colorDestructiveInk: 'the destructive text on its wash',
};

const NIGHT_LANDING = 'night ground: the Landing\'s colorBrandNight, 8.09:1';
const NIGHT_RECAP = 'night ground: colorBrandNightElevated, 6.57:1 (pinned in theme.contrast.test.ts)';
const PAYWALL = 'dark ground: the paywall\'s colorSurfaceDark, 8.26:1 (pinned in theme.contrast.test.ts)';
const LOGO = 'brand mark: the Culprit logo, outside WCAG 1.4.11\'s 3:1 (logos are exempt)';
const WHORL = 'brand mark: the whorl, retiring with WhorlSpinner (CUL-1593)';
const CHOICE = 'CUL-2161: a choice, radio or field, moving to colorRoles.selected / action';
const TREND = 'CUL-2160: a trend line on white, waiting on the chart standard\'s line colour';
const FILL = 'CUL-2178: a teal fill or edge on a light ground, no role leaf yet';

/**
 * Every surviving raw site, one entry per site in file order: its style key, then its
 * ground or the issue that owns it. Ratchets down only (REGISTRY_CEILING).
 */
export const REGISTRY: Record<string, readonly string[]> = {
  'app/(auth)/how-it-works.tsx': [`dotActive · ${FILL}`],
  'app/(auth)/index.tsx': [`learnMoreText · ${NIGHT_LANDING}`],
  'app/(tabs)/profile.tsx': [`progressBar · ${FILL}`],
  'app/ask.tsx': [`send · ${FILL}`],
  'app/day-summary.tsx': [
    `RecapStrip tint · ${NIGHT_RECAP}`,
    `emptyCta · night ground: colorBrandNight, 8.09:1`,
    `retry · night ground: colorBrandNight, 8.09:1`,
  ],
  'app/medication-capture.tsx': [`checkboxChecked fill · ${FILL}`, `checkboxChecked edge · ${FILL}`],
  'app/onboarding/paywall.tsx': [`feature check · ${PAYWALL}`, `priceTileFeatured edge · ${PAYWALL}`, `badge · ${PAYWALL}`],
  'app/onboarding/pet-type.tsx': [`radioSelected fill · ${CHOICE}`, `radioSelected edge · ${CHOICE}`],
  'app/settings/feedback.tsx': [`noteInputFocused · ${CHOICE}`],
  'app/settings/password.tsx': [`checkboxChecked fill · ${FILL}`, `checkboxChecked edge · ${FILL}`],
  'app/vet-files.tsx': [`addBtn · ${FILL}`],
  'components/ask/AskAnswerComponent.tsx': [`Sparkline color · ${TREND}`],
  'components/ask/AskChip.tsx': [`accent edge · ${CHOICE}`],
  'components/brand/CulpritMark.tsx': [`dot · ${LOGO}`, `crescent stroke · ${LOGO}`, `boxed dot · ${LOGO}`],
  'components/brand/WhorlSpinner.tsx': [`night ridge · ${WHORL}`, `day ridge · ${WHORL}`, `dot fallback · ${WHORL}`],
  'components/dayRow/SpineNodeRow.tsx': [`runRail · ${FILL}`],
  'components/food/AlwaysAvailableCard.tsx': [`sharedDot · ${FILL}`],
  'components/food/TrialContaminantNote.tsx': [`card edge · ${FILL}`],
  'components/foods/ArchivedFoodRow.tsx': [`trialChipDot · ${FILL}`],
  'components/foods/FoodRow.tsx': [`trialChipDot · ${FILL}`],
  'components/foods/FoodsTrialStrip.tsx': [`dot · ${FILL}`],
  'components/historyV2/DayCard.tsx': [`bowl bar · ${FILL}`],
  'components/historyV2/GapLine.tsx': [`barBowl · ${FILL}`],
  'components/historyV2/HistoryList.tsx': [`bowlBar · ${FILL}`],
  'components/home/HomeHeader.tsx': [`askDot · ${FILL}`],
  'components/home/SignalReceipts.tsx': [`bandDashedEnd · ${FILL}`],
  'components/log/FoodPicker.tsx': [`alwaysDot · ${FILL}`],
  'components/log/FoodTile.tsx': [`tileSelected · ${CHOICE}`],
  'components/log/MixSplitPanel.tsx': [`segmentFirst · ${FILL}`],
  'components/log/SimpleEventConfirm.tsx': [
    `picker accentColor · ${CHOICE}`,
    `picker accentColor · ${CHOICE}`,
    `picker accentColor · ${CHOICE}`,
    `picker accentColor · ${CHOICE}`,
    `chipActive · ${CHOICE}`,
    `radioOn · ${CHOICE}`,
    `radioDot · ${CHOICE}`,
    `summaryPill · ${CHOICE}`,
  ],
  'components/nav/NyxTabBar.tsx': [`avatarRingActive · ${FILL}`, `tickActive · ${FILL}`],
  'components/notifications/NotificationPrimer.tsx': [
    'heroLabel · night ground: the primer\'s night miniature, a decorative eyebrow, not positive.onNight\'s good fact',
  ],
  'components/onboarding/ProgressBar.tsx': [`segmentFilled · ${FILL}`],
  'components/onboarding/ValuePreview.tsx': [
    `report line · ${TREND}`,
    `report endpoint · ${TREND}`,
    `report glyph · ${TREND}`,
    `qtileHot · ${FILL}`,
    `toastCheck · ${FILL}`,
  ],
  'components/profile/DietTrialCard.tsx': [`progressFill · ${FILL}`],
  'components/profile/StartTrialModal.tsx': [`radioOn · ${CHOICE}`],
  'components/profile/TrialCompletionSheet.tsx': [`radioOn edge · ${CHOICE}`, `radioOn fill · ${CHOICE}`],
  'components/profile/TrialProteinPicker.tsx': [`optionRowOn · ${CHOICE}`, `radioOn · ${CHOICE}`],
  'components/recap/DailyRecapOffer.tsx': [`OFFER_BORDER · ${NIGHT_RECAP}`, `turnOn · ${NIGHT_RECAP}`],
  'components/recap/nodeTints.ts': [
    'NODE_TINT_NIGHT.meal · tint map: exported with NODE_TINT_NIGHT_GROUND and pinned in theme.contrast.test.ts',
  ],
  'components/surfaces/home/LookHeader.tsx': [`rail · ${FILL}`],
  'components/surfaces/signal/SignalScreen.tsx': [`ackDot · ${FILL}`],
  'components/trialScreen/TrialDoorRow.tsx': [`fill · ${FILL}`],
  'components/trialScreen/TrialLedger.tsx': [`meals_logged · ${FILL}`, `today_open · ${FILL}`],
  'components/ui/PrimaryButton.tsx': [`btnAccent · ${FILL} (on night at the Landing and the paywall; on light elsewhere)`],
  'components/ui/TextField.tsx': [`focus edge · ${CHOICE}`],
  'components/vetfiles/DocumentHero.tsx': [`dotOn · ${FILL}`],
  'components/vetvisits/EndTrialReasonSheet.tsx': [`radioOn · ${CHOICE}`],
};

/**
 * The registry's total, measured 2026-10-23 on c4b75d5 after this PR moved the ten
 * colorAccentGlyph sites onto colorRoles.positive.glyphOnLight; 75 after CUL-1908 moved
 * TimeConfidenceField's picker and radios onto colorRoles.action. A RATCHET: lower it
 * whenever an entry goes, and never raise it.
 */
const REGISTRY_CEILING = 75;

/** A justified entry names its key, then a ground or the issue that owns its move. */
const JUSTIFIED = /^\S.* · (?:(?:night|dark) ground: \S|brand mark: \S|tint map: \S|CUL-\d+: \S)/;

const NAME = new RegExp(`(?<![\\w$])(${GUARDED.join('|')})(?![\\w$])`, 'g');

function walk(root: string, dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return out;
    throw e;
  }
  for (const ent of entries) {
    const rel = path.posix.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(root, rel, out);
    } else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) {
      out.push(rel);
    }
  }
  return out;
}

export type HueSite = { file: string; line: number; name: string };

/**
 * Every guarded hue named in code under `root`. `root` is required, never defaulted
 * (CUL-712), so a self-test cannot silently scan the real tree.
 */
export function findRawHueSites(root: string): HueSite[] {
  const sites: HueSite[] = [];
  for (const rel of SCAN_DIRS.flatMap((d) => walk(root, d)).sort()) {
    let src: string;
    try {
      // Bytes, not a grep: app/food/[id].tsx holds NUL bytes (styleLiteralBudget).
      src = fs.readFileSync(path.join(root, rel)).toString('utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') continue;
      throw e;
    }
    const lines = blankComments(src).split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(NAME)) sites.push({ file: rel, line: i + 1, name: m[1] });
    });
  }
  return sites;
}

/** Each way the tree and the registry disagree, as a message naming the repair. */
export function registryProblems(sites: readonly HueSite[], registry: Record<string, readonly string[]>): string[] {
  const byFile = new Map<string, HueSite[]>();
  for (const s of sites) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s]);
  const problems: string[] = [];
  for (const file of [...new Set([...byFile.keys(), ...Object.keys(registry)])].sort()) {
    const found = byFile.get(file) ?? [];
    const allowed = registry[file]?.length ?? 0;
    if (found.length > allowed) {
      problems.push(
        `${file}: ${found.length} raw hue site(s), ${allowed} registered. ` +
          `Reach the colour through colorRoles (constants/theme.ts) by its job and ground: ` +
          found.map((s) => `:${s.line} ${s.name}`).join(', ') +
          '. Never add a registry entry to go green.',
      );
    } else if (found.length < allowed) {
      problems.push(
        `${file}: ${found.length} raw hue site(s), ${allowed} registered. A site moved onto a role: ` +
          `delete its entry from REGISTRY and lower REGISTRY_CEILING in this same PR.`,
      );
    }
  }
  return problems;
}

/** The theme token names `colorRoles` resolves, read from the source of its block. */
function roleTokenNames(): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'constants', 'theme.ts'), 'utf8');
  const block = src.match(/export const colorRoles = \{([\s\S]*?)\n\} as const;/);
  if (!block) throw new Error('colorRoles block not found in constants/theme.ts');
  return [...new Set([...blankComments(block[1]).matchAll(/\btheme\.(\w+)/g)].map((m) => m[1]))].sort();
}

function roleLeaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  return Object.values(node as Record<string, unknown>).flatMap(roleLeaves);
}

describe('CUL-2175: a raw hue reaches a screen only through a role', () => {
  const sites = findRawHueSites(ROOT);

  it('is actually scanning the app (not passing over an empty tree)', () => {
    expect(SCAN_DIRS.flatMap((d) => walk(ROOT, d)).length).toBeGreaterThan(300);
    expect(sites.length).toBeGreaterThan(0);
    // One known registered site is still found where the registry says it is.
    expect(sites.filter((s) => s.file === 'components/brand/CulpritMark.tsx')).toHaveLength(3);
  });

  it('guards the teal under every name, plus the role only tokens (pinned)', () => {
    expect(GUARDED).toEqual([
      'colorAccent',
      'colorAccentGlyph',
      'colorAction',
      'colorEventMeal',
      'colorMomentConfirm',
      'colorMoonlitTeal',
    ]);
  });

  it('decides every token colorRoles resolves: guarded, or not yet with a reason', () => {
    const tokens = roleTokenNames();
    expect(tokens.length).toBeGreaterThan(15);
    const undecided = tokens.filter((t) => !GUARDED.includes(t) && !(t in NOT_GUARDED_YET));
    expect(undecided).toEqual([]);
    // And the reverse: a stale reason for a token the roles no longer resolve.
    expect(Object.keys(NOT_GUARDED_YET).filter((t) => !tokens.includes(t))).toEqual([]);
    // The role only tokens really are role values.
    const leaves = new Set(roleLeaves(colorRoles));
    for (const t of ROLE_ONLY) expect({ t, isLeaf: leaves.has(theme[t]) }).toEqual({ t, isLeaf: true });
  });

  it('every raw site is registered, and every registered site still exists', () => {
    expect(registryProblems(sites, REGISTRY)).toEqual([]);
  });

  it('every registry entry names its ground or the issue that owns its move', () => {
    const unjustified = Object.entries(REGISTRY).flatMap(([file, entries]) =>
      entries.filter((e) => !JUSTIFIED.test(e)).map((e) => `${file}: "${e}"`),
    );
    expect(unjustified).toEqual([]);
  });

  it(`the registry holds ${REGISTRY_CEILING} sites, and no more`, () => {
    const total = Object.values(REGISTRY).reduce((n, e) => n + e.length, 0);
    if (total > REGISTRY_CEILING) {
      throw new Error(
        `REGISTRY holds ${total} sites, over the ceiling of ${REGISTRY_CEILING}. Use colorRoles for the ` +
          'site you added. DO NOT raise REGISTRY_CEILING in guards/colourRoles.test.ts to go green.',
      );
    }
    if (total < REGISTRY_CEILING) {
      throw new Error(
        `REGISTRY holds ${total} sites, below the ceiling of ${REGISTRY_CEILING}. Set REGISTRY_CEILING ` +
          `to ${total} in this same PR, so the freed room is not a budget to regrow into.`,
      );
    }
    expect(total).toBe(REGISTRY_CEILING);
  });
});

// The detector's own proof (C-18): break the thing it protects, one defect at a time.
// Fixtures live outside the repo (CUL-712), so a deliberately raw file is never inside
// a parallel guard's scan.
describe('the colour guard, proven by mutation', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('colour-roles', ['components', 'app', 'hooks']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
    root = '';
  });

  const LIGHT_CARD =
    "import { theme } from '../constants/theme';\n" +
    'const s = StyleSheet.create({\n' +
    '  card: { backgroundColor: theme.colorSurface },\n' +
    '  check: { color: theme.colorAccentInk },\n' +
    '});\n';

  it('a raw theme.colorAccent added to a light ground component reds it', () => {
    writeFixture(root, 'components/Card.tsx', LIGHT_CARD);
    expect(registryProblems(findRawHueSites(root), {})).toEqual([]);
    writeFixture(root, 'components/Card.tsx', LIGHT_CARD.replace('theme.colorAccentInk', 'theme.colorAccent'));
    const problems = registryProblems(findRawHueSites(root), {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^components\/Card\.tsx: 1 raw hue site\(s\), 0 registered\. .*:4 colorAccent/);
  });

  it('removing a registry entry whose site still exists reds it', () => {
    writeFixture(root, 'components/Mark.tsx', 'const a = theme.colorAccent;\nconst b = theme.colorAccent;\n');
    const sites = findRawHueSites(root);
    expect(registryProblems(sites, { 'components/Mark.tsx': ['a · brand mark: x', 'b · brand mark: x'] })).toEqual([]);
    expect(registryProblems(sites, { 'components/Mark.tsx': ['a · brand mark: x'] })).toEqual([
      expect.stringMatching(/^components\/Mark\.tsx: 2 raw hue site\(s\), 1 registered\./),
    ]);
  });

  it('an entry whose site moved onto a role reds until it is deleted', () => {
    writeFixture(root, 'components/Moved.tsx', 'const a = colorRoles.positive.glyphOnLight;\n');
    expect(registryProblems(findRawHueSites(root), { 'components/Moved.tsx': ['a · brand mark: x'] })).toEqual([
      expect.stringMatching(/A site moved onto a role: delete its entry/),
    ]);
  });

  it('reads every guarded name and every way of naming it', () => {
    writeFixture(
      root,
      'app/Many.tsx',
      [
        'const a = theme.colorEventMeal;',
        'const b = theme.colorMomentConfirm;',
        "const c = theme['colorAction'];",
        'const { colorAccentGlyph } = theme;',
        'const d = <Icon color={theme.colorMoonlitTeal} />;',
        "const e = theme.colorAccent + '73';",
      ].join('\n'),
    );
    expect(findRawHueSites(root).map((s) => [s.line, s.name])).toEqual([
      [1, 'colorEventMeal'],
      [2, 'colorMomentConfirm'],
      [3, 'colorAction'],
      [4, 'colorAccentGlyph'],
      [5, 'colorMoonlitTeal'],
      [6, 'colorAccent'],
    ]);
  });

  it('scans hooks/ too', () => {
    writeFixture(root, 'hooks/useTint.ts', 'export const useTint = () => theme.colorAccent;\n');
    expect(findRawHueSites(root).map((s) => s.file)).toEqual(['hooks/useTint.ts']);
  });

  it('leaves the inks, washes and longer names alone', () => {
    writeFixture(
      root,
      'components/Safe.tsx',
      'const s = { a: theme.colorAccentInk, b: theme.colorAccentLight, c: theme.colorEventMealLight, d: theme.colorAccentSoft };\n',
    );
    expect(findRawHueSites(root)).toEqual([]);
  });

  it('reads code, not prose: a comment naming the teal is not a site', () => {
    writeFixture(root, 'components/Note.tsx', '// theme.colorAccent is 2.26:1 on white\n/* colorAction */\nconst s = {};\n');
    expect(findRawHueSites(root)).toEqual([]);
  });

  it('skips test files, so a fixture asserting the defect is not itself one', () => {
    writeFixture(root, 'components/Thing.test.tsx', 'const a = theme.colorAccent;\n');
    expect(findRawHueSites(root)).toEqual([]);
  });

  it('an entry with no ground and no owning issue is not justified', () => {
    expect(JUSTIFIED.test('send · CUL-2178: a teal fill')).toBe(true);
    expect(JUSTIFIED.test('learnMoreText · night ground: colorBrandNight, 8.09:1')).toBe(true);
    expect(JUSTIFIED.test('send · it looks fine')).toBe(false);
    expect(JUSTIFIED.test('send · CUL-2178:')).toBe(false);
    expect(JUSTIFIED.test(' · brand mark: x')).toBe(false);
  });
});
