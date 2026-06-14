import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';

// DashboardEmptyState — the whole-dashboard cold-start state (§10). Shown only when
// there is genuinely nothing to render this window (no symptoms AND no logged feedings,
// per selectDashboardState). A Principle-5 "empty state is a feature" moment: warm,
// honest, forward-looking — the "we're getting to know Luna" tone, never a reassuring
// all-clear (an empty dashboard is "still learning", never "your pet is well", §11 #2).

interface Props {
  petName: string;
}

export function DashboardEmptyState({ petName }: Props) {
  const name = petName.trim().length > 0 ? petName : 'your pet';
  return (
    <View style={styles.container}>
      <Text style={styles.title}>I&apos;m still getting to know {name}.</Text>
      <Text style={styles.body}>
        Log a few meals and anything that seems off, and {name}&apos;s patterns will start to take
        shape here — how often things happen, what {name} eats most, and what tends to go together.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.space5,
    paddingHorizontal: theme.space2,
    gap: theme.space2,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
});
