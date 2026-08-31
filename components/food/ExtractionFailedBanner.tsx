// Food detail's extraction-failure banner — CUL-651.
//
// WHY THIS IS A COMPONENT AND NOT SIX LINES OF JSX ON THE SCREEN:
//
// It used to render `{row.ai_extraction_error}` as its second line. That column is
// written by `extract-food-from-photo`'s catch block as a verbatim `err.message`,
// so an owner could read `Claude API error 529: {"type":"error"…}` or
// `DB update failed: …` on a screen about their cat's food. That is the B-399 leak
// class (CUL-445 / B-477) reaching an owner through a shape the copy guard could
// not see — the guard keys on the BASE of the expression being error-like, and a
// database row is not.
//
// So the fix is shaped the way `NamedCompletionCard` is shaped (CUL-606/CUL-614):
// this component takes NO parameter that could hold a display string, which makes
// the leak unreachable by construction rather than merely deleted. The raw string
// stays where it is useful — `console.warn`, for whoever is debugging — and the
// owner gets copy in the same voice `food-capture.tsx` already uses for this exact
// event ("Couldn't read the label automatically. You can fill it in below…").
//
// ── THE BANNER IS NOT GATED ON THE STORED ERROR ─────────────────────────────
//
// The caller renders this on `ai_extraction_status === 'failed'` ALONE. It used to
// require a non-null `ai_extraction_error` too, which looks harmless and is not:
// `food-capture.tsx` upserts `ai_extraction_status: 'failed'` WITHOUT ever writing
// that column (the cap-reached, flag-off, and transport-fault paths all return
// from the Edge Function without touching the row). Every one of those left an
// owner with a failed food, no banner, and no way to retry — a failure state made
// invisible by the absence of a diagnostic string that has no owner-facing job in
// the first place (the CUL-62 shape: a fact is not gated on the thing it counts).
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { ThemedText } from '../ui/ThemedText';

// Static, because every stored cause has the same owner remedy. A mapper in the
// `authErrorCopy` shape would be right if the causes led anywhere different — they
// do not: a 529 from Claude, an unreadable photo and a failed DB write are all
// "we could not read it; the fields below are yours to fill". Inventing branches
// over a provider string we do not control would be specific-and-wrong, which
// `lib/authErrors.ts` argues is worse than vague-and-honest.
export const EXTRACTION_FAILED_TITLE = 'Extraction failed';
export const EXTRACTION_FAILED_DETAIL =
  'Couldn’t read the label from the photo. You can fill in the details below.';

interface Props {
  /** Re-invokes extraction. The screen owns the pending flip and the write. */
  onRetry: () => void;
  /** Retry in flight — the button holds its place and shows the whorl. */
  retrying: boolean;
}

export function ExtractionFailedBanner({ onRetry, retrying }: Props) {
  return (
    <View style={styles.banner} testID="food-extraction-failed">
      <ThemedText style={styles.title}>{EXTRACTION_FAILED_TITLE}</ThemedText>
      <ThemedText style={styles.detail}>{EXTRACTION_FAILED_DETAIL}</ThemedText>
      <TouchableOpacity
        style={[styles.retryBtn, retrying && styles.retryBtnDisabled]}
        onPress={onRetry}
        disabled={retrying}
        hitSlop={8}
        activeOpacity={0.8}
        accessibilityRole="button"
        testID="food-extraction-retry"
      >
        {retrying
          ? <WhorlSpinner size="sm" tint={theme.colorTextOnDark} />
          : <ThemedText style={styles.retryBtnText}>Try extraction again</ThemedText>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colorEventSymptomLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    gap: theme.space1,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  detail: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: theme.space1,
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  retryBtnDisabled: {
    opacity: 0.6,
  },
  retryBtnText: {
    fontSize: theme.textMD,
    // The token, not the `'#fff'` the screen had inline — same pixels, and the
    // hardcoded value is what CLAUDE.md's theme-tokens-only rule forbids.
    color: theme.colorTextOnDark,
    fontWeight: theme.weightMedium,
  },
});
