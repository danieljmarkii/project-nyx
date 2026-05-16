import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { useSignal } from '../../hooks/useSignal';
import { usePetStore } from '../../store/petStore';

export function SignalZone() {
  const { activePet } = usePetStore();
  const { signalText, isBuilding, isLoading } = useSignal();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // Pulse the skeleton while loading
  useEffect(() => {
    if (!isLoading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLoading, pulseAnim]);

  // Fade in when signal arrives
  useEffect(() => {
    if (isLoading || (signalText === null && isBuilding)) return;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: theme.durationMedium,
      useNativeDriver: true,
    }).start();
  }, [isLoading, signalText, isBuilding, fadeAnim]);

  const petName = activePet?.name ?? 'your pet';

  if (isLoading) {
    return (
      <View style={styles.zone}>
        <Animated.View style={[styles.skeleton, { opacity: pulseAnim }]} />
        <Animated.View style={[styles.skeletonShort, { opacity: pulseAnim }]} />
      </View>
    );
  }

  const displayText = signalText
    ?? `We're getting to know ${petName}. Keep logging and patterns start appearing in about a week.`;
  const isRealSignal = !isBuilding && signalText !== null;

  return (
    <View style={styles.zone}>
      <Animated.Text
        style={[
          isRealSignal ? styles.signalText : styles.buildingText,
          { opacity: fadeAnim },
        ]}
      >
        {displayText}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    minHeight: 80,
    justifyContent: 'center',
  },
  // Real insight — slightly larger, primary color, display weight
  signalText: {
    fontSize: 19,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
    lineHeight: 28,
  },
  // Building state — softer, secondary color, same font
  buildingText: {
    fontSize: 15,
    fontWeight: theme.fontWeightRegular,
    color: theme.colorTextSecondary,
    lineHeight: 22,
  },
  skeleton: {
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colorChartEmpty,
    marginBottom: theme.space1,
    width: '90%',
  },
  skeletonShort: {
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colorChartEmpty,
    width: '60%',
  },
});
