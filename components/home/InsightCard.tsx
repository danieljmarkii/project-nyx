import { useState, type ReactElement } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text, UIManager,
  View,
} from 'react-native';
import { theme } from '../../constants/theme';
import { Badge } from '../ui/Badge';
import { ThemedText } from '../ui/ThemedText';
import {
  DENSITY_BOX_TITLE,
  DOT_LANE_MAX,
  TIMING_STORY_BADGE,
  TRIAL_ADJACENCY,
  TRIAL_RTM_CONFOUND,
  confidenceTag,
  displayProteinName,
  dotLaneA11yLabel,
  dotLaneModel,
  evidenceText,
  isJointCandidate,
  isNewWorsening,
  isReflectionDensityWithheld,
  isTimingFinding,
  isTimingStory,
  isTrialResponse,
  medContextLine,
  phoneScript,
  photoCompositionLines,
  proteinCluster,
  reflectionExpandedExtras,
  reflectionWithheldSampleLine,
  sampleLine,
  stackedCompareA11yLabel,
  timingCompareRows,
  timingControlDisclosure,
  timingReceiptDegrades,
  timingStoryBandRows,
  timingStoryClockLaneModel,
  timingStoryControlDisclosure,
  timingStoryMealLaneModel,
  timingStorySampleLine,
  timingStoryVetLine,
  trialResponseCompareRows,
  trialResponseDayBadge,
  trialResponseDensityLine,
  trialResponseDietStructureLine,
  trialResponseSampleLine,
  trialResponseTimedReconciliationLine,
  worseningNewSampleLine,
} from '../../lib/signalCopy';
import { DotLane, EvidenceBox, PhoneScript, StackedCompare } from './SignalReceipts';
import type { CachedFinding, InsightType, PriorityClass, SignalFinding } from '../../lib/signal';

// Enable the height animation on Android (off by default there).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Priority rail colour (the designed "this one matters more" cue, read before a
// word is). Safety leads in warm terracotta — clear, not alarm-red (Principle 4 /
// Dr. Chen); everything benign rides the single product accent.
const RAIL_COLOR: Record<PriorityClass, string> = {
  safety: theme.colorEventSymptom,
  insight: theme.colorAccent,
};

// ── Per-type renderer registry (§3.2 / §11f) ──────────────────────────────────
// Detection is decoupled from presentation: each insight type owns how its body
// renders. v1 ships the sentence renderer used by both v1 types (correlation,
// intake-decline). A stat or sparkline renderer (preference ④, trend ③) plugs in
// here by type — without touching the card frame, rail, or expand behaviour —
// keyed by InsightType so mixed formats still read as one calm surface.
interface InsightBodyProps {
  cached: CachedFinding;
  // The lead (top-ranked) finding is the AI Signal headline — it alone wears the
  // Newsreader display face at textSignal size (v1.2 §4 / type-signal preview).
  // Subsequent findings stay in the body face so the surface reads as one calm
  // headline + supporting rows, never a column of competing serif headlines.
  isLead: boolean;
}

function SentenceBody({ cached, isLead }: InsightBodyProps) {
  const finding = cached.finding;
  const tag = confidenceTag(finding);
  // Client-derived `New` for a worsening finding whose prior week held zero episodes
  // (§3.2 / Change Contract v1.1): the chip carries the novelty, and the sample line
  // drops the "N this week, 0 last week" pair the chip replaces — one carrier, not two
  // (S10). The other `New` cases (timing / first-appearance for other types) need
  // generate-signal prior-set memory.
  const showNew = isNewWorsening(finding);
  // The card-face sample line, with the two client swaps folded in — each S10 (the face
  // never re-asserts a comparison another element already owns): a `New` worsening drops
  // its "0 last week" pair (the chip carries it), and a density-withheld falling
  // reflection drops its incomparable "M last week" (§3.3 — SR-4 withheld it from the
  // sentence, so the face must not put it back, or the expanded "we're not comparing"
  // line contradicts the card). The guards are inlined so TS narrows `finding` per branch.
  const sample = isNewWorsening(finding)
    ? worseningNewSampleLine(finding)
    : isReflectionDensityWithheld(finding)
      ? reflectionWithheldSampleLine(finding)
      : sampleLine(finding);
  return (
    <View style={styles.body}>
      <ThemedText style={[styles.sentence, isLead && styles.sentenceLead]}>{cached.text}</ThemedText>
      {finding.type === 'food_symptom_correlation' && isJointCandidate(finding) && (
        <LinkedPair proteins={proteinCluster(finding)} />
      )}
      <CardFaceReceipt finding={finding} />
      {/* SR-5 (§5.4) — the medication-on-board context line on correlation + timing cards,
          when a course is active in the finding window. Returns null for other types and
          when the composed line trips the guardrail screen. */}
      <MedContextLine finding={finding} />
      <View style={styles.metaRow}>
        {showNew && <NewChip />}
        {tag && <Badge label={tag} variant="muted" />}
        <ThemedText style={styles.sample}>{sample}</ThemedText>
      </View>
    </View>
  );
}

