// The Home medication strip (B-614 PR M3, §5 + §9 — the one-tap confirm).
//
// One compact card PER active/recent medication (D3), rendered BELOW `TrialStrip`
// and ABOVE `TodayZone`: the diet trial is the wedge's primary object and runs
// 8–12 weeks, a 14-day course is the shorter-lived guest (§8/D9). Same rationale
// as `TrialStrip` — a medication is CONTEXT, not an insight, so Principle 3's lead
// stays with the Signal zone.
//
// ── M3 ADDS THE WRITE: THE ONE-TAP CONFIRM ────────────────────────────────────
// M2 shipped this as context-only (round 1's Option A). M3 wires the confirm the
// resolver already validated (`model.confirm`, §5) to the shipped `insertMedicationDose`
// path — no new write path — and renders the accent-light "Log dose" button plus the
// optimistic "Dose logged just now" state (§9 state 10). The tap is a CONFIRMATION,
// not an entry (§0.1): the app already holds the drug, the amount, the route and the
// cadence, so the button confirms a dose the record predicts (Principle 2) rather than
// opening the FAB's log form. The confirmability gate lives in the resolver, so the
// button renders iff `model.confirm !== null` — the collapse rule (§7) and the
// withholding set (§6) both stand it down there, and this component trusts that.
//
// Every visible fact is computed by the pure `resolveMedStrips` (M1) — this
// component makes no clinical judgement. It draws the day-progress bar only when
// `progressFraction` is non-null (never a dose-derived fraction — N2), and the
// withholding fact (§6) in the concern colour, never a cheery coverage line over a
// refusal (N3).
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
// haptics-guard-ok: not a safety surface — the confirm button never renders on a
// withholding card (§6 mints no confirm payload), so this verb is unreachable from
// any concern state. See the CONFIRMED_LINE note below.
import { commitRoutine } from '../../lib/haptics';
import { Card } from '../ui/Card';
import { ThemedText } from '../ui/ThemedText';
import { insertMedicationDose } from '../../lib/medicationDose';
import { useSyncStore } from '../../store/syncStore';
import type { MedStripModel } from '../../lib/medStrip';

// §9 state 10 — the optimistic confirmation line (locked at M5, `nyx-voice` +
// `clinical-guardrails`): a calm statement about the RECORD, never a verdict about
// the pet, and no exclamation. It is held briefly, then the card settles into its
// reloaded state (2/3).
//
// CUL-614 NAMES THE RECORD. M5 shipped a bare "Dose logged just now". Every M5
// property survives — this is still a statement about the record, still calm, still
// unpunctuated — but §5's sentence rule asks a beat to say WHAT it wrote, and D3 puts
// one card per med on Home, so a multi-med owner confirming one of three cards read a
// line that could have belonged to any of them. The shape is the app's completion
// register throughout: subject · when ("Vomit · found by 5:33 PM", "Logged · {drug}").
//
// The drug name is `model.drugName` — the resolver's display-ready B-171 name, the
// same field the header is built from — never re-derived here (`lib/medStrip.ts`
// carries it separately from `header` for exactly this reason).
const confirmedLine = (drugName: string) => `${drugName} · logged just now`;

// How long "Dose logged just now" dwells before the card settles into its reloaded
// state (§9 state 10). The confirm writes LOCAL-FIRST, so the hydration-tick reload
// that re-reads the dose lands well inside this window — the dwell is a readable beat
// of feedback, not a wait on I/O. A named constant (theme carries no settle-dwell
// duration); the `durationSlow` motion token is for animations, not a UI-copy hold.
const CONFIRM_DWELL_MS = 1500;

// idle → the button is live; submitting → the write is in flight (button stood down
// so a second tap is a no-op); confirmed → the optimistic line dwells, then resets.
type ConfirmPhase = 'idle' | 'submitting' | 'confirmed';

interface Props {
  model: MedStripModel;
  /** Overridable so the test drives navigation without a router mock. */
  onPress?: () => void;
  /**
   * Overridable so the component test can exercise the confirm state machine
   * without the DB/store/sync — mirrors `onPress`. Defaults to the real one-tap
   * write (`performWrite` below: `insertMedicationDose` + a hydration-tick reload).
   */
  onConfirm?: () => Promise<void>;
}

