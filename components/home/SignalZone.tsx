import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { SectionLabel } from '../ui/SectionLabel';
import { InsightCard } from './InsightCard';
import { useSignal } from '../../hooks/useSignal';
import { useWatchingRows } from '../../hooks/useWatchingRows';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import {
  BUILDING_FLOOR,
  BUILDING_SUB,
  BUILDING_WATCHING_FOR,
  NO_PATTERN_HEADLINE,
  NO_PATTERN_SUB,
  WATCHING_SUB,
  ackUpdatingCopy,
  buildingDayCount,
  buildingHeadline,
  buildingHeadlineLead,
  buildingIntro,
  coverageCopy,
  isSignalsV2Finding,
  isTrialResponse,
  noPatternIntro,
  staleIntro,
} from '../../lib/signalCopy';
import type { CachedFinding, CoverageDiagnostic } from '../../lib/signal';
import type { WatchingRow } from '../../lib/signalWatching';

// Ghosted "what insights look like" previews — kept in the building state so the
// empty moment teaches what's coming (Principle 5: empty states are features).
const PREVIEW_INSIGHTS = [
  'Vomiting dropped 60% in the two weeks after switching proteins — the diet trial appears to be working.',
  'Itching tends to follow meals containing chicken. No reaction logged after salmon.',
];

interface SignalZoneProps {
  // B-721 SR-5 (§3.4) — whether a diet trial is running for the active pet (`isTrialRunning`,
  // computed by Home from the useDietTrial load it already does, so this zone adds no second
  // read). Threaded to the falling reflection's expanded state for the mid-trial adjacency
  // line; default false, so every non-Home caller and the flag-off path are unaffected.
  trialRunning?: boolean;
  // B-789 (§5.2) — drop the event-driven trial_response card when the active pet's record
  // carries a NOT-EATING concern (a live intake decline or a diet refusal). The card fires
  // from the server `trial_response` finding, which is blind to the refusal — the day-1
  // diet-refusal cat has uniform-low intake, so the relative-decline detector never fires
  // and no safety card leads, yet a reassuring "0 vomiting · was 20" would render over a
  // starving cat (the B-494 anorexic-cat case). Home computes this from the SAME `trialInput`
  // the strip withholds its vomit line on (`isAnimalNotEating`), so the card and the strip
  // can never disagree. Default false: every non-Home caller and the flag-off path are
  // unaffected.
  suppressTrialResponse?: boolean;
}

