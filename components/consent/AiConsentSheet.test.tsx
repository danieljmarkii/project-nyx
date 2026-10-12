import { Modal } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { AiConsentSheet } from './AiConsentSheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderSheet(overrides: Partial<Parameters<typeof AiConsentSheet>[0]> = {}) {
  const onChoose = jest.fn();
  const onNotNow = jest.fn();
  const utils = render(
    <AiConsentSheet
      visible
      door="label"
      petName="Mochi"
      onChoose={onChoose}
      onNotNow={onNotNow}
      saving={null}
      error={null}
      {...overrides}
    />,
  );
  return { ...utils, onChoose, onNotNow };
}

describe('AiConsentSheet (frames A, B, C)', () => {
  it('reports which button was pressed and writes nothing itself', () => {
    const { getByText, onChoose, onNotNow } = renderSheet();
    fireEvent.press(getByText('Allow'));
    expect(onChoose).toHaveBeenLastCalledWith('allow');
    fireEvent.press(getByText("Don't allow"));
    expect(onChoose).toHaveBeenLastCalledWith('dont_allow');
    fireEvent.press(getByText("Not now, I'll type it in"));
    expect(onNotNow).toHaveBeenCalledTimes(1);
  });

  it('names Claude and Anthropic, says the read cannot reassure, and says what still works', () => {
    const { getByText } = renderSheet();
    expect(getByText('Claude, an AI made by Anthropic')).toBeTruthy();
    expect(getByText(/It can't tell you Mochi is fine\./)).toBeTruthy();
    expect(getByText(/Checks that need no photo, like repeated vomiting, still work\./)).toBeTruthy();
  });

  it('the Ask door has its own headline and a plain Not now', () => {
    const { getByText } = renderSheet({ door: 'ask' });
    expect(getByText("Ask about Mochi's record")).toBeTruthy();
    expect(getByText(/It isn't a vet, and it can't tell you Mochi is fine\./)).toBeTruthy();
    expect(getByText('Not now')).toBeTruthy();
  });

  // C-14: What's sent replaces the panel inside the SAME Modal, never a second one.
  it("opens What's sent inside the one Modal, and Done returns to the ask", () => {
    const { getByText, queryByText, UNSAFE_getAllByType } = renderSheet();
    expect(UNSAFE_getAllByType(Modal)).toHaveLength(1);
    fireEvent.press(getByText("What's sent"));
    expect(getByText("What's sent if you allow")).toBeTruthy();
    expect(getByText(/A prescription label can show your name, your clinic and an Rx number\./)).toBeTruthy();
    expect(UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(queryByText('Allow')).toBeNull();
    fireEvent.press(getByText('Done'));
    expect(getByText('Allow')).toBeTruthy();
  });

  it('while one answer saves, the other buttons cannot fire a second write', () => {
    const { getByTestId, onChoose, onNotNow } = renderSheet({ saving: 'allow' });
    fireEvent.press(getByTestId('consent-dont-allow'));
    fireEvent.press(getByTestId('consent-not-now'));
    expect(onChoose).not.toHaveBeenCalled();
    expect(onNotNow).not.toHaveBeenCalled();
  });

  it('shows a failed write and keeps the sheet up', () => {
    const { getByText } = renderSheet({ error: "That didn't save. Check your connection and try again." });
    expect(getByText("That didn't save. Check your connection and try again.")).toBeTruthy();
    expect(getByText('Allow')).toBeTruthy();
  });

  it('Android back is Not now, and never answers', () => {
    const { UNSAFE_getByType, onNotNow, onChoose } = renderSheet();
    UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onNotNow).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });
});
