import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import { departureWords, sentDateLabel, windowLabel, type SavedReport } from '../../lib/reportLibrary';
import { readReportsForVisit, VISIT_REPORTS_FAILED, VISIT_REPORTS_TITLE } from '../../lib/reportVisitLink';

// The reports filed under this visit (Vet report v2 PR-22, CUL-2302; spec §11.3, GAP-28).
//
// Provenance, listed: each row opens the copy exactly as sent. The section is absent until its
// read answers and absent when nothing is filed here, so a visit with no reports reads as it did
// before this row (a section that only says "none" is noise on a record screen). A failed read
// says so in one line rather than looking like an empty visit (C-12).

interface Props {
  petId: string;
  visitId: string;
  /** The booking this visit was logged from, whose filed reports belong to the visit too. */
  appointmentId: string | null;
  /** Changes whenever the host re-reads, so this section re-reads with it. */
  refreshKey?: number;
  onOpenReport: (report: SavedReport) => void;
}

export function VisitReports({ petId, visitId, appointmentId, refreshKey = 0, onOpenReport }: Props) {
  const [reports, setReports] = useState<SavedReport[] | 'failed' | null>(null);

  useEffect(() => {
    let live = true;
    void readReportsForVisit(petId, visitId, appointmentId).then((r) => {
      if (live) setReports(r);
    });
    return () => {
      live = false;
    };
  }, [petId, visitId, appointmentId, refreshKey]);

  if (reports === null || (Array.isArray(reports) && reports.length === 0)) return null;
  if (reports === 'failed') {
    return <ThemedText style={styles.failed} testID="visit-reports-failed">{VISIT_REPORTS_FAILED}</ThemedText>;
  }

  const year = new Date().getFullYear();
  return (
    <View style={styles.block} testID="visit-reports">
      <SectionLabel label={VISIT_REPORTS_TITLE} header style={styles.sectionLabel} />
      <View style={styles.rows}>
        {reports.map((r) => {
          const title = `${sentDateLabel(r.sharedAt, year)} report`;
          const sub = `${windowLabel(r.startDate, r.endDate, year)} · ${departureWords(r.sharedVia)}`;
          return (
            <TouchableOpacity
              key={r.id}
              style={styles.row}
              onPress={() => onOpenReport(r)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${sub}`}
              testID={`visit-report-${r.id}`}
            >
              <View style={styles.rowMain}>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>{title}</ThemedText>
                <ThemedText style={styles.rowSub}>{sub}</ThemedText>
              </View>
              <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// VisitDetailBody's paperwork block, so the two lists on the visit screen look alike.
const styles = StyleSheet.create({
  block: { marginTop: theme.space3 },
  sectionLabel: { marginBottom: theme.space1 },
  rows: { borderRadius: theme.radiusMedium, borderWidth: 1, borderColor: theme.colorBorder, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space1_5,
    paddingHorizontal: theme.space2,
    minHeight: theme.hitTarget,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: theme.colorTextPrimary },
  rowSub: { fontSize: theme.textXS, color: theme.colorTextSecondary },
  failed: { fontSize: theme.textSM, color: theme.colorTextSecondary, marginTop: theme.space3 },
});
