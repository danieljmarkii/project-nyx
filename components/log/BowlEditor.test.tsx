// The split on the edit screen (CUL-2090, PM option A): a two-food bowl carries the card's
// stepper, staged until Save, so a wrong split is fixed without taking a food out.
import { render, fireEvent } from '@testing-library/react-native';
import { BowlEditor, stepStagedBowl, type StagedBowlFood } from './BowlEditor';

const staged = (id: string, rowName: string, share: number, extra?: Partial<StagedBowlFood>): StagedBowlFood => ({
  foodItemId: id, foodLabel: rowName, rowName, share, shareSource: 'preset', amountValue: null, amountUnit: null, ...extra,
});

const CHICKEN_THIRD = [staged('c', 'Chicken', 1 / 3), staged('r', 'Rabbit', 2 / 3)];

describe('stepStagedBowl', () => {
  it('moves one stop toward the named food, either way', () => {
    const more = stepStagedBowl(CHICKEN_THIRD, 'first');
    expect(more?.map((f) => f.share)).toEqual([1 / 2, 1 / 2]);
    const less = stepStagedBowl(CHICKEN_THIRD, 'second');
    expect(less?.map((f) => f.share)).toEqual([1 / 4, 3 / 4]);
  });

  it('stops at the end of the scale', () => {
    expect(stepStagedBowl([staged('c', 'Chicken', 3 / 4), staged('r', 'Rabbit', 1 / 4)], 'first')).toBeNull();
    expect(stepStagedBowl([staged('c', 'Chicken', 1 / 4), staged('r', 'Rabbit', 3 / 4)], 'second')).toBeNull();
  });

  it('a measured bowl steps to the nearest stop and becomes an estimate', () => {
    const measured = [
      staged('c', 'Chicken', 0.4, { shareSource: 'amounts', amountValue: 2, amountUnit: 'can' }),
      staged('r', 'Rabbit', 0.6, { shareSource: 'amounts', amountValue: 3, amountUnit: 'can' }),
    ];
    const next = stepStagedBowl(measured, 'first');
    expect(next?.map((f) => f.share)).toEqual([1 / 2, 1 / 2]);
    expect(next?.every((f) => f.shareSource === 'preset' && f.amountValue === null && f.amountUnit === null)).toBe(true);
  });

  it('reads raw shares that do not sum to one as their parts of the bowl', () => {
    const next = stepStagedBowl([staged('c', 'Chicken', 1), staged('r', 'Rabbit', 2)], 'first');
    expect(next?.map((f) => f.share)).toEqual([1 / 2, 1 / 2]);
  });

  it('a one-food bowl has no split to step', () => {
    expect(stepStagedBowl([staged('c', 'Chicken', 1)], 'first')).toBeNull();
  });
});

describe('BowlEditor stepper', () => {
  const props = { loadChoices: jest.fn().mockResolvedValue([]), toStaged: jest.fn() };

  it('stages a step through onChange and writes nothing itself', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<BowlEditor foods={CHICKEN_THIRD} onChange={onChange} {...props} />);
    expect(getByTestId('bowl-step-value').props.children).toBe('⅓·⅔');
    fireEvent.press(getByTestId('bowl-step-first'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((f: StagedBowlFood) => f.share)).toEqual([1 / 2, 1 / 2]);
  });

  it('an end stop is dimmed and says why (C-7)', () => {
    const atEnd = [staged('c', 'Chicken', 3 / 4), staged('r', 'Rabbit', 1 / 4)];
    const { getByTestId } = render(<BowlEditor foods={atEnd} onChange={jest.fn()} {...props} />);
    const first = getByTestId('bowl-step-first');
    expect(first.props.accessibilityState).toEqual({ disabled: true });
    expect(first.props.accessibilityLabel).toBe('More Chicken in this bowl. Already at ¾, the most the steps go.');
    expect(getByTestId('bowl-step-second').props.accessibilityState).toEqual({ disabled: false });
  });

  it('no stepper on a one-food bowl', () => {
    const { queryByTestId } = render(<BowlEditor foods={[staged('c', 'Chicken', 1)]} onChange={jest.fn()} {...props} />);
    expect(queryByTestId('bowl-step-value')).toBeNull();
  });
});
