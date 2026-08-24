// "Outside the trial diet" — the exposures screen (B-616 PR 4 / B-458's second
// half). Spec §2.6; design authority: the list + reason sheets in
// `docs/nyx-diet-trial-mockups.html` (round 4, design-locked).
//
// ── WHAT THIS SCREEN IS FOR ─────────────────────────────────────────────────
//
// The trial card can say "4 logged feedings were outside the trial diet" and, until
// now, that was the end of the conversation: `explainVerdict` had no caller, so the
// count was an assertion an owner could not check. §6.3 calls that an unfalsifiable
// accusation. This screen is the destination for the card's `view_exposures` link —
// which feedings, when, and which rung fired for each.
//
// ── THE REGISTER ────────────────────────────────────────────────────────────
//
// It itemises the owner's own logged record, which makes it the one surface in this
// track that could read as an indictment. Three things keep it from doing so, and
// all three live in `lib/trialExposuresScreen.ts` where a test can hold them: the
// count is always framed as a FLOOR, the footer says keep going (§6.7 — no consulted
// source instructs a restart), and nothing on this screen scores the owner (§6.9).
//
// ── THE THREE STATES ────────────────────────────────────────────────────────
//
// `unknown` renders a spinner, never an empty list — an empty exposures screen over
// a record nobody could read is a fabricated all-clear, which is the exact
// reassurance-on-absence `clinical-guardrails` forbids. `no_trial` says so plainly.
// A `ready` trial whose facts could not be computed renders the same spinner path
// for the same reason: null facts are not a clean record.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../constants/theme';
import { Header } from '../components/ui/Header';
import { SectionLabel } from '../components/ui/SectionLabel';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { ExposureReasonSheet } from '../components/profile/ExposureReasonSheet';
import { useTrialFacts } from '../hooks/useTrialFacts';
import { usePetStore } from '../store/petStore';
import {
  buildTrialExposuresScreen,
  noTrialExposuresLine,
  EXPOSURE_REASON_TITLE,
  TRIAL_EXPOSURES_TITLE,
  TRIAL_EXPOSURES_UNREADABLE,
  type TrialExposureRow,
} from '../lib/trialExposuresScreen';
import { ThemedText } from '../components/ui/ThemedText';

export default function TrialExposuresScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const petName = activePet?.name ?? 'your pet';
  const state = useTrialFacts();
  const [open, setOpen] = useState<TrialExposureRow | null>(null);

  const model = state.status === 'ready' ? buildTrialExposuresScreen(petName, state.facts) : null;

  // A `ready` trial whose model came back null is a record that could not be read
  // or computed — the same fact as a thrown read, reached one layer down, and it
  // gets the same designed line rather than a spinner that never resolves.
  const unreadable = state.status === 'unreadable' || (state.status === 'ready' && model === null);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={TRIAL_EXPOSURES_TITLE} leading="back" onLeadingPress={() => router.back()} />

      {model === null ? (
        <View style={styles.centered}>
          {state.status === 'no_trial' ? (
            <ThemedText testID="trial-exposures-no-trial" style={styles.quiet}>
              {noTrialExposuresLine(petName)}
            </ThemedText>
          ) : unreadable ? (
            <ThemedText testID="trial-exposures-unreadable" style={styles.quiet}>
              {TRIAL_EXPOSURES_UNREADABLE}
            </ThemedText>
          ) : (
            // The ONLY spinner state: still reading, which resolves on its own.
            <WhorlSpinner size="md" ground="day" />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* The nav header carries the title (it is the words the owner tapped),
              so the body opens on the fact rather than repeating it. */}
          {model.subtitle !== null && (
            <ThemedText testID="trial-exposures-subtitle" style={styles.subtitle}>
              {model.subtitle}
            </ThemedText>
          )}

          {model.empty !== null && (
            <ThemedText testID="trial-exposures-empty" style={styles.emptyState}>
              {model.empty}
            </ThemedText>
          )}

          {model.groups.map((group, i) => (
            <View key={group.title ?? `group-${i}`} style={styles.group}>
              {group.title !== null && (
                <SectionLabel label={group.title} header style={styles.groupLabel} />
              )}
              {group.rows.map((row) => (
                <TouchableOpacity
                  key={row.key}
                  testID="trial-exposure-row"
                  style={styles.row}
                  // A row with no reason to show is not a button. Nothing is
                  // hidden by that — the row still renders, because an exposure
                  // the app cannot explain still happened.
                  onPress={row.reason !== null ? () => setOpen(row) : undefined}
                  disabled={row.reason === null}
                  activeOpacity={0.7}
                  accessibilityRole={row.reason !== null ? 'button' : undefined}
                  accessibilityLabel={
                    row.reason !== null ? `${row.label}. ${row.meta}. ${EXPOSURE_REASON_TITLE}` : undefined
                  }
                >
                  <View style={styles.rowText}>
                    <ThemedText style={styles.rowLabel}>{row.label}</ThemedText>
                    <ThemedText style={styles.rowMeta}>{row.meta}</ThemedText>
                  </View>
                  {/* geist-ok: icon glyph, not copy — stays a raw <Text> and keeps the system face.
                      These stand in for vector glyphs (the B-745 GlyphSvg migration owns them), and Geist
                      carries no ✓ / ✕ / ＋ in any loaded weight, so sweeping one buys OS fallback for
                      nothing. CUL-364 §7. */}
                  {row.reason !== null && <Text style={styles.chevron}>›</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {/* The blind spots, above the footer that calls the count a floor —
              they are what make that line a description rather than a hedge. */}
          {model.notes.map((note) => (
            <ThemedText key={note} testID="trial-exposures-note" style={styles.note}>
              {note}
            </ThemedText>
          ))}

          <ThemedText testID="trial-exposures-footer" style={styles.footer}>
            {model.footer}
          </ThemedText>
        </ScrollView>
      )}

      {open !== null && <ExposureReasonSheet row={open} onClose={() => setOpen(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space3 },
  quiet: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space4,
  },
  title: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  emptyState: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
    marginTop: theme.space3,
  },
  group: { marginTop: theme.space3 },
  groupLabel: { marginBottom: theme.space1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    // 44pt, so a row is a real tap target rather than a text run that happens to
    // be pressable.
    minHeight: 44,
    paddingVertical: theme.space2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  rowMeta: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextTertiary,
  },
  note: {
    fontSize: theme.textXS,
    lineHeight: theme.textXS * 1.5,
    color: theme.colorTextSecondary,
    marginTop: theme.space2,
  },
  footer: {
    fontSize: theme.textXS,
    lineHeight: theme.textXS * 1.5,
    color: theme.colorTextTertiary,
    marginTop: theme.space3,
  },
});
