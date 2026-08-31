import { render, fireEvent } from '@testing-library/react-native';
import {
  ExtractionFailedBanner,
  EXTRACTION_FAILED_DETAIL,
  EXTRACTION_FAILED_TITLE,
  EXTRACTION_RETRY_LABEL,
} from './ExtractionFailedBanner';

// CUL-651. The banner used to print `row.ai_extraction_error` — the Edge
// Function's verbatim `err.message` — as its second line, so a Claude HTTP
// status could land on a screen about a cat's food.
//
// What is pinned here is the SHAPE of the fix, not the deletion of one line: the
// component has no prop that could hold a display string, so the leak has nowhere
// to come back through. A later "just show the cause, it's useful for support"
// edit has to add a prop and change this file, which is the visible argument the
// CLAUDE.md guard convention is after.
describe('ExtractionFailedBanner', () => {
  it('says what failed and what the owner can do, and never a stored cause', () => {
    const { getByText, getByTestId } = render(
      <ExtractionFailedBanner onRetry={() => {}} retrying={false} />,
    );
    expect(getByText(EXTRACTION_FAILED_TITLE)).toBeTruthy();
    expect(getByText(EXTRACTION_FAILED_DETAIL)).toBeTruthy();
    expect(getByTestId('food-extraction-retry')).toBeTruthy();
  });

  // The real guard on the leak is `guards/ownerFacingCopy.test.ts`, which now
  // fails the build on a stored-error field reaching a display sink. What is
  // enforceable HERE is that there is no door to put one through: this fails
  // `tsc --noEmit` (and so CI) the day the component grows a prop that could
  // carry a cause string. A runtime "does not render the error" assertion would
  // be the green-over-its-own-defect shape CUL-613 warns about — it can only
  // pass, because the fixture has no error to hand over.
  it('has no prop that could carry a stored cause (compile-time)', () => {
    const el = (
      // @ts-expect-error — no `detail` prop exists, and adding one must be argued.
      <ExtractionFailedBanner onRetry={() => {}} retrying={false} detail="Claude API error 529" />
    );
    expect(el).toBeTruthy();
  });

  // The rendered copy, enumerated. A third line — a support code, a cause, a
  // "contact us" — has to change this test rather than arriving quietly.
  it('renders exactly two lines of copy above the button', () => {
    const { UNSAFE_getAllByType } = render(
      <ExtractionFailedBanner onRetry={() => {}} retrying={false} />,
    );
    const { Text } = require('react-native');
    const strings = UNSAFE_getAllByType(Text)
      .map((n: { props: { children: unknown } }) => n.props.children)
      .filter((c: unknown): c is string => typeof c === 'string');
    expect(strings).toEqual([
      EXTRACTION_FAILED_TITLE,
      EXTRACTION_FAILED_DETAIL,
      EXTRACTION_RETRY_LABEL,
    ]);
  });

  it('retries on press', () => {
    const onRetry = jest.fn();
    const { getByTestId } = render(<ExtractionFailedBanner onRetry={onRetry} retrying={false} />);
    fireEvent.press(getByTestId('food-extraction-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // The retry is live the moment the banner appears, so a second tap while the
  // first invoke is still out would fire a second extraction (and spend a second
  // usage unit against §4.3's cap). `disabled` is the correct claim here, unlike
  // CUL-682's case: the control exists and is genuinely unavailable right now.
  it('holds the button while a retry is in flight, and says so', () => {
    const onRetry = jest.fn();
    const { getByTestId, queryByText } = render(
      <ExtractionFailedBanner onRetry={onRetry} retrying />,
    );
    const btn = getByTestId('food-extraction-retry');
    fireEvent.press(btn);
    expect(onRetry).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    // The label is replaced by the whorl, so the row cannot read as tappable.
    expect(queryByText(EXTRACTION_RETRY_LABEL)).toBeNull();
  });

  // …and the button must not go ANONYMOUS when that happens. The whorl sets
  // `accessible={false}` unless given a label, so a button named only by its text
  // child loses its name at the exact moment it also becomes dimmed — a screen
  // reader is left with an unavailable control and no idea what it is or why.
  // `disabled` is a claim (CUL-682) and `busy` is what states the reason.
  it('keeps its name and says it is busy while the label is a spinner', () => {
    const { getByTestId } = render(<ExtractionFailedBanner onRetry={() => {}} retrying />);
    const btn = getByTestId('food-extraction-retry');
    expect(btn.props.accessibilityLabel).toBe(EXTRACTION_RETRY_LABEL);
    expect(btn.props.accessibilityState?.busy).toBe(true);
  });
});
