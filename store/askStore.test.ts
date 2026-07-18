import { useAskStore } from './askStore';
import type { AskAnswerBody, AskCapReached } from '../lib/ask';

// The store singleton binds an AppState listener at import; jest-expo provides
// AppState, so the import is safe. Reset the store to a known fresh state per test.
function reset() {
  useAskStore.setState({
    petId: null,
    messages: [],
    thinking: false,
    capped: null,
    disabled: false,
    lastQuestion: null,
    lastActivityMs: 0,
  });
}

function answer(overrides: Partial<AskAnswerBody> = {}): AskAnswerBody {
  return {
    outcome: 'answer',
    substantive: true,
    headline: 'Pixel has vomited 7 times in the last 30 days.',
    detail: '3 this week.',
    component: null,
    provenance: null,
    safetyLead: null,
    readLine: null,
    followups: [],
    conversationCredited: true,
    generalMode: false,
    ...overrides,
  };
}

beforeEach(reset);

describe('focusPet — D8 lifetime (survive navigation, reset on switch/idle)', () => {
  it('scopes a fresh conversation to the pet on first focus', () => {
    useAskStore.getState().focusPet('petA');
    expect(useAskStore.getState().petId).toBe('petA');
    expect(useAskStore.getState().messages).toHaveLength(0);
  });

  it('does NOT reset when re-focusing the SAME pet within the idle window (survives navigation)', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('when did she last vomit?');
    s.resolveAnswer(answer());
    // A provenance tap-through to History and back = re-focus, same pet, recent activity.
    useAskStore.getState().focusPet('petA');
    expect(useAskStore.getState().messages).toHaveLength(2); // conversation intact
  });

  it('resets on a pet SWITCH (no cross-pet context bleed)', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('q');
    s.resolveAnswer(answer());
    useAskStore.getState().focusPet('petB');
    expect(useAskStore.getState().petId).toBe('petB');
    expect(useAskStore.getState().messages).toHaveLength(0);
  });

  it('resets on an IDLE timeout (stale conversation)', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('q');
    s.resolveAnswer(answer());
    // Backdate activity beyond the 30-min idle window.
    useAskStore.setState({ lastActivityMs: Date.now() - 31 * 60 * 1000 });
    useAskStore.getState().focusPet('petA');
    expect(useAskStore.getState().messages).toHaveLength(0);
  });
});

describe('question → answer flow', () => {
  it('pushQuestion adds a user turn and enters thinking; resolveAnswer adds the assistant turn', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('when did she last vomit?');
    expect(useAskStore.getState().thinking).toBe(true);
    expect(useAskStore.getState().messages).toHaveLength(1);
    expect(useAskStore.getState().lastQuestion).toBe('when did she last vomit?');

    useAskStore.getState().resolveAnswer(answer());
    expect(useAskStore.getState().thinking).toBe(false);
    expect(useAskStore.getState().messages).toHaveLength(2);
  });

  it('resolveCapped stops thinking and keeps the asked question visible', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('is she still vomiting?');
    const cap: AskCapReached = { cap_reached: true, grain: 'conversation', cap: 'monthly', resets_at: '2026-08-01T00:00:00.000Z' };
    useAskStore.getState().resolveCapped(cap);
    expect(useAskStore.getState().thinking).toBe(false);
    expect(useAskStore.getState().capped).toEqual(cap);
    expect(useAskStore.getState().messages).toHaveLength(1); // the question bubble stays
  });

  it('a successful answer clears a prior capped state', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    useAskStore.getState().resolveCapped({ cap_reached: true, grain: 'message', cap: 'daily', resets_at: 'x' });
    s.pushQuestion('q');
    s.resolveAnswer(answer());
    expect(useAskStore.getState().capped).toBeNull();
  });
});

describe('askTurns — the wire (D8/D9)', () => {
  it('derives prior turns with the D9 substantive flag on assistant turns', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('when did she last vomit?');
    s.resolveAnswer(answer({ substantive: true, headline: 'July 9.', detail: 'that\'s 7 in 30 days.' }));
    const turns = useAskStore.getState().askTurns();
    expect(turns).toEqual([
      { role: 'user', content: 'when did she last vomit?' },
      { role: 'assistant', content: 'July 9. that\'s 7 in 30 days.', substantive: true },
    ]);
  });

  it('marks a deflection assistant turn NOT substantive (no credit committed, D9)', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('does she have IBD?');
    s.resolveAnswer(answer({ outcome: 'clinical_judgment', substantive: false, headline: "That's one for her vet.", detail: '' }));
    const turns = useAskStore.getState().askTurns();
    expect(turns[1]).toEqual({ role: 'assistant', content: "That's one for her vet.", substantive: false });
  });
});

describe('startNew + endOnBackground', () => {
  it('startNew clears the conversation but keeps the pet scope', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('q');
    s.resolveAnswer(answer());
    useAskStore.getState().startNew();
    expect(useAskStore.getState().petId).toBe('petA');
    expect(useAskStore.getState().messages).toHaveLength(0);
    expect(useAskStore.getState().capped).toBeNull();
  });

  it('endOnBackground ends an active conversation but no-ops on an already-empty one', () => {
    const s = useAskStore.getState();
    s.focusPet('petA');
    s.pushQuestion('q');
    s.resolveAnswer(answer());
    useAskStore.getState().endOnBackground();
    expect(useAskStore.getState().messages).toHaveLength(0);

    // No-op path: empty + not capped → same reference (no needless write).
    const before = useAskStore.getState();
    useAskStore.getState().endOnBackground();
    expect(useAskStore.getState()).toBe(before);
  });
});
