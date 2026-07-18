import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ArrowUp, ArrowLeft, Plus } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { usePetStore } from '../store/petStore';
import { useIsOnline } from '../hooks/useIsOnline';
import { useAskStore } from '../store/askStore';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { Skeleton } from '../components/ui/Skeleton';
import { AskChip } from '../components/ask/AskChip';
import { AskAnswerCard } from '../components/ask/AskAnswerCard';
import {
  askQuestion,
  loadAskSuggestions,
  buildOfflineDeflection,
  isSymptomShapedQuestion,
  formatResetLabel,
  type AskNav,
  type AskSuggestions,
} from '../lib/ask';
import { askCapCopy } from '../constants/monetizationCopy';

// Ask — the client surface (B-228, PR A5; requirements §3, §4, §9.3). Owner-initiated
// Q&A over THIS pet's own record. States: fresh (chips-first) → thinking (whorl +
// shaped skeleton) → answer (answer-first card) → capped (calm band + navigation) →
// offline (designed, online-only exception) → empty-record (designed, Principle 5).
//
// The conversation lives in useAskStore (D8): it survives every in-app navigation,
// including the provenance tap-through this screen fires — so tapping "Open the event",
// looking, and coming back lands on the SAME conversation, never a fresh one. The store
// ends it only on background / idle / explicit-new (the ＋ in the header).
//
// The model never runs on-device: this screen sends the question + the prior in-memory
// turns to the `ask` Edge Function and renders the typed answer it returns. Every number
// shown was built server-side from a deterministic tool result (§5.4).

// Verbatim §6.5 disclosure — T&S's sign-off on the D2 boundary was conditional on THIS
// exact line shipping with A5. Do not paraphrase.
const POLICY_LINE =
  'Answers use your logged data — including your notes, and photos when your question needs them.';

