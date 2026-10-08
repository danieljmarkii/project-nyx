// CUL-1636 — the FAB fan's height budget, over the matrix the issue names: 320pt wide
// (an SE under Display Zoom), default text and the AX1 to AX3 multipliers, with the
// phones either side of it. The plan is a pure function of the window, so the matrix
// is asserted here over data; FAB.test.tsx proves the FAB draws what the plan says.
import {
  planFan, wrapEstimate, FAN_GAP, FAN_LEFT_MARGIN, FAN_RIGHT_INSET, PILL_MAX_WIDTH, type FanBudgetInput,
} from './fanBudget';

const DOORS = ['More events', 'Loose stool', 'Vomit', 'Log food'];
// The issue's pair: one line, wet and dry, whose labels are identical once the tag
// says the format (PR-23). Newest first, as getRecentFoods answers.
const FOODS = [
  { id: 'rc-wet', label: 'Royal Canin · Selected Protein PR', tag: 'WET' },
  { id: 'rc-dry', label: 'Royal Canin · Selected Protein PR', tag: 'DRY' },
  { id: 'hills', label: 'Hills · i/d Low Fat', tag: 'DRY' },
];

/** RN's fontScale per iOS content size: default (Large), AX1, AX2, AX3. */
const SCALES = { default: 1, AX1: 1.786, AX2: 2.143, AX3: 2.643 } as const;
/** Width, height, safe-area top. */
const PHONES = {
  'SE, Display Zoom (320)': [320, 568, 20],
  'SE (375×667)': [375, 667, 20],
  'iPhone 15': [393, 852, 59],
  'Pro Max': [430, 932, 59],
} as const;

function plan(phone: keyof typeof PHONES, scale: keyof typeof SCALES, over: Partial<FanBudgetInput> = {}) {
  const [windowWidth, windowHeight, safeTop] = PHONES[phone];
  return planFan({
    windowWidth, windowHeight, safeTop, fontScale: SCALES[scale],
    chipName: 'Schrodingers Cat', doors: DOORS, foods: FOODS, ...over,
  });
}

describe('planFan — the fan fits at every size, and never cuts the pet chip', () => {
  const cases = (Object.keys(PHONES) as (keyof typeof PHONES)[]).flatMap((phone) =>
    (Object.keys(SCALES) as (keyof typeof SCALES)[]).map((scale) => [phone, scale] as const));

  it.each(cases)('%s at %s text: it fits, or the chip pins and the doors scroll', (phone, scale) => {
    const p = plan(phone, scale);
    if (p.scroll) {
      // Even the doors overflow: no food is drawn, and the scroll's cap leaves the
      // pinned chip on screen inside the budget.
      expect(p.foods).toEqual([]);
      expect(p.scrollMaxHeight).not.toBeNull();
      expect(p.scrollMaxHeight!).toBeLessThan(p.available);
    } else {
      expect(p.height).toBeLessThanOrEqual(p.available);
    }
  });

  it.each(cases)('%s at %s text: a pill never runs past the screen', (phone, scale) => {
    const [width] = PHONES[phone];
    const p = plan(phone, scale);
    expect(p.pillMaxWidth + FAN_RIGHT_INSET + FAN_LEFT_MARGIN).toBeLessThanOrEqual(width);
    expect(p.pillMaxWidth).toBeLessThanOrEqual(PILL_MAX_WIDTH);
  });

  it('an SE at default text keeps all three foods (the budget costs nothing where it fit)', () => {
    expect(plan('SE (375×667)', 'default').foods.map((f) => f.id)).toEqual(['rc-wet', 'rc-dry', 'hills']);
    expect(plan('Pro Max', 'AX1').foods).toHaveLength(3);
  });

  it('the 320pt SE: the pill is capped inside the screen, not at 300', () => {
    expect(plan('SE, Display Zoom (320)', 'default').pillMaxWidth).toBe(320 - FAN_RIGHT_INSET - FAN_LEFT_MARGIN);
    expect(plan('SE (375×667)', 'default').pillMaxWidth).toBe(PILL_MAX_WIDTH);
  });

  it('foods leave oldest first: what remains is always the newest, nearest the thumb', () => {
    for (const phone of Object.keys(PHONES) as (keyof typeof PHONES)[]) {
      for (const scale of Object.keys(SCALES) as (keyof typeof SCALES)[]) {
        const ids = plan(phone, scale).foods.map((f) => f.id);
        expect(ids).toEqual(FOODS.slice(0, ids.length).map((f) => f.id));
      }
    }
    // And the budget does drop something on the small phones at large text: the
    // matrix is not green because nothing in it overflows.
    expect(plan('SE (375×667)', 'AX1').foods.length).toBeLessThan(FOODS.length);
    expect(plan('SE, Display Zoom (320)', 'default').foods.length).toBeLessThan(FOODS.length);
  });

  it('the SE at AX2 and up scrolls the doors under a pinned chip', () => {
    expect(plan('SE (375×667)', 'AX2').scroll).toBe(true);
    expect(plan('SE (375×667)', 'AX3').scroll).toBe(true);
    const p = plan('SE, Display Zoom (320)', 'AX3');
    const noChip = plan('SE, Display Zoom (320)', 'AX3', { chipName: null });
    expect(noChip.scroll).toBe(true);
    // The chip's own height and its gap come out of the scroll's cap.
    expect(p.scrollMaxHeight!).toBeLessThan(noChip.scrollMaxHeight!);
    expect(noChip.scrollMaxHeight).toBe(noChip.available);
    expect(noChip.available - p.scrollMaxHeight!).toBeGreaterThan(FAN_GAP);
  });

  it('a single-pet household spends no budget on a chip it does not draw', () => {
    const two = plan('SE (375×667)', 'AX1');
    const one = plan('SE (375×667)', 'AX1', { chipName: null });
    expect(one.height).toBeLessThan(two.height);
    expect(one.foods.length).toBeGreaterThanOrEqual(two.foods.length);
  });
});

