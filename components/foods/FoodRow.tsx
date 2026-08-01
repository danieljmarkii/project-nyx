import { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { FORMAT_LABEL } from '../../lib/food';

interface Props {
  brand: string;
  productName: string;
  format: string;
  onPress: () => void;
  // When the row sits under a brand header (Foods-tab brand grouping, B-004
  // PR 3), the brand is already shown once above the group — so drop it from the
  // meta line and let the format stand alone ("WET"), or show nothing when the
  // format is unspecified. The brand stays in the accessibilityLabel either way,
  // so a screen reader still announces the full "<brand> <product>". Defaults to
  // showing the brand, keeping the row's standalone contract (and tests) intact.
  hideBrand?: boolean;
  // Per-active-pet intake annotation (B-004 PR 4) — a factual recency + count
  // line ("Last logged 3 days ago · 12 times") built by lib/food.foodIntakeNote.
  // null/undefined when this pet has no logged meals of the food, leaving the row
  // clean (the catalog is pet-independent; only this note keys off the active
  // pet). Appended to the accessibilityLabel so a screen reader hears it too.
  intakeNote?: string | null;
  // Reliable-favorites shelf line (B-004 PR 5) — the denominator-bearing finished
  // rate ("Finished 9 of 11 meals") built by lib/food.foodFavoriteNote. Only the
  // shelf passes it; the type-grouped list below passes intakeNote instead, so the
  // two don't co-occur in practice. Rendered with a touch more weight than the
  // muted last-logged line (it's the shelf row's point) but kept calm and factual —
  // the visible denominator, not a loud "loved!" badge (intake-is-not-preference).
  favoriteNote?: string | null;
  // Tier-1 protein disclosure (B-351 slice 4, D7/§8.5) — "Duck · also contains
  // chicken", or "Duck · ingredient list not read" when D10's completeness gate
  // fails. Built by lib/.../proteinSummaryLine, which returns null when there is
  // nothing honest to say, so the row stays clean for a library of legacy manual
  // foods rather than turning a browse into a wall of "not read".
  //
  // A PROPERTY OF THE FOOD, so it renders ABOVE the favorite/intake notes, which
  // are properties of this pet's history with it. Never a nudge and never
  // interactive — Tier 1 is informational by ruling (Principle 4); only Tier 2's
  // trial conflict escalates, and that lives on the detail screen and the
  // completion card, never here.
  proteinNote?: string | null;
  // Leading thumbnail (B-004 PR 6). The Foods tab gives every row a fixed-size
  // photo slot so the surface reads as one calm column — never the "uneven
  // empty/photo state machine" that retired thumbnails from the picker GRID (a
  // dense 2-up). The slot is consistent in every state and is NEVER a broken hole:
  //   • photoUrl present          → the photo
  //   • hasPhoto + photoLoading   → a quiet neutral tile while the signed URL resolves
  //   • otherwise (no photo/fail) → a calm "no photo" placeholder glyph
  // The screen resolves signed URLs in one batch (lib/storage.getSignedUrls) and
  // passes the result down; the row stays presentational. The thumbnail is
  // decorative — the row's accessibilityLabel already names the food — so it adds
  // no separate a11y node.
  hasPhoto?: boolean;
  photoUrl?: string | null;
  photoLoading?: boolean;
  // Diet-trial list membership (B-616 FR-2) — "Trial diet" or "Also allowed",
  // built by lib/trialLibraryChrome.trialChipLabel from the one membership
  // predicate. Null for every other food, and NULL IS THE CONTRACT: this row
  // never renders a negative chip, a grey chip, or an "off-diet" mark of any
  // kind (R1 — positive marking only; a mark's absence is not a verdict either
  // way). A row with no chip is a row saying nothing at all about the trial.
  //
  // Rendered as a trailing pill rather than a fourth line in the text stack: it
  // is a property of the trial's list, not of the food or of this pet's history
  // with it, so it sits apart from the protein/favorite/intake lines instead of
  // joining their column. Announced in the spoken label like the other notes.
  trialChip?: string | null;
}

// Full-width library row for the standalone Foods tab (B-004). Distinct from the
// 2-up FoodTile of the quick-log picker: the Foods tab is a browse/manage
// destination, so each food gets its own full-width row with room for the brand
// + format meta line and the product name, and a chevron signalling that a tap
// opens the food's detail screen (where you edit/classify it). There is no
// one-tap-log here — logging stays on the FAB picker path. The metadata line
// (BRAND · FORMAT) mirrors FoodTile's, sourced from the shared FORMAT_LABEL.
export function FoodRow({
  brand, productName, format, onPress, hideBrand = false, intakeNote, favoriteNote,
  proteinNote, hasPhoto, photoUrl, photoLoading, trialChip,
}: Props) {
  const typeLabel = FORMAT_LABEL[format] ?? '';
  const formatMeta = typeLabel.toUpperCase();
  const metaLine = hideBrand
    ? formatMeta
    : typeLabel
      ? `${brand.toUpperCase()} · ${formatMeta}`
      : brand.toUpperCase();
  // Append whichever annotation lines are present to the spoken label, so a screen
  // reader hears the favorite rate / last-logged note, not just the name.
  const spokenNotes = [trialChip, proteinNote, favoriteNote, intakeNote].filter(Boolean).join(', ');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={spokenNotes ? `${brand} ${productName}, ${spokenNotes}` : `${brand} ${productName}`}
    >
      {/* key on the URL so a re-signed URL (after expiry) remounts and clears a
          stale broken-image flag. */}
      <FoodThumbnail
        key={photoUrl ?? 'none'}
        hasPhoto={hasPhoto}
        photoUrl={photoUrl}
        photoLoading={photoLoading}
      />
      <View style={styles.text}>
        {metaLine ? (
          <Text style={styles.meta} numberOfLines={1}>
            {metaLine}
          </Text>
        ) : null}
        <Text style={styles.product} numberOfLines={2}>
          {productName}
        </Text>
        {proteinNote ? (
          <Text style={styles.protein} numberOfLines={1}>
            {proteinNote}
          </Text>
        ) : null}
        {favoriteNote ? (
          <Text style={styles.favorite} numberOfLines={1}>
            {favoriteNote}
          </Text>
        ) : null}
        {intakeNote ? (
          <Text style={styles.intake} numberOfLines={1}>
            {intakeNote}
          </Text>
        ) : null}
      </View>
      {trialChip ? (
        <View style={styles.trialChip} testID="food-row-trial-chip">
          <Text style={styles.trialChipText} numberOfLines={1}>
            {trialChip}
          </Text>
        </View>
      ) : null}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

// The leading photo slot (B-004 PR 6). One fixed-size square per row in EVERY
// state, so a photoless food never leaves a gaping hole next to a photo'd one —
// the inconsistency the May-2026 note retired the picker-grid thumbnails over.
// Local `failed` flag falls a broken/expired URL back to the placeholder rather
// than rendering a torn image; FoodRow keys this component on the URL so a fresh
// (re-signed) URL remounts and clears it.
function FoodThumbnail({
  hasPhoto, photoUrl, photoLoading,
}: Pick<Props, 'hasPhoto' | 'photoUrl' | 'photoLoading'>) {
  const [failed, setFailed] = useState(false);

  // accessible={false} on every branch keeps the slot out of the screen-reader
  // tree — the row's TouchableOpacity already carries the full spoken label, so
  // the thumbnail is purely decorative (explicit for Android TalkBack, which can
  // otherwise focus a bare Image/View; iOS already skips non-interactive images).
  if (photoUrl && !failed) {
    return (
      <Image
        testID="food-thumb-photo"
        accessible={false}
        source={{ uri: photoUrl }}
        style={styles.thumb}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  // Pending: a photo exists but its signed URL is still resolving. A quiet neutral
  // tile, NOT a spinner — a churning indicator in a scrolling list is exactly the
  // noise the grid thumbnails were retired for. Resolves to the image shortly.
  if (hasPhoto && photoLoading) {
    return <View testID="food-thumb-pending" accessible={false} style={[styles.thumb, styles.thumbBlank]} />;
  }
  // No photo (a typed/manual food or an older row) or the URL was unavailable
  // (offline, expired, deleted object) → a calm, intentional "no photo" placeholder.
  // Lucide ImageOff on the current icon system — not the legacy 📷 emoji.
  return (
    <View testID="food-thumb-placeholder" accessible={false} style={[styles.thumb, styles.thumbBlank, styles.thumbPlaceholder]}>
      <ImageOff size={20} color={theme.colorTextDisabled} strokeWidth={1.75} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    // ≥44pt tap target; the whole row navigates (the chevron is decorative).
    minHeight: 64,
    backgroundColor: theme.colorSurface,
  },
  // Leading photo slot — fixed size in every state so rows stay column-aligned
  // whether or not a food has a photo. colorNeutralLight backs the Image so there's
  // no white flash before pixels paint.
  thumb: {
    width: 44,
    height: 44,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  thumbBlank: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  meta: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWidest,
  },
  product: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    lineHeight: 20,
  },
  // Per-pet intake annotation, below the product name. Sentence-case secondary
  // text — distinct from the all-caps tracked tertiary format eyebrow above the
  // name, so the two meta lines don't read as the same thing.
  intake: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  // Reliable-favorite line (the shelf row's salient point). A touch more weight
  // than the last-logged intake line, but the same calm secondary color — the
  // visible denominator carries the meaning, not a loud accent (intake ≠ preference).
  favorite: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  // Tier-1 protein line. Tertiary colour — quieter than the pet-specific intake
  // note below it, because it is context rather than a finding.
  protein: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  // The trial-list pill. Same tinted accent pair as the trial strip above it, so
  // the two read as one piece of trial context rather than as two unrelated
  // marks — and quiet: a small tinted pill, never a filled accent badge. It is a
  // label, not an alert, and it must not out-shout the food's own name.
  trialChip: {
    flexShrink: 0,
    maxWidth: 104,
    backgroundColor: theme.colorAccentLight,
    borderRadius: theme.radiusFull,
    paddingHorizontal: theme.space1,
    paddingVertical: 3,
  },
  trialChipText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextTertiary,
  },
});
