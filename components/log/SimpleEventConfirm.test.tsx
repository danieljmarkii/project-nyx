// B-745 PR 3 — the one-surface confirm. This pins the two ruled ACs:
//   AC-CHIP  — the Saw it / Found it chips never wrap/squeeze/truncate; the pair
//              drops to its own row on narrow widths. The layout-less test asserts
//              the structural CONTRACT that guarantees both states (numberOfLines=1
//              + flexShrink:0 on the chips, flexWrap on the row); the visual check at
//              320pt + max accessibility font is QA spine #3 (on-device).
//   AC-FOUND — the window state set: witnessed / open-ended / bounded, each writing
//              exactly the right occurred_at_confidence + bounds, and the pill wording
//              at History parity.

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
// Foreground state drives the CUL-576 re-derive, so drive it explicitly rather
// than through a real AppState event (the components/ui/TextField.test.tsx shape).
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockInsert = jest.fn().mockResolvedValue({
  eventId: 'e1', occurredAtIso: '2026-08-13T17:33:00.000Z', now: '2026-08-13T17:33:00.000Z',
});
jest.mock('../../lib/simpleEvent', () => ({
  insertSimpleEvent: (...a: unknown[]) => mockInsert(...a),
}));

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SimpleEventConfirm } from './SimpleEventConfirm';
import { useAppActive } from '../../hooks/useAppActive';
import { formatTime } from '../../lib/utils';

const mockedAppActive = useAppActive as jest.Mock;

function renderConfirm(type: any = 'vomit') {
  const onBack = jest.fn();
  const onLogged = jest.fn();
  const onDraftChange = jest.fn();
  const utils = render(
    <SimpleEventConfirm
      type={type} petId="p1" petName="Nyx"
      onBack={onBack} onLogged={onLogged} onDraftChange={onDraftChange}
    />,
  );
  return { ...utils, onBack, onLogged, onDraftChange };
}

/** The most recent draft the confirm reported up (CUL-612). */
function latestDraft(onDraftChange: jest.Mock) {
  return onDraftChange.mock.calls[onDraftChange.mock.calls.length - 1][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedAppActive.mockReturnValue(true);
});

describe('SimpleEventConfirm — header + default (witnessed) state', () => {
  it('names the record "{Type} — {Pet}" and defaults to a witnessed pill', () => {
    const { getByText } = renderConfirm('vomit');
    expect(getByText('Vomit — Nyx')).toBeTruthy();
    // The pill IS the save: "Vomit · today at {time}".
    expect(getByText(/^Vomit · today at /)).toBeTruthy();
  });

  it('Other reads "Other — Nyx"', () => {
    const { getByText } = renderConfirm('other');
    expect(getByText('Other — Nyx')).toBeTruthy();
  });
});

describe('AC-CHIP — the chips never wrap/squeeze/truncate', () => {
  it('renders both chip labels in full', () => {
    const { getByText } = renderConfirm();
    expect(getByText('Saw it')).toBeTruthy();
    expect(getByText('Found it')).toBeTruthy();
  });

  it('each chip label is single-line (numberOfLines=1)', () => {
    const { getByText } = renderConfirm();
    expect(getByText('Saw it').props.numberOfLines).toBe(1);
    expect(getByText('Found it').props.numberOfLines).toBe(1);
  });

  it('each chip and the chip pair are flexShrink:0 (never squeezed)', () => {
    const { getByTestId } = renderConfirm();
    expect(StyleSheet.flatten(getByTestId('chip-saw').props.style).flexShrink).toBe(0);
    expect(StyleSheet.flatten(getByTestId('chip-found').props.style).flexShrink).toBe(0);
    expect(StyleSheet.flatten(getByTestId('confirm-chip-pair').props.style).flexShrink).toBe(0);
  });

  it('the time row wraps, so the chip pair drops to its own line when tight', () => {
    const { getByTestId } = renderConfirm();
    expect(StyleSheet.flatten(getByTestId('confirm-time-row').props.style).flexWrap).toBe('wrap');
  });
});

