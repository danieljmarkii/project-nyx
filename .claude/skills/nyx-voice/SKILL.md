---
name: nyx-voice
description: Use this skill when writing or reviewing any owner-facing copy in Nyx — any string a pet owner (Jordan, Sam) will read on screen or in a notification. Triggers include editing an empty state, a nudge, a home-screen Signal/Today/Trend string, a health-flag or AI read label, a button or action label, an error/alert message, a toast, an onboarding line, or any `Text`/`Alert.alert`/notification copy; adding a new event type or structured-observation label; writing the read text or recommendation copy for a per-incident AI feature; or porting copy into a sibling analysis function. Loads Nyx's voice rules — first-person-pet/second-person-owner, specific-over-generic, no exclamation marks, designed empty states, plain language over jargon, and warm-not-nagging nudges — grounded in the strings already shipped in `components/home/`, `components/event/`, and `constants/`. For the clinical no-reassure asymmetry behind AI read copy, defer to the `clinical-guardrails` skill; this skill covers the voice, that one covers the safety invariant.
---

# Nyx Voice — Owner-Facing Copy

## Origin and Scope

The canonical rules live in two places: the Sr. Product Designer's **Copy standards** in CLAUDE.md, and the **Copy Principles** + **Voice and Tone** sections of `docs/nyx-design-principles-v1_0.md` (lines 143, 167–179, and Principle 4 at 86–96). This skill is the code-grounded version: every rule below points at a string already shipped in the app so the next contributor can copy the register by example, not re-derive it from adjectives.

The voice, in one line from the design doc (`:175`): *"the register of a smart, caring friend who happens to know about veterinary medicine."* Not a pet brand ("fur babies"), not a medical record tool ("emesis"). Calm, considered, quietly confident (`:143`).

