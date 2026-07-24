// The widget layout, evaluated the way the extension evaluates it (PR W5).
//
// `CulpritWidgetLayout` is a FUNCTION to TypeScript and a source STRING at
// runtime (babel-preset-expo's `'widget'` directive). On device that string is
// evaluated in a bare JavaScriptCore context whose only globals come from
// expo-widgets' own bundle entry. This suite reconstructs that context from the
// SAME modules the bundle uses — `@expo/ui/swift-ui`, its modifiers, and
// expo-widgets' jsx/react/expo stubs — and runs the real string inside it.
//
// That makes the highest-value guarantee structural rather than aspirational:
// if the layout ever closes over an import, a theme token, or any module-scope
// helper, the identifier is not a global in this context and the render throws
// here instead of red-boxing on someone's Home Screen.
//
// It also exercises the press path exactly as `WidgetUserInteraction` does:
// re-render with the current props, find the button whose `target` matches, call
// its `onButtonPress`, and merge the returned patch into props.

jest.mock('expo', () => require('expo-widgets/bundle/expo-stub'));

import { CulpritWidgetLayout } from './CulpritWidget';
import type { CulpritWidgetProps, WidgetPetPanel } from '../lib/widgetProps';

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

function children(node: Node): Node[] {
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
  for (const child of children(node)) texts(child, out);
  return out;
}

