import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colorRoles, theme } from '../../constants/theme';
import { PrimaryButton, SectionLabel, ThemedText } from '../ui';
import { PHOTO_THUMB_SIZE } from '../ui/PhotoThumb';
import { useSheetCap } from '../../hooks/useLayoutClass';
import { toLocalDayKey } from '../../lib/utils';
import {
  PHOTO_PICKER_NOTE,
  normaliseLeftOut,
  photoFlagLine,
  photoRowTitle,
  type ReportPhoto,
} from '../../lib/reportPhotoPicker';
import { readPickerThumbs } from '../../lib/reportPhotoThumbs';

// Vet report v2 PR-23b (CUL-2454; R-10, spec §5.9): leave any photo out before sending.
//
// ONE RE-RENDER, ON DONE. A toggle changes only this sheet's draft; the report on screen is
// untouched until Done, which hands the whole choice back once. Closing any other way (the scrim,
// the system back) keeps the choice the report was built with. Whether Done rebuilds is the
// screen's call (`leftOutChanged`), so an unchanged Done costs nothing.
//
// A flagged photo is marked and can still be left out: the flag prints either way, with a dated
// line beside it, so the choice never removes a warning. Thumbnails are the phone's own copy, or a
// short-lived URL signed through the owner's own session; the server never sends one (R7).

export interface PhotoLeaveOutSheetProps {
  visible: boolean;
  photos: readonly ReportPhoto[];
  /** The choice the report on screen was built with. */
  leftOut: readonly string[];
  onDone: (leftOut: string[]) => void;
  onClose: () => void;
}

export function PhotoLeaveOutSheet({ visible, photos, leftOut, onDone, onClose }: PhotoLeaveOutSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetCap = useSheetCap();
  const [draft, setDraft] = useState<Set<string>>(() => new Set(leftOut));
  const [thumbs, setThumbs] = useState<Map<string, string>>(() => new Map());

  // Every opening starts from the report as built, never from an abandoned draft.
  useEffect(() => {
    if (visible) setDraft(new Set(leftOut));
  }, [visible, leftOut]);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    readPickerThumbs(photos.map((p) => p.attachmentId)).then((m) => {
      if (!cancelled) setThumbs(m);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, photos]);

  const todayKey = toLocalDayKey(new Date());
  const toggle = (id: string) =>
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const sending = photos.length - normaliseLeftOut(photos, draft).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close without changes" />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }, sheetCap]}
          accessibilityViewIsModal
          testID="photo-leave-out-sheet"
        >
          <View style={styles.grabber} />
          <SectionLabel label="Photos in this report" header style={styles.title} />
          <ThemedText style={styles.note}>{PHOTO_PICKER_NOTE}</ThemedText>
          <ScrollView style={styles.list} bounces={false}>
            {photos.map((p, i) => {
              const out = draft.has(p.attachmentId);
              const title = photoRowTitle(p, todayKey);
              const flag = photoFlagLine(p.safety);
              const uri = thumbs.get(p.attachmentId);
              return (
                <TouchableOpacity
                  key={p.attachmentId}
                  testID={`photo-row-${p.attachmentId}`}
                  style={[styles.row, i === photos.length - 1 && styles.rowLast]}
                  onPress={() => toggle(p.attachmentId)}
                  activeOpacity={0.7}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: !out }}
                  accessibilityLabel={`${title}${flag ? `. ${flag}` : ''}. ${out ? 'Left out' : 'Sending'}`}
                  accessibilityHint={out ? 'Sends this photo with the report' : 'Leaves this photo out of the report'}
                >
                  {uri ? (
                    <Image source={{ uri }} style={[styles.thumb, out && styles.thumbOut]} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <View style={styles.rowText}>
                    <ThemedText style={styles.rowTitle}>{title}</ThemedText>
                    {flag ? <ThemedText style={styles.rowFlag}>{flag}</ThemedText> : null}
                  </View>
                  <ThemedText style={out ? styles.stateOut : styles.stateIn}>{out ? 'Left out' : 'Sending'}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <PrimaryButton
            label={sending === photos.length ? 'Done' : `Done · sending ${sending} of ${photos.length}`}
            onPress={() => onDone(normaliseLeftOut(photos, draft))}
            testID="photo-leave-out-done"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: theme.space1,
    paddingHorizontal: theme.space3,
    gap: theme.space1,
    maxHeight: '85%',
  },
  grabber: {
    width: theme.space4,
    height: theme.space1 / 2,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: theme.space1,
  },
  title: {
    marginBottom: 0,
  },
  note: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: theme.hitTarget,
    paddingVertical: theme.space1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  thumb: {
    width: PHOTO_THUMB_SIZE,
    height: PHOTO_THUMB_SIZE,
    borderRadius: theme.radiusSmall,
  },
  thumbOut: {
    opacity: 0.4,
  },
  thumbEmpty: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  rowFlag: {
    fontSize: theme.textXS,
    color: colorRoles.concern.textOnLight,
  },
  stateIn: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  stateOut: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
});