export function MedStrip({ model, onPress, onConfirm }: Props) {
  const [phase, setPhase] = useState<ConfirmPhase>('idle');

  // A withholding record replaces the coverage line with the fact (§6/N3); render
  // that fact in the concern colour. The intake-decline-only case carries no line
  // (it defers to the Signal card above), so gate on the line being present too.
  // A withholding card never mints a confirm payload (§6), so `phase` can only reach
  // 'confirmed' on a non-flag card — the two styles below are mutually exclusive by
  // construction, not just by the ternary.
  const isFlag = model.withholding.length > 0 && model.line !== null;

  // What the fact line reads right now: the optimistic confirmation while it dwells,
  // otherwise the resolver's line. Derived once so the rendered line and the
  // screen-reader label can never disagree.
  const displayedLine = phase === 'confirmed' ? confirmedLine(model.drugName) : model.line;

  // §9 state 10 — after a successful write, hold the confirmation line briefly, then
  // fall back to the reloaded model (which now counts the dose → state 2/3). The
  // local-first reload has already landed by the time this fires, so the settle is a
  // clean swap with no flicker back to the pre-write line.
  useEffect(() => {
    if (phase !== 'confirmed') return;
    const t = setTimeout(() => setPhase('idle'), CONFIRM_DWELL_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // The default write: the same one-tap `given` path the Pet-tab card uses
  // (`insertMedicationDose`), built from the confirm payload the resolver already
  // validated (§5.1). `adherence: 'given'` is the owner's own affirmative tap; the
  // amount is honest-null when unknown (§5.1/D5 — never fabricated to make the button
  // eligible). A dose is witnessed, so it stamps now(). Bumping the hydration tick
  // makes Home re-read the local mirror so the card settles into state 2/3.
  //
  // `confirm.petId` is the pet this strip was LOADED for, carried through the resolver
  // with the drug identity — NOT the live active pet re-read at tap time. That is what
  // makes a tap during a pet-switch swap window write to the pet the card belongs to,
  // never the new pet's id against the old pet's drug (the cross-pet-write race).
  async function performWrite() {
    const confirm = model.confirm;
    // Non-null whenever the button renders (`showButton` gates on it); this guard is a
    // defensive no-write fallback that THROWS rather than resolving — a silent resolve
    // would flip the card to "Dose logged just now" without a write, claiming a dose
    // that never landed. The throw routes to handleConfirm's catch (reset + alert).
    if (!confirm) {
      throw new Error('MedStrip confirm: no confirm payload at tap time');
    }
    await insertMedicationDose({
      petId: confirm.petId,
      medicationItemId: confirm.medicationItemId,
      medicationId: confirm.medicationId,
      adherence: 'given',
      doseAmount: confirm.doseAmount,
      occurredAt: new Date(),
    });
    useSyncStore.getState().bumpHydrationTick();
  }

  async function handleConfirm() {
    // The phase gate is the double-write guard (the button is also hidden once
    // submitting) — a second tap mid-write is a no-op, so exactly one dose is written
    // per confirm (AC #9).
    if (phase !== 'idle' || model.confirm === null) return;
    setPhase('submitting');
    try {
      await (onConfirm ?? performWrite)();
    } catch (e) {
      // The write throws only on a LOCAL failure (the sync push is fire-and-forget and
      // never rejects into here). Reset to idle so the owner can retry, and say so —
      // silence over a failed health write would be the worst outcome.
      console.error('[MedStrip] confirm dose failed:', e);
      setPhase('idle');
      // Pattern 8 — honest, calm, points at the next action; no error code, no alarm.
      // Curly apostrophe to match the app's copy convention (e.g. "vet's plan").
      Alert.alert('Couldn’t log that dose', 'Please try again in a moment.');
      return;
    }
    // CUL-614 / §5.6 — the commit haptic. A dose is a ROUTINE commit (the success
    // double-tap), never `commitSymptom`: the tone split is about what was written, and
    // an owner giving a prescribed dose is doing the thing that goes right.
    //
    // Fired here, AFTER the write resolved and never on the tap, so the buzz means "it
    // landed" rather than "you pressed something" — and the failure path above returns
    // before reaching this line, so a dose that did not save is silent. That is the
    // opposite convention from `destructiveConfirm`, which marks the gesture on purpose;
    // the difference is that this button has no confirm step to make the tap feel heard.
    //
    // This card is NOT a safety surface for the D7 silence rule, and the reason is
    // structural rather than a judgement: `resolveMedStrips` mints no `confirm` payload
    // for a withholding record (§6), so the button does not render on a card carrying a
    // refusal fact — meaning no path exists from a concern state to this line. A haptic
    // here can only ever follow the owner's own affirmative tap on a routine card.
    commitRoutine();
    setPhase('confirmed');
  }

  // The button renders iff the resolver supplied a confirm payload AND nothing is in
  // flight (§5). While submitting/confirmed it stands down, so there is no second tap
  // and no button beside the "just logged" line (§9 state 10).
  const showButton = model.confirm !== null && phase === 'idle';

  const a11yLabel = [model.header, displayedLine]
    .filter((s): s is string => s != null)
    .join('. ');

  return (
    // The Card is a plain container so the tap-to-navigate region and the confirm
    // button are SIBLINGS, each its own accessibility element. A confirm button
    // nested inside the navigate Pressable would be swallowed by that Pressable's
    // accessible container (VoiceOver would never reach it) and would blur "tap the
    // card vs tap the button" — the split keeps both reachable and keeps the button's
    // write from ever navigating (AC #9).
    <Card>
      <Pressable
        onPress={onPress ?? (() => router.push('/(tabs)/profile'))}
        accessibilityRole="button"
        accessibilityLabel={`${a11yLabel}. Open medications.`}
        testID="med-strip"
      >
        <View style={styles.headerRow}>
          <ThemedText style={styles.header}>{model.header}</ThemedText>
          {/* geist-ok: Icon glyph, not copy — stays a raw <Text>. These stand in for vector glyphs
              (the B-745 GlyphSvg migration owns them), so they keep the system face rather
              than taking the body family a sweep would give them. CUL-364 §7. */}
          <Text style={styles.chevron}>›</Text>
        </View>

        {/* N2 — day progress and nothing else, and only when there is an honest
            denominator. `progressFraction` is null for ongoing/ad-hoc/collapsed
            cards, so its presence IS the "draw a bar" signal (no second rule). */}
        {model.progressFraction !== null && (
          <View style={styles.progressTrack} testID="med-strip-track">
            <View
              testID="med-strip-fill"
              style={[styles.progressFill, { width: `${model.progressFraction * 100}%` }]}
            />
          </View>
        )}

        {displayedLine !== null && (
          <View style={styles.lineRow}>
            {/* CUL-614 — the R2 mark. The in-place beat's check, at line scale, so the
                strip's confirm reads as the same register as the sheet beat and the
                cards rather than as a colour change nobody notices.

                `colorAccentInk`, not the mint `colorMomentConfirm` the ring-bearing
                beats use: this glyph sits bare on the card's white ground, where mint
                lands around 2.2:1 — under the 3:1 floor for a graphical object. Ink is
                the same accent (the one-accent rule holds) at ~5.5:1, and it is already
                the confirmed line's colour, so mark and sentence read as one unit.
                Static — no motion, so nothing for the reduced-motion rule to govern. */}
            {phase === 'confirmed' && (
              <Check
                size={14}
                color={theme.colorAccentInk}
                strokeWidth={2.5}
                // Decorative: the a11y label below already speaks the whole line, and a
                // second announcement of the mark would just say "check" over it.
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            )}
            <ThemedText
              style={[
                styles.line,
                styles.lineText,
                phase === 'confirmed' ? styles.lineConfirmed : isFlag && styles.lineFlag,
              ]}
            >
              {displayedLine}
            </ThemedText>
          </View>
        )}
      </Pressable>

      {showButton && (
        <Pressable
          onPress={handleConfirm}
          accessibilityRole="button"
          accessibilityLabel={`Log a dose of ${model.drugName}`}
          // The pill is a ~34px visual (matching the design-locked mock); hitSlop lifts
          // the TAP target past the 44pt floor (B-136) without inflating the pill to
          // 44px, which `minHeight` would. The button carries its own padded ground, so
          // hitSlop-as-slack is right here — unlike B-136's bare-text actions, whose
          // visual itself was sub-floor and needed minHeight.
          hitSlop={8}
          testID="med-strip-confirm"
          style={styles.confirm}
        >
          <ThemedText style={styles.confirmLabel}>Log dose</ThemedText>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    // Leave room for the chevron rather than letting a long "day 17 — 3 days past"
    // header shove it off the row.
    flex: 1,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextSecondary,
    marginLeft: theme.space2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginTop: theme.space2,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorAccent,
  },
  // The row that carries the fact line plus, once confirmed, the mark to its left.
  // `marginTop` moves here from `line` so the mark and the text share one baseline
  // block and the card's spacing is unchanged whether or not the mark is present.
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space0_5,
    marginTop: theme.space1,
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  // Lets a long "{drug} · logged just now" wrap inside the row instead of pushing the
  // mark off the card.
  lineText: {
    flexShrink: 1,
  },
  // The withholding fact (§6). `colorEventSymptom` is the app's established
  // concern-text token — every other safety/concern line uses it (EventRow,
  // TodayZone, Badge). The mock's #B4123B is a print-legibility choice for paper;
  // the shipped surface uses the token, per the theme-tokens-only convention. The
  // exact register locks at M5 behind `clinical-guardrails`.
  lineFlag: {
    color: theme.colorEventSymptom,
  },
  // §9 state 10 — the optimistic "just logged" line reads in accent-ink, the
  // contrast-safe mark colour (the mock's `.card-line.just`), so it registers as a
  // calm confirmation rather than a concern (rose) or a plain fact (secondary).
  lineConfirmed: {
    color: theme.colorAccentInk,
  },
  // §5 / §9 — the confirm. Accent-light ground + accent-ink mark: the contrast-safe
  // pair (teal at full strength fails contrast on its own tint, so the ink is the same
  // accent, not a second one — the one-accent rule holds). `alignSelf: flex-start`
  // keeps it inline-block / left-aligned, never a full-width primary CTA — this is a
  // quiet confirmation on a context card, not the screen's main action.
  confirm: {
    alignSelf: 'flex-start',
    marginTop: theme.space1,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    backgroundColor: theme.colorAccentLight,
    borderRadius: theme.radiusSmall,
  },
  confirmLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
    textAlign: 'center',
  },
});
