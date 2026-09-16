import { render } from '@testing-library/react-native';
import FeedbackScreen from './feedback';

// Pins the composer's intro block (CUL-250 / B-299). Two facts have to be on
// screen BEFORE the note is written, and they are not the same fact:
//   • this channel does not guarantee a reply;
//   • the channel that does is Contact support, and here is where it lives.
// The second is the one that shipped missing — the support-vs-feedback split was
// legible on the Settings rows and nowhere inside the composer, so an owner
// reporting "my logs aren't syncing" picked the friendlier-sounding door and had
// no way to learn about the other one.
//
// Asserted as rendered text rather than through a helper, because the defect was
// an absence on screen: a test that read the copy from a constant would pass over
// a line that never rendered.

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

describe('Share feedback composer — the support redirect', () => {
  it('names Contact support and where to find it, alongside the reply expectation', () => {
    const { getByText } = render(<FeedbackScreen />);

    // The pre-existing half: no guaranteed reply here.
    expect(getByText("We read every note; we can't always reply.")).toBeTruthy();

    // The half CUL-250 adds: the route out for something broken, named with its
    // location ("the You screen") so it is followable from inside the composer,
    // and carrying the same promise the Settings row makes ("within a day") so
    // the two cannot disagree about what support offers.
    const redirect = getByText(/Something not working\?/);
    expect(redirect).toBeTruthy();
    const text = Array.isArray(redirect.props.children)
      ? redirect.props.children.join('')
      : String(redirect.props.children);
    expect(text).toContain('Contact support');
    expect(text).toContain('You screen');
    expect(text).toContain('within a day');
  });

  it('keeps the redirect out of the send block — it is an expectation, not fine print', () => {
    const { getByText } = render(<FeedbackScreen />);

    // The send hint is the mechanic signpost and stays exactly that. If the
    // redirect ever migrates down here it lands AFTER the owner has written the
    // note, which is the placement pm-feature-review rejected.
    expect(getByText("We'll open your mail app so you can send it.")).toBeTruthy();
  });
});
