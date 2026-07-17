import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { FORMAT_LABEL } from '../log/FoodTile';

interface Props {
  brand: string;
  productName: string;
  format: string;
  onRestore: () => void;
  // While this row's restore is in flight, swap the Restore label for a quiet
  // spinner and disable the tap — so a double-press can't fire two reverts.
  restoring?: boolean;
}

// A removed-from-library food, shown in the Foods-tab Archived section (B-005
// PR 3). Deliberately lighter than the library's FoodRow: no thumbnail, no
// per-pet intake note, no chevron-into-detail — an archived food isn't being
// browsed to feed, it's parked, and the one thing to do with it is put it back.
// So the row's action IS Restore, sitting where FoodRow's navigation chevron
// would be. The meta line still reads BRAND · FORMAT (from the shared
// FORMAT_LABEL) so a food removed in one format stays distinguishable from an
// active capture of the same name in another.
export function ArchivedFoodRow({ brand, productName, format, onRestore, restoring = false }: Props) {
  const typeLabel = FORMAT_LABEL[format] ?? '';
  const metaLine = typeLabel ? `${brand.toUpperCase()} · ${typeLabel.toUpperCase()}` : brand.toUpperCase();

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        {metaLine ? (
          <Text style={styles.meta} numberOfLines={1}>{metaLine}</Text>
        ) : null}
        <Text style={styles.product} numberOfLines={2}>{productName}</Text>
      </View>
      <TouchableOpacity
        onPress={onRestore}
        disabled={restoring}
        hitSlop={12}
        style={styles.restoreBtn}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Restore ${brand} ${productName} to your library`}
      >
        {restoring
          ? <WhorlSpinner size="sm" ground="day" />
          : <Text style={styles.restoreText}>Restore</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
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
    // A shade quieter than an active row's near-black product name — archived
    // foods are parked, not the surface's main content.
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },
  // The row's action, where FoodRow's chevron sits. Accent text (the one
  // interactive colour), ≥44pt via minWidth/minHeight + hitSlop.
  restoreBtn: {
    minWidth: 60,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
});
