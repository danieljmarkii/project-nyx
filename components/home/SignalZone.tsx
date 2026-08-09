import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { SectionLabel } from '../ui/SectionLabel';
import { InsightCard } from './InsightCard';
import { useSignal } from '../../hooks/useSignal';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import {
  BUILDING_FLOOR,
  BUILDING_SUB,
  BUILDING_WATCHING_FOR,
  NO_PATTERN_HEADLINE,
  NO_PATTERN_SUB,
  ackUpdatingCopy,
  buildingDayCount,
  buildingHeadline,
  buildingHeadlineLead,
  buildingIntro,
  coverageCopy,
  noPatternIntro,
  staleIntro,
} from '../../lib/signalCopy';
import type { CachedFinding, CoverageDiagnostic } from '../../lib/signal';

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
}

export function SignalZone({ trialRunning = false }: SignalZoneProps = {}) {
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

  // Signal/Home design uplift (B-721) — dark behind the allowlist flag, resolved once
  // here and threaded down so the whole zone reads one eligibility (fail-closed to the
  // shipped surface for everyone else). SR-1 gates the live receipts (via LiveStack →
  // InsightCard); SR-2 gates the empty states (E1 building / E2 no_pattern) below; SR-3
  // gates the register (receded chrome + secondary compression) and the acknowledgment
  // line. Flag-off renders the shipped surface byte-identical (FR-FLAG-2); `stale` is
  // untouched on both paths. `dayNumber` / `eventCount` feed the E1 headline.
  const designV2 = useAllowlistFlag('signal_design_v2');

  // While the first cache read is in flight, hold the warm building state rather
  // than letting the empty findings flash 'stale' for a frame.
  const state = isLoading && findings.length === 0 ? 'building' : displayState;

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
        <LiveStack findings={findings} petName={petName} designV2={designV2} trialRunning={trialRunning} />
      ) : state === 'stale' ? (
        <Text style={styles.intro}>{staleIntro(petName)}</Text>
      ) : state === 'no_pattern' ? (
        // Substantial history, nothing cleared a floor (B-051) — honest, no ghosted
        // previews (the owner has logged enough to know the surface). B-053: when
        // the engine knows WHY there's no signal yet, surface the top coverage
        // diagnostic's one-line why + ≤1 safe action instead of the generic line.
        designV2 ? (
          <NoPatternStateV2 petName={petName} coverage={coverage} />
        ) : (
          <NoPatternState petName={petName} coverage={coverage} />
        )
      ) : designV2 ? (
        <BuildingStateV2 petName={petName} dayNumber={dayNumber} eventCount={eventCount} />
      ) : (
        <BuildingState petName={petName} />
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
}: {
  petName: string;
  coverage: CoverageDiagnostic[];
}) {
  const top = coverage[0];
  if (!top) {
    return <Text style={styles.intro}>{noPatternIntro(petName)}</Text>;
  }
  const { why, action } = coverageCopy(top, petName);
  return (
    <View>
      <Text style={styles.intro}>{why}</Text>
      {action ? <Text style={styles.coverageAction}>{action}</Text> : null}
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
  trialRunning,
}: {
  findings: CachedFinding[];
  petName: string;
  designV2: boolean;
  trialRunning: boolean;
}) {
  const ordered = [...findings].sort((a, b) => a.rank - b.rank);
  return (
    <View>
      {ordered.map((f, i) => (
        <View key={`${f.finding.type}-${f.rank}`}>
          {i > 0 && <Divider style={styles.rowDivider} />}
          {/* SR-3 register (§5.1) — the lead (rank 0) keeps the enlarged canvas; secondary
              rows compress into a tighter rhythm. Gated on the flag: off, `compact` is
              false and every row renders the shipped padding. SR-5 (§3.4) threads
              trialRunning for the falling reflection's mid-trial adjacency line. */}
          <InsightCard
            cached={f}
            petName={petName}
            isLead={i === 0}
            designV2={designV2}
            compact={designV2 && i > 0}
            trialRunning={trialRunning}
          />
        </View>
      ))}
    </View>
  );
}

function BuildingState({ petName }: { petName: string }) {
  return (
    <>
      <Text style={styles.intro}>{buildingIntro(petName)}</Text>
      <View style={styles.previews}>
        <Text style={styles.previewsHeader}>What the signal looks like:</Text>
        {PREVIEW_INSIGHTS.map((text, i) => (
          <View key={i} style={styles.previewRow}>
            <View style={styles.previewAccentBar} />
            <Text style={styles.previewText}>{text}</Text>
          </View>
        ))}
      </View>
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
}: {
  petName: string;
  dayNumber: number;
  eventCount: number;
}) {
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
function NoPatternStateV2({ petName, coverage }: { petName: string; coverage: CoverageDiagnostic[] }) {
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
});