describe('AC-FOUND — witnessed / open-ended / bounded', () => {
  it('witnessed (default) → Log it writes confidence witnessed, no bounds', async () => {
    const { getByText, onLogged } = renderConfirm('vomit');
    fireEvent.press(getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const arg = mockInsert.mock.calls[0][0];
    expect(arg).toMatchObject({ eventType: 'vomit', petId: 'p1', confidence: 'witnessed', earliest: null, latest: null });
    // CUL-614 — the result carries the RECORD as written, so the host's beat derives
    // its sentence from the same buildTimeFields output the pill and the write used.
    expect(onLogged).toHaveBeenCalledWith({
      eventId: 'e1',
      occurredAtIso: '2026-08-13T17:33:00.000Z',
      record: { kind: 'event', typeLabel: 'Vomit', confidence: 'witnessed', earliest: null, latest: null },
    });
  });

  it('Found it → open-ended window: pill reads "found by …", writes window w/ latest only', async () => {
    const { getByText, onLogged } = renderConfirm('vomit');
    fireEvent.press(getByText('Found it'));
    // Pill + row shift to the History-parity open-ended wording — NOT "since this morning".
    expect(getByText(/^Vomit · found by /)).toBeTruthy();
    expect(getByText(/^Found by /)).toBeTruthy();

    fireEvent.press(getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const arg = mockInsert.mock.calls[0][0];
    expect(arg.confidence).toBe('window');
    expect(arg.earliest).toBeNull();          // open-ended: no fabricated lower bound
    expect(arg.latest).toBeInstanceOf(Date);

    // CUL-614 — the record handed to the host mirrors what was WRITTEN, bounds and
    // all. This is the case the sentence rule exists for: the beat must be able to say
    // "found by 5:33 PM" rather than "Logged", and it can only do that honestly if the
    // window travels with the result. A record that flattened to `witnessed` here would
    // let the beat assert the owner saw it happen (the B-448 over-claim direction).
    const passed = onLogged.mock.calls[0][0].record;
    expect(passed).toMatchObject({ kind: 'event', typeLabel: 'Vomit', confidence: 'window', earliest: null });
    expect(passed.latest).toBe(arg.latest.toISOString());
  });

  it('Found it → Adjust window → Between: pill reads "between … and …", writes both edges', async () => {
    const { getByText, getByTestId } = renderConfirm('diarrhea');
    fireEvent.press(getByText('Found it'));
    fireEvent.press(getByTestId('confirm-time-main')); // opens the window editor
    fireEvent.press(getByText('Between two times'));    // seeds earliest = latest − 2h

    expect(getByText(/^Loose stool · between /)).toBeTruthy();

    fireEvent.press(getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const arg = mockInsert.mock.calls[0][0];
    expect(arg.confidence).toBe('window');
    expect(arg.earliest).toBeInstanceOf(Date);
    expect(arg.latest).toBeInstanceOf(Date);
    expect(arg.earliest.getTime()).toBeLessThanOrEqual(arg.latest.getTime());
  });

  it('the window editor opens inside the confirm (no navigation) with both modes', () => {
    const { getByText, getByTestId, queryByText } = renderConfirm();
    expect(queryByText('Between two times')).toBeNull(); // collapsed by default
    fireEvent.press(getByText('Found it'));
    fireEvent.press(getByTestId('confirm-time-main'));
    expect(getByText('Sometime before')).toBeTruthy();
    expect(getByText('Between two times')).toBeTruthy();
  });
});

describe('SimpleEventConfirm — photo copy (clinical-guardrails)', () => {
  it('promises a read only for the types that actually get one (vomit)', () => {
    const { getByText } = renderConfirm('vomit');
    expect(getByText('Optional — I can read it for signs')).toBeTruthy();
  });

  it('does NOT promise a read for a type with no analyze function (itch)', () => {
    const { getByText, queryByText } = renderConfirm('itch');
    expect(queryByText('Optional — I can read it for signs')).toBeNull();
    expect(getByText('Optional')).toBeTruthy();
  });
});

describe('SimpleEventConfirm — double-submit guard', () => {
  it('a second Log it tap does not write twice', async () => {
    const { getByText } = renderConfirm('vomit');
    const pill = getByText('Log it');
    fireEvent.press(pill);
    fireEvent.press(pill);
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});


// ── What the discard guard is told (CUL-612 · §5) ────────────────────────────
//
// The guard itself is EventTypeSheet's; the predicate and copy are
// lib/discardGuard.test.ts's. This block owns the DERIVATION — and the derivation
// is the half a hand-set flag would get wrong. `timeTouched` is computed against
// the values the sheet opened with rather than set at each of the six sites that
// can move the time, so the cases below are what that buys.
describe('SimpleEventConfirm — the draft it reports up', () => {
  it('opens CLEAN — the defaults are the app\u2019s claim, not the owner\u2019s work', () => {
    const { onDraftChange } = renderConfirm();
    expect(latestDraft(onDraftChange)).toEqual({
      hasPhoto: false, timeTouched: false, hasNote: false,
    });
  });

  it('a typed note is work; whitespace is not', () => {
    const { getByPlaceholderText, onDraftChange } = renderConfirm();
    const input = getByPlaceholderText('Add a note (optional)');
    fireEvent.changeText(input, '   ');
    expect(latestDraft(onDraftChange).hasNote).toBe(false);
    fireEvent.changeText(input, 'threw up on the rug');
    expect(latestDraft(onDraftChange).hasNote).toBe(true);
  });

  it('switching to "Found it" counts — it changes the confidence that gets written', () => {
    const { getByText, onDraftChange } = renderConfirm();
    fireEvent.press(getByText('Found it'));
    expect(latestDraft(onDraftChange).timeTouched).toBe(true);
  });

  it('adjusting the window to two bounds counts', () => {
    const { getByText, onDraftChange } = renderConfirm('diarrhea');
    fireEvent.press(getByText('Found it'));
    fireEvent.press(getByText('Adjust window'));
    fireEvent.press(getByText('Between two times'));
    expect(latestDraft(onDraftChange).timeTouched).toBe(true);
  });

  it('merely OPENING the window editor does NOT count — looking is not editing', () => {
    // A guard here would put a dialog in front of an owner who expanded a
    // disclosure and changed nothing.
    const { getByText, onDraftChange } = renderConfirm();
    fireEvent.press(getByText('Found it'));
    const beforeOpen = latestDraft(onDraftChange).timeTouched;
    fireEvent.press(getByText('Adjust window'));
    // "Found it" already made it dirty; what this pins is that opening the editor
    // adds nothing of its own on the witnessed path.
    expect(beforeOpen).toBe(true);

    const fresh = renderConfirm();
    fireEvent.press(fresh.getByTestId('confirm-time-main')); // opens the point picker
    expect(latestDraft(fresh.onDraftChange).timeTouched).toBe(false);
  });

  it('returning to the opening state clears it — re-confirming a default is not work', () => {
    const { getByText, onDraftChange } = renderConfirm();
    fireEvent.press(getByText('Found it'));
    expect(latestDraft(onDraftChange).timeTouched).toBe(true);
    fireEvent.press(getByText('Saw it'));
    expect(latestDraft(onDraftChange).timeTouched).toBe(false);
  });
});

// ── CUL-576 — the clock default: whose claim is it, and when is it re-derived ──
//
// Two defects with one root: `occurred_at` starts as the app's assumption at mount
// and was then (a) labelled as the OWNER's manual choice and (b) never revisited,
// however long the sheet stayed open. Both reach the vet report — (a) as a
// provenance the record does not hold, (b) as a timestamp on the correlation
// engine's key. The fix re-derives on re-entry rather than re-stamping at save,
// because this surface SHOWS the value (§0: the summary pill IS the save).
describe('SimpleEventConfirm — the clock default (CUL-576)', () => {
  // Local components, not UTC literals: the pill renders in the device zone, so a
  // UTC literal would make these assertions a statement about the runner (B-514).
  const opened = new Date(2026, 7, 24, 17, 33);
  const returned = new Date(2026, 7, 24, 18, 5);

  function renderAt(when: Date) {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(when);
    const onDraftChange = jest.fn();
    // A FRESH element each render: React bails out of re-rendering a subtree it is
    // handed a referentially identical element for, which would mean the mocked
    // useAppActive never gets re-read and this helper silently tests nothing.
    const el = () => (
      <SimpleEventConfirm
        type="vomit" petId="p1" petName="Nyx"
        onBack={jest.fn()} onLogged={jest.fn()} onDraftChange={onDraftChange}
      />
    );
    const utils = render(el());
    /** Background the app, move the clock, bring it back — the restored sheet. */
    const reenter = (at: Date) => {
      mockedAppActive.mockReturnValue(false);
      utils.rerender(el());
      jest.setSystemTime(at);
      mockedAppActive.mockReturnValue(true);
      utils.rerender(el());
    };
    return { ...utils, reenter, onDraftChange };
  }

  afterEach(() => { jest.useRealTimers(); });

  it('writes source "now" when untouched — the app’s clock, not the owner’s claim', async () => {
    // The mislabel this replaces: every symptom logged on the default clock wrote
    // 'manual', which is the app asserting a human picked that timestamp.
    const { getByText } = renderAt(opened);
    fireEvent.press(getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockInsert.mock.calls[0][0].source).toBe('now');
  });

  it('writes source "manual" once the owner moves the picker', async () => {
    const view = renderAt(opened);
    fireEvent.press(view.getByTestId('confirm-time-main'));
    fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, new Date(2026, 7, 24, 14, 0));
    fireEvent.press(view.getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockInsert.mock.calls[0][0].source).toBe('manual');
  });

  it('re-derives the untouched time when the sheet is re-entered', () => {
    // The pill is the assertion on purpose: it is what the owner reads, and §0
    // makes it the save. A pill still reading 5:33 PM at 6:05 is the whole defect.
    const { reenter, getByText } = renderAt(opened);
    expect(getByText(`Vomit · today at ${formatTime(opened)}`)).toBeTruthy();
    reenter(returned);
    expect(getByText(`Vomit · today at ${formatTime(returned)}`)).toBeTruthy();
  });

  it('leaves an owner-set time alone across a re-entry', () => {
    // The asymmetry that makes the re-derive safe: the clock may replace the app's
    // own assumption and nothing else. Backgrounding must never silently re-date a
    // time the owner deliberately backfilled.
    const chosen = new Date(2026, 7, 24, 14, 0);
    const view = renderAt(opened);
    fireEvent.press(view.getByTestId('confirm-time-main'));
    fireEvent(view.UNSAFE_getByType('DateTimePicker' as never), 'change', {}, chosen);
    expect(view.getByText(`Vomit · today at ${formatTime(chosen)}`)).toBeTruthy();
    view.reenter(returned);
    expect(view.getByText(`Vomit · today at ${formatTime(chosen)}`)).toBeTruthy();
  });

  it('a re-derive while in "Found it" moves neither the window nor the draft', () => {
    // The found path derives occurred_at from the window's LATEST edge, not from
    // the point — so a re-derive of the point must be invisible here. If it leaked
    // into the window it would widen a discovery bound the owner already asserted,
    // which is a stronger claim than the record holds (the B-448 direction).
    const { reenter, getByText, onDraftChange } = renderAt(opened);
    fireEvent.press(getByText('Found it'));
    const before = getByText(/^Vomit · found by /).props.children;
    const dirtyBefore = latestDraft(onDraftChange).timeTouched;
    reenter(returned);
    expect(getByText(/^Vomit · found by /).props.children).toEqual(before);
    expect(latestDraft(onDraftChange).timeTouched).toBe(dirtyBefore);
  });

  it('a re-derive does not make the sheet dirty — the discard guard stays quiet', () => {
    // CUL-612's guard reads `timeTouched`. If the app moving its own assumption
    // counted as the owner's work, a backdrop tap on a sheet nobody edited would
    // put a discard dialog in front of them.
    const { reenter, onDraftChange } = renderAt(opened);
    expect(latestDraft(onDraftChange).timeTouched).toBe(false);
    reenter(returned);
    expect(latestDraft(onDraftChange).timeTouched).toBe(false);
  });
});

// ── CUL-577 — the sheet is actually wired to the per-source chooser ───────────
//
// The RULE (which permission is asked for, what a denial says) is owned and pinned
// by lib/photoSource.test.ts. What these three add is that this surface reaches it
// — the half a shared module cannot prove about its callers, and the half that was
// wrong here for the whole life of the feature.
describe('SimpleEventConfirm — photo permissions (CUL-577)', () => {
  /** Press a button on the most recent Alert.alert by its label. */
  function pressAlert(label: string) {
    const spy = Alert.alert as unknown as jest.Mock;
    const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as { text: string; onPress?: () => void }[];
    const btn = buttons.find((b) => b.text === label);
    if (!btn) throw new Error(`no "${label}" button on the alert`);
    btn.onPress?.();
  }

  const askCamera = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
  const askLibrary = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
  const launchCamera = ImagePicker.launchCameraAsync as jest.Mock;
  const launchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // clearAllMocks wipes call data but NOT implementations, so a per-test denial
    // would leak into the next test as a granted-looking mock that quietly denies.
    askCamera.mockResolvedValue({ status: 'granted' });
    askLibrary.mockResolvedValue({ status: 'granted' });
    launchCamera.mockResolvedValue({ canceled: true });
    launchLibrary.mockResolvedValue({ canceled: true });
  });
  afterEach(() => { (Alert.alert as unknown as jest.Mock).mockRestore?.(); });

  it('Take photo asks only for camera — a library denial no longer blocks it', async () => {
    // The defect: the library grant gated the chooser itself, so an owner who had
    // said no to Photos could never take a camera shot — on a vomit/stool confirm
    // that is the payload the per-incident AI read runs on.
    askLibrary.mockResolvedValue({ status: 'denied' });
    const { getByText } = renderConfirm('vomit');
    fireEvent.press(getByText('Add a photo'));
    pressAlert('Take photo');
    await waitFor(() => expect(launchCamera).toHaveBeenCalled());
    expect(askCamera).toHaveBeenCalled();
    expect(askLibrary).not.toHaveBeenCalled();
  });

  it('Choose from library asks only for the library', async () => {
    const { getByText } = renderConfirm('vomit');
    fireEvent.press(getByText('Add a photo'));
    pressAlert('Choose from library');
    await waitFor(() => expect(launchLibrary).toHaveBeenCalled());
    expect(askLibrary).toHaveBeenCalled();
    expect(askCamera).not.toHaveBeenCalled();
  });

  it('a denial points at the other source, which now actually works', async () => {
    askCamera.mockResolvedValue({ status: 'denied' });
    const { getByText } = renderConfirm('vomit');
    fireEvent.press(getByText('Add a photo'));
    pressAlert('Take photo');
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Camera access needed',
        'Allow camera access in Settings, or choose a photo from your library instead.',
      );
    });
    expect(launchCamera).not.toHaveBeenCalled();
  });
});