// ── The A2 combined timing card (Signals v2 / B-755 / CUL-12) ─────────────────
// The timing_story card (both phenotypes) + the lone empty_stomach_timing card. Face:
// the server-phrased lead sentence (both phenotypes count-anchored), the three-band
// Shape-C compare (≤30m / in between / 6h+, every count printed — S2), and a meta row.
// The med line, the per-phenotype lanes, the L3 lines and the for-your-vet relay live in the
// expand (TimingStoryExpanded). GA'd (CUL-548): the card renders whenever the payload carries
// a timing_story / empty_stomach_timing finding (the server's B-777 gate governs whether an
// account's payload carries one, until GA-3). The G10 contract still protects a future,
// not-yet-rendered lane via the registry `!Body` guard.
function TimingStoryBody({ cached, isLead }: InsightBodyProps) {
  const finding = cached.finding;
  // Registry-keyed, so this is always a story type; the guard narrows the union for the
  // copy helpers (and is a defensive null for an impossible call).
  if (!isTimingStory(finding)) return null;
  return (
    <View style={styles.body}>
      <ThemedText style={[styles.sentence, isLead && styles.sentenceLead]}>{cached.text}</ThemedText>
      <StackedCompare rows={timingStoryBandRows(finding)} />
      <View style={styles.metaRow}>
        <Badge label={TIMING_STORY_BADGE} variant="muted" />
        <ThemedText style={styles.sample}>{timingStorySampleLine(finding)}</ThemedText>
      </View>
    </View>
  );
}

// ── The trial-response card (L2 — the wedge; Signals v2 / B-755 / CUL-13) ──────
// The event-driven Signal trial card. Face: the server-phrased lead sentence (cached.text — the
// pooled count comparison, direction-neutral) + the two per-phenotype count rows (rapid ≤30m / long
// ≥6h, each two-sided "4 · was 8" — G2) + a meta row (the "Day N of M" badge + the "counted from days
// you logged" sample line). The RTM/confound honesty, the §3.4 adjacency, the density disclosure and
// the diet-structure context live in the expand (TrialResponseExpanded). GA'd (CUL-548): the card
// renders whenever the payload carries a trial_response finding (the server's B-777 gate governs
// whether an account's payload carries one, until GA-3). The D2 absence-shaped SENTENCE lead is NOT
// here (open, Dr. Chen gate); the count-row form is the unconditional one.
function TrialResponseBody({ cached, isLead }: InsightBodyProps) {
  const finding = cached.finding;
  // Registry-keyed, so this is always a trial_response; the guard narrows the union for the copy
  // helpers (and is a defensive null for an impossible call).
  if (!isTrialResponse(finding)) return null;
  // B-766 — the un-timeable reconciliation line renders BELOW the three band rows and ABOVE the meta
  // row, only when the timed bands don't already sum to the pooled lead (else null). It is what makes
  // the face foot: three bands (the timed episodes) + this remainder = the pooled count in the lead.
  const reconciliation = trialResponseTimedReconciliationLine(finding);
  return (
    <View style={styles.body}>
      <ThemedText style={[styles.sentence, isLead && styles.sentenceLead]}>{cached.text}</ThemedText>
      <StackedCompare rows={trialResponseCompareRows(finding)} />
      {reconciliation ? <ThemedText style={styles.sample}>{reconciliation}</ThemedText> : null}
      <View style={styles.metaRow}>
        <Badge label={trialResponseDayBadge(finding)} variant="muted" />
        <ThemedText style={styles.sample}>{trialResponseSampleLine(finding)}</ThemedText>
      </View>
    </View>
  );
}

