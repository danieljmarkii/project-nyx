// The FIRST PAINT: a day's thread draws down and its rows land as it passes (History v2,
// HV-10 / CUL-1167; spec §4 "First paint" and "Land on a day"; design authority round 5 of
// `docs/culprit-history-v2-mockups.html`, the `.dayc.arm` / `.dayc.play` transitions).
//
// Design v2's DRAW IN, applied to a day rather than a chart (`drawInMotion.ts` is the
// chart's): the mark first, the words as the mark reaches them. The thread grows from the
// first row's dot to the last one's; each row fades up from 4pt above as the line passes
// it, the row whole (its words land in one beat with it); the day's header never moves.
// Every day on screen draws at once, never one day after another (§4: no cascade across
// days).
//
// C-30, AGAIN: a shared choreography lives in `components/motion/`. The line is the fold's
// own opening (`FOLD_MOTION.openMs`, 370ms) and a row's landing is the fold's own
// `landMs` (300ms), so this draw and the run that opens in place beneath it move on one
// clock. The ease is the mock's `cubic-bezier(.2,.8,.2,1)`: a settle, never an overshoot.
//
// ONE ENGINE. Nothing here moves geometry: the line is a transform about its own top on a
// node whose frame never changes, and a row is an opacity and a translate. So every value
// runs on the native driver and there is no `LayoutAnimation` anywhere in this file.
//
// THE TRIGGER IS A FACT, NEVER THE PRESENTATION. A card draws when the list's first read
// for a MOUNT IDENTITY (pet · filter · window · the day the list opens on) has answered and
// the card was on the first frame that drew it, or when a landing picked its day. Which
// card may draw is the LEDGER's decision (`createPaintLedger`): it grants a token, and a
// card's draw CLAIMS it the moment it starts, so a card the list unmounts and mounts again
// as the owner scrolls (a virtualized list does that) never draws twice, and a card that
// first mounts because the owner scrolled to it never draws at all (§4: never motion on
// scroll).
//
// "THE FIRST FRAME" IS THE COMMIT OF THE FIRST CLAIM, not the commit that opened the
// identity: a virtualized list that goes from empty to full (a filter change) mounts its
// cells one batch AFTER the render that handed it the data, so a seal in that render's
// commit would refuse every card. The ledger seals itself in a microtask queued by the
// identity's first claim, which runs once that commit's layout effects (every card on
// that frame) have claimed, and before the list's next batch. The host also seals on the
// owner's own scroll, so a list whose first frame held no card never draws one later.
//
// REDUCED MOTION is the still frame: nothing is seeded, nothing starts, and the token is
// left unclaimed rather than spent on a draw nobody saw. APP BLUR FINISHES, never pauses:
// a draw cut by a blur is committed at its end state. A native-driver animation never
// writes its final value back to JS, so every end PINS its values (the fold's `rest()`).
// And the end never rides on the frame clock alone (the Motion Designer's rule): a timer
// set to the draw's own length ends it if the completion callback never comes.
//
// No haptic here and none may be added: the rows that land include a photographed vomit's
// `worth_a_call`, and this file is named in `guards/haptics.test.ts`'s ALWAYS_SCANNED.

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { theme } from '../../constants/theme';
import { FOLD_MOTION } from './foldMotion';

/** The beats, in ms and pt: the mock's CSS, on the fold's clock. */
export const THREAD_DRAW = {
  /** The line grows from the first dot to the last over the fold's opening. */
  lineMs: FOLD_MOTION.openMs,
  /** A row fades and settles over the fold's landing. */
  rowMs: FOLD_MOTION.landMs,
  /** A row lands from this far above (the mock's `translateY(-4px)`). */
  rowDriftPt: theme.space0_5,
} as const;

/** The mock's `cubic-bezier(.2,.8,.2,1)`. */
const LINE_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const ROW_EASE = Easing.out(Easing.quad);

/** How long after the line starts row `i` of `rows` begins to land: the line reaches it
 *  (the mock's `--step`, `round(370 / rows)`). */
export function threadRowDelayMs(i: number, rows: number): number {
  return i * Math.round(THREAD_DRAW.lineMs / Math.max(rows, 1));
}

/** The whole draw, first frame to last row settled: a caller's "the draw is over". */
export function threadDrawTotalMs(rows: number): number {
  return Math.max(THREAD_DRAW.lineMs, threadRowDelayMs(Math.max(rows - 1, 0), rows) + THREAD_DRAW.rowMs);
}