// ── Witnessed-by-construction leaves (D10, CUL-675 — cough / sneeze) ─────────
// There is nothing to "find" about a cough, so the confirm renders no Saw it /
// Found it pair — a window claim is unwritable by construction (the B-448 leak
// class) — and no photo row (hasPhoto false: no visual evidence to photograph).
// The witnessed time row's "Change time" covers late logging.
describe('witnessed-by-construction leaves (D10 — cough / sneeze)', () => {
  it('cough renders no Saw it / Found it pair, and keeps the Change-time affordance', () => {
    const { queryByTestId, queryByText, getByText } = renderConfirm('cough');
    expect(queryByTestId('confirm-chip-pair')).toBeNull();
    expect(queryByText('Saw it')).toBeNull();
    expect(queryByText('Found it')).toBeNull();
    expect(getByText('Change time')).toBeTruthy();
  });

  it('cough renders no photo row at all', () => {
    const { queryByText } = renderConfirm('cough');
    expect(queryByText('Add a photo')).toBeNull();
  });

  it('the pill reads "Cough · today at …" and Log it writes witnessed with no bounds', async () => {
    const { getByText, onLogged } = renderConfirm('cough');
    expect(getByText(/^Cough · today at /)).toBeTruthy();
    fireEvent.press(getByText('Log it'));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    expect(mockInsert.mock.calls[0][0]).toMatchObject({
      eventType: 'cough', petId: 'p1', confidence: 'witnessed', earliest: null, latest: null,
    });
    // CUL-614 — the record the beat derives from says exactly what the row holds.
    expect(onLogged).toHaveBeenCalledWith(
      expect.objectContaining({
        record: { kind: 'event', typeLabel: 'Cough', confidence: 'witnessed', earliest: null, latest: null },
      }),
    );
  });

  it('sneeze carries the same contract', () => {
    const { queryByTestId, queryByText, getByText } = renderConfirm('sneeze');
    expect(queryByTestId('confirm-chip-pair')).toBeNull();
    expect(queryByText('Add a photo')).toBeNull();
    expect(getByText(/^Sneeze · today at /)).toBeTruthy();
  });

  it('an artifact leaf keeps both affordances — the pre-W1 confirms are untouched (FL-1)', () => {
    const { getByTestId, getByText } = renderConfirm('lethargy');
    expect(getByTestId('confirm-chip-pair')).toBeTruthy();
    expect(getByText('Add a photo')).toBeTruthy();
  });
});