// ── The trial-response expanded state (CUL-13, §4.2) ───────────────────────────
// Below the "Why we're showing this" prose: the RTM/confound honesty block verbatim + the §3.4
// adjacency line (both about a running trial — the finding only ever exists for one, so neither is
// gated on trialRunning), then the "what else changed" box with the diet-structure context in words
// (no "%", B-733) + the logged-days density disclosure. The §5.4 med-on-board line trails when a
// course is active. Every string count-anchored / never-verdicted (G1/G3). Rendered only for a
// trial_response finding (gated at the call site by the expanded-receipt fork).
function TrialResponseExpanded({ finding }: { finding: SignalFinding }) {
  if (!isTrialResponse(finding)) return null;
  const dietStructure = trialResponseDietStructureLine(finding);
  const medLine = medContextLine(finding);
  // The RTM/confound honesty is fewer-SPECIFIC WORDING ("A calmer stretch…", "A quieter week…"), and
  // the card fires on more-during-trial too (escalation — the direction that ships if the PM picks
  // escalate-only). "Calmer/quieter" contradicts a rising record, so the box renders ONLY on a fewer
  // card. The MORE-direction confound copy is an OPEN Dr. Chen / nyx-voice call (spec §2 L2 ratified
  // only the fewer strings, verbatim, no MORE variant); until it lands, a more card omits this box —
  // the direction-neutral "What else changed" (diet structure) below still shows, and the lead already
  // routes to the vet. (code-reviewer / Dr. Chen, CUL-13.)
  const showRtm = finding.comparisonDirection === 'fewer_during_trial';
  return (
    <>
      {showRtm ? (
        <EvidenceBox title="Reading this stretch honestly">
          <ThemedText style={styles.disclosure}>{TRIAL_RTM_CONFOUND}</ThemedText>
          <ThemedText style={[styles.trialAdjacency, styles.disclosureSpaced]}>{TRIAL_ADJACENCY}</ThemedText>
        </EvidenceBox>
      ) : null}
      <EvidenceBox title="What else changed">
        {dietStructure ? <ThemedText style={styles.disclosure}>{dietStructure}</ThemedText> : null}
        <ThemedText style={[styles.disclosure, dietStructure ? styles.disclosureSpaced : null]}>
          {trialResponseDensityLine(finding)}
        </ThemedText>
      </EvidenceBox>
      {/* §5.4 med-on-board context — a bare fact line, never a verdict; dropped fail-quiet when the
          composed line trips the guardrail screen (a "%" in the drug name — B-733). */}
      {medLine ? <ThemedText style={styles.medContext}>{medLine}</ThemedText> : null}
    </>
  );
}

// ── Med-on-board context line (SR-5, §5.4) ────────────────────────────────────
// A quiet slate-toned line under the sentence/receipt: "During an active {drug} course —
// {n} doses logged." Context stated as fact, never a verdict (§5.4). Renders null for a
// type that carries no context, and — via medContextLine — when the composed line trips
// the guardrail screen (a "%" in the owner's drug name, B-733); the med context is
// non-essential decoration on a benign card, so dropping it is fail-quiet, never a gap.
// (Correlation/timing types only — for other types medContextLine returns null.)
function MedContextLine({ finding }: { finding: SignalFinding }) {
  const line = medContextLine(finding);
  if (!line) return null;
  return <ThemedText style={styles.medContext}>{line}</ThemedText>;
}

// The `New`-for-worsening chip (§3.2 / SR-3). Accent-ink on the accent wash — a tinted
// sibling of the confidence Badge, deliberately NOT rose: novelty is not alarm, so a
// "this is new" cue carries no safety tone. Sized to the meta row's other chips (textXS)
// so mixed chips read level. Renders only for a zero-prior worsening (gated at the call site).
function NewChip() {
  return (
    <View style={styles.newChip}>
      <ThemedText style={styles.newChipText}>New</ThemedText>
    </View>
  );
}