describe('planFan — two shown foods never read the same', () => {
  it('the wet / dry pair of one line keeps its two-line cap: the tags already part them', () => {
    for (const scale of Object.keys(SCALES) as (keyof typeof SCALES)[]) {
      for (const f of plan('Pro Max', scale).foods) expect(f.numberOfLines).toBe(2);
    }
  });

  it('two labels that would truncate to the same words under the same tag both wrap in full', () => {
    const twins = [
      { id: 'pr', label: 'Royal Canin · Selected Protein Adult PR Hydrolysed Rabbit', tag: 'DRY' },
      { id: 'pd', label: 'Royal Canin · Selected Protein Adult PD Hydrolysed Duck', tag: 'DRY' },
    ];
    // Room for both (one pet): both lose the cap and wrap in full, inside the budget.
    const p = plan('Pro Max', 'AX1', { foods: twins, chipName: null });
    expect(p.foods.map((f) => f.numberOfLines)).toEqual([undefined, undefined]);
    expect(p.height).toBeLessThanOrEqual(p.available);
    // No room for both at full length (the chip drawn too): the older one leaves, and
    // the one that stays has no twin to be mistaken for, so it keeps its cap.
    expect(plan('Pro Max', 'AX1', { foods: twins }).foods).toEqual([{ id: 'pr', numberOfLines: 2 }]);
    // Two that differ inside two lines keep the cap: nothing is hidden that tells them apart.
    const short = [
      { id: 'pr', label: 'Royal Canin · Selected Protein PR', tag: 'DRY' },
      { id: 'pd', label: 'Royal Canin · Selected Protein PD', tag: 'DRY' },
    ];
    expect(plan('Pro Max', 'default', { foods: short }).foods.map((f) => f.numberOfLines)).toEqual([2, 2]);
  });

  it('two foods whose labels are in fact the same words stay capped: there is nothing to reveal', () => {
    const same = [
      { id: 'x1', label: 'Royal Canin · Selected Protein Adult PR Hydrolysed Rabbit', tag: 'DRY' },
      { id: 'x2', label: 'Royal Canin · Selected Protein Adult PR Hydrolysed Rabbit', tag: 'DRY' },
    ];
    expect(plan('Pro Max', 'AX1', { foods: same }).foods.map((f) => f.numberOfLines)).toEqual([2, 2]);
  });
});

describe('wrapEstimate', () => {
  it('wraps by word, and breaks a word wider than the line', () => {
    expect(wrapEstimate('More events', 15, 1, 300)).toEqual(['More events']);
    expect(wrapEstimate('More events', 15, 2.643, 190)).toEqual(['More', 'events']);
    expect(wrapEstimate('Schrodingerscatsname', 10, 1, 60)).toEqual(['Schrodinge', 'rscatsname']);
    expect(wrapEstimate('', 15, 1, 100)).toEqual(['']);
  });
});