// ── CUL-688 — two adjacent-control pairs in this sheet claimed reach into each other. ──
//
// Both are the witnessed-vs-discovered classifier (B-448), one nested inside the
// other: the chips choose Saw it / Found it, and the radios refine a Found window
// into open-ended vs two-sided. A boundary tap resolving by z-order files one
// confidence class as another, and the vet report prints the difference.
//
// The CLAUDE.md CUL-612 arithmetic is `gap >= facing(a) + facing(b)`. Both pairs
// sat in a 4pt gap carrying 8pt of facing slop each — a 12pt shared band, twice.
// The two fixes differ because the geometry differs (the CUL-579 rule: pick the
// tool by the geometry, not by habit), so each is asserted on its own terms.
//
// Every assertion reads the RENDERED geometry and walks up from the label to its
// owning touchable. Restating the tokens in the test would assert only that two
// constants the test itself names still add up (CUL-621), and `fireEvent.press`
// cannot prove any of this — it can reach a handler by DESCENDING from an
// enclosing composite, so it goes green on the unfixed tree (CUL-613, learned
// the hard way in TimeConfidenceField.test.tsx).

/** The nearest ancestor host element with responder handlers — the touchable that
 *  actually owns a node — or null if the node sits in no button at all. */
function owningTouchable(node: any): any {
  let n = node;
  while (n) {
    if (n.props?.accessible && typeof n.props?.onStartShouldSetResponder === 'function') return n;
    n = n.parent;
  }
  return null;
}

