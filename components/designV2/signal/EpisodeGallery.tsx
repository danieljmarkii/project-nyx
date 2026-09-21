import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import type { GalleryTile, SignalScreenEpisodes } from '../../../lib/signalScreen';
import { getSignedUrl } from '../../../lib/storage';
import { REC_LABEL } from '../../event/VomitAnalysisSection';
import { ThemedText } from '../../ui/ThemedText';

// EpisodeGallery — the photographed episodes on the Signal's screen (D2-3 · CUL-1065;
// design authority `docs/culprit-design-v4-mockups.html` §03 "The episodes · 21, nine
// photographed").
//
// EACH TILE CARRIES ITS OWN READ, IN THE SHIPPED WORDS. `REC_LABEL` is imported from the
// per-incident read that wrote the verdict, never restated, so "Keep an eye out" here is
// the same "Keep an eye out" on the record. There is no summary line, no "the other
// three": Dr. Chen's round-3 finding is that an aggregate over reads reassures, and the
// model has no field to put one in. A tile with no read says "No read yet" — the absence
// of a verdict is never wellness.
//
// A tile is a door to its record (`app/event/[id]`), where the photo is the hero and the
// read is in full — the incident spec's D1: a photographed episode lands on its record.
//
// The photos are the owner's own record, served exactly as the record screen serves
// them: the on-device file when it is still there, else a signed URL from the private
// bucket (RLS-scoped, one-hour TTL), transformed to a tile — never a public URL, never
// cached anywhere new (T&S).
//
// The spoken label is the whole tile in one sentence — "Sep 17, 5:11 PM, photographed,
// read as Keep an eye out" — so VoiceOver hears the date, the time and the read (§06,
// Trust & Safety: gallery tiles need spoken labels).
//
// A haptic never belongs here: this file paints `worth_a_call`, and it is named in
// `guards/haptics.test.ts`'s ALWAYS_SCANNED (proven by mutation on CUL-1065).

const BUCKET = 'nyx-event-attachments';
const SIGNED_URL_TTL_SEC = 60 * 60;
/** A square tile transform — a few tens of KB, not the multi-MB original (B-207's rule). */
const TILE_TRANSFORM = { width: 320, height: 320, resize: 'cover' as const };
/** "No read yet" — an episode whose photo has no verdict on the record (pending, failed,
 *  or never read). Said, never blank: a missing word under a photo reads as "nothing found". */
export const NO_READ_LABEL = 'No read yet';

export function verdictWord(verdict: GalleryTile['verdict']): string {
  return verdict ? REC_LABEL[verdict] : NO_READ_LABEL;
}

/** The tile in one sentence, for the screen reader. */
export function tileA11yLabel(tile: GalleryTile): string {
  const when = tile.timeWord ? `${tile.dateWord}, ${tile.timeWord}` : tile.dateWord;
  return tile.verdict ? `${when}, photographed, read as ${verdictWord(tile.verdict)}` : `${when}, photographed, ${NO_READ_LABEL.toLowerCase()}`;
}

interface Props {
  episodes: SignalScreenEpisodes;
}

export function EpisodeGallery({ episodes }: Props) {
  return (
    <View testID="episode-gallery">
      <View style={styles.header}>
        <ThemedText style={styles.title} accessibilityRole="header">
          The episodes
        </ThemedText>
        <ThemedText style={styles.count} testID="episode-count-line">
          {episodes.countLine}
        </ThemedText>
      </View>
      {episodes.tiles.length > 0 ? (
        <View style={styles.grid}>
          {episodes.tiles.map((tile) => (
            <Tile key={tile.eventId} tile={tile} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Tile({ tile }: { tile: GalleryTile }) {
  const [uri, setUri] = useState<string | null>(tile.photo.localUri);
  useEffect(() => {
    if (tile.photo.localUri) {
      setUri(tile.photo.localUri);
      return;
    }
    let cancelled = false;
    getSignedUrl(BUCKET, tile.photo.storagePath, SIGNED_URL_TTL_SEC, TILE_TRANSFORM)
      .then((url) => {
        if (!cancelled) setUri(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tile.photo.localUri, tile.photo.storagePath]);

  return (
    <Pressable
      onPress={() => router.push(`/event/${tile.eventId}`)}
      accessibilityRole="button"
      accessibilityLabel={tileA11yLabel(tile)}
      accessibilityHint="Opens this episode's record"
      style={styles.tile}
      testID={`episode-tile-${tile.eventId}`}
    >
      <View style={styles.photoWell}>
        {uri ? <Image source={{ uri }} style={styles.photo} accessibilityIgnoresInvertColors /> : null}
      </View>
      <ThemedText style={styles.date} numberOfLines={1}>
        {tile.dateWord}
      </ThemedText>
      {/* The read, in the record's own words. `worth_a_call` takes the symptom INK — text
          on a light ground (C-1), never the bright glyph tint. */}
      <ThemedText
        style={[styles.verdict, tile.verdict === 'worth_a_call' ? styles.verdictCall : null]}
        numberOfLines={2}
        testID={`episode-verdict-${tile.eventId}`}
      >
        {verdictWord(tile.verdict)}
      </ThemedText>
    </Pressable>
  );
}

const TILE_WIDTH = '23%';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space1,
    marginBottom: theme.space1,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  count: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Adjacent doors (C-5): no slop on the tiles, so the gap is the whole separation.
    columnGap: theme.space1,
    rowGap: theme.space2,
  },
  tile: {
    width: TILE_WIDTH,
    minHeight: 44,
  },
  photoWell: {
    aspectRatio: 1,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurfaceSubtle,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  date: {
    marginTop: theme.space0_5,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  verdict: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
  },
  verdictCall: {
    color: theme.colorEventSymptomInk,
  },
});
