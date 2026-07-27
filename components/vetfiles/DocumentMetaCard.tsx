import { Fragment } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';

export interface MetaRow {
  key: string;
  /** The left-hand label: "Type", "Doc date", "Vet visit", "Notes". */
  label: string;
  /** The current value, or null when nothing is set yet. */
  value: string | null;
  /** Shown greyed when `value` is null — an invitation, not an error. */
  placeholder: string;
  /** Renders the value in accent ink (the mock's `.det-v.link`, used by the visit row). */
  link?: boolean;
  /** Renders the value as a kind chip rather than plain text (the Type row). */
  chip?: boolean;
  onPress: () => void;
}

// The editable metadata card (mock E-img-r2 / E-pdf-r2 `.det-card`).
//
// Rows are DATA, not markup, for one reason that matters: the visit-link row is
// conditional (it renders only when the pet has at least one logged visit), and a
// caller that assembles an array can simply not include it. The alternative —
// four hard-coded rows with a `{visits.length > 0 && …}` in the middle — makes the
// hairline separators land wrong the moment the row is absent, which is the sort of
// thing that ships.
//
// Every row is tappable and every row opens a sheet; none of them edits in place.
// That is the same call VetDocumentMetaSheets already made for Name and Add type:
// a detail screen full of live inputs has no saved/unsaved state an owner can read,
// and this screen has no Save button by design.
export function DocumentMetaCard({ rows }: { rows: MetaRow[] }) {
  return (
    <View style={styles.card}>
      {rows.map((row, i) => (
        <Fragment key={row.key}>
          {i > 0 && <View style={styles.divider} />}
          <TouchableOpacity
            style={styles.row}
            onPress={row.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${row.value ?? row.placeholder}`}
            accessibilityHint="Opens an editor"
          >
            <Text style={styles.label}>{row.label}</Text>

            <View style={styles.valueWrap}>
              {row.value == null ? (
                <Text style={styles.placeholder} numberOfLines={1}>
                  {row.placeholder}
                </Text>
              ) : row.chip ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{row.value}</Text>
                </View>
              ) : (
                <Text
                  style={[styles.value, row.link && styles.valueLink]}
                  numberOfLines={2}
                >
                  {row.value}
                </Text>
              )}
            </View>

            <ChevronRight size={16} color={theme.colorTextDisabled} strokeWidth={2} />
          </TouchableOpacity>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    overflow: 'hidden',
    ...shadows.sm,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colorBorder,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    // 13pt padding around a ~18pt line clears the 44pt floor without a hitSlop —
    // these rows are full-width, so the whole strip is the target.
    minHeight: 44,
  },
  label: {
    width: 78,
    flexShrink: 0,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  valueWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  valueLink: {
    color: theme.colorAccentInk,
  },
  placeholder: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextDisabled,
  },
  chip: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusXS,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 9,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextSecondary,
  },
});
