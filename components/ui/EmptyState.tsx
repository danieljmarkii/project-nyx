import { View, Text, StyleSheet, StyleProp, ViewStyle, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

interface Props {
  // The one required part. Every empty state is at minimum a warm, honest line
  // (Principle 5) — never a blank View, never a bare "No data".
  title: string;
  // The forward-looking second line: what's coming, or what to do to get there.
  body?: string;
  // A single low-emphasis text action (e.g. "Try again" on an error state).
  // Rendered as an accent text link, not a filled button — an empty state invites,
  // it doesn't demand, so the action never competes with the copy for weight.
  action?: EmptyStateAction;
  // 'inset' (default): a calm message near the top of a list or tab — the
  // designed cold-start (History's "Nothing logged yet", the Foods library
  // first-run). 'fill': centre vertically in the space left over — the
  // full-screen guard (an event or pet that isn't there).
  align?: 'inset' | 'fill';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The shared empty-state block (B-165). Title, optional body, optional action —
 * centred, calm, forward-looking. It exists so Principle 5 ("empty states are
 * features, not gaps") is the path of least resistance: a screen reaches for this
 * and gets the designed treatment for free, so shipping a plain blank space
 * becomes the *harder* thing to do rather than the default.
 *
 * Replaces four near-duplicate hand-rolled `emptyState`/`emptyTitle`/`emptyBody`
 * View+Text blocks (History, Foods, Profile, event-detail), each of which had
 * drifted its own font sizes and padding. The copy stays at the call site — voice
 * lives next to context — and only the layout is shared.
 */
export function EmptyState({ title, body, action, align = 'inset', style, testID }: Props) {
  return (
    <View style={[align === 'fill' ? styles.fill : styles.inset, style]} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? (
        <TouchableOpacity
          style={styles.action}
          onPress={action.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Top-anchored: the designed empty state that lives inside a list or tab, sitting
  // a comfortable distance below the header rather than floating dead-centre.
  inset: {
    paddingHorizontal: theme.space4,
    paddingTop: theme.space6,
    alignItems: 'center',
    gap: theme.space1,
  },
  // Vertically centred in whatever space is left — the full-screen guard states,
  // where there is no list to sit above.
  fill: {
    flex: 1,
    paddingHorizontal: theme.space4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    lineHeight: theme.lineHeightBody,
  },
  // A 44pt tap target for the text link (Designer anti-pattern: sub-44pt targets).
  action: {
    marginTop: theme.space2,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
  },
  actionText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
});
