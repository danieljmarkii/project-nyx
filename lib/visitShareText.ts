import { formatVisitDate, formatVisitWeekday, formatWhereLine, type VetVisitDetail } from './vetVisits';

// *Share* on a saved visit (R8·6, CUL-2760): the visit as plain text, for the partner who
// feeds the dog too.
//
// ADDRESSED TO NO ONE, like Get ready's *Copy as text*. The system share sheet chooses the
// reader; this text never names one, never greets, never signs off, and never claims to be
// for the vet (the vet's artifact is the report). Free, always (Principle 7).
//
// IT SAYS WHAT THE RECORD SAYS AND NOTHING ELSE. Every line is a field the visit screen
// already renders, in the words that screen uses: *What the vet said* is the notes, the
// plan is the courses and trials this visit started and their status, and the recheck is
// *Recheck around {date}*: `next_visit_at` is the vet's "around", never a booking (§4.4 R2). No line is derived: no dose count, no adherence, no "booked"
// or "not booked" (whether a booking exists for that date is not on this read, and a
// shared sentence that guessed would travel further than the screen it came from). A
// visit with no notes and no plan says exactly that (paperwork may exist and is not this
// text's to summarise), rather than sharing a bare date that reads as "nothing was decided".
export function visitToPlainText(detail: VetVisitDetail, petName: string, now: Date = new Date()): string {
  const { visit } = detail;
  const where = formatWhereLine({ clinicName: visit.clinic_name, vetName: visit.vet_name });
  const heading = [petName, visit.reason?.trim() || 'vet visit', formatVisitWeekday(visit.visited_at), where]
    .filter(Boolean)
    .join(' · ');

  const blocks: string[] = [heading];

  const notes = visit.notes?.trim();
  if (notes) blocks.push(`What the vet said: ${notes}`);

  const plan: string[] = [
    ...detail.medications.map((m) =>
      [m.drugName, m.doseAmount, m.status === 'active' ? 'still on it' : 'ended'].filter(Boolean).join(' · '),
    ),
    ...detail.trials.map((t) => `${t.label} · ${t.status === 'active' ? 'trial running' : 'trial ended'}`),
  ];
  const nextVisit = visit.next_visit_at ? formatVisitDate(visit.next_visit_at, now) : '';
  if (nextVisit) plan.push(`Recheck around ${nextVisit}`);
  if (plan.length > 0) blocks.push(['The plan:', ...plan.map((line) => `• ${line}`)].join('\n'));

  if (!notes && plan.length === 0) {
    blocks.push('No notes or plan on this visit yet.');
  }

  return blocks.join('\n\n');
}
