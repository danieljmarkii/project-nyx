import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Card } from '../ui/Card';
import { PrimaryButton } from '../ui/PrimaryButton';
import { VetDocumentThumb } from './VetDocumentThumb';
import { theme } from '../../constants/theme';
import type { VetFilesCardModel } from '../../lib/vetDocumentLibrary';

interface Props {
  model: VetFilesCardModel;
  /** storagePath → resolved signed-URL thumbnail, for the preview. */
  thumbUris?: Map<string, string>;
  thumbsLoading?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

// The pet-profile entry point (G3/D6). Sits directly beneath the Vet report card as
// a sibling — same anatomy (title, blurb, one action), because the shipped profile
// is a stack of full cards and a compact row here would read as a lesser thing than
// the report it sits under.
//
// The populated card previews the LATEST document — thumb, name, type, date — in
// place of the old cover-thumbnail strip (B-712). The strip was tuned for three
// tiles and a "+3", so at one document it stranded a lone glyph in a wide gutter and
// read as a failed load; the preview carries the real filing at n=1 and scales with
// a "+N more". Hierarchy is unchanged: same secondary button, same calm type — the
// substrate is never louder than the artifact it sits under.
//
// Nothing about this card lives on Home (Principle 3: no shelf, no feature menu).
//
// The blurb still carries the D14 honesty line in the populated state, doing real
// work rather than being a disclaimer: two cards about vet-facing paperwork stacked
// together read as one system, and until B-480 ships a saved document does NOT ride
// along with the report. Both persona reviews assumed it did.
export function VetFilesCard({ model, thumbUris, thumbsLoading, onPress, style }: Props) {
  const { preview } = model;
  // An untitled document's title already carries its date ("Document — Jul 30"), so
  // the secondary line shows the page count instead; a named document shows its
  // date. Either may be absent, and then that half of the meta row just doesn't
  // render.
  const subLabel = preview ? (preview.untitled ? preview.pageLabel : preview.dateLabel) : null;

  return (
    <Card style={style}>
      <View style={styles.head}>
        <Text style={styles.title}>Vet Files</Text>
        {model.countLabel ? <Text style={styles.count}>{model.countLabel}</Text> : null}
      </View>
      <Text style={styles.blurb}>{model.blurb}</Text>

      {preview && (
        // Decorative relative to the button below — which carries the action, and
        // whose count is already spoken — so the whole preview is hidden from the
        // a11y tree rather than announcing an unlabelled thumbnail and a title the
        // owner reaches by opening the library anyway.
        <View style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <VetDocumentThumb
            uri={preview.localUri ? preview.localUri : thumbUris?.get(preview.storagePath) ?? null}
            isPdf={preview.isPdf}
            loading={thumbsLoading}
            style={styles.previewThumb}
          />
          <View style={styles.previewMain}>
            <Text
              style={[styles.previewTitle, preview.untitled && styles.previewTitleMuted]}
              numberOfLines={1}
            >
              {preview.title}
            </Text>
            {(preview.kindLabel || subLabel) ? (
              <View style={styles.previewMeta}>
                {preview.kindLabel ? (
                  <View style={styles.kindChip}>
                    <Text style={styles.kindText}>{preview.kindLabel}</Text>
                  </View>
                ) : null}
                {subLabel ? <Text style={styles.previewSub}>{subLabel}</Text> : null}
              </View>
            ) : null}
          </View>
          {model.moreLabel ? <Text style={styles.moreLabel}>{model.moreLabel}</Text> : null}
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
  // The latest-document preview: a legible mini-row on an inset surface, so it reads
  // as a peek into the library rather than as another card action.
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 11,
    padding: 9,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  previewThumb: {
    width: 40,
    height: 50,
  },
  previewMain: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  // Quieter, not disabled: the document is real, it just hasn't been named (D11).
  previewTitleMuted: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  // White chip on the inset surface, so the type still reads as a chip.
  kindChip: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusXS,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  kindText: {
    fontSize: theme.textMicro,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextSecondary,
  },
  previewSub: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  moreLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextTertiary,
  },
  button: {
    marginTop: 11,
  },
});
