// The report's silhouette (D2-7 / CUL-1068): the wait for the vet report's first build,
// drawn from the round-2 archive §06 ("Current · the report, writing") with the moon off
// (round 3, Q1 — the tick is the only mark in the app). The document's own shape:
// the letterhead line, the three at-a-glance tiles, the chart block, the rows — and
// above it the one line, "Writing {pet}'s report…", with the tick breathing beside it.
// When the report lands, the blocks become the page. No night screen, no takeover.
//
// The line is real, owner-facing copy (voice: the pet's name, no exclamation); the
// blocks are hidden from assistive tech as one unit. The tick's `working` is the
// screen's own status — the request being the report generation — so the tick can
// only ever breathe while the server is being asked.
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { ThemedText } from '../../ui/ThemedText';
import { Block, Line, SilhouetteFrame } from './Silhouette';
import { Tick } from './Tick';

export const REPORT_SILHOUETTE_TEST_ID = 'design-v2-report-silhouette';

/** The subtitle stays the shipped one: it claims nothing about the window. */
export const REPORT_WAIT_SUBTITLE = 'Pulling together the full record.';

export function reportWaitTitle(petName: string | null | undefined): string {
  return petName ? `Writing ${petName}’s report…` : 'Writing the report…';
}

export interface ReportSilhouetteProps {
  petName: string | null | undefined;
  /** The generation request is in flight — the screen's `status === 'loading'`. */
  working: boolean;
}

export function ReportSilhouette({ petName, working }: ReportSilhouetteProps) {
  return (
    <View style={styles.fill}>
      <View style={styles.line} accessible accessibilityRole="progressbar">
        <Tick working={working} />
        <View style={styles.copy}>
          <ThemedText style={styles.title}>{reportWaitTitle(petName)}</ThemedText>
          <ThemedText style={styles.subtitle}>{REPORT_WAIT_SUBTITLE}</ThemedText>
        </View>
      </View>

      <SilhouetteFrame testID={REPORT_SILHOUETTE_TEST_ID} style={styles.document}>
        <Line width="44%" height={10} />
        <Line width="70%" height={8} />
        <View style={styles.tiles}>
          <Block height={44} style={styles.tile} />
          <Block height={44} style={styles.tile} />
          <Block height={44} style={styles.tile} />
        </View>
        <Block height={70} />
        <Line width="90%" height={8} />
        <Line width="84%" height={8} />
        <Line width="60%" height={8} />
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
  tiles: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  tile: {
    flex: 1,
  },
});