// ── Card-face receipt (SR-1, §4) ──────────────────────────────────────────────
// Between the sentence and the sample line, a timing finding shows its glance
// evidence: Shape A (dot lane) at v1 sample sizes, degrading to Shape C (within-window
// vs outside) above the legibility cap — never bins (SD-4). Every other type stays
// sentence-only (S1 safety faces stay plain; S10 correlation/intake/reflection are
// already carried by their sample line). Returns null when the type carries no strip.
function CardFaceReceipt({ finding }: { finding: SignalFinding }) {
  if (!isTimingFinding(finding)) return null;
  if (timingReceiptDegrades(finding)) {
    return <StackedCompare rows={timingCompareRows(finding)} />;
  }
  return <DotLane model={dotLaneModel(finding)} />;
}

// The card-face receipt's evidence phrased as one sentence, for the card's OWN
// accessibilityLabel — the strip Views are decorative (a self-label on them is
// swallowed by the outer Pressable and never reaches VoiceOver; see SignalReceipts).
// Null when the type carries no card-face strip.
function cardFaceReceiptA11y(finding: SignalFinding): string | null {
  if (!isTimingFinding(finding)) return null;
  return timingReceiptDegrades(finding)
    ? stackedCompareA11yLabel(timingCompareRows(finding))
    : dotLaneA11yLabel(finding);
}

// ── Expanded-state evidence (SR-1 + SR-5, §4 / §3.3 / §3.4) ───────────────────
// Additive under the flag, below the unchanged "Why we're showing this" prose. Timing
// expands draw the two-sided control side + the honest un-timeable remainder (S2/S9);
// safety expands render the phone-call script — the facts to say on a vet call (§9). A
// FALLING reflection (SR-5) draws its density disclosure/withheld line + the mid-trial
// adjacency. Correlation still adds nothing here (its sample line carries it — S10).
function ExpandedReceipts({
  finding,
  petName,
  trialRunning,
}: {
  finding: SignalFinding;
  petName: string;
  trialRunning: boolean;
}) {
  if (isTimingFinding(finding)) {
    const disclosure = timingControlDisclosure(finding);
    const rows = timingReceiptDegrades(finding) ? null : timingCompareRows(finding);
    // Degraded + everything timeable → the card-face compare already said it all.
    if (!rows && !disclosure) return null;
    return (
      <EvidenceBox title="The other side of the picture">
        {rows && <StackedCompare rows={rows} />}
        {disclosure ? (
          <ThemedText style={[styles.disclosure, rows ? styles.disclosureSpaced : null]}>{disclosure}</ThemedText>
        ) : null}
      </EvidenceBox>
    );
  }
  // Reflection (SR-5, §3.3 / §3.4) — the density disclosure/withheld line + the mid-trial
  // adjacency, each rendered only when it applies (both null → no box, e.g. a flat
  // reflection or an old cached row with no density and no trial). Falling-only and
  // expanded-only; the card face stays sentence-only (S1/S10).
  if (finding.type === 'reflection') {
    const { densityLine, trialAdjacency } = reflectionExpandedExtras(finding, trialRunning);
    if (!densityLine && !trialAdjacency) return null;
    return (
      <EvidenceBox title={DENSITY_BOX_TITLE}>
        {densityLine ? <ThemedText style={styles.disclosure}>{densityLine}</ThemedText> : null}
        {trialAdjacency ? (
          <ThemedText style={[styles.trialAdjacency, densityLine ? styles.disclosureSpaced : null]}>
            {trialAdjacency}
          </ThemedText>
        ) : null}
      </EvidenceBox>
    );
  }
  const facts = phoneScript(finding, petName);
  if (facts) {
    return (
      <EvidenceBox title="If you call your clinic, the facts to have ready">
        <PhoneScript facts={facts} />
      </EvidenceBox>
    );
  }
  return null;
}