export function SignalZone({
  trialRunning = false,
  suppressTrialResponse = false,
}: SignalZoneProps = {}) {
  const {
    findings,
    coverage,
    displayState,
    petName,
    isLoading,
    dayNumber,
    eventCount,
    acknowledging,
    markSeen,
  } = useSignal();

  // Signal/Home design uplift (B-721) — behind `signal_design_v2`, resolved once here
  // and threaded down so the whole zone reads one flag (fail-closed to the shipped
  // surface for everyone else). SR-1 gates the live receipts (via LiveStack →
  // InsightCard); SR-2 gates the empty states (E1 building / E2 no_pattern) below; SR-3
  // gates the register (receded chrome + secondary compression) and the acknowledgment
  // line. Flag-off renders the shipped surface byte-identical (FR-FLAG-2); `stale` is
  // untouched on both paths. `dayNumber` / `eventCount` feed the E1 headline.
  //
  // FR-FLAG-4 (the beta-shelf composition): enablement flows through the beta workflow,
  // never eligibility alone — `eligible && optedIn`, the B-712 two-gate rule (never
  // conflated). Being in the cohort (the `app_config` allowlist) makes the "Signal
  // redesign" card VISIBLE on app/settings/beta; the owner's local opt-in (default off,
  // wiped on sign-out) is what turns it ON. Both hooks are called unconditionally (Rules
  // of Hooks — no short-circuit), then combined; this mirrors BetaFeatureCard.
  const eligible = useAllowlistFlag('signal_design_v2');
  const optedIn = useBetaOptIn('signal_design_v2');
  const designV2 = eligible && optedIn;

  // Signals v2 (B-755 / CUL-12) — the A2 timing-story cards ride their OWN flag `signals_v2`
  // (not signal_design_v2 — spec §0 D6: this track changes WHAT the engine says, not just how
  // cards render, so a separate kill-switch + GA call). Same two-gate resolution (eligible &&
  // optedIn — never conflated); fail-closed to nothing for everyone else. Both hooks are called
  // unconditionally (Rules of Hooks — no short-circuit), then combined, mirroring designV2 above.
  // Threaded to InsightCard, which renders a timing_story / empty_stomach_timing finding only
  // when it is on (and nothing for those types when off — byte-identical). The beta-shelf opt-in
  // row is PR 10; until then this is dark for everyone (optedIn is false with no shelf to flip).
  const signalsV2Eligible = useAllowlistFlag('signals_v2');
  const signalsV2OptedIn = useBetaOptIn('signals_v2');
  const signalsV2 = signalsV2Eligible && signalsV2OptedIn;

  // While the first cache read is in flight, hold the warm building state rather
  // than letting the empty findings flash 'stale' for a frame.
  const state = isLoading && findings.length === 0 ? 'building' : displayState;

  // Signals v2 (B-755 / CUL-14) — the watching system (§4.4 / D5). Per-lane rows with
  // REAL partial counts, rendered inside whichever empty-state frame is live. Gated on
  // signals_v2 AND an empty state (building / no_pattern): in `live` there is a real
  // finding to show and in `stale` too little to say, so the rows never apply there. The
  // hook reads local data ONLY when enabled, so flag-off / live / stale do zero extra
  // work and stay byte-identical. `dayNumber` is shared with the E1 headline so the
  // Change row's week count and the "Day N" headline always agree (one day definition).
  const watchingEnabled = signalsV2 && (state === 'building' || state === 'no_pattern');
  const watching = useWatchingRows(watchingEnabled, dayNumber);

  // SR-3 receded chrome (§5.2) — the section label drops a tier in the LIVE register
  // only, where the lead's canvas should dominate. The empty states keep the label
  // prominent (it orients the owner while the engine is still learning — the round-2.1
  // mock keeps E1/E2's label at full weight). The footer doorway recedes across every
  // flag-on state (below). Both are token-only and gated: flag-off renders the shipped
  // chrome, and the style prop stays a single reference so the snapshot is byte-identical.
  const labelReceded = designV2 && state === 'live';

  // The acknowledgment line shows above the live findings while a fresh log's regen is in
  // flight (§5.3). Computed once — the render and the iOS announce below read the same value.
  const showAck = designV2 && acknowledging && state === 'live';

  // `accessibilityLiveRegion` (on AckLine) is Android-only; announce imperatively on iOS
  // (Nyx ships iOS-first) so VoiceOver reads the "updating…" line when it appears — the
  // same gap + fix TextField.tsx documents for its error text. Fires on the transition to
  // showing, not every render; no "cleared" announcement (there is no "done" copy — the
  // findings just refresh, and re-announcing on clear would be noise).
  useEffect(() => {
    if (showAck && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(ackUpdatingCopy(petName));
    }
  }, [showAck, petName]);

  // The CulpritMark pulse contract (B-284 §3): "flips false when the Signal zone
  // is viewed (screen focus with the zone on-screen)". This card is always on-
  // screen whenever Home is focused (it isn't behind a scroll gate), so marking
  // seen here — once findings have actually landed — satisfies that trigger. The
  // "See all patterns" footer tap-through is the spec's second trigger; it
  // navigates away, which itself re-focuses Home (and re-marks seen) on return.
  // `markSeen` comes straight off THIS `useSignal()` call, not a separately-read
  // pet id — it always closes over the SAME petId+findings pair this hook just
  // derived `state` from, so a pet switch can never pair the wrong pet's id with
  // stale findings (a code-reviewed multi-pet-safety regression this PR fixed).
  useEffect(() => {
    if (state === 'live') {
      markSeen();
    }
  }, [state, markSeen]);

  return (
    // Signal is the dominant zone — one elevated container holding the ordered
    // stack of insight rows (PM-decided: rows + dividers, not separate cards, so
    // it reads as one calm intelligence surface, never a dashboard dump — §3.1).
    <Card elevated>
      {/* The style prop stays a SINGLE reference when the chrome isn't receded, so the
          shipped snapshot is byte-identical (an inline [style, false] array would drift it). */}
      <SectionLabel
        label="Signal"
        header
        style={labelReceded ? [styles.label, styles.labelReceded] : styles.label}
      />

      {/* SR-3 acknowledgment line (§5.3) — one quiet line ABOVE the still-readable FINDINGS
          while a fresh log's regen is in flight (never a spinner, never blanks the findings).
          Scoped to the live register: the empty states carry their own "getting to know you"
          reassurance (E1), so an "updating…" line there would just double it. Clears when the
          regen settles (useSignal reads the lifecycle flag) or the safety ceiling fires —
          fail-quiet, never an error surface. Flag-off never renders it. */}
      {showAck ? <AckLine petName={petName} /> : null}

      {state === 'live' ? (
        <LiveStack
          findings={findings}
          petName={petName}
          designV2={designV2}
          signalsV2={signalsV2}
          trialRunning={trialRunning}
          suppressTrialResponse={suppressTrialResponse}
        />
      ) : state === 'stale' ? (
        <Text style={styles.intro}>{staleIntro(petName)}</Text>
      ) : state === 'no_pattern' ? (
        // Substantial history, nothing cleared a floor (B-051) — honest, no ghosted
        // previews (the owner has logged enough to know the surface). B-053: when
        // the engine knows WHY there's no signal yet, surface the top coverage
        // diagnostic's one-line why + ≤1 safe action instead of the generic line.
        // CUL-14: the watching rows compose in additively (the gap row can still
        // escalate on a mature record); dark + a no-op when signals_v2 is off.
        designV2 ? (
          <NoPatternStateV2 petName={petName} coverage={coverage} watching={watching} signalsV2={signalsV2} />
        ) : (
          <NoPatternState petName={petName} coverage={coverage} watching={watching} signalsV2={signalsV2} />
        )
      ) : designV2 ? (
        <BuildingStateV2
          petName={petName}
          dayNumber={dayNumber}
          eventCount={eventCount}
          watching={watching}
          signalsV2={signalsV2}
        />
      ) : (
        <BuildingState petName={petName} watching={watching} signalsV2={signalsV2} />
      )}

      {/* §8 doorway into the Patterns dashboard — a quiet footer affordance, present in
          every Signal state so the deeper surface is discoverable from Home. Navigates
          AWAY to a destination (Principle 3 — not a 4th Home zone, not a tab). */}
      <Pressable
        onPress={() => router.push('/insights')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`See all of ${petName}'s patterns`}
        style={styles.patternsLink}
      >
        {/* SR-3 (§5.2) — the footer doorway recedes (to the label's tertiary tier) across
            every flag-on state so it never competes with the content. Single style
            reference when off, so the shipped snapshot holds. */}
        <Text
          style={
            designV2 ? [styles.patternsLinkText, styles.patternsLinkTextReceded] : styles.patternsLinkText
          }
        >
          See all of {petName}'s patterns →
        </Text>
      </Pressable>
    </Card>
  );
}

