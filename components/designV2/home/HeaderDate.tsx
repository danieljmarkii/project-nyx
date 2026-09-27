// The day, named in Home's header (Design v2 — the whole day, CUL-1221; the critique's
// BRK-26; the round-4 frame's "Thu, Sep 17").
//
// §05 names the spine's window as "today, dated in the header", and the header had no
// date: the Today card's only label is "Today" and the coverage door speaks the month.
// This draws the date at the head of the header's right cluster. It lives in the
// namespace so the flag-off guard can stub it (C-36): `HomeHeader` holds the gate and
// draws nothing here with the flag off.
//
// Metadata, not a control: plain text, no touchable, muted and small so it never competes
// with the pet's name (the one thing on the row an owner may need larger). The label is
// passed in rather than read here, so the header sizes the name against the SAME string
// this draws (`headerNameBudget`'s `dateLabel`).

import { StyleSheet } from 'react-native';
import { theme } from '../../../constants/theme';
import { HEADER_DATE_FONT_SIZE } from '../../../lib/headerName';
import { ThemedText } from '../../ui/ThemedText';

export function HeaderDate({ label }: { label: string }) {
  return (
    <ThemedText style={styles.date} numberOfLines={1} testID="home-header-date">
      {label}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  date: {
    fontSize: HEADER_DATE_FONT_SIZE,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    flexShrink: 0,
  },
});
