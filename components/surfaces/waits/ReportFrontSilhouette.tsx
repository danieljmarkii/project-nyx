// The v2 Front Page's silhouette (Vet report v2 PR-17, CUL-2297; spec §10.2, §14 "Building"): the
// preview's wait, drawn from the phone layout's own order: the masthead (eyebrow, name, the
// signalment lines, the scope line), then the band slot when the composer's outline reported a
// live flag, then the lead chart. It is the page the owner is about to read, so the blocks become
// the page when it lands (MOT-2: never a blank frame).
//
// THE BAND SLOT IS A SHAPE, NOT A CLAIM. It draws only on the outline's positive answer (`flags`);
// `none`, `incomplete` and an outline never read draw no slot, because a slot that appears and
// then vanishes reads as a flag withdrawn. It carries no colour and no words: the band's words are
// the document's, and the document prints them (BRK-1).
//
// The line under the tick is the shipped `ReportSilhouette` copy, so the wait reads the same on
// both layouts. The blocks are hidden from assistive tech as one unit.
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { ThemedText } from '../../ui/ThemedText';
import { REPORT_WAIT_SUBTITLE, reportWaitTitle } from './ReportSilhouette';
import { Block, Line, SilhouetteFrame } from './Silhouette';
import { Tick } from './Tick';

export const REPORT_FRONT_SILHOUETTE_TEST_ID = 'report-v2-front-silhouette';
export const REPORT_FRONT_BAND_SLOT_TEST_ID = 'report-v2-front-silhouette-band';

export interface ReportFrontSilhouetteProps {
  petName: string | null | undefined;
  /** The generation request is in flight. */
  working: boolean;
  /** The composer outline reported a live flag (`live.state === 'flags'`); false otherwise. */
  bandSlot: boolean;
}

export function ReportFrontSilhouette({ petName, working, bandSlot }: ReportFrontSilhouetteProps) {
  return (
    <View style={styles.fill}>
      <View style={styles.line} accessible accessibilityRole="progressbar">
        <Tick working={working} />
        <View style={styles.copy}>
          <ThemedText style={styles.title}>{reportWaitTitle(petName)}</ThemedText>
          <ThemedText style={styles.subtitle}>{REPORT_WAIT_SUBTITLE}</ThemedText>
        </View>
      </View>

      <SilhouetteFrame testID={REPORT_FRONT_SILHOUETTE_TEST_ID} style={styles.document}>
        <Line width="30%" height={8} />
        <Line width="46%" height={18} />
        <Line width="92%" height={8} />
        <Line width="78%" height={8} />
        <Line width="60%" height={8} />
        {bandSlot && (
          <View testID={REPORT_FRONT_BAND_SLOT_TEST_ID} style={styles.band}>
            <Line width="52%" height={10} />
            <Line width="88%" height={8} />
            <Line width="70%" height={8} />
          </View>
        )}
        <Line width="84%" height={8} />
        <Block height={96} />
        <Line width="90%" height={8} />
      </SilhouetteFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    padding: theme.space3,
    gap: theme.space3,
    backgroundColor: theme.colorSurface,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1 + theme.spaceMicro,
  },
  copy: {
    flex: 1,
    gap: theme.spaceMicro,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  document: {
    gap: theme.space1 + theme.spaceMicro,
  },
  // The band's frame: the document's box, drawn as a hairline so it is a slot, never a signal.
  band: {
    gap: theme.space1,
    padding: theme.space1 + theme.spaceMicro,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    borderRadius: theme.radiusSmall,
  },
});
