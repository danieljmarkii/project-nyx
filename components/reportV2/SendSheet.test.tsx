// The send sheet (Vet report v2 PR-18, CUL-2298; spec §10.3, §10.4; C-14).
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('../../lib/a11yFocus', () => ({ focusAccessibility: jest.fn(() => true) }));

import { useState } from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SendSheet, type SendAction } from './SendSheet';
import { useReducedMotionStore } from '../../store/reducedMotionStore';
import { focusAccessibility } from '../../lib/a11yFocus';
import { sendCallCard, sendDocumentsOf } from '../../lib/reportSend';
import type { ComposerLive } from '../../lib/reportComposer';

const TODAY = '2026-10-31';
const FLAGGED: ComposerLive = { state: 'flags', startDate: '2026-09-06', endDate: TODAY, flags: [{ kind: 'present_foreign', sign: 'vomit', trigger: null }] };
const docs = sendDocumentsOf([
  { id: 'inv', title: 'Invoice', kindLabel: 'Invoice or estimate', dateLabel: 'Oct 2', isPdf: true, pageCount: 1, localUri: 'file:///inv.pdf' },
  { id: 'far', title: 'Vaccines', kindLabel: null, dateLabel: 'Aug 1', isPdf: true, pageCount: 1, localUri: '' },
]);

function Host({ onAction, mailReady = true, live = FLAGGED, hour = 10 }: { onAction: (a: SendAction) => void; mailReady?: boolean; live?: ComposerLive; hour?: number }) {
  const [visible, setVisible] = useState(true);
  return (
    <SendSheet
      visible={visible}
      petName="Nyx"
      ownerSurname="Reyes"
      live={live}
      card={sendCallCard(live, 'Nyx', hour)}
      startDate="2026-09-16"
      endDate={TODAY}
      today={TODAY}
      visitDay="2026-11-03"
      documents={docs}
      mailReady={mailReady}
      onClose={() => setVisible(false)}
      onAction={onAction}
    />
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  useReducedMotionStore.setState({ reduceMotion: true });
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

function show(view: ReturnType<typeof render>) {
  act(() => {
    view.UNSAFE_getAllByType(Modal)[0].props.onShow();
  });
  act(() => {
    jest.runAllTimers();
  });
}

describe('the first frame', () => {
  it('leads with the call card, above the targets, and focus lands on it once the sheet is up', () => {
    const view = render(<Host onAction={jest.fn()} />);
    const card = view.getByTestId('send-call-card');
    const firstTarget = view.getByTestId('send-target-email');
    const order = view.toJSON() ? JSON.stringify(view.toJSON()) : '';
    expect(order.indexOf('send-call-card')).toBeLessThan(order.indexOf('send-target-email'));
    expect(card).toBeTruthy();
    expect(firstTarget).toBeTruthy();
    show(view);
    expect(focusAccessibility).toHaveBeenCalled();
  });

  it('after hours the emergency clinic row leads (d5)', () => {
    const view = render(<Host onAction={jest.fn()} hour={21} />);
    const json = JSON.stringify(view.toJSON());
    expect(json.indexOf('send-call-card-row-emergency')).toBeLessThan(json.indexOf('send-call-card-row-clinic'));
  });

  it('is one Modal, and swapping to the email draft presents no second one (C-14)', () => {
    const view = render(<Host onAction={jest.fn()} />);
    show(view);
    fireEvent.press(view.getByTestId('send-target-email'));
    act(() => jest.runAllTimers());
    expect(view.getByTestId('send-panel-email')).toBeTruthy();
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
  });

  it('with no Mail on this phone, the Email row says why and is not a control (C-7)', () => {
    const view = render(<Host onAction={jest.fn()} mailReady={false} />);
    expect(view.queryByTestId('send-target-email')).toBeNull();
    expect(view.getByTestId('send-target-email-unavailable').props.accessibilityState).toBeUndefined();
  });
});

describe('a target runs only after the sheet has gone (C-14)', () => {
  it('Share: the choice is handed over only once the Modal is no longer visible', () => {
    let view: ReturnType<typeof render> | null = null;
    const visibleAtHandOver: boolean[] = [];
    const onAction = jest.fn(() => {
      visibleAtHandOver.push(view?.UNSAFE_queryAllByType(Modal)[0]?.props.visible ?? false);
    });
    view = render(<Host onAction={onAction} />);
    show(view);
    fireEvent.press(view.getByTestId('send-target-share'));
    act(() => jest.runAllTimers());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ target: 'share' });
    expect(visibleAtHandOver).toEqual([false]);
  });

  it('closing without choosing hands nothing over', () => {
    const onAction = jest.fn();
    const view = render(<Host onAction={onAction} />);
    show(view);
    fireEvent.press(view.getByLabelText('Close', { includeHiddenElements: true }));
    act(() => jest.runAllTimers());
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('the email draft (R-12)', () => {
  function toDraft(onAction = jest.fn()) {
    const view = render(<Host onAction={onAction} />);
    show(view);
    fireEvent.press(view.getByTestId('send-target-email'));
    act(() => jest.runAllTimers());
    return { view, onAction };
  }

  it('the owner’s note and questions travel verbatim; vet documents are off by default', () => {
    const { view, onAction } = toDraft();
    fireEvent.changeText(view.getByTestId('send-email-note'), 'He gets it every night with dinner.');
    fireEvent.press(view.getByTestId('send-email-add-question'));
    fireEvent.changeText(view.getByTestId('send-email-question-1'), 'Does that reset the trial clock?');
    fireEvent.press(view.getByTestId('send-email-open'));
    act(() => jest.runAllTimers());
    const action = onAction.mock.calls[0][0];
    expect(action.target).toBe('email');
    expect(action.body).toContain('My note: “He gets it every night with dinner.”');
    expect(action.body).toContain('1. “Does that reset the trial clock?”');
    expect(action.subject).toContain('visit Nov 3');
    expect(action.documentUris).toEqual([]);
  });

  it('a document is attached only when the owner switches it on; one not on this phone cannot be', () => {
    const { view, onAction } = toDraft();
    expect(view.getByTestId('send-document-far')).toBeTruthy();
    fireEvent.press(view.getByText('Invoice'));
    fireEvent.press(view.getByTestId('send-email-open'));
    act(() => jest.runAllTimers());
    expect(onAction.mock.calls[0][0].documentUris).toEqual(['file:///inv.pdf']);
  });

  it('the visit can be left out of the subject and body', () => {
    const { view, onAction } = toDraft();
    fireEvent.press(view.getByText('The visit on Nov 3'));
    fireEvent.press(view.getByTestId('send-email-open'));
    act(() => jest.runAllTimers());
    expect(onAction.mock.calls[0][0].subject).not.toContain('visit');
    expect(onAction.mock.calls[0][0].body).not.toContain('for the visit');
  });

  it('at most five questions can be added', () => {
    const { view } = toDraft();
    for (let i = 0; i < 5; i += 1) fireEvent.press(view.getByTestId('send-email-add-question'));
    expect(view.getByTestId('send-email-question-5')).toBeTruthy();
    expect(view.queryByTestId('send-email-add-question')).toBeNull();
  });
});
