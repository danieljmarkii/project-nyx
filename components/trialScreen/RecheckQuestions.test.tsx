// Get ready's recheck questions as drawn (TS-8 · CUL-1304; the dose-list door, CUL-1342).
// The model is `lib/trialRecheck.test.ts`'s business, driven through the real loaders; this
// pins what the drawing does with it: the capped dose rows' door is a 44pt button of its
// own, OUTSIDE the question's one accessibility element, and absent when nothing was capped.
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

import { StyleSheet } from 'react-native';
import { RecheckQuestions } from './RecheckQuestions';
import { doseListLabel, type TrialRecheck } from '../../lib/trialRecheck';

type ReactTestInstance = ReturnType<typeof render>['UNSAFE_root'];

function recheck(doseList: TrialRecheck['questions'][number]['doseList']): TrialRecheck {
  return {
    title: 'Rabbit trial · day 23 of 56',
    subline: null,
    isSafety: false,
    questions: [
      {
        key: 'by_mouth',
        question: 'Has Mochi had anything besides the trial diet, chewable medicine included?',
        answers: [
          { text: 'Jul 21, 07:00 AM · flavoured chewable', label: 'Rimadyl', role: 'fact' },
          { text: 'Rimadyl is a chewable, and chewables are flavoured with something.', label: null, role: 'quiet' },
        ],
        doseList,
      },
      {
        key: 'weight',
        question: 'What does Mochi weigh?',
        answers: [{ text: '41.2–42.0 lb', label: null, role: 'fact' }],
        doseList: null,
      },
    ],
  };
}

/** The nearest ancestor host that is its own accessibility element (C-6: walk UP). */
function accessibleAncestor(node: ReactTestInstance): ReactTestInstance | null {
  let n: ReactTestInstance | null = node.parent;
  while (n) {
    if (typeof n.type === 'string' && n.props.accessible) return n;
    n = n.parent;
  }
  return null;
}

describe('RecheckQuestions — the dose list door (CUL-1342)', () => {
  const LIST = { label: doseListLabel(7), total: 7 };

  it('draws a 44pt button with the total, and opens the list', () => {
    const onOpenDoses = jest.fn();
    const view = render(<RecheckQuestions recheck={recheck(LIST)} onOpenDoses={onOpenDoses} />);
    const door = view.getByTestId('recheck-dose-list');
    expect(door.props.accessibilityRole).toBe('button');
    expect(door.props.accessibilityLabel).toBe('See all 7 logged doses given by mouth');
    expect(view.getByText('See all 7 logged doses given by mouth')).toBeTruthy();
    expect(StyleSheet.flatten(door.props.style).minHeight).toBeGreaterThanOrEqual(44);
    // No slop to reach into a neighbour's gap (C-5).
    expect(door.props.hitSlop).toBeUndefined();
    fireEvent.press(door);
    expect(onOpenDoses).toHaveBeenCalledTimes(1);
  });

  it('sits outside the question’s one accessibility element, so VoiceOver can reach it', () => {
    const view = render(<RecheckQuestions recheck={recheck(LIST)} onOpenDoses={jest.fn()} />);
    const question = view.getByTestId('recheck-by_mouth');
    const door = view.getByTestId('recheck-dose-list');
    expect(accessibleAncestor(door)).toBeNull();
    // …and the question's spoken sentence does not swallow the door's label.
    expect(question.props.accessibilityLabel).not.toContain('See all');
  });

  it('no cap, no door', () => {
    const view = render(<RecheckQuestions recheck={recheck(null)} onOpenDoses={jest.fn()} />);
    expect(view.queryByTestId('recheck-dose-list')).toBeNull();
  });
});