// ── The A2 expanded state (A3's mechanics — Signals v2 / CUL-12, §4.1) ─────────
// Below the "Why we're showing this" prose: the per-phenotype dot lanes (a meal-relative
// lane + the early-morning clock lane where one exists), the honest un-timeable remainder
// (S2), the §5.4 med-on-board line, the L3 photographed-content lines (present-only, never
// reassuring — G4), and a plain for-your-vet relay (descriptors, never labels). Rendered
// only for a story finding (gated at the call site by the expanded-receipt fork).
function TimingStoryExpanded({ finding }: { finding: SignalFinding }) {
  if (!isTimingStory(finding)) return null;
  // Cap the dot lanes at the shared legibility limit (DOT_LANE_MAX): above it, individual dots
  // stop being countable in a single 22px row, so a chronic/heavily-logged patient — the exact
  // target user — would see a blob. Degrade by OMITTING the dense lane (its geometry has no
  // per-episode times to jitter, and the face's three-band compare + the for-your-vet line
  // already carry the split + the clustering in legible form). This mirrors the shipped
  // timingReceiptDegrades cap; a taller jittered lane is a Patterns-surface treatment (PR 9).
  const mealModel = timingStoryMealLaneModel(finding);
  const clockModel = timingStoryClockLaneModel(finding);
  const showMeal = mealModel.dots.length <= DOT_LANE_MAX;
  const showClock = clockModel != null && clockModel.dots.length <= DOT_LANE_MAX;
  const control = timingStoryControlDisclosure(finding);
  const medLine = medContextLine(finding);
  const photoLines = photoCompositionLines(finding);
  return (
    <>
      {showMeal || showClock ? (
        <EvidenceBox title="When they happen">
          {showMeal ? (
            <>
              <ThemedText style={styles.laneCaption}>After eating</ThemedText>
              <DotLane model={mealModel} />
            </>
          ) : null}
          {showClock && clockModel ? (
            <>
              <ThemedText style={[styles.laneCaption, showMeal ? styles.laneCaptionSpaced : null]}>By clock</ThemedText>
              <DotLane model={clockModel} />
            </>
          ) : null}
        </EvidenceBox>
      ) : null}
      {/* The un-timeable remainder (S2). Titled for what it ACTUALLY holds — a coverage
          caveat — not "the other side of it", which would promise the base-rate counterbalance
          the mock drew ("mornings with a meal and no episode: N of M"). That richer two-sided
          control needs an engine payload field CUL-7 doesn't emit yet (backlog / pm-review),
          so the honest title here is the episodes we couldn't place. */}
      {control ? (
        <EvidenceBox title="What we couldn't time">
          <ThemedText style={styles.disclosure}>{control}</ThemedText>
        </EvidenceBox>
      ) : null}
      {/* §5.4 med-on-board context — a bare fact line, never a verdict; dropped fail-quiet
          when the composed line trips the guardrail screen (a "%" in the drug name — B-733). */}
      {medLine ? <ThemedText style={styles.medContext}>{medLine}</ThemedText> : null}
      {photoLines.length > 0 ? (
        <EvidenceBox title="What the photos showed">
          {photoLines.map((line, i) => (
            <ThemedText key={i} style={[styles.disclosure, i > 0 ? styles.disclosureSpaced : null]}>
              {line}
            </ThemedText>
          ))}
        </EvidenceBox>
      ) : null}
      <EvidenceBox title="For your vet">
        <ThemedText style={styles.disclosure}>{timingStoryVetLine(finding)}</ThemedText>
      </EvidenceBox>
    </>
  );
}

