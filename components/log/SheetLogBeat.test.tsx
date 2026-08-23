// The in-sheet completion beat — the R2 register (`docs/nyx-app-polish-requirements.md`
// §5). Added by CUL-614, which is also what gave this component something worth
// testing: until then it rendered a fixed word.
//
// WHY THIS FILE EXISTS AT ALL. This beat is the ONE completion surface that does not go
// through `momentStore`, because the root <CompletionMoment/> renders under the sheet's
// Modal. So the two rules the store enforces centrally for every other card — the §5.6
// tone split and §5's sentence rule — are re-implemented here, and were enforced by
// nothing: `store/momentStore.test.ts` covers the store's copy of the tone split, and
// this component's copy of it had no coverage. A duplicated safety rule with a test on
// only one of its two implementations is how the two drift.
//
// The verbs are mocked (not `expo-haptics`), matching momentStore.test: this suite is
// about WHICH moment fires; `lib/haptics.test.ts` owns verb→pattern.
jest.mock('../../lib/haptics', () => ({
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
}));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));

import { render } from '@testing-library/react-native';
import { commitRoutine, commitSymptom } from '../../lib/haptics';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { SheetLogBeat } from './SheetLogBeat';

const mockedReducedMotion = useReducedMotion as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedReducedMotion.mockReturnValue(false);
});

describe('the tone split (§5.6 rule 1)', () => {
  it('a SYMPTOM commit takes the single soft tap, never the success pattern', () => {
    // The load-bearing half. A 2am vomit log is acknowledged, never congratulated —
    // the same reasoning that withholds the gold glow from the 'calm' beat. Both
    // assertions matter: the second is what would catch a future edit collapsing the
    // two verbs into one "because both are commits."
    render(<SheetLogBeat tone="calm" title="Vomit · found by 5:33 PM" petName="Nyx" onDone={jest.fn()} />);
    expect(commitSymptom).toHaveBeenCalledTimes(1);
    expect(commitRoutine).not.toHaveBeenCalled();
  });

  it('a routine commit takes the success pattern', () => {
    render(<SheetLogBeat tone="celebrate" title="Other · today at 5:33 PM" petName="Nyx" onDone={jest.fn()} />);
    expect(commitRoutine).toHaveBeenCalledTimes(1);
    expect(commitSymptom).not.toHaveBeenCalled();
  });

  it('still fires under Reduce Motion — touch is not motion', () => {
    // The component comment asserts this and puts the haptic outside the `reduced`
    // branch to achieve it. An owner who turned off animation did not ask to stop being
    // told their log landed, and under Reduce Motion the beat has no spring to announce
    // itself with — so the haptic is carrying MORE of the confirmation there, not less.
    mockedReducedMotion.mockReturnValue(true);
    render(<SheetLogBeat tone="calm" title="Vomit · found by 5:33 PM" petName="Nyx" onDone={jest.fn()} />);
    expect(commitSymptom).toHaveBeenCalledTimes(1);
  });
});

describe('what the beat says (§5 sentence rule + nyx-voice)', () => {
  it('speaks the record it was given, and names the pet it landed on', () => {
    const { getByText } = render(
      <SheetLogBeat tone="calm" title="Vomit · found by 5:33 PM" petName="Nyx" onDone={jest.fn()} />,
    );
    expect(getByText('Vomit · found by 5:33 PM')).toBeTruthy();
    expect(getByText('Saved to Nyx’s record')).toBeTruthy();
  });

  it('announces both lines to a screen reader as one polite live region', () => {
    // Two <Text> nodes, one announcement: a screen-reader user should hear the record
    // and where it landed in the order they are shown, not two interrupting fragments.
    const { getByLabelText } = render(
      <SheetLogBeat tone="celebrate" title="Weight · 12.4 lbs" petName="Nyx" onDone={jest.fn()} />,
    );
    expect(getByLabelText('Weight · 12.4 lbs. Saved to Nyx’s record')).toBeTruthy();
  });
});

describe('the dwell', () => {
  it('calls onDone exactly once, after the beat has been readable', () => {
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      render(<SheetLogBeat tone="calm" title="Vomit · found by 5:33 PM" petName="Nyx" onDone={onDone} />);
      // 1400ms was the pre-CUL-614 dwell, sized for the single word "Logged". A
      // sentence needs longer, so the beat must NOT have closed by then — this is the
      // assertion that would fail if someone restored the old number alongside the new
      // copy, leaving the sentence on screen too briefly to read.
      jest.advanceTimersByTime(1400);
      expect(onDone).not.toHaveBeenCalled();
      jest.advanceTimersByTime(500);
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
