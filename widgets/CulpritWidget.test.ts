// The widget layout, evaluated the way the extension evaluates it (Widget V2, PR 2).
//
// `CulpritWidgetLayout` is a FUNCTION to TypeScript and a source STRING at runtime
// (babel-preset-expo's `'widget'` directive). On device that string is evaluated in
// a bare JavaScriptCore context whose only globals come from expo-widgets' own
// bundle entry. This suite reconstructs that context from the SAME modules the
// bundle uses — `@expo/ui/swift-ui`, its modifiers, and expo-widgets' jsx/react/expo
// stubs — and runs the real string inside it.
//
// That makes the highest-value guarantee structural rather than aspirational: if the
// layout ever closes over an import, a theme token, or any module-scope helper (the
// class of bug the inlined `EXPECTED_SCHEMA_VERSION` and `T` palette exist to avoid),
// the identifier is not a global here and the render throws in CI, not on someone's
// Home Screen. v2 has no button/press path — every element is a `Link` — so this
// suite also proves the widget can never write (AC 1).

jest.mock('expo', () => require('expo-widgets/bundle/expo-stub'));

import { CulpritWidgetLayout } from './CulpritWidget';
import type {
  CulpritWidgetProps,
  WidgetBand,
  WidgetPetPanel,
  WidgetTile,
} from '../lib/widgetProps';

// ── The extension's global context, rebuilt (mirrors expo-widgets/bundle/index) ──
const widgetGlobals: Record<string, unknown> = {
  ...require('@expo/ui/swift-ui'),
  ...require('@expo/ui/swift-ui/modifiers'),
  ...require('expo-widgets/bundle/jsx-runtime-stub'),
  ...require('expo-widgets/bundle/react-stub'),
  PlatformColor: (...names: string[]) => ({ semantic: names }),
};

type Node = { type?: unknown; props?: Record<string, unknown> } | null | undefined;

function evaluateLayout(): (props: CulpritWidgetProps, environment: object) => Node {
  const source = CulpritWidgetLayout as unknown as string;
  // eslint-disable-next-line no-new-func
  return new Function('__g', `with (__g) { return (${source}); }`)(widgetGlobals);
}

function render(props: CulpritWidgetProps, environment: object): Node {
  return evaluateLayout()(props, environment);
}

function childrenOf(node: Node): Node[] {
  const raw = node?.props?.children;
  if (raw === undefined || raw === null) return [];
  return (Array.isArray(raw) ? raw : [raw]) as Node[];
}

/** Every string the tree would render (SwiftUI Text maps children → `text`). */
function texts(node: Node, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  const props = node.props ?? {};
  for (const key of ['text', 'label'] as const) {
    if (typeof props[key] === 'string') out.push(props[key] as string);
  }
  if (typeof props.systemName === 'string') out.push('sf:' + props.systemName);
  if (typeof props.destination === 'string') out.push('link:' + props.destination);
  for (const child of childrenOf(node)) texts(child, out);
  return out;
}

/** Every node in the tree, pre-order. */
function allNodes(node: Node, out: Node[] = []): Node[] {
  if (!node || typeof node !== 'object') return out;
  out.push(node);
  for (const child of childrenOf(node)) allNodes(child, out);
  return out;
}

/** Does any node carry a modifier of `$type` matching the optional predicate? */
function hasModifier($type: string, node: Node, match?: (m: Record<string, unknown>) => boolean): boolean {
  return allNodes(node).some((n) => {
    const mods = (n?.props?.modifiers as Record<string, unknown>[] | undefined) ?? [];
    return mods.some((m) => m && m.$type === $type && (!match || match(m)));
  });
}

// The jsx stub calls function components, so a rendered node's `type` is the
// native VIEW behind the @expo/ui component — `VStackView`, `HStackView`,
// `DividerView`, `LinkView` — identified by its function name.
function typeName(node: Node): string {
  const t = node?.type as unknown;
  return typeof t === 'function' ? (t as { name: string }).name : String(t);
}

