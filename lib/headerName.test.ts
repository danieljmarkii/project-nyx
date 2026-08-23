import { theme } from '../constants/theme';
import { ESTIMATE_HEADROOM, estimateTextWidth } from './textWidth';
import {
  HEADER_NAME_RUNGS,
  askPillWidth,
  headerNameBudget,
  headerSwitcherLabel,
  resolveHeaderName,
} from './headerName';

// The Home header's name ladder (CUL-600; app-polish spec §2 DP-2, ruling D3):
//     17pt semibold  →  16pt  →  tail-ellipsis
//
// Widths are the phones the app is actually used on: 320pt is the narrowest
// supported frame (SE gen-1), 393pt a current iPhone, 430pt a Pro Max. Every
// assertion states its frame, because a rung is a function of the ROW's width and a
// test that omits it is a claim about no phone in particular.
const W_NARROW = 320;
const W_TYPICAL = 393;
const W_LARGE = 430;

const RUNG_FULL = HEADER_NAME_RUNGS[0];
const RUNG_TIGHT = HEADER_NAME_RUNGS[1];

/** The tightest real configuration: multi-pet chevron AND the Ask pill both present. */
const tightest = (windowWidth: number) =>
  headerNameBudget({ windowWidth, multiPet: true, askEnabled: true });

describe('the ladder is the ruled one', () => {
  it('runs 17pt → 16pt, and the rungs are the theme tokens the spec names', () => {
    expect(RUNG_FULL).toBe(theme.textLG);
    expect(RUNG_FULL).toBe(17);
    expect(RUNG_TIGHT).toBe(theme.textHeaderNameTight);
    expect(RUNG_TIGHT).toBe(16);
    expect(HEADER_NAME_RUNGS).toHaveLength(2);
  });

  it('ellipsises AT the bottom rung — never back up at 17pt', () => {
    // The third rung is a tail on the second, not a rung of its own. Falling back up
    // to 17pt would cut MORE of the name to say the same thing louder.
    const tail = resolveHeaderName('Willowbrook Fitzgerald', tightest(W_NARROW));
    expect(tail.willEllipsize).toBe(true);
    expect(tail.fontSize).toBe(RUNG_TIGHT);
  });

  it('renders every ordinary name whole at the top rung on the narrowest phone', () => {
    for (const name of ['Nyx', 'Biscuit', 'Mochi', 'Bartholomew', 'Luna', 'Willow']) {
      const resolved = resolveHeaderName(name, tightest(W_NARROW));
      expect(resolved).toEqual({ fontSize: RUNG_FULL, willEllipsize: false });
    }
  });

  it('spends the middle rung to keep a name whole rather than tailing it', () => {
    // "Captain Nibbles" overruns 17pt on a 320pt phone with both the chevron and the
    // Ask pill present, and fits at 16pt. That is the entire job of the middle rung.
    const resolved = resolveHeaderName('Captain Nibbles', tightest(W_NARROW));
    expect(resolved).toEqual({ fontSize: RUNG_TIGHT, willEllipsize: false });
  });
});

describe('the rung is a function of the row, not a verdict on the name', () => {
  it('gives the same name a better rung on a wider phone', () => {
    const name = 'Schrodingers Cat';
    expect(resolveHeaderName(name, tightest(W_NARROW))).toEqual({
      fontSize: RUNG_TIGHT,
      willEllipsize: true,
    });
    expect(resolveHeaderName(name, tightest(W_TYPICAL))).toEqual({
      fontSize: RUNG_FULL,
      willEllipsize: false,
    });
    expect(resolveHeaderName(name, tightest(W_LARGE))).toEqual({
      fontSize: RUNG_FULL,
      willEllipsize: false,
    });
  });

  it('gives the same name a better rung when there is no chevron to draw', () => {
    // A single-pet household spends no width on multi-pet chrome, so the name gets it.
    const name = 'Schrodingers Cat';
    const single = headerNameBudget({
      windowWidth: W_NARROW,
      multiPet: false,
      askEnabled: true,
    });
    expect(resolveHeaderName(name, single).willEllipsize).toBe(false);
  });

  it('gives the name the Ask pill’s width back when Ask is off for this account', () => {
    const withAsk = headerNameBudget({ windowWidth: W_NARROW, multiPet: true, askEnabled: true });
    const without = headerNameBudget({ windowWidth: W_NARROW, multiPet: true, askEnabled: false });
    expect(without - withAsk).toBeCloseTo(askPillWidth() + 10, 5);
  });

  it('never renders a worse rung on a wider phone (monotonic in width)', () => {
    // A bar that changed its mind on rotation would be worse than any single rung.
    // Rung index rises as the name gets smaller, so it must never rise with width.
    const names = ['Nyx', 'Biscuit', 'Captain Nibbles', 'Schrodingers Cat', 'Willowbrook Fitzgerald'];
    const widths = [320, 360, 375, 390, 393, 402, 414, 430, 440];
    for (const name of names) {
      let worst = -1;
      for (const windowWidth of [...widths].reverse()) {
        const { fontSize, willEllipsize } = resolveHeaderName(name, tightest(windowWidth));
        const severity = willEllipsize ? 2 : fontSize === RUNG_TIGHT ? 1 : 0;
        expect(severity).toBeGreaterThanOrEqual(worst);
        worst = severity;
      }
    }
  });
});