/** Mirrors `__expoWidgetHandlePress`: find the target's handler, run it. */
function press(props: CulpritWidgetProps, environment: object, target: string): Partial<CulpritWidgetProps> {
  const find = (node: Node): (() => object) | undefined => {
    if (!node || typeof node !== 'object') return undefined;
    const p = node.props ?? {};
    if (p.target === target && typeof p.onButtonPress === 'function') {
      return p.onButtonPress as () => object;
    }
    for (const child of children(node)) {
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  };
  const handler = find(render(props, environment));
  if (!handler) throw new Error(`no button with target "${target}"`);
  return handler() as Partial<CulpritWidgetProps>;
}

/** What the interaction intent does with a patch: shallow-merge into props. */
function merge(props: CulpritWidgetProps, patch: Partial<CulpritWidgetProps>): CulpritWidgetProps {
  return { ...props, ...patch };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const TODAY = '2026-07-24';
const ENV = { date: new Date(2026, 6, 24, 17, 0), configuration: { petSlot: 'slot1' } };

function panel(overrides: Partial<WidgetPetPanel> = {}): WidgetPetPanel {
  return {
    slot: 1,
    petId: '11111111-1111-4111-8111-111111111111',
    petName: 'Biscuit',
    active: true,
    dayKey: TODAY,
    contextLine: 'Day 12 of 28',
    rows: [
      { label: 'Breakfast', done: true, when: '7:42a', expected: '~7a' },
      { label: 'Dinner', done: false, when: '', expected: '~6p' },
    ],
    mealChoices: [{ label: "Dinner — Hill's z/d", foodItemId: 'f1', kind: 'meal' }],
    treatChoices: [
      { label: 'Dental chew', foodItemId: 't1', kind: 'treat' },
      { label: 'Freeze-dried liver', foodItemId: 't2', kind: 'treat' },
    ],
    bowl: false,
    ...overrides,
  };
}

function props(overrides: Partial<CulpritWidgetProps> = {}): CulpritWidgetProps {
  return {
    schemaVersion: 1,
    pets: { slot1: panel() },
    signedIn: true,
    ui: {},
    pending: [],
    revoked: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('resting state (mock states 1 + 4)', () => {
  it('renders the pet, the trial line, the status rows and both tiles', () => {
    const out = texts(render(props(), ENV));
    expect(out).toContain('Biscuit');
    expect(out).toContain('Day 12 of 28');
    expect(out).toContain('Breakfast');
    expect(out).toContain('7:42a');
    expect(out).toContain('Dinner');
    expect(out).toContain('~6p'); // the unlogged slot shows its window, not a ✓
    expect(out).toContain('Meal');
    expect(out).toContain('Treat');
    expect(out).toContain('tap to pick');
  });

  it('ticks a logged slot and leaves an unlogged one as an open gap', () => {
    const out = texts(render(props(), ENV));
    expect(out).toContain('sf:checkmark.circle.fill'); // Breakfast
    expect(out).toContain('sf:circle'); // Dinner — the visible gap (B-156 G1)
  });

  it('deep-links the status column to that pet AND that day', () => {
    const out = texts(render(props(), ENV));
    expect(out).toContain(
      'link:nyx:///history?date=2026-07-24&pet=11111111-1111-4111-8111-111111111111',
    );
  });

  it('renders a designed empty state before any routine is learned', () => {
    const out = texts(render(props({ pets: { slot1: panel({ rows: [] }) } }), ENV));
    expect(out).toContain('Log a few meals and your usual times show up here.');
  });

  it('a hybrid pet gets both row types (D6)', () => {
    const hybrid = panel({
      contextLine: 'free-fed + meals',
      rows: [
        { label: 'Bowl', done: true, when: 'topped 8:05a', expected: 'free-fed' },
        { label: 'Dinner', done: false, when: '', expected: '~7p' },
      ],
    });
    const out = texts(render(props({ pets: { slot1: hybrid } }), ENV));
    expect(out).toContain('Bowl');
    expect(out).toContain('topped 8:05a');
    expect(out).toContain('free-fed + meals');
  });
});

describe('the staleness guard (§4.1 Q3)', () => {
  it('drops yesterday’s tick, its clock time AND the trial line on a later day', () => {
    const out = texts(render(props(), { ...ENV, date: new Date(2026, 6, 25, 9, 0) }));
    expect(out).not.toContain('7:42a');
    expect(out).not.toContain('Day 12 of 28');
    expect(out).not.toContain('sf:checkmark.circle.fill');
    // The row is still there — as an honest gap with its expected window.
    expect(out).toContain('Breakfast');
    expect(out).toContain('~7a');
  });
});

describe('the flip (D3)', () => {
  it('tapping Meal opens the meal picker with the named lead row and the app door', () => {
    const next = merge(props(), press(props(), ENV, 'tile:meal'));
    const out = texts(render(next, ENV));
    expect(out).toContain('Which meal?');
    expect(out).toContain("Dinner — Hill's z/d");
    expect(out).toContain('one tap · logs now');
    expect(out).toContain('Something else…');
    expect(out).toContain('opens Culprit');
    expect(out).toContain('‹ back');
  });

  it('tapping Treat lists the two most-logged treats, app door last', () => {
    const next = merge(props(), press(props(), ENV, 'tile:treat'));
    const out = texts(render(next, ENV));
    expect(out).toContain('Which treat?');
    expect(out).toContain('Dental chew');
    expect(out).toContain('Freeze-dried liver');
    expect(out.indexOf('Something else…')).toBeGreaterThan(out.indexOf('Freeze-dried liver'));
  });

  it('a slot with no stable named food offers only the app door (D2 no-garbage)', () => {
    const bare = panel({ mealChoices: [] });
    const base = props({ pets: { slot1: bare } });
    const next = merge(base, press(base, ENV, 'tile:meal'));
    const out = texts(render(next, ENV));
    expect(out).toContain('Which meal?');
    expect(out).toContain('Something else…');
    expect(out).not.toContain('one tap · logs now');
  });

  it('a hybrid pet’s meal picker offers the bowl, labelled as not a meal', () => {
    const hybrid = panel({ bowl: true });
    const base = props({ pets: { slot1: hybrid } });
    const next = merge(base, press(base, ENV, 'tile:meal'));
    const out = texts(render(next, ENV));
    expect(out).toContain('Top up bowl');
    expect(out).toContain('not a meal');
  });

  it('flips only the pressing widget’s slot — a second pet’s widget is untouched', () => {
    const two = props({ pets: { slot1: panel(), slot2: panel({ slot: 2, petName: 'Mochi' }) } });
    const next = merge(two, press(two, ENV, 'tile:meal'));
    expect(texts(render(next, ENV))).toContain('Which meal?');
    const otherEnv = { ...ENV, configuration: { petSlot: 'slot2' } };
    const otherOut = texts(render(next, otherEnv));
    expect(otherOut).toContain('Mochi');
    expect(otherOut).not.toContain('Which meal?');
  });
});

describe('capture (the outbox)', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function tapMealChoice() {
    const opened = merge(props(), press(props(), ENV, 'tile:meal'));
    return merge(opened, press(opened, ENV, 'pick:meal:0'));
  }

  it('appends one named capture with tap-time uuids and the widget’s own pet', () => {
    const after = tapMealChoice();
    expect(after.pending).toHaveLength(1);
    const capture = after.pending[0];
    expect(capture.kind).toBe('meal');
    expect(capture.foodItemId).toBe('f1');
    expect(capture.petId).toBe('11111111-1111-4111-8111-111111111111');
    // The ids must satisfy the inbox's UUID guard — they become the row ids.
    expect(capture.id).toMatch(UUID_RE);
    expect(capture.mealId).toMatch(UUID_RE);
    expect(capture.id).not.toBe(capture.mealId);
    expect(Number.isNaN(Date.parse(capture.occurredAt))).toBe(false);
  });

  it('returns to resting and offers the undo', () => {
    const after = tapMealChoice();
    expect(after.ui.slot1.view).toBe('resting');
    expect(after.ui.slot1.logged?.label).toBe("Dinner — Hill's z/d");
    const out = texts(render(after, ENV));
    expect(out).toContain("Dinner — Hill's z/d");
    expect(out).toContain('logged just now');
    expect(out).toContain('Undo');
  });

  it('a bowl top-up carries no food and no meal row', () => {
    const hybrid = props({ pets: { slot1: panel({ bowl: true }) } });
    const opened = merge(hybrid, press(hybrid, ENV, 'tile:meal'));
    const after = merge(opened, press(opened, ENV, 'pick:bowl'));
    expect(after.pending).toHaveLength(1);
    expect(after.pending[0]).toMatchObject({
      kind: 'bowl_topup',
      foodItemId: null,
      mealId: null,
    });
  });

  it('undo takes the capture out of the outbox AND records the revocation', () => {
    const after = tapMealChoice();
    const captureId = after.pending[0].id;
    const undone = merge(after, press(after, ENV, 'undo'));
    expect(undone.pending).toHaveLength(0);
    expect(undone.revoked).toEqual([captureId]);
    expect(undone.ui.slot1.logged).toBeNull();
    expect(texts(render(undone, ENV))).not.toContain('Undo');
  });

  it('the app door names the widget’s pet so the app opens on the right one', () => {
    const opened = merge(props(), press(props(), ENV, 'tile:meal'));
    expect(texts(render(opened, ENV))).toContain(
      'link:nyx:///log?type=meal&pet=11111111-1111-4111-8111-111111111111',
    );
  });
});

describe('the doors (every dead end opens the app — Job 2)', () => {
  it('signed out', () => {
    const out = texts(render(props({ signedIn: false }), ENV));
    expect(out).toContain('Sign in to start logging');
    expect(out).toContain('link:nyx:///');
    expect(out).not.toContain('Biscuit'); // no pet data before a session
  });

  it('an unbound slot', () => {
    const out = texts(render(props(), { ...ENV, configuration: { petSlot: 'slot4' } }));
    expect(out).toContain('No pet in this slot yet');
    expect(out).toContain('Touch and hold the widget to pick a pet.');
  });

  it('a tombstoned pet is named, never silently re-pointed (D5 / B-086)', () => {
    const gone = panel({ active: false, petName: 'Pixel', rows: [], mealChoices: [] });
    const out = texts(render(props({ pets: { slot1: gone } }), ENV));
    expect(out).toContain('Pixel isn’t in Culprit anymore');
    expect(out).toContain('Touch and hold the widget to pick another pet.');
  });
});

describe('what the widget may never say (D9 / §8 / nyx-voice)', () => {
  const surfaces = () => {
    const base = props({ pets: { slot1: panel({ bowl: true }) } });
    const mealOpen = merge(base, press(base, ENV, 'tile:meal'));
    const treatOpen = merge(base, press(base, ENV, 'tile:treat'));
    const logged = merge(mealOpen, press(mealOpen, ENV, 'pick:meal:0'));
    return [base, mealOpen, treatOpen, logged, props({ signedIn: false })]
      .flatMap((p) => texts(render(p, ENV)))
      .concat(texts(render(props(), { ...ENV, configuration: { petSlot: 'slot6' } })));
  };

  it('never reassures, praises, diagnoses, or sells', () => {
    const banned = [
      /\ball clear\b/i,
      /\bdoing (great|well|fine)\b/i,
      /\blooks? (good|healthy|normal)\b/i,
      /\bno (issues|problems|concerns)\b/i,
      /\bnice (work|job)\b/i,
      /\bstreak\b/i,
      /\bpremium\b/i,
      /\bupgrade\b/i,
      /\bfree trial\b/i,
      /\bsignal\b/i,
      /\bAI\b/,
      /!/,
    ];
    const all = surfaces();
    for (const phrase of all) {
      for (const rule of banned) {
        expect(phrase).not.toMatch(rule);
      }
    }
  });

  it('never claims a bowl top-up is intake', () => {
    const hybrid = props({ pets: { slot1: panel({ bowl: true }) } });
    const opened = merge(hybrid, press(hybrid, ENV, 'tile:meal'));
    const out = texts(render(opened, ENV));
    // The disclaimer rides the row itself, not a separate screen the owner
    // might never see.
    expect(out).toContain('not a meal');
  });
});