// SR-3 acknowledgment line (§5.3 / §9) — a small teal dot + the nyx-voice-locked
// "Noted — updating {pet}'s picture…". A polite live region so VoiceOver announces it
// when it appears and clears; the dot is decorative (a View, no label). Renders only
// behind the flag while a regen is in flight (gated at the call site).
function AckLine({ petName }: { petName: string }) {
  return (
    <View style={styles.ackLine} accessibilityLiveRegion="polite">
      <View style={styles.ackDot} />
      <Text style={styles.ackText}>{ackUpdatingCopy(petName)}</Text>
    </View>
  );
}

// no_pattern — show the top coverage diagnostic (B-053) if the engine produced one,
// else the honest generic line. The diagnostic is about DATA COVERAGE, never
// wellness; the action (if any) is a calm corrective, never a nag.
function NoPatternState({
  petName,
  coverage,
  watching,
  signalsV2,
}: {
  petName: string;
  coverage: CoverageDiagnostic[];
  watching: WatchingRow[];
  signalsV2: boolean;
}) {
  // CUL-14 — the watching rows compose in additively on the mature record (only the
  // escalate-only gap row is likely to qualify here; the count floors are usually met).
  // Flag-off (or no qualifying row) is byte-identical: the no-coverage branch keeps its
  // bare <Text> via the early return, and the coverage branch adds a null-rendering slot.
  const showWatching = signalsV2 && watching.length > 0;
  const top = coverage[0];
  if (!top) {
    if (!showWatching) return <Text style={styles.intro}>{noPatternIntro(petName)}</Text>;
    return (
      <View>
        <Text style={styles.intro}>{noPatternIntro(petName)}</Text>
        <WatchingBlock rows={watching} />
      </View>
    );
  }
  const { why, action } = coverageCopy(top, petName);
  return (
    <View>
      <Text style={styles.intro}>{why}</Text>
      {action ? <Text style={styles.coverageAction}>{action}</Text> : null}
      {showWatching ? <WatchingBlock rows={watching} /> : null}
    </View>
  );
}