// The joint-candidate linked pair (B-351 D5, mock §3). Two proteins the engine cannot
// separate, shown as linked chips with a three-word note — NOT a wrapping text pill,
// which is what an earlier draft used and what the mock review rejected.
//
// Why a visual row and not just more sentence: the honesty here is a STANDING PROPERTY
// of the finding ("these two travel together"), and a property reads better as structure
// than as another clause the eye has to parse. The sentence keeps the action; this row
// keeps the caveat. It renders for every member, at any cluster size — a cluster of four
// shows four chips rather than silently truncating, because dropping a member from the
// display is the exact false exoneration the joint candidate exists to prevent.
function LinkedPair({ proteins }: { proteins: string[] }) {
  return (
    <View
      style={styles.pairRow}
      accessibilityLabel={`${proteins.map(displayProteinName).join(' and ')} — always fed together`}
    >
      {proteins.map((protein, i) => (
        <View key={protein} style={styles.pairItem}>
          {/* geist-ok: Icon glyph, not copy — stays a raw <Text>. These stand in for vector glyphs
              (the B-745 GlyphSvg migration owns them), so they keep the system face rather
              than taking the body family a sweep would give them. CUL-364 §7. */}
          {i > 0 && <Text style={styles.pairLink}>+</Text>}
          <View style={styles.pairChip}>
            <ThemedText style={styles.pairChipText}>{displayProteinName(protein)}</ThemedText>
          </View>
        </View>
      ))}
      <ThemedText style={styles.pairNote}>always fed together</ThemedText>
    </View>
  );
}

const INSIGHT_RENDERERS: Record<InsightType, (p: InsightBodyProps) => ReactElement | null> = {
  food_symptom_correlation: SentenceBody,
  intake_decline: SentenceBody,
  // Reflection (③, B-051) — a descriptive count, rendered as a calm sentence like
  // the other types; it rides the benign 'insight' rail, never the safety rail.
  reflection: SentenceBody,
  // Symptom-frequency worsening (④) — also a calm sentence, but a SAFETY finding, so
  // it rides the safety rail (via priorityClass) and leads the surface.
  symptom_worsening: SentenceBody,
  // Symptom chronicity / persistence (⑦, B-182) — a calm sentence on the SAFETY rail: the
  // "this has been going on for weeks and isn't resolving" statement. No confidence tag (a
  // deterministic count shows its sample size); leads the surface below intake-decline.
  symptom_chronicity: SentenceBody,
  // Per-incident visual red flag (B-340) — a calm sentence on the SAFETY rail: what a logged photo
  // showed (blood / foreign material), routed to the vet. Leads the whole surface (top of the
  // safety band). No confidence tag; the sentence itself carries the unconfirmed-AI-read framing.
  incident_red_flag: SentenceBody,
  // Postprandial timing (⑤, B-078) — a descriptive timing count, rendered as a calm
  // sentence on the benign 'insight' rail; no confidence tag (it shows its sample size).
  postprandial_timing: SentenceBody,
  // Time-of-day clustering (⑥, B-079) — a descriptive clock-band count, also a calm
  // sentence on the 'insight' rail; no confidence tag (it shows its sample size).
  timeofday_clustering: SentenceBody,
  // Signals v2 (B-755 / CUL-12) — the A2 combined timing card and its lone empty-stomach
  // sibling. Their own face (three-band compare) + expand. GA'd (CUL-548): rendered
  // whenever the payload carries the type; the server's B-777 gate governs whether an
  // account's payload carries one, until GA-3.
  empty_stomach_timing: TimingStoryBody,
  timing_story: TimingStoryBody,
  // Signals v2 (B-755 / CUL-13) — the event-driven trial card (L2, the wedge). Its own face
  // (server lead + two two-sided count rows + day badge) + expand. GA'd (CUL-548): rendered
  // whenever the payload carries a trial_response finding.
  trial_response: TrialResponseBody,
  // CUL-786 — the labeled stand-down is NOT a card: `LiveStack` renders it as one plain line
  // (`StoodDownLine`) before this component is ever reached. The entry exists so the map stays
  // exhaustive over InsightType; if a marker ever does arrive here, nothing renders rather than
  // a rail-bearing card dressing a sentence about absence as a finding.
  stood_down: () => null,
};

/** The safety/insight rail's width — exported so the stand-down line (which has NO rail) can
 *  sit in the same text column as the cards above and below it. */
export const RAIL_WIDTH = 3;