describe('the estimate stays on the safe side of its own budget', () => {
  it('never picks a rung whose estimated width exceeds the budget', () => {
    // The invariant the ladder rests on. Deliberately checked against the BUDGET
    // (what the row actually has) rather than the headroomed figure, so a future
    // headroom change cannot make this vacuous.
    const names = ['Nyx', 'Biscuit', 'Captain Nibbles', 'Bartholomew', 'ミルク', '🐈 Mochi'];
    for (const name of names) {
      for (const windowWidth of [320, 375, 393, 430]) {
        const budget = tightest(windowWidth);
        const { fontSize, willEllipsize } = resolveHeaderName(name, budget);
        if (!willEllipsize) {
          expect(estimateTextWidth(name, fontSize, 0)).toBeLessThanOrEqual(budget);
        }
      }
    }
  });

  it('measures the name with no letter spacing, because the header renders none', () => {
    // The Pet tab binds trackingWide; this surface binds 0. Two callers of one table,
    // each stating its own typography — the drift this split exists to prevent.
    const budget = estimateTextWidth('Bartholomew', RUNG_FULL, 0) / ESTIMATE_HEADROOM;
    expect(resolveHeaderName('Bartholomew', budget).fontSize).toBe(RUNG_FULL);
  });

  it('measures an astral name once, not as two half-width halves', () => {
    // Inherited from the shared table, asserted here because this surface is where a
    // replacement glyph would land next to the pet's own photo.
    expect(estimateTextWidth('🐈', RUNG_FULL, 0)).toBeGreaterThan(
      estimateTextWidth('n', RUNG_FULL, 0),
    );
  });
});

describe('degenerate inputs still produce a header', () => {
  it('answers for a blank name rather than throwing', () => {
    for (const name of [null, undefined, '', '   ']) {
      expect(resolveHeaderName(name, tightest(W_NARROW))).toEqual({
        fontSize: RUNG_FULL,
        willEllipsize: false,
      });
    }
  });

  it('never returns a negative budget on an absurdly narrow frame', () => {
    expect(headerNameBudget({ windowWidth: 0, multiPet: true, askEnabled: true })).toBe(0);
    expect(headerNameBudget({ windowWidth: 120, multiPet: true, askEnabled: true })).toBe(0);
  });

  it('tails rather than crashing when there is no room at all', () => {
    expect(resolveHeaderName('Biscuit', 0)).toEqual({
      fontSize: RUNG_TIGHT,
      willEllipsize: true,
    });
  });
});

describe('headerSwitcherLabel — the name is never lost, only unrendered', () => {
  it('speaks the full name even at the rung that tails it', () => {
    expect(headerSwitcherLabel('Willowbrook Fitzgerald', true)).toContain(
      'Willowbrook Fitzgerald',
    );
    expect(headerSwitcherLabel('Willowbrook Fitzgerald', false)).toContain(
      'Willowbrook Fitzgerald',
    );
  });

  it('says which pet is active when there is a choice to make', () => {
    expect(headerSwitcherLabel('Biscuit', true)).toBe('Switch pet — Biscuit active');
  });

  it('still names the pet for a one-pet household', () => {
    // The row stays tappable for everyone (the sheet is the only "Add a pet" door),
    // so its label must still carry the name a tail may have cut.
    expect(headerSwitcherLabel('Biscuit', false)).toBe('Biscuit — your pets');
  });

  it('degrades to a generic label when there is no name to speak', () => {
    expect(headerSwitcherLabel(null, true)).toBe('Your pets');
    expect(headerSwitcherLabel('  ', false)).toBe('Your pets');
  });
});