**Out of scope:**
- The **clinical no-reassure asymmetry** behind AI read text and recommendation enums — that's the `clinical-guardrails` skill. This skill covers how those strings *sound*; that one covers what they're *forbidden to assert*. Pattern 6 below is the seam.
- The **vet report** register (SOAP-note, clinical-grade, Dr. Chen's lens). The vet report is deliberately *not* in the owner voice — it's a separate audience. If/when a `vet-report-clinical` skill exists, it owns that.

---

## PATTERN 1: First Person for the Pet, Second Person for the Owner

**RULE:** The pet is the subject, by name. Address the owner as "you." Never "your pet" when a name exists, never "the pet," never third-person about the owner. When the name is genuinely unavailable, the fallback is `'your pet'` (second person) — not `'the pet'` or `'this pet'`. Using the pet's name is what creates the emotional stakes that make a nudge land (`design-principles:179`).

**CANONICAL EXAMPLE** (`components/home/SignalZone.tsx:14`, the fallback; `:21` the in-copy use):

```ts
const petName = activePet?.name ?? 'your pet';   // second-person fallback, never 'the pet'
// ...
<Text style={styles.intro}>
  Keep logging and {petName}'s first pattern will surface in about a week.
</Text>
```

And in the nudge (`components/home/TodayZone.tsx:54`):

```tsx
Nothing logged yet — how's {petName} doing?
```

**ANTI-PATTERN:** `"Your pet hasn't been logged today"` (generic, no stakes), `"The pet's pattern will surface…"` (clinical distance), or any string that talks *about* the owner in the third person. If you find yourself writing "the user" or "the pet" in a visible string, you've slipped out of voice. Always thread `petName` through; always default it to `'your pet'`.

---

## PATTERN 2: Specific Over Generic — Numbers, Dates, Foods

**RULE:** Owner-facing insight copy names the thing: the percentage, the day, the food, the window. Specificity is what makes Jordan trust the app; generic copy reads as filler (`design-principles:171`). "Vomiting is down 60% since Tuesday," never "things are improving."

**CANONICAL EXAMPLE** (`components/home/SignalZone.tsx:8–9`, the shipped preview insights that set the bar for the real Step 10 Signal):

```ts
const PREVIEW_INSIGHTS = [
  "Vomiting dropped 60% in the two weeks after switching proteins — the diet trial appears to be working.",
  "Itching tends to peak 3–6 hours after meals containing chicken. No reaction to salmon-based foods.",
];
```

Each names a magnitude (60%, 3–6 hours), an anchor (switching proteins, chicken), and a bounded claim. The hedge ("appears to be working") is doing honest work, not softening into vagueness.

**ANTI-PATTERN:** `"Things are looking better"`, `"Some improvement this week"`, `"Mochi's doing great"`. Generic praise is both un-trustworthy and, for a health surface, quietly unsafe — it implies a wellness judgement the data may not support (see Pattern 6). If you can't be specific, say what's still being gathered (Pattern 3), don't fill space with a platitude.

---

## PATTERN 3: Empty States Are Designed, Forward-Looking Copy — Never Blank, Never a Placeholder

**RULE:** Every empty state — first open, nothing logged today, not enough data for a chart — is a trust-building moment, because that's when the owner is most uncertain about the product (`design-principles:102`). It must be warm, honest, and forward-looking: name what's coming and what to do to get there. Never a blank space, never "No data," never a broken chart, never "Coming soon."

**CANONICAL EXAMPLE** (`components/home/TrendZone.tsx:42–46`):

```tsx
function EmptyState({ petName }: { petName: string }) {
  return (
    <Text style={styles.emptyText}>
      A few more days of logs and we'll be able to show {petName}'s pattern.
    </Text>
  );
}
```

And the Signal empty state (`components/home/SignalZone.tsx:21`) tells the owner *when* the payoff arrives and *what it will look like* (it renders example insights below the intro):

```tsx
Keep logging and {petName}'s first pattern will surface in about a week.
```

**ANTI-PATTERN:** `"No data yet"`, an empty `View`, a zeroed-out chart with no copy, or `"Check back later"`. Each of these is the blank moment the principle exists to prevent. An empty state that doesn't (a) name what's being built and (b) point forward is not done.

---

## PATTERN 4: No Exclamation Marks, No Manufactured Enthusiasm

**RULE:** Nyx does not shout and does not celebrate aggressively (`design-principles:143`). No exclamation marks to manufacture enthusiasm — this is a CLAUDE.md copy standard, not a stylistic preference. The register is calm and quietly confident throughout, including success and completion states.

**CANONICAL EXAMPLE:** the rule is enforced as a *test assertion* in the AI read path (`supabase/functions/analyze-vomit/index.test.ts:255`):

```ts
assertEquals(t.includes('!'), false);
```

Every shipped owner-facing string in `components/home/` and `components/event/VomitAnalysisSection.tsx` holds to this — none ends in `!`. Match that.

**ANTI-PATTERN:** `"Logged! 🎉"`, `"Great job!"`, `"Mochi's all caught up!"`. Enthusiasm-by-punctuation is the pet-brand voice the product explicitly rejects. A completion state can be satisfying without shouting — see the brief, quiet confirmation the quick-log uses (`design-principles:195`).

---

## PATTERN 5: Plain Language, Not Medical Jargon — Translate at the UI Boundary

**RULE:** Jordan knows "vomiting," not "emesis" (CLAUDE.md, Pet Owner — Jordan). Every clinical term gets a plain-language label at the display boundary. Structured fields that an AI or schema stores in clinical form must be mapped to owner-readable labels before rendering. This was a shipped B-027 `[Now]` fix (plain-language observation labels).

**CANONICAL EXAMPLE** (`components/event/VomitAnalysisSection.tsx:48–63`, the label maps that translate stored enum values into owner copy):

```ts
// stored value            → owner-facing label
black_coffee_ground:      'Black',
partially_digested_food:  'Partly digested food',
coffee_ground:            'Dark / older blood',   // not "coffee-ground emesis"
mucoid_slimy:             'Slimy',
```

And at the event-type level (`constants/eventTypes.ts:4`), the schema value `diarrhea` surfaces to the owner as the plain label `'Loose stool'`:

```ts
diarrhea: { label: 'Loose stool', /* ... */ },
```

**ANTI-PATTERN:** Rendering a raw enum or a clinical term directly — `"emesis"`, `"coffee-ground"`, `"anorexia"`, `"lethargy"` shown verbatim without a friendlier label, or `{row.consistency}` piped straight into a `Text`. The clinical term may be the stored truth and may even belong in the *vet report* (different audience) — but the owner surface always gets the translation.

---

## PATTERN 6: Health Flags Surface Clearly, Without Alarm — and Never Reassure

**RULE:** Surface a health concern clearly, but without spiking anxiety before the data justifies it (CLAUDE.md copy standards: "No alarm language for health flags"). The forward-looking label, not the all-clear: the verdict copy must never assert wellness. This is the *copy face* of the `clinical-guardrails` n=1 asymmetry — read that skill for the enum/floor enforcement; this pattern is the wording rule.

**CANONICAL EXAMPLE** (`components/event/VomitAnalysisSection.tsx:67–69`):

```ts
const REC_LABEL: Record<Recommendation, string> = {
  worth_a_call: 'Worth a call',
  monitor: 'Keep an eye out',          // forward-looking, NOT 'All clear'
  not_enough_to_say: 'Not enough to say yet',
};
```

`'Keep an eye out'` surfaces the state honestly and points forward. It is not `'All clear'`, not `'Looks fine'`, not `'No concern'` — absence of a visible flag is not wellness.

**ANTI-PATTERN (two failure modes):**
- *Alarm:* `"⚠️ URGENT: Mochi may be seriously ill"`, red-alert phrasing, or anything that spikes anxiety before the data earns it.
- *False reassurance:* `"All clear"`, `"Mochi looks fine"`, `"Nothing to worry about"`. This is a clinical regression, not just an off-voice line — route any proposed wellness-asserting label to PM and do not merge. The `clinical-guardrails` skill (Patterns 1 + 8) is the binding authority; this is the voice-side restatement so the rule is caught at copy-review time too.

---

## PATTERN 7: The Nudge Is Warm, Not Nagging — Specific, One a Day

**RULE:** A nudge sounds like a thoughtful friend, never a DAU metric (`design-principles:96`). It is specific to what happened, not a generic reminder, and there is at most one a day (Principle 4). The test (`design-principles:96`): read it aloud — does it sound like a caring friend or a PM chasing engagement? If the latter, rewrite.

**CANONICAL EXAMPLE** — the in-app nudge (`components/home/TodayZone.tsx:54`) is specific and warm, and it *vanishes the moment anything is logged* (`design-principles:77`):

```tsx
Nothing logged yet — how's {petName} doing?
```

The aspirational push-notification bar (`design-principles:93`) ties the nudge to the actual event:

```
"Luna vomited at 2am — she had a snack 20 minutes earlier. Want to note what it was?"
```

**ANTI-PATTERN:** `"Don't forget to log today!"` (`design-principles:93` names this exact line as the thing not to do — generic, nagging, exclamation-marked, all three failures at once). Also anti-pattern: more than one nudge a day, a red badge/dot instead of a sentence (`design-principles:77`), or a streak-pressure framing ("Don't break your 6-day streak").

---

## PATTERN 8: Error and Degradation Copy Stays in Voice — Honest, Calm, Points to an Action

**RULE:** Failure states are owner-facing copy too. They name what happened in plain language, stay calm (no stack traces, no error codes, no alarm), and point at the next action — including, when health is in question, the vet. A failure must never silently degrade into reassurance (Pattern 6).

**CANONICAL EXAMPLE** — the photo-unreadable fallback in the AI read path (`supabase/functions/analyze-vomit/index.ts`, cited in `clinical-guardrails` Pattern 5):

```ts
readText = `I couldn't read this photo — it may be too large or in a format I can't open. ` +
  `Try replacing it with a fresh shot and I'll take another look. ` +
  `If you're worried about ${petName}, your vet is the best call.`;
```

Plain cause, a concrete recovery (replace the photo), and the honest health backstop (your vet) — never "couldn't read it, probably fine." User-action alerts follow the same register (`components/event/VomitAnalysisSection.tsx:151`): `Alert.alert('Could not update', 'Try again in a moment.')` — calm, plain, actionable.

**ANTI-PATTERN:** Surfacing a raw error (`Alert.alert('Error', err.message)` with a 400/JWT string), an exclamation-marked alarm (`"Upload failed!"`), or a degradation that reassures to fill the gap. Error copy is held to the same voice bar as everything else — and to the Pattern 6 no-reassure rule on any health-adjacent surface.

---

## Ambiguities Flagged

Gaps between what this skill asserts and what the code currently enforces. Left open for PM decision rather than silently "fixed."

1. **The voice rules are tested only on the AI read path.** Pattern 4's no-`!` assertion and Pattern 6's no-reassure regex live in `analyze-vomit/index.test.ts`. No equivalent guard exists for the home-zone strings, empty states, or alerts — they hold to voice by authorship, not by test. A lightweight option: a copy lint/test that scans rendered string literals in `components/` for `!` and the reassurance vocabulary. Worth a backlog row if copy drift becomes real; not obviously worth the maintenance now.

2. **Model-emitted `read_text` is unguarded for voice, not just for reassurance.** `clinical-guardrails` Ambiguity #1 already flags that the model's own `read_text` isn't regex-checked for reassurance. The same gap applies to *voice*: the model could emit an exclamation mark or a jargon term ("emesis") in the clean-photo path, and nothing catches it before display. If a post-call check is added for reassurance, fold the `!` and jargon checks into the same pass.

3. **No central copy module.** Strings live inline in each component (`SignalZone`, `TodayZone`, `VomitAnalysisSection`, …). That's fine at MVP scale and keeps copy next to context, but it means voice consistency is enforced by review, not structure, and there's no single place to audit tone or to localize later. If a `lib/copy.ts` or i18n layer is ever introduced, these patterns become its style guide. Not a defect — a scaling note.

4. **Jargon translation (Pattern 5) is per-surface and hand-maintained.** Each component owns its own label map. A new structured field added to `event_ai_analysis` won't get a plain-language label automatically — the mapping has to be added wherever it's rendered. When the per-incident AI generalizes across types (stool, skin, eye — `clinical-guardrails` Ambiguity #4), the label maps should generalize with it, or new clinical enum values will leak to owners raw.
