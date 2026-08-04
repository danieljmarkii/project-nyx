import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Card } from '../ui/Card';
import { PrimaryButton } from '../ui/PrimaryButton';
import { VetDocumentThumb } from './VetDocumentThumb';
import { theme } from '../../constants/theme';
import type { VetFilesCardModel } from '../../lib/vetDocumentLibrary';

interface Props {
  model: VetFilesCardModel;
  /** storagePath → resolved thumbnail uri, for the strip. */
  thumbUris?: Map<string, string>;
  thumbsLoading?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

// The pet-profile entry point (G3/D6, mock A1-r2 + A1z). Sits directly beneath the
// Vet report card as a sibling — same anatomy (title, blurb, one action), because
// the shipped profile is a stack of full cards and a compact row here would read as
// a lesser thing than the report it sits under.
//
// Nothing about this card lives on Home (Principle 3: no shelf, no feature menu).
//
// Both blurbs come from lib/vetDocumentLibrary — including the D14 honesty line in
// the populated state, which is doing real work rather than being a disclaimer:
// two cards about vet-facing paperwork stacked together will be read as one
// system, and until B-480 ships, a saved document does NOT ride along with the
// report. Both persona reviews assumed it did.
export function VetFilesCard({ model, thumbUris, thumbsLoading, onPress, style }: Props) {
  const empty = model.documentCount === 0;

  return (
    <Card style={style}>
      <View style={styles.head}>
        <Text style={styles.title}>Vet Files</Text>
        {model.countLabel ? <Text style={styles.count}>{model.countLabel}</Text> : null}
      </View>
      <Text style={styles.blurb}>{model.blurb}</Text>

      {!empty && (
        // Decorative — the button below carries the action and the count is
        // already spoken — so the strip is hidden from the a11y tree rather than
        // announcing three unlabelled tiles.
        <View style={styles.strip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {model.stripPaths.map((path) => (
            <VetDocumentThumb
              key={path}
              uri={thumbUris?.get(path) ?? null}
              loading={thumbsLoading}
              style={styles.stripTile}
            />
          ))}
          {model.overflowLabel ? (
            <View style={[styles.stripTile, styles.overflow]}>
              <Text style={styles.overflowText}>{model.overflowLabel}</Text>
            </View>
          ) : null}
        </View>
      )}

      <PrimaryButton
        label={model.actionLabel}
        onPress={onPress}
        variant="secondary"
        style={styles.button}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space1,
  },
  // Token parity with the sibling profile cards (B-553): the Vet report card
  // directly above uses textMD/weightMedium/colorNeutralDark, and the substrate
  // must not shout louder than the artifact it sits under.
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  count: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  blurb: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: 4,
  },
  strip: {
    flexDirection: 'row',
    gap: theme.space1,
    marginTop: 11,
  },
  // Smaller than the list tile: this is a pulse showing the library isn't empty,
  // not a browse surface.
  stripTile: {
    width: 34,
    height: 44,
  },
  overflow: {
    borderStyle: 'dashed',
    borderColor: theme.colorBorderStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: theme.radiusSmall,
  },
  overflowText: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  button: {
    marginTop: 11,
  },
});
