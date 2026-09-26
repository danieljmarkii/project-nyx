// The pets the engine replay may read (CUL-1314, PMD-12).
//
// export.sql runs through the Supabase MCP's `execute_sql`, which is the service role:
// RLS does not apply, so nothing in the database stops a session from exporting any
// owner's pet. Pairing the id with an owner email (C-27) stops a typo, not a session
// handed a customer's pair (the critique's GAP-25: a beta tester reports a false alarm,
// and a session replays her record into its context and the page it produces).
//
// The rule, until the privacy policy and the App Store label name an evaluation purpose
// (PMD-12, CUL-1313): every evaluation input is the PM's own pet or a synthetic record.
// This list is that rule, and it is enforced twice:
//   · export.sql's CTEs match only these ids, so an unlisted pet comes back as
//     `subjects: 0` and none of its rows leave the database;
//   · subject.ts refuses to replay any other pet id, so a hand-edited query still stops
//     at the loader.
// subject.test.ts fails the build when the two CTEs and this list disagree.
//
// Adding a pet is a reviewed PR. Another owner's pet waits for CUL-1313's notice; a
// consent "no" outranks the list.

export interface EvaluationSubject {
  petId: string
  name: string
  owner: 'pm'
}

export const EVALUATION_SUBJECTS: readonly EvaluationSubject[] = [
  { petId: 'bf7b196e-6db1-4a34-af34-f1759d380042', name: 'Nyx', owner: 'pm' },
  { petId: '892f29cb-fdc7-4add-a374-bc082e028825', name: 'Schrodingers Cat', owner: 'pm' },
]