/** The nearest ancestor containing BOTH nodes — i.e. whichever element the two are
 *  siblings in, derived from the tree rather than reached by a fixed number of
 *  `.parent` hops, so it cannot quietly start measuring some other element. */
function commonAncestor(a: any, b: any): any {
  const chain = new Set<any>();
  for (let n = a; n; n = n.parent) chain.add(n);
  for (let n = b; n; n = n.parent) if (chain.has(n)) return n;
  return null;
}

/** Facing reach toward a neighbour, from a rendered `hitSlop` prop. A number is
 *  reach on all four edges; an object yields per-edge; absent is no reach at all. */
function facing(node: any, edge: 'top' | 'bottom' | 'left' | 'right'): number {
  const slop = node?.props?.hitSlop;
  if (slop == null) return 0;
  return typeof slop === 'number' ? slop : (slop[edge] ?? 0);
}

function flat(node: any): Record<string, number | undefined> {
  return (StyleSheet.flatten(node?.props?.style) ?? {}) as Record<string, number | undefined>;
}

/** Open Found it → Adjust window, where the two radio rows live. */
function openWindowEditor() {
  const utils = renderConfirm();
  fireEvent.press(utils.getByText('Found it'));
  fireEvent.press(utils.getByTestId('confirm-time-main'));
  return utils;
}