interface Props {
  cached: CachedFinding;
  petName: string;
  // True for the top-ranked row only — gates the display-face headline.
  isLead?: boolean;
  // B-721 SR-3 (§5.1) — the register compresses secondary (non-lead) findings into a
  // tighter vertical rhythm so the lead's canvas dominates. Set by SignalZone for the
  // register's secondary rows; default false, so a lead row (and any other caller) keeps
  // the full padding. minHeight 44 is untouched, so the tap target is preserved — only the
  // surrounding breathing room tightens.
  compact?: boolean;
  // B-721 SR-5 (§3.4) — whether a diet trial is running for this pet (`isTrialRunning`,
  // resolved once by SignalZone). Gates ONLY the falling reflection's mid-trial adjacency
  // line in the expanded state; default false, so every non-Home caller is unaffected.
  trialRunning?: boolean;
}

export function InsightCard({
  cached,
  petName,
  isLead = false,
  compact = false,
  trialRunning = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const Body = INSIGHT_RENDERERS[cached.finding.type];
  // Unknown future type with no registered renderer: skip the card rather than
  // crash the whole surface (G10 — forward-compatible with new detectors merged ahead of
  // their client renderer).
  if (!Body) return null;

  const isStory = isTimingStory(cached.finding);
  const isTrial = isTrialResponse(cached.finding);

  const rail = RAIL_COLOR[cached.finding.priorityClass];

  // The card is one accessible button (the whole row), so its label must carry the
  // card-face glance evidence too — a self-label on the receipt Views (or the med line)
  // would be swallowed by this container and never reach VoiceOver (code-review / MedStrip
  // idiom). A non-timing type → null → the label stays exactly `cached.text`. SR-5: the
  // med-on-board line folds in after the receipt when present, so VoiceOver hears the same
  // card-face context a sighted owner reads.
  //
  // The A2 story card folds its three-band compare into the label instead; its med line is
  // in the EXPAND, not the face, so it is not part of the collapsed label (unlike the ⑤/⑥
  // face med line below).
  // NB: use the type-guard functions inline here (not the `isStory` / `isTrial` booleans) so
  // TypeScript narrows `cached.finding` for the copy helpers below; the booleans drive the
  // expand fork, which passes `SignalFinding` straight through and needs no narrowing.
  let receiptA11y: string | null = null;
  let faceMedLine: string | null = null;
  if (isTimingStory(cached.finding)) {
    receiptA11y = stackedCompareA11yLabel(timingStoryBandRows(cached.finding));
  } else if (isTrialResponse(cached.finding)) {
    // The trial card folds its band count rows, the B-766 un-timeable reconciliation (when present),
    // and the day badge into the label; its med line is in the EXPAND, not the face (unlike the ⑤/⑥
    // face med line), so it's not part of the collapsed label. VoiceOver hears the face foot too.
    const recon = trialResponseTimedReconciliationLine(cached.finding);
    receiptA11y = `${stackedCompareA11yLabel(trialResponseCompareRows(cached.finding))}${recon ? ` ${recon}` : ''} ${trialResponseDayBadge(cached.finding)}.`;
  } else {
    receiptA11y = cardFaceReceiptA11y(cached.finding);
    faceMedLine = medContextLine(cached.finding);
  }
  let accessibilityLabel = receiptA11y ? `${cached.text}. ${receiptA11y}` : cached.text;
  if (faceMedLine) accessibilityLabel = `${accessibilityLabel}. ${faceMedLine}`;
  // B-727 (CUL-239 client half): the `New` chip is visual-only, and this card is ONE
  // accessible button — children never reach VoiceOver — so the chip's fact must ride the
  // label. Load-bearing for GA-3: when the server sentence retires its "after none the week
  // before" clause, this clause is what keeps the novelty audible.
  if (isNewWorsening(cached.finding)) {
    accessibilityLabel = `${accessibilityLabel}. New this week.`;
  }

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.create(theme.durationMedium, 'easeInEaseOut', 'opacity'));
    setExpanded((e) => !e);
  }

  return (
    // Whole row is the tap target (≥44pt with hitSlop) — the 3am-stumbling rule.
    <Pressable
      onPress={toggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Shows the evidence behind this insight"
      // Single style reference when not compact (an inline [style, false] array would
      // drift the card's structure for a lead row unnecessarily).
      style={compact ? [styles.row, styles.rowCompact] : styles.row}
    >
      <View style={[styles.rail, { backgroundColor: rail }]} />
      <View style={styles.content}>
        <Body cached={cached} isLead={isLead} />
        {expanded && (
          <>
            <ThemedText style={styles.evidence}>{evidenceText(cached.finding, petName)}</ThemedText>
            {/* Each shape's own expanded receipts: the A2 story card's lanes/control/L3, the trial
                card's RTM-confound + density + diet-structure, else the SR-1 receipts (timing control
                side / safety phone script / reflection density). A finding is only ever one shape, so
                this is an either/or chain, never two at once. */}
            {isStory ? (
              <TimingStoryExpanded finding={cached.finding} />
            ) : isTrial ? (
              <TrialResponseExpanded finding={cached.finding} />
            ) : (
              <ExpandedReceipts finding={cached.finding} petName={petName} trialRunning={trialRunning} />
            )}
          </>
        )}
        <ThemedText style={styles.expandHint}>{expanded ? 'Hide details' : "Why we're showing this"}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.space2,
    minHeight: 44,
    paddingVertical: theme.space2,
  },
  // The register's tighter rhythm for secondary rows (§5.1). Overrides paddingVertical
  // only; minHeight 44 and the gap are untouched, so the tap target holds.
  rowCompact: {
    paddingVertical: theme.space1,
  },
  rail: {
    width: RAIL_WIDTH,
    borderRadius: 2,
    opacity: 0.85,
  },
  content: {
    flex: 1,
  },
  body: {
    gap: theme.space1,
  },
  sentence: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  // AI Signal headline — Newsreader display at 26 / 1.3, tracking −0.3, weight
  // 400 (the only Newsreader face loaded; never set fontWeight here or RN will
  // request an unloaded bold and fall back). Mirrors type-signal preview.
  sentenceLead: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textSignal,
    lineHeight: theme.lineHeightSignal,
    letterSpacing: theme.trackingTight,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space1,
  },
  // Linked pair (B-351 D5). Wraps rather than scrolls — a cluster member must never be
  // hidden off-screen (the B-146 rule, and here it would also be a false exoneration).
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space1,
    marginTop: theme.spaceMicro,
  },
  pairItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  pairLink: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  pairChip: {
    paddingHorizontal: theme.space1,
    paddingVertical: theme.spaceMicro,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurfaceSubtle,
  },
  pairChipText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  pairNote: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  sample: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  // The `New`-for-worsening chip (§3.2). A pill (radiusFull, per the mock) sized like the
  // confidence Badge but accent-tinted: accent-ink text on the accent wash.
  newChip: {
    paddingHorizontal: theme.space1,
    paddingVertical: theme.spaceMicro,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
    alignSelf: 'flex-start',
  },
  newChipText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
  },
  evidence: {
    marginTop: theme.space1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  // The honest un-timeable remainder inside the expanded control-side box (§4), and the
  // reflection density disclosure/withheld line inside its "Counted honestly" box (§3.3).
  disclosure: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  // The A2 expand's per-lane caption ("After eating" / "By clock") above each dot lane
  // (CUL-12). A micro-label in the tertiary tier, so the lanes read as two views of the
  // same evidence box rather than two separate widgets.
  laneCaption: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginBottom: theme.spaceMicro,
  },
  laneCaptionSpaced: {
    marginTop: theme.space1,
  },
  disclosureSpaced: {
    marginTop: theme.space0_5,
  },
  // The mid-trial adjacency line (§3.4) — italic, marking it as an interpretive aside
  // (the mock's `.adj`), set below the density line when both render.
  trialAdjacency: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    fontStyle: 'italic',
  },
  // The med-on-board context line (§5.4) — a quiet, slate-toned line under the sentence/
  // receipt. colorEventMedicationInk is the readable slate TEXT ink (colorEventMedication
  // is a ~3:1 glyph tint that fails AA as body text); textSM keeps it subordinate to the
  // sentence. Spaced from its neighbours by the body's own `gap`, like the receipt.
  medContext: {
    fontSize: theme.textSM,
    color: theme.colorEventMedicationInk,
    lineHeight: theme.lineHeightSM,
  },
  expandHint: {
    marginTop: theme.space1,
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
