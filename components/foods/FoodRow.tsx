import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { FORMAT_LABEL } from '../log/FoodTile';

interface Props {
  brand: string;
  productName: string;
  format: string;
  onPress: () => void;
  // When the row sits under a brand header (Foods-tab brand grouping, B-004
  // PR 3), the brand is already shown once above the group — so drop it from the
  // meta line and let the format stand alone ("WET"), or show nothing when the
  // format is unspecified. The brand stays in the accessibilityLabel either way,
  // so a screen reader still announces the full "<brand> <product>". Defaults to
  // showing the brand, keeping the row's standalone contract (and tests) intact.
  hideBrand?: boolean;
  // Per-active-pet intake annotation (B-004 PR 4) — a factual recency + count
  // line ("Last logged 3 days ago · 12 times") built by lib/food.foodIntakeNote.
  // null/undefined when this pet has no logged meals of the food, leaving the row
  // clean (the catalog is pet-independent; only this note keys off the active
  // pet). Appended to the accessibilityLabel so a screen reader hears it too.
  intakeNote?: string | null;
  // Reliable-favorites shelf line (B-004 PR 5) — the denominator-bearing finished
  // rate ("Finished 9 of 11 meals") built by lib/food.foodFavoriteNote. Only the
  // shelf passes it; the type-grouped list below passes intakeNote instead, so the
  // two don't co-occur in practice. Rendered with a touch more weight than the
  // muted last-logged line (it's the shelf row's point) but kept calm and factual —
  // the visible denominator, not a loud "loved!" badge (intake-is-not-preference).
  favoriteNote?: string | null;
}

// Full-width library row for the standalone Foods tab (B-004). Distinct from the
// 2-up FoodTile of the quick-log picker: the Foods tab is a browse/manage
// destination, so each food gets its own full-width row with room for the brand
// + format meta line and the product name, and a chevron signalling that a tap
// opens the food's detail screen (where you edit/classify it). There is no
// one-tap-log here — logging stays on the FAB picker path. The metadata line
// (BRAND · FORMAT) mirrors FoodTile's, sourced from the shared FORMAT_LABEL.
export function FoodRow({ brand, productName, format, onPress, hideBrand = false, intakeNote, favoriteNote }: Props) {
  const typeLabel = FORMAT_LABEL[format] ?? '';
  const formatMeta = typeLabel.toUpperCase();
  const metaLine = hideBrand
    ? formatMeta
    : typeLabel
      ? `${brand.toUpperCase()} · ${formatMeta}`
      : brand.toUpperCase();
  // Append whichever annotation lines are present to the spoken label, so a screen
  // reader hears the favorite rate / last-logged note, not just the name.
  const spokenNotes = [favoriteNote, intakeNote].filter(Boolean).join(', ');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={spokenNotes ? `${brand} ${productName}, ${spokenNotes}` : `${brand} ${productName}`}
    >
      <View style={styles.text}>
        {metaLine ? (
          <Text style={styles.meta} numberOfLines={1}>
            {metaLine}
          </Text>
        ) : null}
        <Text style={styles.product} numberOfLines={2}>
          {productName}
        </Text>
        {favoriteNote ? (
          <Text style={styles.favorite} numberOfLines={1}>
            {favoriteNote}
          </Text>
        ) : null}
        {intakeNote ? (
          <Text style={styles.intake} numberOfLines={1}>
            {intakeNote}
          </Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    // ≥44pt tap target; the whole row navigates (the chevron is decorative).
    minHeight: 64,
    backgroundColor: theme.colorSurface,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  meta: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWidest,
  },
  product: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    lineHeight: 20,
  },
  // Per-pet intake annotation, below the product name. Sentence-case secondary
  // text — distinct from the all-caps tracked tertiary format eyebrow above the
  // name, so the two meta lines don't read as the same thing.
  intake: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  // Reliable-favorite line (the shelf row's salient point). A touch more weight
  // than the last-logged intake line, but the same calm secondary color — the
  // visible denominator carries the meaning, not a loud accent (intake ≠ preference).
  favorite: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextTertiary,
  },
});
