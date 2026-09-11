import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { RundownTileRow } from './RundownTileRow';
import { rundownDateLine, pastMedsSectionLabel, type Rundown, type RundownTap } from '../../lib/rundown';

// The rundown's BODY, extracted verbatim from `app/rundown.tsx` (CUL-903 VV-5).
//
// It moved for one reason and it is an acceptance criterion, not tidiness: Get ready
// (§4.1 B1) is the same route with an `appointmentId`, and AC 4 requires the rundown
// it renders to be BYTE-IDENTICAL to the one `/rundown` renders — asserted as a
// `toJSON()` deep-equal over one fixture DB. Two copies of this JSX would satisfy
// that on the day they were written and drift the first time either was touched;
// one component makes the equality structural.
//
// It carries its own `testID` so the assertion has a handle without a convention
// anybody has to remember (the flag-off guard's header makes the same argument
// against testID conventions — this one belongs to the component, not to its
// callers).
//
// DELIBERATELY NOT IN `components/vetvisits/`. That namespace is what
// `guards/vetVisitsFlagOff.test.tsx` stubs to prove "the companion does not exist",
// and this block renders with the flag OFF — on the shipped rundown, which is one of
// the four surfaces AC 0 names. Putting it there would stub away half of `/rundown`
// on one side of the comparison.

interface Props {
  rundown: Rundown;
  petName: string;
  onTap: (tap: RundownTap) => void;
}

export function RundownBlock({ rundown, petName, onTap }: Props) {
  return (
    <View testID="rundown-block" style={styles.block}>
      <Text style={styles.intro}>
        The clinician’s opening questions, straight from {petName}’s record. Tap any line to
        open its source in the app.
      </Text>
      <Text style={styles.dateLine}>{rundownDateLine(rundown.generatedAtMs)}</Text>
      <Card noPadding style={styles.tileCard}>
        {rundown.tiles.map((tile, i) => (
          <RundownTileRow
            // key: index-scoped by section — a pet can have multiple symptom
            // and med rows sharing a `key`, so the position disambiguates.
            key={`${tile.key}-${i}`}
            tile={tile}
            isLast={i === rundown.tiles.length - 1}
            onPress={tile.tap ? () => onTap(tile.tap as RundownTap) : undefined}
          />
        ))}
      </Card>

      {/* Past medications — its own labelled card (B-140 PR 4). A course a vet
          asks about ("has she been on steroids?") that ended is invisible in the
          Current-meds block above; this is where the past lives, in read-aloud rows.
          Rendered only when there is past history — an absent history is silence,
          not a finding, so there is no empty state here. */}
      {rundown.pastMedications.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{pastMedsSectionLabel()}</Text>
          <Card noPadding style={styles.tileCard}>
            {rundown.pastMedications.map((tile, i) => (
              <RundownTileRow
                key={`${tile.key}-${i}`}
                tile={tile}
                isLast={i === rundown.pastMedications.length - 1}
                onPress={tile.tap ? () => onTap(tile.tap as RundownTap) : undefined}
              />
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

// Moved with the JSX, values unchanged — the block has to render identically to the
// screen it came out of, and a restyled token here would be the one thing AC 4's
// deep-equal cannot tell from a deliberate change.
//
// geist-ok: these three are the screen's own raw <Text> nodes, moved verbatim; each
// names an explicit `fontFamily` below, which is what resolves the family (CUL-364 §7).
const styles = StyleSheet.create({
  // The gap the ScrollView used to supply between these children directly. Before the
  // extraction they were siblings of the scroll container (`gap: theme.space2`); one
  // wrapper View would have collapsed all four spacings to zero, which no guard here
  // would have caught — the flag-off differential compares two renders of the same
  // tree, so it moves with the regression.
  block: { gap: theme.space2 },
  intro: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space1,
  },
  dateLine: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    paddingHorizontal: theme.space1,
    marginTop: -theme.space1,
  },
  sectionLabel: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextSecondary,
    paddingHorizontal: theme.space1,
    marginTop: theme.space1,
  },
  tileCard: {
    overflow: 'hidden',
  },
});