const RADIO_LABELS = ['Sometime before', 'Between two times'] as const;

describe('CUL-688 — the found-mode radio rows', () => {
  // The fix here is to GROW THE BOX. The rows were minHeight 40 — under the 44pt
  // floor — so unlike the CUL-579/CUL-657 pairs the slop was doing real vertical
  // work and could not simply be deleted. Taking the row to 44 clears the floor by
  // construction and removes the overlap in the same edit, which is the shape
  // `menuAction` and `logForChip` already use.
  it('each row carries the 44pt floor in its own box, not in slop', () => {
    const { getByText } = openWindowEditor();
    for (const label of RADIO_LABELS) {
      const row = owningTouchable(getByText(label));
      expect(row).not.toBeNull();
      expect(flat(row).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  // Asserting the ABSENCE, because the instinct on reading "44pt floor" is to add
  // it back — the same reason TimeConfidenceField pins its three rows.
  it('neither row claims reach into the other', () => {
    const { getByText } = openWindowEditor();
    for (const label of RADIO_LABELS) {
      expect(owningTouchable(getByText(label)).props.hitSlop).toBeUndefined();
    }
  });

  // Pins the geometry the rule rests on: the panel's gap is small (4pt), which is
  // precisely why no slop fits in it. If a redesign opens that gap up, this is the
  // line that makes re-deriving the rule a decision rather than an accident.
  it('the panel gap is never crossed — facing reach fits inside it', () => {
    const { getByText } = openWindowEditor();
    const before = owningTouchable(getByText('Sometime before'));
    const between = owningTouchable(getByText('Between two times'));
    expect(before).not.toBe(between);

    const panel = commonAncestor(before, between);
    const gap = flat(panel).rowGap ?? flat(panel).gap ?? 0;
    expect(facing(before, 'bottom') + facing(between, 'top')).toBeLessThanOrEqual(gap);
  });

  it('each row still selects the found-mode it names', () => {
    const { getByText, queryByText } = openWindowEditor();
    // "Sometime before" is the default, so drive the one that changes state and
    // read the mode back off the surface the owner actually sees.
    fireEvent.press(getByText('Between two times'));
    expect(queryByText('Found it by')).toBeNull();
    expect(getByText('From')).toBeTruthy();
    expect(getByText('To')).toBeTruthy();

    fireEvent.press(getByText('Sometime before'));
    expect(getByText('Found it by')).toBeTruthy();
    expect(queryByText('From')).toBeNull();
  });
});

describe('CUL-688 — the Saw it / Found it chips', () => {
  // The fix here is the OPPOSITE tool, because the geometry is the opposite. The
  // chip is a 32pt pill (the design-locked FilterChip register), so its vertical
  // slop is what carries the 44pt floor and deleting it would drop the control
  // below the floor. Growing it to 44 would change the register the round-4 mock
  // fixed. So each chip keeps its vertical and OUTWARD reach and yields only the
  // edge facing its neighbour — the lib/completionCard HITSLOP_ACTION_* shape.
  it('each chip still clears the 44pt floor through its vertical reach', () => {
    const { getByTestId } = renderConfirm();
    for (const id of ['chip-saw', 'chip-found']) {
      const chip = getByTestId(id);
      const box = flat(chip).minHeight ?? 0;
      expect(box + facing(chip, 'top') + facing(chip, 'bottom')).toBeGreaterThanOrEqual(44);
    }
  });

  it('the pair yields the facing edge — the gap between them is never crossed', () => {
    const { getByTestId } = renderConfirm();
    const saw = getByTestId('chip-saw');
    const found = getByTestId('chip-found');
    const gap = flat(getByTestId('confirm-chip-pair')).columnGap
      ?? flat(getByTestId('confirm-chip-pair')).gap ?? 0;

    expect(facing(saw, 'right') + facing(found, 'left')).toBeLessThanOrEqual(gap);
  });

  // The pair's OUTWARD left edge is not free space: `timeMain` is flexGrow:1, so it
  // eats the row's slack and the chipPair's `marginLeft: 'auto'` resolves to zero —
  // the two abut. The Change-time control carries no slop of its own, so every
  // point the chip claims there is taken from a control that opens the picker.
  // Flush neighbours get no slop at all (CUL-579): there is no gap to spend.
  it('the left chip claims nothing from the flush Change-time control', () => {
    const { getByTestId } = renderConfirm();
    const row = getByTestId('confirm-time-row');
    const rowGap = flat(row).columnGap ?? flat(row).gap ?? 0;
    const timeMain = getByTestId('confirm-time-main');

    expect(facing(getByTestId('chip-saw'), 'left') + facing(timeMain, 'right'))
      .toBeLessThanOrEqual(rowGap);
  });

  // The other direction of the same reach. Once the pair wraps to its own line
  // (AC-CHIP), `timeRow`'s rowGap is the whole of what separates these chips from
  // the Change-time control above them — so the vertical slop that carries the 44pt
  // floor in the test above is, in this state, reach toward a neighbour. It held by
  // coincidence: the reach and the gap were two independently-written 8s. Pinned
  // here so narrowing the row's gap fails the build rather than silently reopening
  // the defect in the wrapped state alone, where nothing else was looking.
  it('the wrapped pair does not reach up into the Change-time control', () => {
    const { getByTestId } = renderConfirm();
    const row = getByTestId('confirm-time-row');
    // The state this guards is reachable at all — AC-CHIP's wrap is what creates it.
    expect(flat(row).flexWrap).toBe('wrap');

    const rowGap = flat(row).rowGap ?? flat(row).gap ?? 0;
    const timeMain = getByTestId('confirm-time-main');
    for (const id of ['chip-saw', 'chip-found']) {
      expect(facing(getByTestId(id), 'top') + facing(timeMain, 'bottom'))
        .toBeLessThanOrEqual(rowGap);
    }
  });

  it('each chip still selects its own mode', () => {
    const { getByText, getByTestId, queryByTestId } = renderConfirm();
    fireEvent.press(getByText('Found it'));
    fireEvent.press(getByTestId('confirm-time-main'));
    expect(getByText('Sometime before')).toBeTruthy();

    fireEvent.press(getByText('Saw it'));
    expect(queryByTestId('confirm-chip-pair')).not.toBeNull();
    expect(getByText(/^Vomit · today at /)).toBeTruthy();
  });
});
