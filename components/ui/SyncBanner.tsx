import { View, Text, StyleSheet } from 'react-native';
import { useSyncStore } from '../../store/syncStore';
import { theme } from '../../constants/theme';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function SyncBanner() {
  const { oldestPendingAt } = useSyncStore();

  if (!oldestPendingAt) return null;

  const ageMs = Date.now() - new Date(oldestPendingAt).getTime();
  if (ageMs < STALE_THRESHOLD_MS) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        Some logs haven't synced in over a day. Connect to the internet to update your records.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    paddingHorizontal: theme.space2,
    paddingVertical: 10,
  },
  text: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightRegular,
    lineHeight: 18,
  },
});