// The card stack — findings are already ranked server-side (safety leads, then
// the pet's context-lead type, then tier — §5/§8); we render in that order and
// only add the visual rhythm. Hairline dividers between rows keep one container
// reading as a quiet list, not a wall of boxes.
function LiveStack({
  findings,
  petName,
  designV2,
  signalsV2,
  trialRunning,
  suppressTrialResponse,
}: {
  findings: CachedFinding[];
  petName: string;
  designV2: boolean;
  signalsV2: boolean;
  trialRunning: boolean;
  suppressTrialResponse: boolean;
}) {
  // Drop the Signals-v2 types (the timing-story pair CUL-12 + the trial card CUL-13) when the flag
  // is off: the server computes them uniformly for every account (spec §5), so a non-eligible cache
  // DOES carry them, and the client gate is what keeps them dark. Filtering HERE (not just relying on
  // InsightCard's null) keeps the divider rhythm and the lead/compact indexing correct — a null card
  // would otherwise leave a stray divider and shift the true first row off `isLead`. A no-op until
  // the PR-10 redeploy (no cache carries these types before then), so the shipped surface is
  // byte-identical. NOTE: displayState/hasUnseen upstream still count the full set (a non-eligible
  // account whose ONLY findings are Signals-v2 types would read 'live' with an empty stack) — an
  // accepted edge until PR 10's flag-off QA, where the full-surface gate is set.
  //
  // B-789 (§5.2) — then drop the reassuring trial_response card when the record shows the animal
  // isn't eating (`suppressTrialResponse`, computed by Home from the same `trialInput` the strip
  // withholds its vomit line on). SUPPRESSION, NOT REORDER: §5.2 forbids a reassuring summary next
  // to a refusal even BELOW the safety card, so ranking it down is insufficient — the card must not
  // render at all. The server emits `trial_response` blind to the refusal (the day-1-refusal cat the
  // relative-decline lane can't see), and the client is already this card's visibility gate (the
  // signals_v2 filter above), so this is one more condition on the gate that already governs it. The
  // finding stays in the cache; nothing consumes it but this stack.
  const ordered = [...findings]
    .filter((f) => signalsV2 || !isSignalsV2Finding(f.finding))
    .filter((f) => !(suppressTrialResponse && isTrialResponse(f.finding)))
    .sort((a, b) => a.rank - b.rank);
  return (
    <View>
      {ordered.map((f, i) => (
        <View key={`${f.finding.type}-${f.rank}`}>
          {i > 0 && <Divider style={styles.rowDivider} />}
          {/* SR-3 register (§5.1) — the lead (rank 0) keeps the enlarged canvas; secondary
              rows compress into a tighter rhythm. Gated on the flag: off, `compact` is
              false and every row renders the shipped padding. SR-5 (§3.4) threads
              trialRunning for the falling reflection's mid-trial adjacency line. CUL-12
              threads signalsV2 for the A2 timing-story cards (its own flag — spec §0 D6). */}
          <InsightCard
            cached={f}
            petName={petName}
            isLead={i === 0}
            designV2={designV2}
            signalsV2={signalsV2}
            compact={designV2 && i > 0}
            trialRunning={trialRunning}
          />
        </View>
      ))}
    </View>
  );
}

