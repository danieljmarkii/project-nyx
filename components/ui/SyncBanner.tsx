import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSyncStore } from '../../store/syncStore';
import { useAppActive } from '../../hooks/useAppActive';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Decide what — if anything — the sync banner should say. Pure so the two
 * conditions can be tested without a renderer; `now` is injected for the same
 * reason.
 *
 * TWO STATES, DELIBERATELY NOT ONE (B-398). Before this, the banner had a single
 * line — "connect to the internet to update your records" — and it keyed on a
 * pending count that only ever looked at `events`. So it was silent for a wedged
 * meals queue, and when it did fire it gave advice that is only true for one of
 * the two ways a row gets stuck.
 *
 * QUARANTINED LEADS. A quarantined row is one the server has refused, repeatedly
 * and finally; no amount of connectivity moves it, so telling that owner to check
 * their connection would send them to fix the one thing that is not broken. It is
 * also the more serious of the two, and it is not self-healing: a pending row
 * resolves the moment the phone finds a signal, while a quarantined row waits for
 * a person. When both are true, the one needing a human wins the banner.
 *
 * The pending line still waits out STALE_THRESHOLD_MS. A queue that is minutes
 * old on a train is not news, and Principle 4's warm-not-nagging register applies
 * to a persistent banner more than to anything else on the surface.
 */
export function syncBannerText(
  state: { pendingCount: number; oldestPendingAt: string | null; quarantinedCount: number },
  now: number,
): string | null {
  if (state.quarantinedCount > 0) {
    const entries = state.quarantinedCount === 1 ? '1 entry' : `${state.quarantinedCount} entries`;
    // Names what to do, and the action is one the owner can actually take: any
    // edit re-queues the row (every local write clears sync_error).
    return (
      `${entries} couldn't be saved to your records. They're still here — ` +
      'open one from History and save it again to retry.'
    );
  }
  if (!state.oldestPendingAt) return null;
  const ageMs = now - new Date(state.oldestPendingAt).getTime();
  if (Number.isNaN(ageMs) || ageMs < STALE_THRESHOLD_MS) return null;
  return "Some logs haven't synced in over a day. Connect to the internet to update your records.";
}

/**
 * CUL-2547: how long until the pending line's answer changes on its own, or null when it
 * never will without a store change (nothing pending, already past the threshold, the
 * quarantined line leading, an unreadable stamp). The banner reads `Date.now()` only when
 * it renders, and the store changes only after a sync cycle, so an app held open and
 * offline across the 24-hour mark stayed quiet until something else redrew it. One timer
 * to this moment is the redraw. One millisecond past the mark, so the render it forces
 * reads strictly past it.
 */
export function msUntilPendingLineDue(
  state: { pendingCount: number; oldestPendingAt: string | null; quarantinedCount: number },
  now: number,
): number | null {
  if (state.quarantinedCount > 0 || !state.oldestPendingAt) return null;
  const ageMs = now - new Date(state.oldestPendingAt).getTime();
  if (Number.isNaN(ageMs) || ageMs >= STALE_THRESHOLD_MS) return null;
  return STALE_THRESHOLD_MS - ageMs + 1;
}

export function SyncBanner() {
  const { pendingCount, oldestPendingAt, quarantinedCount } = useSyncStore();
  // CUL-2547: the redraw at the moment the oldest pending entry turns a day old. Cleared
  // and re-armed on any store change; paused while the app is not in the foreground (no
  // timer runs then, and coming back re-renders through `active` anyway). `tick` re-arms
  // it should a render land early (a clock moved), so the moment is never missed.
  const active = useAppActive();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const delay = msUntilPendingLineDue({ pendingCount, oldestPendingAt, quarantinedCount }, Date.now());
    if (delay === null) return undefined;
    const timer = setTimeout(() => setTick((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [active, tick, pendingCount, oldestPendingAt, quarantinedCount]);

  const text = syncBannerText({ pendingCount, oldestPendingAt, quarantinedCount }, Date.now());
  if (!text) return null;

  return (
    <View style={styles.banner}>
      <ThemedText style={styles.text}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    paddingHorizontal: theme.space2,
    paddingVertical: 10,
  },
  text: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightRegular,
    lineHeight: 18,
  },
});
