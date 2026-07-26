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
import type { TrialCardActionId, TrialCardModel } from '../../lib/dietTrialCard';

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
  style?: ViewStyle;
}

export function DietTrialCard({ model, actions, onManage, style }: Props) {
  const manageLabel = model.state === 'no_trial' ? '+ Start' : 'Change';

  return (
    <Card style={style}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>{model.kicker}</Text>
        {onManage && (
          <TouchableOpacity
            onPress={onManage}
            hitSlop={8}
            style={styles.manageTouch}
            accessibilityRole="button"
            accessibilityLabel={
              model.state === 'no_trial' ? 'Start a diet trial' : 'Change this diet trial'
            }
          >
            <Text style={styles.manageText}>{manageLabel}</Text>
          </TouchableOpacity>
        )}
      </View>

      {model.foodLabel !== null && (
        <Text style={styles.food}>{model.foodLabel}</Text>
      )}

      {model.dayLine !== null && <Text style={styles.dayLine}>{model.dayLine}</Text>}
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

      {model.lines.map((line, i) => (
        <Text
          key={`${line.role}-${i}`}
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
      ))}

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
        return (
          <PrimaryButton
            key={action.id}
            testID={`trial-action-${action.id}`}
            label={action.label}
            variant={action.emphasis === 'primary' ? 'primary' : 'secondary'}
            onPress={onPress}
            style={styles.primaryAction}
          />
        );
      })}
    </Card>
  );
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
