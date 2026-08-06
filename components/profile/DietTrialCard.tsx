// The diet-trial card v2 (B-417 PR 4, §4.2). Presentation only.
//
// Every string on this card comes from `resolveTrialCard` (lib/dietTrialCard.ts),
// which is where the eleven states and the two rules live. This file lays the
// model out and owns exactly one judgement of its own: which action buttons it is
// allowed to draw.
//
// ── THE BAR ──────────────────────────────────────────────────────────────────
// `progressFraction` is `getDietTrialProgress().fraction` — DAY progress. It is
// the only number this component turns into a width, and the acceptance criterion
// is asserted on that computed width prop rather than on the absence of a word,
// because the card this replaces bound the same bar to a "% compliance" that
// measured logging: the deleted bar and the kept bar are visually identical on a
// good week, which is exactly why a string-only criterion would have passed the
// bug (§1.3).
//
// ── NO SECOND DOOR ───────────────────────────────────────────────────────────
// §4.2: "The card carries no 'Log a meal' action. Logging is the FAB. A second
// door to the same room is not a feature."
import { Pressable, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { PrimaryButton } from '../ui/PrimaryButton';
import { TrialContaminantNote } from '../food/TrialContaminantNote';
import { trialManageLabel } from '../../lib/dietTrialCard';
import type {
  TrialCardActionId,
  TrialCardLine,
  TrialCardLineRole,
  TrialCardModel,
} from '../../lib/dietTrialCard';

interface Props {
  model: TrialCardModel;
  /** A handler per action id. The model DECLARES an action; this component draws
   *  it only when the surface can actually service it. PR 4 lands before PR 3's
   *  start modal and PR 6's completion sheet exist, and a button that goes
   *  nowhere is worse than no button — so the omission is structural rather than
   *  a comment someone has to remember to act on. */
  actions?: Partial<Record<TrialCardActionId, () => void>>;
  /** Opens the start/change sheet from the card's header. Separate from
   *  `actions` on purpose: it is not a state-driven affordance the resolver
   *  declares, it is the always-available way back into `StartTrialModal` that
   *  B-417 PR 3 shipped. One active trial per pet is a DATABASE constraint
   *  (migration 040's UNIQUE partial index), so on a running trial this opens the
   *  ordered "end the running one first" sheet, never a second concurrent trial. */
  onManage?: () => void;
  /** The action currently mid-write, drawn in `PrimaryButton`'s loading state and
   *  press-blocked. `Keep going` is a one-tap write with no confirm (deliberately
   *  — the named default is the whole affordance), so the pending state is what
   *  stops a slow write earning a second tap and a double extension. */
  busyAction?: TrialCardActionId | null;
  style?: ViewStyle;
}

export function DietTrialCard({ model, actions, onManage, busyAction, style }: Props) {
  // The header affordance's label, or null to hide it. The resolver owns the
  // per-state judgement (`trialManageLabel`: running → "Replace", empty/abandoned
  // → suppressed since the body already carries a Start CTA, completed → "+ Start"),
  // replacing the old '+ Start'/'Change' split that labelled a destructive
  // end-and-replace as a benign "Change".
  const manageLabel = trialManageLabel(model);
  // NORMALISED, because the prop is optional and `undefined !== null`. The first
  // cut compared `busyAction !== null` directly, so on every surface that does not
  // pass the prop at all — which is every state but the milestone — the guard read
  // true and DISABLED every button on the card, including "Start a diet trial" on
  // the empty state. Caught by the existing entry-point test.
  const busyId = busyAction ?? null;

  return (
    <Card style={style}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>{model.kicker}</Text>
        {onManage && manageLabel !== null && (
          <TouchableOpacity
            onPress={onManage}
            hitSlop={8}
            style={styles.manageTouch}
            accessibilityRole="button"
            accessibilityLabel={
              manageLabel === 'Replace' ? 'Replace this diet trial' : 'Start a diet trial'
            }
          >
            <Text style={styles.manageText}>{manageLabel}</Text>
          </TouchableOpacity>
        )}
      </View>

      {model.foodLabel !== null && (
        <Text style={styles.food}>{model.foodLabel}</Text>
      )}

      {/* The day line is caption-scale metadata on every ordinary day and a
          HEADLINE at the milestone — the role comes off the model, not from
          `state`, so §4.3's "never reads as permission to stop" doesn't depend on
          a view remembering which day is the important one. */}
      {model.dayLine !== null && (
        <Text
          testID="trial-day-line"
          style={model.dayLineRole === 'headline' ? styles.dayHeadline : styles.dayLine}
        >
          {model.dayLine}
        </Text>
      )}
      {model.windowLine !== null && (
        <Text style={styles.windowLine}>{model.windowLine}</Text>
      )}

      {model.progressFraction !== null && (
        <View
          style={styles.progressTrack}
          testID="trial-progress-track"
          accessibilityRole="progressbar"
          // Named in words as well as drawn, so the bar is never the only place
          // the day count lives — and so a screen reader gets DAY progress
          // rather than an unlabelled percentage.
          accessibilityLabel={model.dayLine ?? undefined}
        >
          <View
            testID="trial-progress-fill"
            style={[
              styles.progressFill,
              { width: `${model.progressFraction * 100}%` },
            ]}
          />
        </View>
      )}

      {groupLines(model.lines).map((group, gi) => {
        // ── The two BLOCK roles ────────────────────────────────────────────
        // Everything else is body text in reading order. These two are drawn as
        // containers because they are not commentary on the lines around them —
        // they are what the card is saying instead of them.
        if (group.role === 'flag') {
          return (
            <View key={`flag-${gi}`} testID="trial-flag" style={styles.flagBlock}>
              {group.lines.map((line, i) => (
                <Text
                  key={i}
                  testID="trial-line-flag"
                  // The first flag line is the headline and the rest is its body,
                  // which is how both safety registers are drawn in the design
                  // lock. Emphasis by POSITION inside the block rather than by a
                  // second role: the resolver already guarantees the order (fact
                  // first, then what to do about it) and a second role would be
                  // one more thing a future state could set wrong.
                  style={[styles.line, i === 0 ? styles.flagHeadline : styles.flagBody]}
                >
                  {line.text}
                </Text>
              ))}
            </View>
          );
        }
        if (group.role === 'teach') {
          return (
            <View key={`teach-${gi}`} testID="trial-teach" style={styles.teachBlock}>
              {group.lines.map((line, i) => (
                <Text key={i} testID="trial-line-teach" style={styles.teachText}>
                  {line.text}
                </Text>
              ))}
            </View>
          );
        }
        return group.lines.map((line, i) => (
          <Text
            key={`${line.role}-${gi}-${i}`}
            testID={`trial-line-${line.role}`}
            style={[
              styles.line,
              line.role === 'lead' && styles.lead,
              line.role === 'forward' && styles.forward,
              (line.role === 'qualifier' || line.role === 'caveat') && styles.qualifier,
            ]}
          >
            {line.text}
          </Text>
        ));
      })}

      {/* B-351's target-protein disclosure — the assumption the contaminant check
          rests on, rendered where the owner can see it is wrong. Quiet metadata,
          deliberately not a safety card. */}
      {model.standingMeta !== null && (
        <Text testID="trial-standing-meta" style={styles.meta}>{model.standingMeta}</Text>
      )}

      {/* C2's standing fact, re-sited from slice 4 rather than dropped on the
          floor (§0.2's anticipated collision, landing in the opposite direction
          from the ruling). It sits last because it is a property of the FOOD,
          not a report of the trial's progress. */}
      {model.standingNote && (
        <View style={styles.noteWrap}>
          <TrialContaminantNote
            title={model.standingNote.title}
            body={model.standingNote.body}
          />
        </View>
      )}

      {/* The action ROW. Emphasis comes off the model rather than being inferred
          here, because §4.3 makes relative weight an acceptance criterion on the
          milestone: `Keep going` is never weaker than `This trial is done`. A view
          that decided weight from `state` or from array position would put that
          criterion somewhere no test can reach it. */}
      {model.actions.map((action) => {
        const onPress = actions?.[action.id];
        if (!onPress) return null;
        if (action.emphasis === 'link') {
          return (
            <Pressable
              key={action.id}
              onPress={onPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={`trial-action-${action.id}`}
              style={styles.secondaryAction}
            >
              <Text style={styles.secondaryActionText}>{action.label} ›</Text>
            </Pressable>
          );
        }
        const busy = busyId === action.id;
        return (
          <PrimaryButton
            key={action.id}
            testID={`trial-action-${action.id}`}
            label={action.label}
            variant={action.emphasis === 'primary' ? 'primary' : 'secondary'}
            onPress={onPress}
            loading={busy}
            disabled={busyId !== null && !busy}
            style={styles.primaryAction}
          />
        );
      })}
    </Card>
  );
}

/** Consecutive lines sharing a role, in reading order.
 *
 *  Grouping rather than per-line rendering exists for one reason: the `flag`
 *  register is a BLOCK — a headline and its body inside one tinted container —
 *  and drawing each line in its own container would make one safety statement
 *  look like two. Runs are contiguous by construction (the resolver pushes a
 *  register's lines together), and the grouping preserves order regardless, so a
 *  future state that interleaves them degrades to two blocks rather than to a
 *  wrong order. */
function groupLines(
  lines: readonly TrialCardLine[],
): { role: TrialCardLineRole; lines: TrialCardLine[] }[] {
  const out: { role: TrialCardLineRole; lines: TrialCardLine[] }[] = [];
  for (const line of lines) {
    const tail = out[out.length - 1];
    if (tail && tail.role === line.role) tail.lines.push(line);
    else out.push({ role: line.role, lines: [line] });
  }
  return out;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageTouch: {
    // Padding plus hitSlop={8} clears the 44pt tap-target floor.
    paddingVertical: theme.space1,
    paddingLeft: theme.space2,
  },
  manageText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  kicker: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  food: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    marginTop: 2,
  },
  dayLine: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  // The milestone's day line, drawn as the design lock draws it (`.milestone-h` —
  // serif, 21px, tight leading). `fontDisplay` is the same Newsreader the AI
  // Signal headline uses; this is the second sentence in the app that earns it,
  // and it earns it for the same reason: it is the one line on the screen that
  // has to be read rather than scanned.
  dayHeadline: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    lineHeight: theme.textXL * 1.3,
    letterSpacing: -0.2,
    color: theme.colorNeutralDark,
    marginTop: theme.space1,
  },
  windowLine: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginBottom: theme.space2,
  },
  progressFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colorAccent,
  },
  line: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  // The sentence that owns the card in a replacement state (§5.2, §5.6) — it
  // reads first because on those two states the trial is not the headline.
  lead: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
  },
  // The card's actual job is keeping the owner IN the trial (§4.2), so the
  // forward line gets the warm accent rather than the quiet secondary grey.
  forward: {
    color: theme.colorTextPrimary,
  },
  // The blind-spot qualifier and the multi-pet caveat are subordinate to the
  // claim they qualify, but never hidden — §5.2 forbids demoting either to a
  // page-level legend.
  qualifier: {
    fontSize: theme.textXS,
    lineHeight: theme.textXS * 1.5,
  },
  // ── The safety register (intake decline, trial-diet refusal) ───────────────
  // The app's existing firm-but-calm tinted safety container — the same tokens
  // `CrossPetSafetyBanner` and the AI "worth a call" reads use. Culprit has no
  // danger/klaxon state and this is deliberately not where one gets invented (the
  // call the PM made on B-340).
  //
  // NO ICON AND NO COLOUR-ONLY MEANING: the headline carries the fact in words,
  // so the block survives greyscale and a screen reader reaches the same content
  // in the same order. What the tint adds is that the REPLACEMENT reads as a
  // replacement — §5.2 makes the composition structural, and a structural
  // replacement rendered in body weight is invisible as one.
  flagBlock: {
    backgroundColor: theme.colorEventSymptomLight,
    borderWidth: 1,
    borderColor: theme.colorEventSymptomBorder,
    borderRadius: theme.radiusMedium,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    marginTop: theme.space2,
  },
  flagHeadline: {
    fontSize: theme.textMD,
    lineHeight: theme.textMD * 1.4,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginTop: 0,
  },
  flagBody: {
    color: theme.colorTextPrimary,
  },
  // ── The teach register (R1b) ──────────────────────────────────────────────
  // Quiet on purpose, and the distinction from `flagBlock` is the whole design:
  // this line fires when NOTHING is wrong, so it may not borrow the safety
  // colour. It gets a neutral surface and a hairline — visible enough to read as
  // a distinct suggestion, quiet enough that eight weeks of it is not a scolding.
  teachBlock: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusMedium,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    marginTop: theme.space2,
  },
  teachText: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
  },
  meta: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    marginTop: theme.space2,
  },
  noteWrap: {
    marginTop: theme.space2,
  },
  primaryAction: {
    marginTop: theme.space2,
  },
  secondaryAction: {
    marginTop: theme.space2,
    // Padding plus hitSlop={8} clears the 44pt tap-target floor.
    paddingVertical: theme.space1,
  },
  secondaryActionText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
});
