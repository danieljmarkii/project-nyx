import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../constants/theme';
import { EVENT_TYPES, EventTypeKey } from '../constants/eventTypes';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { getDb } from '../lib/db';
import { supabase } from '../lib/supabase';
import { syncPendingEvents, syncPendingMeals } from '../lib/sync';

type Step = 'type' | 'food' | 'food-new' | 'symptom' | 'simple' | 'complete';

interface CachedFood {
  id: string;
  brand: string;
  product_name: string;
  format: string;
}

const TYPE_ICONS: Record<EventTypeKey, string> = {
  meal: '🍽',
  vomit: '⚡',
  diarrhea: '⚡',
  stool_normal: '✓',
  lethargy: '◑',
  itch: '✦',
  other: '+',
};

const FOOD_FORMATS = [
  { value: 'dry_kibble', label: 'Dry kibble' },
  { value: 'wet_canned', label: 'Wet / canned' },
  { value: 'raw', label: 'Raw' },
  { value: 'freeze_dried', label: 'Freeze-dried' },
  { value: 'fresh_cooked', label: 'Fresh cooked' },
  { value: 'topper', label: 'Topper' },
  { value: 'treat', label: 'Treat' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_CONFIG = [
  { value: 1, label: 'Mild' },
  { value: 2, label: '' },
  { value: 3, label: '' },
  { value: 4, label: '' },
  { value: 5, label: 'Severe' },
];

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function LogModal() {
  const { activePet } = usePetStore();
  const { user } = useAuthStore();
  const { prependEvent } = useEventStore();

  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<EventTypeKey | null>(null);

  // Food state
  const [foods, setFoods] = useState<CachedFood[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [selectedFoodBrand, setSelectedFoodBrand] = useState<string | null>(null);
  const [selectedFoodProduct, setSelectedFoodProduct] = useState<string | null>(null);

  // New food form
  const [newBrand, setNewBrand] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [newFormat, setNewFormat] = useState('dry_kibble');

  // Symptom state
  const [severity, setSeverity] = useState<number | null>(null);

  // Shared
  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Completion animation
  const checkScale = useRef(new Animated.Value(0.5)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step === 'food') loadFoods();
  }, [step]);

  useEffect(() => {
    if (step !== 'complete') return;
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => router.back(), 1000);
    return () => clearTimeout(t);
  }, [step]);

  async function loadFoods() {
    const db = getDb();
    const rows = await db.getAllAsync<CachedFood>(
      `SELECT id, brand, product_name, format FROM food_items_cache
       ORDER BY last_used_at DESC NULLS LAST, brand ASC LIMIT 30`
    );
    setFoods(rows);
  }

  function handleTypeSelect(type: EventTypeKey) {
    setSelectedType(type);
    const config = EVENT_TYPES[type];
    if (config.hasFood) setStep('food');
    else if (config.hasSeverity) setStep('symptom');
    else setStep('simple');
  }

  async function handleNewFoodSave() {
    if (!newBrand.trim() || !newProduct.trim()) return;
    const foodId = uuid();
    const db = getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO food_items_cache (id, brand, product_name, format, cached_at) VALUES (?, ?, ?, ?, ?)`,
      [foodId, newBrand.trim(), newProduct.trim(), newFormat, now]
    );
    // Best-effort remote insert — food_items is a global shared catalog
    supabase.from('food_items').insert({
      id: foodId,
      brand: newBrand.trim(),
      product_name: newProduct.trim(),
      format: newFormat,
      created_by_user_id: user?.id ?? null,
    }).then(({ error }) => {
      if (error) console.warn('[food] remote insert failed:', error.message);
    });
    setSelectedFoodId(foodId);
    setSelectedFoodBrand(newBrand.trim());
    setSelectedFoodProduct(newProduct.trim());
    setNewBrand('');
    setNewProduct('');
    setNewFormat('dry_kibble');
    // Return to food screen with new item selected
    await loadFoods();
    setStep('food');
  }

  async function handleConfirm() {
    if (!activePet) return;
    if (selectedType === 'meal' && !selectedFoodId) return;
    const db = getDb();
    const eventId = uuid();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO events
         (id, pet_id, event_type, occurred_at, severity, notes, source, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, 0)`,
      [eventId, activePet.id, selectedType!, occurredAt.toISOString(),
       severity ?? null, notes.trim() || null, now, now]
    );
    if (selectedType === 'meal' && selectedFoodId) {
      const mealId = uuid();
      await db.runAsync(
        `INSERT INTO meals (id, event_id, pet_id, food_item_id, quantity, created_at, synced)
         VALUES (?, ?, ?, ?, 'unknown', ?, 0)`,
        [mealId, eventId, activePet.id, selectedFoodId, now]
      );
      await db.runAsync(
        `UPDATE food_items_cache SET last_used_at = ? WHERE id = ?`,
        [now, selectedFoodId]
      );
    }
    prependEvent({
      id: eventId,
      pet_id: activePet.id,
      event_type: selectedType!,
      occurred_at: occurredAt.toISOString(),
      severity: severity ?? null,
      notes: notes.trim() || null,
      source: 'manual',
      deleted_at: null,
      created_at: now,
      updated_at: now,
      food_item_id: selectedFoodId,
      food_brand: selectedFoodBrand,
      food_product_name: selectedFoodProduct,
      quantity: selectedFoodId ? 'unknown' : null,
    });
    setStep('complete');
    syncPendingEvents()
      .then(() => syncPendingMeals())
      .catch(console.error);
  }

  function handleBack() {
    if (step === 'type') { router.back(); return; }
    if (step === 'food' || step === 'symptom' || step === 'simple') {
      setSelectedType(null);
      setSeverity(null);
      setStep('type');
      return;
    }
    if (step === 'food-new') { setStep('food'); return; }
  }

  const petName = activePet?.name ?? 'your pet';

  // ── Completion ──────────────────────────────────────────────────────────────

  if (step === 'complete') {
    return (
      <View style={styles.completeContainer}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
        <Animated.Text style={[styles.loggedText, { opacity: checkOpacity }]}>Logged</Animated.Text>
      </View>
    );
  }

  // ── Shared sub-components ───────────────────────────────────────────────────

  function TimeRow() {
    return (
      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>
          {occurredAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
          {' · '}
          {formatTime(occurredAt)}
        </Text>
        <TouchableOpacity onPress={() => setShowTimePicker(!showTimePicker)} hitSlop={8}>
          <Text style={styles.changeTimeBtn}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function NotesInput() {
    return (
      <TextInput
        style={styles.notesInput}
        placeholder="Add a note (optional)"
        placeholderTextColor={theme.colorTextSecondary}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={300}
      />
    );
  }

  // ── Type selection ──────────────────────────────────────────────────────────

  if (step === 'type') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Log for {petName}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.typeGrid} showsVerticalScrollIndicator={false}>
          {(Object.entries(EVENT_TYPES) as [EventTypeKey, typeof EVENT_TYPES[EventTypeKey]][]).map(([key, config]) => (
            <TouchableOpacity
              key={key}
              style={styles.typeCard}
              onPress={() => handleTypeSelect(key)}
              activeOpacity={0.7}
            >
              <Text style={styles.typeIcon}>{TYPE_ICONS[key]}</Text>
              <Text style={styles.typeLabel}>{config.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Food library ────────────────────────────────────────────────────────────

  if (step === 'food') {
    const canConfirm = !!selectedFoodId;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>What did {petName} eat?</Text>
          <View style={styles.headerSpacer} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            data={foods}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.foodList}
            ListEmptyComponent={
              <Text style={styles.emptyState}>No foods in the library yet. Add one below.</Text>
            }
            renderItem={({ item }) => {
              const isSelected = item.id === selectedFoodId;
              return (
                <TouchableOpacity
                  style={[styles.foodItem, isSelected && styles.foodItemSelected]}
                  onPress={() => {
                    setSelectedFoodId(item.id);
                    setSelectedFoodBrand(item.brand);
                    setSelectedFoodProduct(item.product_name);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.foodItemName, isSelected && styles.foodItemNameSelected]}>
                    {item.product_name}
                  </Text>
                  <Text style={[styles.foodItemBrand, isSelected && styles.foodItemBrandSelected]}>
                    {item.brand}
                  </Text>
                  {isSelected && <Text style={styles.foodItemCheck}>✓</Text>}
                </TouchableOpacity>
              );
            }}
            ListFooterComponent={
              <TouchableOpacity style={styles.addFoodBtn} onPress={() => setStep('food-new')}>
                <Text style={styles.addFoodBtnText}>+ Add new food</Text>
              </TouchableOpacity>
            }
          />
          <View style={styles.bottomPanel}>
            <NotesInput />
            <TimeRow />
            {showTimePicker && (
              <DateTimePicker
                value={occurredAt}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(_e, date) => {
                  if (Platform.OS === 'android') setShowTimePicker(false);
                  if (date) setOccurredAt(date);
                }}
              />
            )}
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={styles.confirmBtnText}>Log meal</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Add new food ────────────────────────────────────────────────────────────

  if (step === 'food-new') {
    const canSave = newBrand.trim().length > 0 && newProduct.trim().length > 0;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add a food</Text>
          <View style={styles.headerSpacer} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Brand</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Royal Canin"
              placeholderTextColor={theme.colorTextSecondary}
              value={newBrand}
              onChangeText={setNewBrand}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <Text style={styles.fieldLabel}>Product name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Gastrointestinal Adult"
              placeholderTextColor={theme.colorTextSecondary}
              value={newProduct}
              onChangeText={setNewProduct}
              autoCapitalize="words"
              returnKeyType="done"
            />
            <Text style={styles.fieldLabel}>Format</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formatRow}>
              {FOOD_FORMATS.map((f) => (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.formatChip, newFormat === f.value && styles.formatChipSelected]}
                  onPress={() => setNewFormat(f.value)}
                >
                  <Text style={[styles.formatChipText, newFormat === f.value && styles.formatChipTextSelected]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.confirmBtn, !canSave && styles.confirmBtnDisabled]}
              onPress={handleNewFoodSave}
              disabled={!canSave}
            >
              <Text style={styles.confirmBtnText}>Save and continue</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Severity (symptom events) ───────────────────────────────────────────────

  if (step === 'symptom') {
    const eventLabel = selectedType ? EVENT_TYPES[selectedType].label : '';
    const canConfirm = severity !== null;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{eventLabel}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.symptomScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.severityHeading}>How severe?</Text>
            <View style={styles.severityRow}>
              {SEVERITY_CONFIG.map(({ value, label }) => {
                const isSelected = severity === value;
                const fillOpacity = 0.15 + (value - 1) * 0.175;
                return (
                  <TouchableOpacity
                    key={value}
                    style={styles.severityItem}
                    onPress={() => setSeverity(value)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.severityCircle,
                      { backgroundColor: isSelected ? theme.colorNeutralDark : `rgba(26,26,26,${fillOpacity})` },
                      isSelected && styles.severityCircleSelected,
                    ]}>
                      <Text style={[styles.severityNum, isSelected && styles.severityNumSelected]}>
                        {value}
                      </Text>
                    </View>
                    <Text style={styles.severityLabel}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.divider} />
            <NotesInput />
            <TimeRow />
            {showTimePicker && (
              <DateTimePicker
                value={occurredAt}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(_e, date) => {
                  if (Platform.OS === 'android') setShowTimePicker(false);
                  if (date) setOccurredAt(date);
                }}
              />
            )}
          </ScrollView>
          <View style={styles.bottomAction}>
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={styles.confirmBtnText}>Log {eventLabel.toLowerCase()}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Simple events (stool, other) ────────────────────────────────────────────

  if (step === 'simple') {
    const eventLabel = selectedType ? EVENT_TYPES[selectedType].label : '';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{eventLabel}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.simpleScroll} keyboardShouldPersistTaps="handled">
            <NotesInput />
            <TimeRow />
            {showTimePicker && (
              <DateTimePicker
                value={occurredAt}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(_e, date) => {
                  if (Platform.OS === 'android') setShowTimePicker(false);
                  if (date) setOccurredAt(date);
                }}
              />
            )}
          </ScrollView>
          <View style={styles.bottomAction}>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmBtnText}>
                {eventLabel === 'Other' ? 'Log event' : `Log ${eventLabel.toLowerCase()}`}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
    textAlign: 'center',
  },
  closeBtn: {
    width: 32,
    alignItems: 'flex-end',
  },
  closeBtnText: {
    fontSize: 18,
    color: theme.colorTextSecondary,
  },
  backBtn: {
    width: 32,
  },
  backBtnText: {
    fontSize: 22,
    color: theme.colorNeutralDark,
  },
  headerSpacer: {
    width: 32,
  },

  // ── Type grid ──
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: theme.space2,
    gap: theme.space2,
    justifyContent: 'space-between',
  },
  typeCard: {
    width: '47%',
    aspectRatio: 1.3,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusMedium,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space1,
  },
  typeIcon: {
    fontSize: 28,
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },

  // ── Food list ──
  foodList: {
    padding: theme.space2,
    paddingBottom: 0,
  },
  emptyState: {
    fontSize: 15,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    paddingVertical: theme.space4,
    lineHeight: 22,
  },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    marginBottom: theme.space1,
    backgroundColor: theme.colorSurface,
  },
  foodItemSelected: {
    borderColor: theme.colorNeutralDark,
    backgroundColor: theme.colorNeutralDark,
  },
  foodItemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  foodItemNameSelected: {
    color: '#fff',
  },
  foodItemBrand: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    marginRight: theme.space1,
  },
  foodItemBrandSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  foodItemCheck: {
    fontSize: 15,
    color: '#fff',
  },
  addFoodBtn: {
    paddingVertical: theme.space2,
    marginTop: theme.space1,
    alignItems: 'center',
  },
  addFoodBtnText: {
    fontSize: 15,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },

  // ── Bottom panel (food screen) ──
  bottomPanel: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    padding: theme.space2,
    gap: theme.space2,
  },

  // ── Notes input ──
  notesInput: {
    fontSize: 15,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    minHeight: 44,
    maxHeight: 88,
  },

  // ── Time row ──
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontSize: 14,
    color: theme.colorTextSecondary,
  },
  changeTimeBtn: {
    fontSize: 14,
    color: theme.colorAccent,
  },

  // ── Confirm button ──
  confirmBtn: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: theme.colorBorder,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: '#fff',
  },

  // ── New food form ──
  formScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: -theme.space1,
  },
  textInput: {
    fontSize: 16,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 48,
  },
  formatRow: {
    flexDirection: 'row',
    marginBottom: theme.space2,
  },
  formatChip: {
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    borderRadius: theme.radiusLarge,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    marginRight: theme.space1,
  },
  formatChipSelected: {
    backgroundColor: theme.colorNeutralDark,
    borderColor: theme.colorNeutralDark,
  },
  formatChipText: {
    fontSize: 14,
    color: theme.colorTextPrimary,
  },
  formatChipTextSelected: {
    color: '#fff',
  },

  // ── Severity ──
  symptomScroll: {
    padding: theme.space3,
    gap: theme.space3,
  },
  severityHeading: {
    fontSize: 22,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  severityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.space1,
  },
  severityItem: {
    alignItems: 'center',
    gap: 6,
  },
  severityCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  severityCircleSelected: {
    borderColor: theme.colorNeutralDark,
  },
  severityNum: {
    fontSize: 18,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  severityNumSelected: {
    color: '#fff',
  },
  severityLabel: {
    fontSize: 11,
    color: theme.colorTextSecondary,
    height: 16,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colorBorder,
  },

  // ── Simple events ──
  simpleScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },

  // ── Bottom action bar ──
  bottomAction: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    padding: theme.space2,
  },

  // ── Completion ──
  completeContainer: {
    flex: 1,
    backgroundColor: theme.colorSurface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space2,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colorNeutralDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkMark: {
    fontSize: 36,
    color: '#fff',
  },
  loggedText: {
    fontSize: 20,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
});