/** All nodes whose native view name matches. */
function nodesOfType(node: Node, name: string): Node[] {
  return allNodes(node).filter((n) => typeName(n) === name);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const TODAY = '2026-07-24';
const ENV = { date: new Date(2026, 6, 24, 17, 0), configuration: { petSlot: 'slot1' } };

function tile(overrides: Partial<WidgetTile> & { kind: WidgetTile['kind'] }): WidgetTile {
  return { label: 'Meals', value: '1', unit: '', sub: '', ...overrides };
}

const TRIAL_BAND: WidgetBand = {
  type: 'trial',
  dots: [
    { logged: true }, { logged: true }, { logged: true }, { logged: true },
    { logged: false }, { logged: true }, { logged: true }, { logged: true },
    { logged: true }, { logged: true }, { logged: true }, { logged: true },
  ],
  todayDotIndex: 11,
  caption: '11 of 12 trial days logged',
};

const PIPS_BAND: WidgetBand = {
  type: 'pips',
  days: [
    { logged: true, symptomLogged: false },
    { logged: true, symptomLogged: false },
    { logged: true, symptomLogged: true },
    { logged: false, symptomLogged: false },
    { logged: true, symptomLogged: false },
    { logged: true, symptomLogged: false },
    { logged: true, symptomLogged: true },
  ],
  caption: 'last 7 days',
};

function panel(overrides: Partial<WidgetPetPanel> = {}): WidgetPetPanel {
  return {
    slot: 1,
    petId: '11111111-1111-4111-8111-111111111111',
    petName: 'Biscuit',
    active: true,
    dayKey: TODAY,
    contextLine: 'Day 12 of 28',
    classTiles: [
      tile({ kind: 'meal', label: 'Meals', value: '1', unit: '· 7:42a', sub: "Hill's z/d" }),
      tile({ kind: 'med', label: 'Meds', value: '1', unit: 'of 2 today', sub: 'Amoxicillin · 8a' }),
      tile({ kind: 'treat', label: 'Treats', value: '1', unit: '· 3:05p', sub: 'Dental chew' }),
    ],
    upNext: { label: 'Dinner', approxTime: '~5p' },
    trialRecord: tile({ kind: 'trialRecord', label: 'Trial record', value: '12', unit: 'of 12 days', sub: 'every day logged so far' }),
    hasTodayEvents: true,
    band: TRIAL_BAND,
    ...overrides,
  };
}

function props(overrides: Partial<CulpritWidgetProps> = {}): CulpritWidgetProps {
  return { schemaVersion: 2, pets: { slot1: panel() }, signedIn: true, ...overrides };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('resting state (mock Day A)', () => {
  it('renders the pet, the trial line, the four fact tiles and the ground band', () => {
    const out = texts(render(props(), ENV));
    expect(out).toContain('Biscuit');
    expect(out).toContain('Day 12 of 28');
    // The four class + up-next tiles (§2.3), first four in priority order.
    expect(out).toContain('MEALS');
    expect(out).toContain("Hill's z/d");
    expect(out).toContain('MEDS');
    expect(out).toContain('of 2 today'); // the med denominator (cadence known)
    expect(out).toContain('TREATS');
    expect(out).toContain('UP NEXT');
    expect(out).toContain('usually ~5p · not logged yet');
    // The ground band's trial strip caption + the Log chip.
    expect(out).toContain('11 of 12 trial days logged');
    expect(out).toContain('Log ›');
  });

  it('uses the §2.3 glyph vocabulary — shape carries type', () => {
    const out = texts(render(props(), ENV));
    expect(out).toContain('sf:circle.fill'); // meal / treat (filled circle)
    expect(out).toContain('sf:app.fill'); // med (rounded square)
    expect(out).toContain('sf:circle'); // up-next (hollow ring)
  });

  it('deep-links every tile to that pet + that day WITH the ts nonce and src=widget', () => {
    const links = texts(render(props(), ENV)).filter((t) => t.startsWith('link:nyx:///history'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toMatch(
        /^link:nyx:\/\/\/history\?date=2026-07-24&ts=\d+&pet=11111111-1111-4111-8111-111111111111&src=widget$/,
      );
    }
  });

  it('links the trial strip to the trial card and the Log chip to quick-log', () => {
    const out = texts(render(props(), ENV));
    expect(out).toContain('link:nyx:///profile?pet=11111111-1111-4111-8111-111111111111&src=widget');
    expect(out).toContain('link:nyx:///log?type=meal&pet=11111111-1111-4111-8111-111111111111&src=widget');
  });

  it('drops the up-next tile when the grid is full and shows the trial-record tile instead', () => {
    // Four class tiles → no room for up-next (⑤) or trial-record (⑥).
    const four = panel({
      classTiles: [
        tile({ kind: 'symptom', label: 'Vomiting', value: '×1', sub: '2:14p' }),
        tile({ kind: 'meal', label: 'Meals', value: '1', sub: 'Kibble' }),
        tile({ kind: 'med', label: 'Meds', value: '1', sub: 'Amoxicillin' }),
        tile({ kind: 'treat', label: 'Treats', value: '1', sub: 'Chew' }),
      ],
    });
    const out = texts(render(props({ pets: { slot1: four } }), ENV));
    expect(out).toContain('VOMITING'); // small-caps label (uppercased for display)
    expect(out).not.toContain('UP NEXT');
    expect(out).not.toContain('TRIAL RECORD');
  });

  it('shows the trial-record tile in a free slot when there is no up-next (evening complete)', () => {
    const evening = panel({
      classTiles: [
        tile({ kind: 'meal', label: 'Meals', value: '2', sub: "Hill's z/d" }),
        tile({ kind: 'med', label: 'Meds', value: '2', unit: 'of 2 today', sub: 'Amoxicillin' }),
        tile({ kind: 'treat', label: 'Treats', value: '1', sub: 'Chew' }),
      ],
      upNext: null,
    });
    const out = texts(render(props({ pets: { slot1: evening } }), ENV));
    expect(out).toContain('TRIAL RECORD');
    expect(out).toContain('every day logged so far');
  });
});

describe('the symptom tile (§2.3 ① — always first, never dropped)', () => {
  it('leads the grid and carries the symptom-light ground (mock Day B)', () => {
    const day = panel({
      contextLine: '',
      classTiles: [
        tile({ kind: 'symptom', label: 'Vomiting', value: '×2', unit: '· last 4:40p', sub: '2:14p · 4:40p' }),
        tile({ kind: 'meal', label: 'Meals', value: '1', unit: '· 8:05a', sub: 'wet food' }),
      ],
      upNext: { label: 'Wet dinner', approxTime: '~7p' },
      trialRecord: null,
      band: PIPS_BAND,
    });
    const out = texts(render(props({ pets: { slot1: day } }), ENV));
    expect(out).toContain('VOMITING'); // small-caps label (uppercased for display)
    expect(out).toContain('×2');
    expect(out).toContain('sf:diamond.fill'); // the symptom glyph (rotated square)
    // Pips band, not the trial strip.
    expect(out).toContain('last 7 days');
    // The free slot falls to the door tile (§2.3 ⑦).
    expect(out).toContain('opens Culprit ›');
  });
});

describe('empty day (§2.6.2)', () => {
  it('shows the honest headline, the up-next window, the door and the band', () => {
    const empty = panel({
      hasTodayEvents: false,
      classTiles: [],
      contextLine: 'Day 13 of 28',
      upNext: { label: 'Breakfast', approxTime: '~7:45a' },
    });
    const out = texts(render(props({ pets: { slot1: empty } }), ENV));
    expect(out).toContain('Nothing logged yet today');
    expect(out).toContain('Breakfast');
    // The empty-day up-next drops "· not logged yet" (the headline already says it).
    expect(out).toContain('usually ~7:45a');
    expect(out).not.toContain('usually ~7:45a · not logged yet');
    expect(out).toContain('opens Culprit ›');
    expect(out).toContain('11 of 12 trial days logged'); // the record still in the band
  });

  it('a pet with a trial but no logged events still shows the band (not the empty grid tile)', () => {
    const empty = panel({ hasTodayEvents: false, classTiles: [], upNext: null });
    const out = texts(render(props({ pets: { slot1: empty } }), ENV));
    expect(out).toContain('Nothing logged yet today');
    expect(out).toContain('opens Culprit ›');
  });
});

describe('the staleness guard (§2.6.5 / AC 6)', () => {
  it('renders the empty day on a later local day — no tile, count, context line, or band coverage', () => {
    const out = texts(render(props(), { ...ENV, date: new Date(2026, 6, 25, 9, 0) }));
    expect(out).toContain('Nothing logged yet today');
    expect(out).not.toContain('Day 12 of 28'); // context line dropped
    expect(out).not.toContain("Hill's z/d"); // no carried tile
    expect(out).not.toContain('of 2 today'); // no carried count
    expect(out).not.toContain('11 of 12 trial days logged'); // no carried coverage
    expect(out).toContain('Log ›'); // the band is still present, as the Log chip alone
  });
});

describe('the doors (every dead end opens the app — Job 2)', () => {
  it('signed out', () => {
    const out = texts(render(props({ signedIn: false }), ENV));
    expect(out).toContain('Sign in to start logging');
    expect(out).toContain('link:nyx:///?src=widget');
    expect(out).not.toContain('Biscuit');
  });

  it('a schema mismatch renders the catch-up door, never garbage (§3)', () => {
    const out = texts(render(props({ schemaVersion: 1 }), ENV));
    expect(out).toContain('Open Culprit to catch up');
    expect(out).not.toContain('Biscuit');
  });

  it('an unbound slot', () => {
    const out = texts(render(props(), { ...ENV, configuration: { petSlot: 'slot4' } }));
    expect(out).toContain('No pet in this slot yet');
  });

  it('a tombstoned pet is named, never silently re-pointed (D5 / B-086)', () => {
    const gone = panel({ active: false, petName: 'Pixel', classTiles: [], upNext: null, trialRecord: null, band: null });
    const out = texts(render(props({ pets: { slot1: gone } }), ENV));
    expect(out).toContain('Pixel isn’t in Culprit anymore');
  });
});

describe('two pets render independently of the in-app active pet (AC 7 / D5)', () => {
  it('each slot resolves its own panel', () => {
    const two = props({
      pets: { slot1: panel(), slot2: panel({ slot: 2, petName: 'Mochi', petId: 'p2', contextLine: '' }) },
    });
    expect(texts(render(two, ENV))).toContain('Biscuit');
    const otherEnv = { ...ENV, configuration: { petSlot: 'slot2' } };
    const otherOut = texts(render(two, otherEnv));
    expect(otherOut).toContain('Mochi');
    expect(otherOut).not.toContain('Biscuit');
  });
});

describe('AC 1 — no widget state can write', () => {
  const everySurface = () => [
    render(props(), ENV),
    render(props({ pets: { slot1: panel({ hasTodayEvents: false, classTiles: [] }) } }), ENV),
    render(props(), { ...ENV, date: new Date(2026, 6, 25, 9, 0) }),
    render(props({ signedIn: false }), ENV),
    render(props({ schemaVersion: 1 }), ENV),
  ];

  it('renders no Button and no press handler — every interactive element is a Link', () => {
    for (const tree of everySurface()) {
      for (const node of allNodes(tree)) {
        const p = node?.props ?? {};
        expect(p.onButtonPress).toBeUndefined();
        expect(p.onPress).toBeUndefined();
        expect(p.target).toBeUndefined();
      }
    }
  });
});

describe('AC 9 — structural geometry (fixed shares, ellipsized lines)', () => {
  it('the resting shell is header · grid · band, and the grid is two rows', () => {
    const root = render(props(), ENV);
    const kids = childrenOf(root);
    expect(kids).toHaveLength(3); // header, grid, band
    const gridRows = childrenOf(kids[1]).filter((n) => typeName(n) === 'HStackView');
    expect(gridRows).toHaveLength(2); // 2×2 grid — two rows
    for (const row of gridRows) {
      expect(childrenOf(row)).toHaveLength(2); // two cells each
    }
  });

  it('the ground band is a fixed 34pt region with a hairline Divider', () => {
    const root = render(props(), ENV);
    const band = childrenOf(root)[2];
    expect(hasModifier('frame', band, (m) => m.height === 34)).toBe(true);
    expect(nodesOfType(band, 'DividerView').length).toBe(1);
  });

  it('the header is a fixed 16pt region', () => {
    expect(hasModifier('frame', render(props(), ENV), (m) => m.height === 16)).toBe(true);
  });

  it('every fact-tile text line clips with a line limit (nothing wraps)', () => {
    const root = render(props(), ENV);
    // A tile value/label/sub carries lineLimit(1); prove the modifier reached the tree.
    expect(hasModifier('lineLimit', root)).toBe(true);
  });

  it('the whole widget is a VStack shell with the container background', () => {
    const root = render(props(), ENV);
    expect(typeName(root)).toBe('VStackView');
    expect(hasModifier('containerBackground', root)).toBe(true);
  });
});

describe('AC 4 / AC 8 / §2.7 — what the widget may never say', () => {
  // Every string across every state — the grep gate the spec mandates on this
  // surface. `missed` / `due` / `overdue` / `all clear` / `all quiet` / `great job`
  // / `streak` / praise / AI copy / monetization, plus no exclamation marks.
  const BANNED = [
    /\bmissed\b/i,
    /\bdue\b/i,
    /\boverdue\b/i,
    /\ball clear\b/i,
    /\ball quiet\b/i,
    /\bgreat job\b/i,
    /\bnice (work|job)\b/i,
    /\bstreak\b/i,
    /\bdoing (great|well|fine)\b/i,
    /\blooks? (good|healthy|normal)\b/i,
    /\bno (issues|problems|concerns)\b/i,
    /\bpremium\b/i,
    /\bupgrade\b/i,
    /\bfree trial\b/i,
    /\bsignal\b/i,
    /\bAI\b/,
    /!/,
  ];

  const withMedNoCadence = panel({
    classTiles: [tile({ kind: 'med', label: 'Meds', value: '1', unit: '· 8a', sub: 'Amoxicillin' })],
    upNext: null,
    trialRecord: null,
  });

  const surfaces = () =>
    [
      render(props(), ENV),
      render(props({ pets: { slot1: panel({ hasTodayEvents: false, classTiles: [] }) } }), ENV),
      render(props({ pets: { slot1: withMedNoCadence } }), ENV),
      render(props({ pets: { slot1: panel({ band: PIPS_BAND }) } }), ENV),
      render(props(), { ...ENV, date: new Date(2026, 6, 25, 9, 0) }),
      render(props({ signedIn: false }), ENV),
      render(props({ schemaVersion: 1 }), ENV),
    ].flatMap((tree) => texts(tree));

  it('never says missed/due/all-clear, never praises, never sells, never asserts AI', () => {
    for (const phrase of surfaces()) {
      // Skip the deep-link URLs (a pet id or ts nonce is not owner-facing copy).
      if (phrase.startsWith('link:') || phrase.startsWith('sf:')) continue;
      for (const rule of BANNED) {
        expect(phrase).not.toMatch(rule);
      }
    }
  });

  // The source-level grep gate (spec §2.7) — a second layer over the rendered gate
  // above. Scans the STRING LITERALS in the layout + the props copy (comments
  // stripped) so a banned word added to a state no fixture reaches still fails CI.
  it('carries no banned word in any string literal of the widget source', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const files = ['CulpritWidget.tsx', '../lib/widgetProps.ts'];
    const literalRe = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
    for (const rel of files) {
      const src: string = fs.readFileSync(path.join(__dirname, rel), 'utf8');
      const literals: string[] = [];
      for (const rawLine of src.split('\n')) {
        const line = rawLine.replace(/\/\/.*$/, ''); // drop line comments
        for (let m = literalRe.exec(line); m; m = literalRe.exec(line)) {
          literals.push(m[1] ?? m[2] ?? '');
        }
      }
      for (const lit of literals) {
        for (const rule of BANNED) {
          expect(lit).not.toMatch(rule);
        }
      }
    }
  });
});

declare const __dirname: string;
