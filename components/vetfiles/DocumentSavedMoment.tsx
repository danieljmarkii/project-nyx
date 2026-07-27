import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { VetDocumentThumb } from './VetDocumentThumb';
import type { SavedMomentCopy } from '../../lib/vetDocumentCapture';

export interface AlsoAddTarget {
  petId: string;
  /** "Also add to Juniper’s Vet Files", or the confirmed past tense once filed. */
  label: string;
  done: boolean;
}

interface Props {
  copy: SavedMomentCopy;
  /** The cover page's local file — always present on a just-captured document. */
  thumbUri?: string | null;
  isPdf?: boolean;
  /** D13 targets. Empty in a single-pet account, where the line never renders. */
  alsoAdd?: AlsoAddTarget[];
  onAlsoAdd?: (petId: string) => void;
  /** Camera captures only — the mechanism behind D1-r2's "snap each page". */
  onAddPage?: () => void;
  busy?: boolean;
  onName: () => void;
  onDone: () => void;
}

// D2-r2 — the saved moment.
//
// It is a full screen and it does NOT auto-dismiss, which is the difference
// between this and the log-time completion beat: a log beat confirms something the
// owner just did deliberately, while this one carries two optional actions (Name
// it, and D13's copy-to-another-pet) that a 900ms beat would snatch away.
//
// What it must NOT do is ask anything. The kind chips round 2 proposed here were
// ruled out (D11) — the document is already saved, complete and findable, and the
// recovery for an untitled row lives on the row itself. So every action on this
// screen is additive, and "Done" is always the shortest path off it.
export function DocumentSavedMoment({
  copy, thumbUri, isPdf, alsoAdd = [], onAlsoAdd, onAddPage, busy, onName, onDone,
}: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.body}>
        <View style={styles.check}>
          <Check size={24} color={theme.colorAccentInk} strokeWidth={2.4} />
        </View>

        <View style={styles.headings}>
          <Text style={styles.headline} accessibilityRole="header">{copy.headline}</Text>
          {/* The offline promise. The save above completed against SQLite with no
              network involved, so this is a statement of fact, not reassurance —
              and without it an owner in a clinic basement has no way to know. */}
          <Text style={styles.offline}>{copy.offlineLine}</Text>
        </View>

        <View style={styles.card}>
          <VetDocumentThumb uri={thumbUri} isPdf={isPdf} />
          <View style={styles.cardMeta}>
            <Text style={styles.cardTitle} numberOfLines={1}>{copy.cardTitle}</Text>
            {copy.cardSub ? <Text style={styles.cardSub}>{copy.cardSub}</Text> : null}
          </View>
        </View>

        {onAddPage ? (
          <TouchableOpacity
            style={styles.quietAction}
            onPress={onAddPage}
            disabled={busy}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add another page to this document"
          >
            <Text style={styles.quietActionText}>Add another page</Text>
          </TouchableOpacity>
        ) : null}

        {/* D13 — one line per other pet in the household; nothing at all in a
            single-pet account. Each files a full independent copy, and flips to the
            past tense so a second tap can't file a third. */}
        {alsoAdd.map((target) => (
          <TouchableOpacity
            key={target.petId}
            style={styles.quietAction}
            onPress={() => onAlsoAdd?.(target.petId)}
            disabled={target.done || busy}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: target.done }}
            accessibilityLabel={target.label}
          >
            <Text style={[styles.quietActionText, target.done && styles.quietActionDone]}>
              {target.done ? `✓  ${target.label}` : target.label}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.actions}>
          <PrimaryButton label="Name it" variant="secondary" onPress={onName} />
          <PrimaryButton label="Done" onPress={onDone} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: theme.space3,
  },
  check: {
    width: 56,
    height: 56,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headings: {
    alignItems: 'center',
    gap: 4,
  },
  headline: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
    textAlign: 'center',
  },
  offline: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
  card: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...shadows.sm,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  cardSub: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 3,
  },
  quietAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space1,
  },
  quietActionText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
    textAlign: 'center',
  },
  quietActionDone: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextTertiary,
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.space1,
    marginTop: theme.space1,
  },
});
