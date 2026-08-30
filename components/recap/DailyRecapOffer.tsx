// The in-context Daily Recap offer banner (daily-recap DR-3 / CUL-26, spec §4 /
// R-6). The night-ground card that appears at the foot of the Daily Recap on an
// IN-APP visit while the recap notification is off — "Culprit can let you know each
// evening…" with a primer-gated `Turn on` and a `Not now` that quiets it 30 days.
//
// PURELY PRESENTATIONAL. Every decision (whether to show it, arrival classification,
// the quiet/value-moment markers) lives in lib/dailyRecapOffer.ts and the
// hooks/useDailyRecapOffer.ts wiring; this renders the card and reports two taps.
//
// THE CONSENT-PATH INVARIANT (§4): `onTurnOn` opens the PRIMER — the OS permission
// prompt is never reachable from this banner directly. This component cannot violate
// it (it only calls the handler it is given); the hook guarantees the handler opens
// the primer.
//
// DESIGN LOCK: the mock's `.offer-night` (section 3, second frame). The teal-tinted
// hairline (vs the fact strips' lavender `colorBorderOnNight`) is the accent-rule
// signal that this card is a live offer rather than a record fact — the same
// alpha-on-accent idiom RecapStrip uses for its glyph wash (`tint + '26'`).
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { DAILY_RECAP_OFFER_COPY } from '../../lib/dailyRecapOffer';
import { ThemedText } from '../ui/ThemedText';

// The teal hairline at ~45% alpha — the night sibling of the mock's
// `color-mix(in srgb, #00C2A8 45%, transparent)`. `0x73` ≈ 0.45 × 255. Follows
// RecapStrip's alpha-on-token idiom rather than minting a one-off theme token.
const OFFER_BORDER = theme.colorAccent + '73';

interface Props {
  /** "Turn on" — opens the primer (NEVER the OS prompt directly). */
  onTurnOn: () => void;
  /** "Not now" — quiets the banner for 30 days. */
  onNotNow: () => void;
}

function DailyRecapOfferImpl({ onTurnOn, onNotNow }: Props) {
  return (
    <View style={styles.card}>
      <ThemedText style={styles.body}>{DAILY_RECAP_OFFER_COPY.body}</ThemedText>
      <View style={styles.actions}>
        <Pressable
          onPress={onTurnOn}
          accessibilityRole="button"
          // A specific name — "Turn on" alone doesn't say what turns on (and it
          // distinguishes this from the primer's own "Turn on" for a screen reader
          // and for the consent-path test).
          accessibilityLabel="Turn on the daily summary"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          style={styles.actionWrap}
        >
          <ThemedText style={styles.turnOn}>{DAILY_RECAP_OFFER_COPY.turnOn}</ThemedText>
        </Pressable>
        <Pressable
          onPress={onNotNow}
          accessibilityRole="button"
          accessibilityLabel="Not now, hide the daily summary offer"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          style={styles.actionWrap}
        >
          <ThemedText style={styles.notNow}>{DAILY_RECAP_OFFER_COPY.notNow}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export const DailyRecapOffer = memo(DailyRecapOfferImpl);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorBrandNightElevated,
    borderWidth: 1,
    borderColor: OFFER_BORDER,
    borderRadius: 14, // matches RecapStrip + the mock's `.offer-night`
    padding: theme.space1 + theme.space0_5, // 12, the mock's padding
  },
  body: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNight,
    lineHeight: theme.lineHeightSM,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2, // 16, the mock's action gap
    marginTop: theme.space1,
  },
  // paddingVertical + hitSlop together clear the 44pt tap target for two compact
  // text links sitting in one row (the house rule RecapStrip's minHeight satisfies).
  actionWrap: {
    paddingVertical: theme.space0_5,
  },
  // The interactive accent (colorAccent) — NOT the decorative colorMoonlitTeal.
  // The accent rule reserves teal `colorAccent` for tappable elements, and the
  // recap's other night links (the zero-log CTA, the retry) already read in it, so
  // "Turn on" matches its siblings on this screen.
  turnOn: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    // accent-on-dark-ok: colorBrandNightElevated (the card's fill, :72) — 6.57:1.
    // colorAccentInk would be 2.88:1 on this ground (CUL-744).
    color: theme.colorAccent,
  },
  notNow: {
    fontSize: theme.textSM,
    color: theme.colorTextOnNightMuted,
  },
});
