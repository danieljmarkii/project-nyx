import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { ThemedText } from '../../components/ui/ThemedText';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { VisitDetailBody } from '../../components/vetvisits/VisitDetailBody';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { resolveRecordPetName, usePetStore } from '../../store/petStore';
import { readVetVisitDetail, type VetVisitDetail } from '../../lib/vetVisits';

// One visit as written (CUL-900 VV-2; mock D3 without ⋯).
//
// Read-only in this PR: *Edit* is VV-4's and *Delete* is VV-6's, the latter gated
// on CUL-19 deploying the reader that honours `deleted_at`.
export default function VetVisitScreen() {
  const eligible = useAllowlistFlag('vet_visits');
  const optedIn = useBetaOptIn('vet_visits');
  const enabled = eligible && optedIn;

  const { id } = useLocalSearchParams<{ id: string }>();
  const pets = usePetStore((s) => s.pets);

  const [detail, setDetail] = useState<VetVisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || !id) {
      setLoading(false);
      setLoaded(true);
      return;
    }
    try {
      setDetail(await readVetVisitDetail(id));
      setLoaded(true);
    } catch (err) {
      console.warn('[vet-visit] read failed:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!enabled) return <Redirect href="/(tabs)/profile" />;

  // The RECORD's pet, never the active one (CUL-574 / AC 11): open a visit, switch
  // the store's active pet, and this screen still names the pet whose visit it is.
  // There is no `?? activePet?.name` rung — `resolveRecordPetName` already falls
  // back to an anonymous label, and correct-but-anonymous beats confidently wrong.
  const petName = resolveRecordPetName(pets, detail?.visit.pet_id);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header
        leading="back"
        onLeadingPress={() => (router.canGoBack() ? router.back() : router.replace('/vet-visits'))}
      />
      {loading ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : detail ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <VisitDetailBody
            detail={detail}
            petName={petName}
            onOpenDocument={(groupId) => router.push(`/vet-document/${groupId}`)}
          />
        </ScrollView>
      ) : loaded ? (
        // The read answered and the row is not there — deleted on another device,
        // or a stale link. Said plainly rather than left as a blank screen.
        <View style={styles.centre}>
          <ThemedText style={styles.missing}>This visit is no longer on the record.</ThemedText>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space3,
  },
  missing: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  scroll: {
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space4,
  },
});
