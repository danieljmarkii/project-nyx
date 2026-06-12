// B-040 R1 + multi-pet spec §3.4 (mock B2) — the food-detail "Always available"
// (free-choice) standing-fact card. Set-once, lives in the food domain (never
// the pet page). A free-fed food means intake is NOT directly observed; the vet
// report carries that caveat (free-feeding spec §2/§6).
//
// Single-pet households see the original single toggle, unchanged (multi-pet
// spec §7.8 — zero new chrome). Multi-pet households get one toggle row per
// active pet (avatar + name + since-date), active pet first; both-ON on the
// same food IS the shared bowl, surfaced by the shared-bowl hint line. Each
// row is an independent feeding_arrangements row — toggling pet A never
// touches pet B's arrangement (spec §7.7).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import {
  startFreeChoice, endFreeChoice, getArrangementMetasForFood, confirmArrangementFresh,
  confirmedLabel, formatCalendarDate, isArrangementStale, sharedBowlHint,
  ActiveArrangementMeta,
} from '../../lib/feedingArrangements';
import { usePetStore, orderPetsActiveFirst, Pet } from '../../store/petStore';
import { PetAvatar } from '../pet/PetAvatar';

const ROW_AVATAR = 28;

interface Props {
  foodItemId: string;
}

export function AlwaysAvailableCard({ foodItemId }: Props) {
  const pets = usePetStore((s) => s.pets);
  const activePet = usePetStore((s) => s.activePet);

  // Active pet leads (spec §3.4); the rest keep store (oldest-first) order.
  const orderedPets = useMemo(
    () => orderPetsActiveFirst(pets, activePet?.id ?? null),
    [pets, activePet?.id],
  );
  const petIdsKey = orderedPets.map((p) => p.id).join(',');

  // Per-pet arrangement state, keyed by pet id. `onByPet` is the optimistic
  // toggle state (set before the write, reverted on failure so the switch
  // never lies about a write that didn't land); metaByPet backs the §6a
  // "last confirmed" freshness reads.
  const [metaByPet, setMetaByPet] = useState<Record<string, ActiveArrangementMeta>>({});
  const [onByPet, setOnByPet] = useState<Record<string, boolean>>({});
  const [savingPetId, setSavingPetId] = useState<string | null>(null);
  const [confirmingPetId, setConfirmingPetId] = useState<string | null>(null);
  // Brief "Confirmed ✓" acknowledgment after a re-attest, before the line
  // settles back to fresh (and the "Still accurate?" nudge disappears).
  const [flashPetId, setFlashPetId] = useState<string | null>(null);
  // Which pet's two-way "still out? yes / no" answer is open. The stale nudge
  // is a question, so tapping it asks rather than silently auto-confirming;
  // "no" (the bowl ended) is the outcome freshness exists to catch (§6a).
  const [choosingPetId, setChoosingPetId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!foodItemId || orderedPets.length === 0) return;
    const metas = await getArrangementMetasForFood(
      foodItemId,
      orderedPets.map((p) => p.id),
    );
    const byPet: Record<string, ActiveArrangementMeta> = {};
    for (const m of metas) byPet[m.pet_id] = m;
    setMetaByPet(byPet);
    setOnByPet(Object.fromEntries(orderedPets.map((p) => [p.id, !!byPet[p.id]])));
    // foodItemId + the pet-id set are the real dependencies; orderedPets is
    // identity-unstable across renders, so we key on the joined ids (names
    // aren't used in this callback, so an id-stable rename needn't retrigger).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodItemId, petIdsKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await reload();
      } catch (err) {
        console.warn('[AlwaysAvailableCard] free-choice load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  async function handleToggle(pet: Pet, next: boolean) {
    setChoosingPetId(null); // don't carry an open answer across a toggle
    setOnByPet((cur) => ({ ...cur, [pet.id]: next })); // optimistic
    setSavingPetId(pet.id);
    try {
      if (next) await startFreeChoice(pet.id, foodItemId);
      else await endFreeChoice(pet.id, foodItemId);
      // Re-read so the freshness line reflects the new arrangement (or clears).
      await reload();
    } catch (err) {
      setOnByPet((cur) => ({ ...cur, [pet.id]: !next })); // revert — the write didn't land
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Couldn't update", msg);
    } finally {
      setSavingPetId(null);
    }
  }

  // §6a passive freshness — "Yes, still out": re-attest the bowl is still down.
  // Never a push; shown only here (and in the library), only when the owner is
  // already looking. Bumps updated_at so the line reads "Last confirmed today".
  async function handleConfirmFresh(pet: Pet) {
    setChoosingPetId(null);
    setConfirmingPetId(pet.id);
    try {
      await confirmArrangementFresh(pet.id, foodItemId);
      await reload();
      setFlashPetId(pet.id);
      setTimeout(() => setFlashPetId((cur) => (cur === pet.id ? null : cur)), 1500);
    } catch (err) {
      console.warn('[AlwaysAvailableCard] freshness confirm failed:', err);
    } finally {
      setConfirmingPetId(null);
    }
  }

  // "No, it's stopped" — end the arrangement (soft; reuses the toggle-off path,
  // writes the active_until "Stopped" boundary History renders). The row's
  // toggle flips off and the freshness line disappears via reload.
  async function handleStopFresh(pet: Pet) {
    setChoosingPetId(null);
    setOnByPet((cur) => ({ ...cur, [pet.id]: false })); // optimistic
    try {
      await endFreeChoice(pet.id, foodItemId);
      await reload();
    } catch (err) {
      setOnByPet((cur) => ({ ...cur, [pet.id]: true })); // revert — the write didn't land
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Couldn't update", msg);
    }
  }

  if (orderedPets.length === 0) return null;

  // ── Single-pet: the original toggle, unchanged (spec §7.8) ────────────────
  if (orderedPets.length === 1) {
    const pet = orderedPets[0];
    const freeChoice = !!onByPet[pet.id];
    const meta = metaByPet[pet.id];
    return (
      <View style={styles.freeChoiceCard}>
        <View style={styles.freeChoiceRow}>
          <View style={styles.freeChoiceText}>
            <Text style={styles.freeChoiceLabel}>
              Always available for {pet.name}?
            </Text>
            <Text style={styles.freeChoiceHelper}>
              {pet.name} can graze this throughout the day — we'll note it
              as free-choice on the vet report.
            </Text>
          </View>
          <Switch
            value={freeChoice}
            onValueChange={(next) => handleToggle(pet, next)}
            disabled={savingPetId === pet.id}
            trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
            ios_backgroundColor={theme.colorBorderStrong}
          />
        </View>

        {/* §6a passive freshness — last-confirmed + one-tap re-confirm.
            Shown only while free-fed; updated_at backs "last confirmed". */}
        {freeChoice && meta && (
          <>
            <View style={styles.freshnessRow}>
              <Text style={styles.freshnessText}>
                Last confirmed {confirmedLabel(meta.updated_at)}
              </Text>
              {/* The re-attest is a nudge that shows only once stale; a fresh
                  arrangement just shows the date. Tapping it opens a two-way
                  answer (below) rather than silently auto-confirming. */}
              {flashPetId === pet.id ? (
                <Text style={styles.freshnessConfirmed}>Confirmed ✓</Text>
              ) : isArrangementStale(meta.updated_at) && choosingPetId !== pet.id ? (
                <TouchableOpacity
                  onPress={() => setChoosingPetId(pet.id)}
                  hitSlop={12}
                  activeOpacity={0.7}
                  style={styles.freshnessActionBtn}
                >
                  <Text style={styles.freshnessAction}>Still accurate?</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {choosingPetId === pet.id && renderFreshnessChoices(pet)}
          </>
        )}
      </View>
    );
  }

  // ── Multi-pet: one toggle row per active pet (mock B2) ────────────────────
  const petsOn = orderedPets.filter((p) => onByPet[p.id]);
  const hint = sharedBowlHint(petsOn);

  return (
    <View style={styles.freeChoiceCard}>
      <Text style={styles.cardHeader}>Always available</Text>
      {orderedPets.map((pet) => {
        const on = !!onByPet[pet.id];
        const meta = metaByPet[pet.id];
        const since = meta ? formatCalendarDate(meta.active_from) : null;
        const stale = on && !!meta && isArrangementStale(meta.updated_at);
        return (
          <View key={pet.id}>
            <View style={styles.petRow}>
              <PetAvatar name={pet.name} photoPath={pet.photo_path} size={ROW_AVATAR} />
              <View style={styles.petRowText}>
                <Text style={styles.petRowName} numberOfLines={1}>{pet.name}</Text>
                {on && (
                  flashPetId === pet.id ? (
                    <Text style={styles.petRowMeta}>Confirmed ✓</Text>
                  ) : since ? (
                    <Text style={styles.petRowMeta}>since {since}</Text>
                  ) : null
                )}
              </View>
              {stale && flashPetId !== pet.id && choosingPetId !== pet.id && (
                <TouchableOpacity
                  onPress={() => setChoosingPetId(pet.id)}
                  hitSlop={12}
                  activeOpacity={0.7}
                  style={styles.freshnessActionBtn}
                >
                  <Text style={styles.freshnessAction}>Still accurate?</Text>
                </TouchableOpacity>
              )}
              <Switch
                value={on}
                onValueChange={(next) => handleToggle(pet, next)}
                disabled={savingPetId === pet.id}
                trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
                ios_backgroundColor={theme.colorBorderStrong}
                accessibilityLabel={`Always available for ${pet.name}`}
              />
            </View>
            {choosingPetId === pet.id && renderFreshnessChoices(pet)}
          </View>
        );
      })}
      {hint && (
        <View style={styles.sharedHintRow}>
          <View style={styles.sharedDot} />
          <Text style={styles.sharedHintText}>{hint}</Text>
        </View>
      )}
    </View>
  );

  function renderFreshnessChoices(pet: Pet) {
    return (
      <View style={styles.freshnessChoices}>
        <Text style={styles.freshnessPrompt}>
          Still always out for {pet.name}?
        </Text>
        <View style={styles.freshnessChoiceBtns}>
          <TouchableOpacity
            onPress={() => handleConfirmFresh(pet)}
            disabled={confirmingPetId === pet.id}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.freshnessChoiceBtn}
          >
            <Text style={styles.choiceYes}>
              {confirmingPetId === pet.id ? 'Confirming…' : 'Yes, still out'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleStopFresh(pet)}
            // Locked while a "Yes" confirm is in flight so a fast Yes→No
            // can't end the row mid-confirm and flash a false "Confirmed ✓".
            disabled={confirmingPetId === pet.id}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.freshnessChoiceBtn}
          >
            <Text style={styles.choiceNo}>No, it's stopped</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  freeChoiceCard: {
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    marginTop: theme.space1,
  },
  freeChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  freeChoiceText: {
    flex: 1,
    gap: 4,
  },
  freeChoiceLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  freeChoiceHelper: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 18,
  },
  cardHeader: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginBottom: theme.space1,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: 48,
  },
  petRowText: {
    flex: 1,
    minWidth: 0,
  },
  petRowName: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  petRowMeta: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 1,
  },
  sharedHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    marginTop: theme.space1,
    paddingTop: theme.space1,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  sharedDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccent,
  },
  sharedHintText: {
    flex: 1,
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    lineHeight: 16,
  },
  freshnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.space2,
    paddingTop: theme.space1,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    minHeight: theme.space4,
  },
  freshnessText: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  freshnessActionBtn: {
    paddingVertical: theme.space1,
    justifyContent: 'center',
  },
  freshnessAction: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
  },
  freshnessConfirmed: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  freshnessChoices: {
    marginTop: theme.space1,
    gap: theme.space1,
  },
  freshnessPrompt: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  freshnessChoiceBtns: {
    flexDirection: 'row',
    gap: theme.space3,
  },
  freshnessChoiceBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  choiceYes: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  choiceNo: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
});
