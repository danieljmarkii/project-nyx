// CUL-2728: Remind me's words (mock round 2 §4, D2). The sheet-level behaviour is in
// BookVisitSheet.test.tsx; this pins the lines for each count of reminders left.
import { render, screen } from '@testing-library/react-native';
import { RemindMeRow, onLine, pickedLine, REMIND_ME_SUB } from './RemindMeRow';

const TWO = ['Friday at 6:00 pm', 'Monday at 8:00 am'];

describe('the lines', () => {
  it('picked: the times, capitalised, and that the switch covers every pet', () => {
    expect(pickedLine(TWO)).toBe('Friday at 6:00 pm and Monday at 8:00 am, for every pet’s visits');
    expect(pickedLine(['today at 8:00 am'])).toBe('Today at 8:00 am, for every pet’s visits');
    expect(pickedLine([])).toBe('Turns on reminders for every pet’s visits');
  });

  it('on: names what this booking gets, in the right number', () => {
    expect(onLine(TWO)).toBe('You’ll get reminders Friday at 6:00 pm and Monday at 8:00 am.');
    expect(onLine(['Monday at 8:00 am'])).toBe('You’ll get a reminder Monday at 8:00 am.');
    expect(onLine([])).toBe('Reminders are on.');
  });

  it('no line carries an exclamation mark or a nag', () => {
    for (const l of [pickedLine(TWO), pickedLine([]), onLine(TWO), onLine([]), REMIND_ME_SUB]) {
      expect(l).not.toMatch(/!|don.t forget/i);
    }
  });
});

it('the on face is one accessible sentence with no control', () => {
  render(<RemindMeRow status="on" picked={false} onToggle={jest.fn()} onOpenSettings={jest.fn()} times={TWO} />);
  expect(screen.getByLabelText(onLine(TWO))).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
});