export default function AskScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const online = useIsOnline();

  const messages = useAskStore((s) => s.messages);
  const thinking = useAskStore((s) => s.thinking);
  const capped = useAskStore((s) => s.capped);
  const disabled = useAskStore((s) => s.disabled);
  const lastQuestion = useAskStore((s) => s.lastQuestion);
  const focusPet = useAskStore((s) => s.focusPet);
  const startNew = useAskStore((s) => s.startNew);
  const pushQuestion = useAskStore((s) => s.pushQuestion);
  const resolveAnswer = useAskStore((s) => s.resolveAnswer);
  const resolveCapped = useAskStore((s) => s.resolveCapped);
  const resolveDisabled = useAskStore((s) => s.resolveDisabled);

  const petId = activePet?.id ?? null;
  const petName = activePet?.name ?? 'your pet';

  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<AskSuggestions>({ total: 0, chips: [] });
  const scrollRef = useRef<ScrollView>(null);

  // On focus: re-scope the conversation to the active pet (resets on a pet switch or an
  // idle timeout, D8) and (re)load the data-aware suggested chips from local SQLite.
  useFocusEffect(
    useCallback(() => {
      focusPet(petId);
      if (petId) setSuggestions(loadAskSuggestions(petId, petName));
    }, [petId, petName, focusPet]),
  );

  // Keep the newest message in view as the conversation grows / a think starts.
  useEffect(() => {
    if (messages.length > 0 || thinking) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
      return () => clearTimeout(t);
    }
  }, [messages.length, thinking]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || thinking || !petId) return;
      setInput('');

      // Snapshot the PRIOR turns before the optimistic push — the server takes the new
      // question separately and `conversation` as prior context only (D8/D9).
      const prior = useAskStore.getState().askTurns();
      pushQuestion(question);

      // Online-only (§3.2): offline, don't burn a round-trip — answer with the honest,
      // designed llm_unavailable deflection immediately (never an error toast).
      if (!online) {
        resolveAnswer(buildOfflineDeflection(petName));
        return;
      }

      const res = await askQuestion({ petId, question, conversation: prior });
      if (!res.ok) {
        resolveAnswer(buildOfflineDeflection(petName));
        return;
      }
      if ('answer' in res) resolveAnswer(res.answer);
      else if ('capped' in res) resolveCapped(res.capped);
      else resolveDisabled();
    },
    [thinking, petId, online, petName, pushQuestion, resolveAnswer, resolveCapped, resolveDisabled],
  );

  const goTapThrough = useCallback((nav: AskNav) => {
    // In-app navigation — the store keeps the conversation alive across it (D8).
    if (nav.pathname === '/insights') router.push('/insights');
    else router.push({ pathname: nav.pathname, params: nav.params });
  }, []);

  // `disabled` (flag flipped off server-side mid-session) is an EXCLUSIVE state — it must
  // not compose on top of an inviting fresh/chips view (that reads as "ask me… but you
  // can't"). fresh/empty only apply when the feature is on and there's no conversation.
  const fresh = messages.length === 0 && !capped && !disabled;
  const emptyRecord = fresh && suggestions.total === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header — back, the "Ask" title + pet scope, and the explicit new-conversation ＋. */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={22} color={theme.colorTextPrimary} strokeWidth={1.75} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Ask</Text>
          <Text style={styles.headerPet} numberOfLines={1}>{petName}</Text>
        </View>
        {messages.length > 0 || capped ? (
          <TouchableOpacity onPress={startNew} hitSlop={10} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="New conversation">
            <Plus size={22} color={theme.colorTextPrimary} strokeWidth={1.75} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {disabled ? (
            <Text style={styles.disabledLine}>Ask isn't available on this account right now.</Text>
          ) : emptyRecord ? (
            <EmptyRecord petName={petName} onLog={() => router.push('/log')} />
          ) : fresh ? (
            <FreshState
              petName={petName}
              chips={suggestions.chips}
              online={online}
              onAsk={send}
            />
          ) : (
            <Conversation
              petName={petName}
              onAsk={send}
              onTapThrough={goTapThrough}
              thinking={thinking}
            />
          )}

          {capped ? (
            <CapBand
              petName={petName}
              grain={capped.grain}
              cap={capped.cap}
              resetsAt={capped.resets_at}
              symptomShaped={isSymptomShapedQuestion(lastQuestion ?? '')}
              onNavigate={goTapThrough}
            />
          ) : null}
        </ScrollView>

        {/* Input — hidden when capped (chips degrade to navigation, §9.3) or the flag is
            off. Offline shows a quiet, honest line and disables sending. */}
        {!capped && !disabled ? (
          <View style={styles.inputZone}>
            {!online ? (
              <Text style={styles.offlineLine}>Ask needs a connection — {petName}'s record is still all here.</Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={`Ask about ${petName}…`}
                placeholderTextColor={theme.colorTextDisabled}
                value={input}
                onChangeText={setInput}
                editable={!thinking}
                onSubmitEditing={() => send(input)}
                returnKeyType="send"
                multiline
                maxLength={1000}
              />
              {/* Offline, send is NOT disabled — it produces the same honest offline
                  deflection a tapped chip does (both explain "Ask needs a connection"),
                  so the two controls never disagree about whether Ask is reachable
                  (pm-review). Only an empty input or an in-flight ask disables it. */}
              <TouchableOpacity
                style={[styles.send, (!input.trim() || thinking) && styles.sendDisabled]}
                onPress={() => send(input)}
                disabled={!input.trim() || thinking}
                accessibilityRole="button"
                accessibilityLabel="Send question"
              >
                <ArrowUp size={18} color={theme.colorTextOnDark} strokeWidth={2.25} />
              </TouchableOpacity>
            </View>
            {fresh ? <Text style={styles.policy}>{POLICY_LINE}</Text> : null}
            {/* The free-tier conversation meter ("N of 3 left this month", §9.3) belongs
                here, under the input. It is deliberately NOT shown in A5: the flag is
                allowlist-gated to the UNCAPPED experiment tier (§9.2), so there is no
                finite count to meter — and the server exposes no running total, only the
                boundary (cap_reached). It lights up when Track-3 wires the free-tier caps
                + surfaces the count; rendering a fabricated "3 of 3" now would be a lie. */}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Fresh state (mock §2) ──────────────────────────────────────────────────────────
function FreshState({
  petName,
  chips,
  online,
  onAsk,
}: {
  petName: string;
  chips: string[];
  online: boolean;
  onAsk: (q: string) => void;
}) {
  return (
    <View style={styles.freshWrap}>
      <Text style={styles.promise}>
        Anything in {petName}'s record — counts, trends, foods, meds. I'll show my sources.
      </Text>
      {!online ? (
        <Text style={styles.offlineNote}>Ask needs a connection to answer — {petName}'s record is still all here to look through.</Text>
      ) : null}
      <View style={styles.chipStack}>
        {chips.map((c, i) => (
          <AskChip key={`${c}-${i}`} label={c} block onPress={() => onAsk(c)} />
        ))}
      </View>
    </View>
  );
}

// ── Empty-record state (designed, Principle 5) ──────────────────────────────────────
function EmptyRecord({ petName, onLog }: { petName: string; onLog: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyHeadline}>Once a few days are logged, I'll have things to answer.</Text>
      <Text style={styles.emptyDetail}>
        Ask reads from {petName}'s own record — counts, trends, foods, meds. Log a meal or a symptom and I'll have something honest to say.
      </Text>
      <AskChip label={`Log something for ${petName}`} variant="accent" onPress={onLog} />
    </View>
  );
}

// ── Conversation (user bubbles + answer cards + thinking) ───────────────────────────
function Conversation({
  petName,
  onAsk,
  onTapThrough,
  thinking,
}: {
  petName: string;
  onAsk: (q: string) => void;
  onTapThrough: (nav: AskNav) => void;
  thinking: boolean;
}) {
  const messages = useAskStore((s) => s.messages);
  return (
    <View style={styles.convo}>
      {messages.map((m) =>
        m.role === 'user' ? (
          <View key={m.id} style={styles.qPill}>
            <Text style={styles.qText}>{m.text}</Text>
          </View>
        ) : (
          <AskAnswerCard key={m.id} body={m.body} petName={petName} onAsk={onAsk} onTapThrough={onTapThrough} />
        ),
      )}
      {thinking ? <Thinking petName={petName} /> : null}
    </View>
  );
}

// ── Thinking (mock §2) — whorl + honest narration + card-shaped skeleton ────────────
function Thinking({ petName }: { petName: string }) {
  return (
    <View style={styles.thinkingCard}>
      <View style={styles.thinkingHead}>
        <WhorlSpinner size="sm" ground="day" />
        {/* Honest for every question type — a recall/weight question isn't "counting"
            (Principle 5: narration names the real step, and we don't know the plan yet). */}
        <Text style={styles.thinkingText}>Reading {petName}'s record…</Text>
      </View>
      <View style={styles.skelStack}>
        <Skeleton width="85%" height={14} />
        <Skeleton width="60%" height={14} />
        <Skeleton width="100%" height={56} radius={theme.radiusSmall} />
      </View>
    </View>
  );
}

// ── Cap band (mock §6, §16.1 rules) ─────────────────────────────────────────────────
function CapBand({
  petName,
  grain,
  cap,
  resetsAt,
  symptomShaped,
  onNavigate,
}: {
  petName: string;
  grain: 'conversation' | 'message';
  cap: 'daily' | 'monthly';
  resetsAt: string;
  symptomShaped: boolean;
  onNavigate: (nav: AskNav) => void;
}) {
  const copy = askCapCopy({ grain, cap, resetLabel: formatResetLabel(cap, resetsAt), petName, symptomShaped });
  return (
    <View style={styles.capWrap}>
      <View style={styles.capBand}>
        <Text style={styles.capPrimary}>{copy.primary}</Text>
        {copy.care ? <Text style={styles.capCare}>{copy.care}</Text> : null}
      </View>
      <Text style={styles.capNavLabel}>These still open directly:</Text>
      <View style={styles.capNav}>
        <AskChip label="Patterns" onPress={() => onNavigate({ pathname: '/insights' })} />
        <AskChip label="History" onPress={() => router.push({ pathname: '/(tabs)/history', params: { date: 'today', ts: String(Date.now()) } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  flex: { flex: 1 },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
  },
  headerPet: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 1,
  },

  scroll: { padding: theme.space3, gap: theme.space2, paddingBottom: theme.space3, flexGrow: 1 },

  // ── Fresh ──
  freshWrap: { gap: theme.space2 },
  promise: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
  },
  chipStack: { gap: theme.space1, marginTop: theme.space1 },
  offlineNote: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
  },

  // ── Empty record ──
  emptyWrap: { gap: theme.space2, paddingTop: theme.space4 },
  emptyHeadline: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    lineHeight: 28,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  emptyDetail: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
  },

  // ── Conversation ──
  convo: { gap: theme.space3 },
  qPill: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: theme.colorSurfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    borderBottomRightRadius: theme.radiusXS,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  qText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
  },

  // ── Thinking ──
  thinkingCard: {
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
  },
  thinkingHead: { flexDirection: 'row', alignItems: 'center', gap: theme.space1 },
  thinkingText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  skelStack: { gap: theme.space1, marginTop: theme.space2 },

  // ── Cap band ──
  capWrap: { gap: theme.space1, marginTop: theme.space1 },
  capBand: {
    backgroundColor: theme.colorAccentLight,
    borderWidth: 1,
    borderColor: theme.colorAccentSoft,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
  },
  capPrimary: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  capCare: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  capNavLabel: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
  },
  capNav: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space1 },

  disabledLine: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    paddingTop: theme.space3,
  },

  // ── Input ──
  inputZone: {
    paddingHorizontal: theme.space3,
    paddingTop: theme.space1,
    paddingBottom: theme.space2,
    gap: theme.space1,
    backgroundColor: theme.colorNeutralLight,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space1 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    borderRadius: theme.radiusLarge,
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space2,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colorAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: theme.colorBorderStrong },
  offlineLine: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
  policy: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
});