// ── The ledger: which cards may draw ──────────────────────────────────────────────

/**
 * Which days may draw, and exactly once each.
 *
 * `open(identity)` — a read answered for a new mount identity: every card that mounts before
 *   the next `seal()` may draw once. Idempotent for the identity already open, so a render
 *   may call it.
 * `seal()` — the identity's first frame is over. Cards that mount later (the owner scrolled
 *   to them) never draw it. Idempotent. The ledger seals itself after the commit of the
 *   identity's first claim; a host seals it too on the owner's own scroll, and when its
 *   first answer drew nothing to claim (Home's empty day).
 * `land(day)` — a landing picked this day: it draws once more, the next time its card is
 *   drawn, whenever that is (a far landing mounts the card after the jump).
 * `dropLanding()` — the landing ended without a draw (the owner's own scroll).
 * `peek(day)` — the token the day's card would draw under now, or null. Pure: a render asks.
 * `claim(token)` — the draw starts: true once, and never again for that token.
 */
export interface PaintLedger {
  open: (identity: string) => void;
  seal: () => void;
  land: (day: string) => void;
  dropLanding: () => void;
  peek: (day: string) => string | null;
  claim: (token: string) => boolean;
}

export function createPaintLedger(): PaintLedger {
  let identity: string | null = null;
  let sealed = true;
  let sealQueued = false;
  const claimed = new Set<string>();
  let landing: { day: string; token: string } | null = null;
  let landSeq = 0;

  const paintToken = (day: string) => `paint:${identity}:${day}`;

  return {
    open(next) {
      if (next === identity) return;
      identity = next;
      sealed = false;
      sealQueued = false;
      claimed.clear();
    },
    seal() {
      sealed = true;
    },
    land(day) {
      landSeq += 1;
      landing = { day, token: `land:${landSeq}:${day}` };
    },
    dropLanding() {
      landing = null;
    },
    peek(day) {
      if (landing !== null && landing.day === day) return landing.token;
      if (identity === null || sealed) return null;
      const token = paintToken(day);
      return claimed.has(token) ? null : token;
    },
    claim(token) {
      if (landing !== null && landing.token === token) {
        landing = null;
        return true;
      }
      if (identity === null || sealed || claimed.has(token) || !token.startsWith(`paint:${identity}:`)) return false;
      claimed.add(token);
      if (!sealQueued) {
        // The first frame is the commit of the first claim (the header): sealed once every
        // card in it has claimed, before the list's next batch mounts another.
        sealQueued = true;
        const sealing = identity;
        queueMicrotask(() => {
          if (identity === sealing) sealed = true;
        });
      }
      return true;
    },
  };
}

// ── The draw ──────────────────────────────────────────────────────────────────────

export interface ThreadRowStyle {
  opacity: Animated.Value;
  transform: { translateY: Animated.Value }[];
}

export interface ThreadDraw {
  /** The drawing line is out: render it (its scale is `lineScale`). False at rest. */
  drawing: boolean;
  /** The line's scaleY about its top edge (0 → 1). */
  lineScale: Animated.Value;
  /** Row `i`'s style: stable across renders for an index. */
  rowStyle: (i: number) => ThreadRowStyle;
}

interface Params {
  /** The token the ledger granted this card (`peek`), or null: nothing to draw. */
  token: string | null;
  /** How many rows lie on the thread. */
  rows: number;
  /** The ledger's `claim`, called once when the draw starts. Read through a ref, so a
   *  caller's new function identity never restarts a draw. */
  claim: (token: string) => boolean;
  reducedMotion: boolean;
  appActive: boolean;
}