function BuildingState({
  petName,
  watching,
  signalsV2,
}: {
  petName: string;
  watching: WatchingRow[];
  signalsV2: boolean;
}) {
  // CUL-14 — when signals_v2 is on and a lane has something to report, the real-count
  // watching rows take the place of the ghosted "What the signal looks like" previews
  // (the concrete version of the same "here's what's coming" idea). The lead intro
  // stays. Flag-off (or no qualifying row) renders the shipped previews byte-identical.
  const showWatching = signalsV2 && watching.length > 0;
  return (
    <>
      <Text style={styles.intro}>{buildingIntro(petName)}</Text>
      {showWatching ? (
        <WatchingBlock rows={watching} />
      ) : (
        <View style={styles.previews}>
          <Text style={styles.previewsHeader}>What the signal looks like:</Text>
          {PREVIEW_INSIGHTS.map((text, i) => (
            <View key={i} style={styles.previewRow}>
              <View style={styles.previewAccentBar} />
              <Text style={styles.previewText}>{text}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ── SR-2 empty states (B-721 §6) — flag-on E1 (building) + E2 (no_pattern) ──────
// These render only behind `signal_design_v2`. E1 shows the SHAPE of what's coming:
// ghosted receipts (a dot lane + a stacked compare), hollow dots, and DASHES where a
// real receipt would print a count — never a fabricated number (§6). E2 is the mature
// "nothing established" record: the verbatim B-284 §9 copy + the top B-053 coverage
// diagnostic, restyled into the card rhythm. Neither reads absence as wellness.

// The E1-vs-E1-c intensity pick (§6) — the ONE open design decision of this PR,
// resolved on the PM's device at QA. Ships as E1-c, the COLOR pass: accent + slate
// washes at ghost opacity, the day counter in accent ink. (Dialing a drawn color
// pass down on-device is easier than imagining it on a neutral build, so E1-c is the
// QA starting point.) Every tunable lives in this ONE object so the decision is a
// single edit, never a hunt through the stylesheet:
//   • plain E1 (neutral ghost): rails → colorTickIdle at 0.85; band 0.05; dots →
//     colorTickIdle; compare 0.25; dayCount → colorTextPrimary / weightRegular.
//   • "somewhere between": nudge the opacities.
// Rose is deliberately absent — no alarm tone on a state with nothing to report. The
// row-2 slate is colorEventMedication (a slate-blue WORLD hue); at ghost opacity on a
// building-state rail it reads as a neutral slate, never a medication cue.
const GHOST = {
  rails: [theme.colorAccent, theme.colorEventMedication, theme.colorAccent] as const,
  railOpacity: 0.35,
  band: theme.colorAccent,
  bandOpacity: 0.12,
  dotInWindow: theme.colorAccent,
  dotOutWindow: theme.colorTickIdle, // the honest exception: present but pale
  compareFill: theme.colorAccent,
  compareFillOpacity: 0.4,
  dayCountColor: theme.colorAccentInk,
  dayCountWeight: theme.weightSemibold,
} as const;

function BuildingStateV2({
  petName,
  dayNumber,
  eventCount,
  watching,
  signalsV2,
}: {
  petName: string;
  dayNumber: number;
  eventCount: number;
  watching: WatchingRow[];
  signalsV2: boolean;
}) {
  // CUL-14 — when signals_v2 is on and a lane qualifies, the real-count watching rows
  // replace the abstract "what we're watching for" ghost list (their concrete form) while
  // the headline stays. The WatchingBlock carries its OWN sub + safety floor, so the
  // else-branch (the shipped B-721 E1) still owns BUILDING_SUB / BUILDING_FLOOR — no
  // doubling. Flag-off (or no qualifying row) renders the ghost list byte-identical.
  const showWatching = signalsV2 && watching.length > 0;
  return (
    <View>
      {/* eventCount 0 ⇒ the pre-read sentinel (a real building pet always has ≥1 recent
          event — deriveDisplayState requires hasRecentActivity), so hold the day-count
          clause back for that one load frame rather than flash a fabricated
          "Day 1 — 0 events so far". Once the local read lands it renders in full. */}
      <Text
        style={styles.v2Headline}
        accessibilityLabel={
          eventCount > 0 ? buildingHeadline(petName, dayNumber, eventCount) : buildingHeadlineLead(petName)
        }
      >
        {buildingHeadlineLead(petName)}
        {eventCount > 0 ? (
          <Text style={[styles.v2DayCount, { color: GHOST.dayCountColor, fontWeight: GHOST.dayCountWeight }]}>
            {' '}
            {buildingDayCount(dayNumber, eventCount)}
          </Text>
        ) : null}
      </Text>

      {showWatching ? (
        <WatchingBlock rows={watching} />
      ) : (
        <>
          <Text style={styles.v2Sub}>{BUILDING_SUB}</Text>

          {/* The three things the engine is building toward, in the mock's order
              (timing → food → change), each with a ghost preview of its future receipt.
              Every row carries a top hairline — the first one separates the list from the
              sub-line above (matching the mock's three-divider rhythm). */}
          <WatchingForRow text={BUILDING_WATCHING_FOR[0]} railColor={GHOST.rails[0]}>
            <GhostLane />
          </WatchingForRow>
          <WatchingForRow text={BUILDING_WATCHING_FOR[1]} railColor={GHOST.rails[1]} />
          <WatchingForRow text={BUILDING_WATCHING_FOR[2]} railColor={GHOST.rails[2]}>
            <GhostCompare />
          </WatchingForRow>

          {/* The safety floor — the weekly-pattern framing must never read as "nothing
              urgent surfaces before then". Absence is never wellness (§6). */}
          <Text style={styles.v2Floor}>{BUILDING_FLOOR}</Text>
        </>
      )}
    </View>
  );
}

function WatchingForRow({
  text,
  railColor,
  children,
}: {
  text: string;
  railColor: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.watchRow}>
      <View style={[styles.ghostRail, { backgroundColor: railColor, opacity: GHOST.railOpacity }]} />
      <View style={styles.watchBody}>
        <Text style={styles.watchText}>{text}</Text>
        {children}
      </View>
    </View>
  );
}

// Ghosted dot lane — the SHAPE of a timing receipt (Shape A) before any real episode
// exists: hollow dots, a tinted "window" band, and one pale out-of-window dot (the
// honest exception — §4 "the exceptions are the honesty"). No axis numbers, no counts.
const GHOST_LANE_DOTS = [
  { left: '8%', inWindow: true },
  { left: '15%', inWindow: true },
  { left: '21%', inWindow: true },
  { left: '62%', inWindow: false },
] as const;

function GhostLane() {
  return (
    <View style={styles.estrip}>
      <View style={styles.ghostLane}>
        <View style={[styles.ghostBand, { backgroundColor: GHOST.band, opacity: GHOST.bandOpacity }]} />
        {GHOST_LANE_DOTS.map((d) => (
          <View
            key={d.left}
            style={[
              styles.ghostDot,
              { left: d.left, borderColor: d.inWindow ? GHOST.dotInWindow : GHOST.dotOutWindow },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// Ghosted stacked-compare — the SHAPE of a change receipt (Shape C): two labeled
// rows, proportional bars at ghost opacity, and DASHES for the counts. A real
// week-over-week compare prints numbers here; the building state must not invent them
// (§6 — "dashes for counts, never fake numbers").
const GHOST_COMPARE_ROWS = [
  { label: 'Last week', fill: '40%' },
  { label: 'This week', fill: '65%' },
] as const;

function GhostCompare() {
  return (
    <View style={styles.estrip}>
      {GHOST_COMPARE_ROWS.map((r) => (
        <View key={r.label} style={styles.cmpRow}>
          <Text style={styles.cmpLabel}>{r.label}</Text>
          <View style={styles.cmpTrack}>
            <View
              style={[
                styles.cmpFill,
                { width: r.fill, backgroundColor: GHOST.compareFill, opacity: GHOST.compareFillOpacity },
              ]}
            />
          </View>
          <Text style={styles.cmpDash}>—</Text>
        </View>
      ))}
    </View>
  );
}

// E2 — mature record, nothing established. The verbatim B-284 §9 copy (headline +
// dimmed sub), then the top B-053 coverage diagnostic as the one calm corrective
// (shipped behavior, restyled). No coverage diagnostic → the §9 copy stands alone.
// The sub line is load-bearing: "isn't an all-clear" — absence is never wellness.
function NoPatternStateV2({
  petName,
  coverage,
  watching,
  signalsV2,
}: {
  petName: string;
  coverage: CoverageDiagnostic[];
  watching: WatchingRow[];
  signalsV2: boolean;
}) {
  // CUL-14 — additive watching rows (see NoPatternState). Flag-off renders the slot as
  // null, so the shipped E2 tree is byte-identical.
  const showWatching = signalsV2 && watching.length > 0;
  const top = coverage[0];
  const cov = top ? coverageCopy(top, petName) : null;
  return (
    <View>
      <Text style={styles.v2Headline}>{NO_PATTERN_HEADLINE}</Text>
      <Text style={styles.v2Sub}>{NO_PATTERN_SUB}</Text>
      {cov ? (
        <View style={styles.v2Quiet}>
          <Text style={styles.v2QuietText}>{cov.why}</Text>
          {cov.action ? <Text style={styles.v2QuietAction}>{cov.action}</Text> : null}
        </View>
      ) : null}
      {showWatching ? <WatchingBlock rows={watching} /> : null}
    </View>
  );
}

// ── CUL-14 the watching block (§4.4 / D5 / G8) ────────────────────────────────
// The per-lane real-count rows, rendered as ONE unit wherever the watching system
// composes into an empty-state frame (shipped E1/E2 or B-721's). It carries its own sub
// line and the verbatim safety-floor line, so a frame that shows it hands over its whole
// "what we're watching" middle to this block. PLAIN count-in-words rows — deliberately NO
// progress bar / dot-fill visual: R-5 ratified the count form precisely because it
// carries the "N of 6" progress WITHOUT a fill-the-dots visual's implied "a card is
// coming" (G8 — the count is the progress; it carries no promise). The rows are already
// ordered + gated (buildWatchingRows); the floor line is unconditional (absence ≠
// wellness — the weekly cadence must never read as "nothing urgent surfaces before then").
function WatchingBlock({ rows }: { rows: WatchingRow[] }) {
  return (
    <View>
      <Text style={styles.watchingSub}>{WATCHING_SUB}</Text>
      <View style={styles.watchingRows}>
        {rows.map((r) => (
          <Text key={r.key} style={styles.watchingRow}>
            {r.text}
          </Text>
        ))}
      </View>
      <Text style={styles.watchingFloor}>{BUILDING_FLOOR}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: theme.space2,
  },
  // SR-3 receded chrome (§5.2) — the section label drops one tier (secondary → tertiary)
  // in the live register. Tertiary, not disabled: a disabled-tier heading fails AA
  // contrast; tertiary keeps it (≥4.5:1) while still reading as receded.
  labelReceded: {
    color: theme.colorTextTertiary,
  },
  // §8 quiet doorway into the dashboard — a hairline-separated footer link.
  patternsLink: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    paddingTop: theme.space2,
    marginTop: theme.space1,
  },
  patternsLinkText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  // SR-3 receded chrome (§5.2) — the doorway drops to the SAME tertiary tier as the
  // label. The mock dims it to a lighter teal, but a lighter teal on white fails AA
  // (≈1.6:1) — worse than the shipped accent footer — and there is no teal that both
  // recedes AND clears AA on white. So the doorway recedes as the label does (grey,
  // ≥4.5:1), extending the team's label-contrast override of the mock to the footer.
  // pm-feature-review flagged the teal path as the sole-doorway AA failure; teal is the
  // interactive FILL colour, not a link requirement, and the whole row is a button.
  patternsLinkTextReceded: {
    color: theme.colorTextTertiary,
  },
  // SR-3 acknowledgment line (§5.3) — the teal dot + the "Noted — updating …" line, sat
  // above the findings with a little breathing room below.
  ackLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingBottom: theme.space1,
  },
  ackDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: theme.colorAccent,
  },
  ackText: {
    fontSize: theme.textXS,
    color: theme.colorAccentInk,
    lineHeight: theme.lineHeightXS,
  },
  intro: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space2,
  },
  // The single corrective action under a coverage diagnostic (B-053) — calm and
  // gently actionable, never a nag. Sits just below the "why" line.
  coverageAction: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
    // Match the single-text states' bottom spacing so the two-line (action) variant
    // doesn't sit tighter against the card edge (code-review nit).
    marginBottom: theme.space2,
  },
  rowDivider: {
    marginHorizontal: -theme.space1,
  },
  previews: {
    gap: theme.space1,
  },
  previewsHeader: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  previewAccentBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: theme.colorAccent,
    opacity: 0.5,
  },
  previewText: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
    opacity: 0.65,
  },

  // ── SR-2 empty states (E1/E2) — flag-on rhythm ──────────────────────────────
  v2Headline: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.spaceMicro,
  },
  // The day-count clause — its color + weight come from GHOST (the E1-vs-E1-c pick),
  // applied inline; the size matches the surrounding headline so it reads as one line.
  v2DayCount: {
    fontSize: theme.textMD,
  },
  v2Sub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginBottom: theme.space1,
  },
  // A "watching for" row — a ghost rail + the named thing + an optional ghost receipt.
  // Every row carries a top hairline; the first row's separates the list from the
  // sub-line above (the mock's three-divider rhythm).
  watchRow: {
    flexDirection: 'row',
    gap: theme.space1,
    paddingVertical: theme.space1,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  ghostRail: {
    width: 3,
    borderRadius: 2,
    // backgroundColor + opacity applied inline from GHOST.
  },
  watchBody: {
    flex: 1,
    minWidth: 0,
  },
  watchText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
  },
  // Ghost receipts — the previews of a real Shape-A lane / Shape-C compare.
  estrip: {
    marginTop: theme.space1,
  },
  ghostLane: {
    height: 22,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderStyle: 'dashed',
    position: 'relative',
  },
  ghostBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '26%',
    borderRadius: theme.radiusSmall,
    // backgroundColor + opacity applied inline from GHOST.
  },
  ghostDot: {
    position: 'absolute',
    top: '50%',
    // Center the 7pt dot on its left% / vertical midpoint (RN has no translate-by-%).
    marginTop: -3.5,
    marginLeft: -3.5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    backgroundColor: 'transparent', // hollow — nothing here is logged yet
    // left + borderColor applied inline.
  },
  cmpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginTop: theme.spaceMicro,
  },
  cmpLabel: {
    width: 72,
    fontSize: theme.textXS,
    color: theme.colorTextDisabled,
  },
  cmpTrack: {
    flex: 1,
    height: 8,
    borderRadius: theme.radiusXS,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  cmpFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: theme.radiusXS,
    // width + backgroundColor + opacity applied inline.
  },
  cmpDash: {
    width: 28,
    textAlign: 'right',
    fontSize: theme.textXS,
    color: theme.colorTextDisabled,
  },
  // The quiet block under E2 — the coverage diagnostic, hairline-set-off like the
  // shipped states' bottom rhythm.
  v2Quiet: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: theme.space2,
    paddingTop: theme.space1,
  },
  v2QuietText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  v2QuietAction: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightSM,
    marginTop: theme.spaceMicro,
  },
  // The E1 safety-floor line — same hairline-set-off treatment as E2's quiet block.
  v2Floor: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: theme.space2,
    paddingTop: theme.space1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },

  // ── CUL-14 watching block (§4.4) — the sub, the real-count rows, the floor line ──
  // The intro above the rows: what we're watching, secondary weight (it orients; the
  // rows carry the facts). Matches the v2Sub tier so the block reads as one register in
  // the design_v2 frame and calm-but-present in the shipped one.
  watchingSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginBottom: theme.space1,
  },
  // The rows sit as a quiet list — small gaps, no rails/dots/bars (R-5: count-in-words,
  // never a fill-the-dots visual that reads as a game / a promise a card is coming).
  watchingRows: {
    gap: theme.spaceMicro,
  },
  // One row: the primary-ink fact ("Timing — 4 of the 6 …"), body line-height so a
  // wrapped row stays legible. No color/severity coding — every row is the same calm ink.
  watchingRow: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  // The block's own safety-floor line — the same hairline-set-off treatment as v2Floor,
  // owned here so the block carries the floor into the shipped frame too (which has none).
  watchingFloor: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: theme.space2,
    paddingTop: theme.space1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
});