export function useThreadDraw({ token, rows, claim, reducedMotion, appActive }: Params): ThreadDraw {
  const lineScale = useRef(new Animated.Value(1)).current;
  const opacities = useRef<Animated.Value[]>([]);
  const shifts = useRef<Animated.Value[]>([]);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const valve = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimRef = useRef(claim);
  claimRef.current = claim;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  /** The last token this hook acted on: drawn, settled, or refused. Never acted on twice. */
  const handled = useRef<string | null>(null);
  /** The token whose from-state is seeded (so a render seeds once, never per render). */
  const seeded = useRef<string | null>(null);
  const [flying, setFlying] = useState(false);
  // A refused token leaves `flying` false, which is no state change; the render that
  // armed it still drew the line, so it asks for one more render at rest.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const ensure = useCallback((n: number) => {
    while (opacities.current.length < n) {
      opacities.current.push(new Animated.Value(1));
      shifts.current.push(new Animated.Value(0));
    }
  }, []);
  ensure(rows);

  /** Every value at the draw's FROM-state: the line at nothing, every row above and clear. */
  const seed = useCallback(() => {
    lineScale.setValue(0);
    for (let i = 0; i < opacities.current.length; i++) {
      opacities.current[i].setValue(0);
      shifts.current[i].setValue(-THREAD_DRAW.rowDriftPt);
    }
  }, [lineScale]);

  /** Every value at rest, nothing in flight. */
  const rest = useCallback(() => {
    if (valve.current !== null) clearTimeout(valve.current);
    valve.current = null;
    const anim = running.current;
    running.current = null;
    anim?.stop();
    lineScale.setValue(1);
    for (const v of opacities.current) v.setValue(1);
    for (const v of shifts.current) v.setValue(0);
  }, [lineScale]);

  // ARMED: a token this hook has not acted on, and motion allowed. The from-state must be
  // on the FIRST frame the card draws (a row that paints and then vanishes to land is a
  // flash, not a draw), so it is seeded here, in the render, once per token.
  const armed = token !== null && token !== handled.current && !reducedMotion;
  if (armed && seeded.current !== token) {
    seeded.current = token;
    seed();
  }

  // A draw ends at its own end, on a blur, under Reduce Motion, when a NEW token replaces it,
  // or on unmount. Never when the token goes back to null: a claimed token is exactly what
  // the ledger stops granting, so the very next render of a drawing card carries null, and
  // a cleanup keyed on the token would stop every draw one render after it started.
  useLayoutEffect(() => {
    if (token === null || token === handled.current) return;
    handled.current = token;
    // Reduced motion, or a token another mount of this card already spent: the still frame.
    if (reducedMotion || !claimRef.current(token)) {
      rest();
      setFlying(false);
      rerender();
      return;
    }
    // A draw this one replaces (a landing on a day still drawing) stops where it is; this one
    // starts from the from-state, seeded again because that stop can land a value anywhere.
    const replaced = running.current;
    running.current = null;
    replaced?.stop();
    if (valve.current !== null) clearTimeout(valve.current);
    seed();
    const n = Math.min(rowsRef.current, opacities.current.length);
    const beats: Animated.CompositeAnimation[] = [
      Animated.timing(lineScale, {
        toValue: 1,
        duration: THREAD_DRAW.lineMs,
        easing: LINE_EASE,
        useNativeDriver: true,
      }),
    ];
    for (let i = 0; i < n; i++) {
      const delay = threadRowDelayMs(i, n);
      beats.push(
        Animated.parallel([
          Animated.timing(opacities.current[i], {
            toValue: 1,
            duration: THREAD_DRAW.rowMs,
            delay,
            easing: ROW_EASE,
            useNativeDriver: true,
          }),
          Animated.timing(shifts.current[i], {
            toValue: 0,
            duration: THREAD_DRAW.rowMs,
            delay,
            easing: ROW_EASE,
            useNativeDriver: true,
          }),
        ]),
      );
    }
    const anim = Animated.parallel(beats);
    running.current = anim;
    setFlying(true);
    anim.start(({ finished }) => {
      // `finished: false` is a stop (blur, reduced motion, a new token, unmount): whoever
      // stopped it owns the end state.
      if (!finished || running.current !== anim) return;
      rest();
      setFlying(false);
    });
    // The safety valve: the draw ends at its own length whatever the frame clock did.
    valve.current = setTimeout(() => {
      valve.current = null;
      if (running.current !== anim) return;
      rest();
      setFlying(false);
    }, threadDrawTotalMs(n) + FOLD_MOTION.settleSlackMs * 2);
  }, [token, reducedMotion, rest, seed, lineScale]);

  // Unmount: whatever was drawing is committed at rest (and nothing is left running).
  useEffect(
    () => () => {
      if (running.current === null) return;
      rest();
      setFlying(false);
    },
    [rest],
  );

  // Blur FINISHES; reduced motion switched on mid-draw is the still frame, now.
  useEffect(() => {
    if (appActive && !reducedMotion) return;
    if (running.current === null) return;
    rest();
    setFlying(false);
  }, [appActive, reducedMotion, rest]);

  const rowStyle = useCallback(
    (i: number): ThreadRowStyle => {
      ensure(i + 1);
      return { opacity: opacities.current[i], transform: [{ translateY: shifts.current[i] }] };
    },
    [ensure],
  );

  return { drawing: flying || armed, lineScale, rowStyle };
}
