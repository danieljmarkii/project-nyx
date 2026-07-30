// Pure SQL for the event-photo reads — kept in an I/O-free module (no
// expo-sqlite import) so the ordering can be exercised against an in-memory
// SQLite in jest, following lib/foodQueries.ts. lib/db.ts imports these strings;
// eventAttachmentQueries.test.ts runs them for real against node:sqlite.
//
// The ordering here is the READ half of the B-105 fix, and it is load-bearing
// rather than cosmetic.
//
// Every row this app writes has sort_order = 0 — nothing sets it — so the
// original `ORDER BY sort_order ASC LIMIT 1` left the winner entirely to
// SQLite's rowid. That is why replacing an event's photo could appear not to
// take: the replacement row was inserted, correctly, and the read kept handing
// back its predecessor.
//
// The tiebreakers make the order TOTAL and point it at the NEWEST row:
//
//   • created_at DESC — the replace semantic. Both writers stamp ISO-8601 UTC
//     (locally new Date().toISOString(), on hydration the server's created_at),
//     and ISO-8601 UTC sorts lexicographically, so this is a genuine recency
//     order rather than a string coincidence.
//   • id DESC — reachable only on identical timestamps. Present so the order is
//     total rather than merely usually-decisive; an arbitrary-but-STABLE answer
//     is what stops the hero flickering between two rows across reads.
//
// sort_order stays the primary key of the sort so a future multi-photo event
// keeps its intended sequence; recency only breaks ties within a rank.
//
// This ordering is also what makes the write half safe in the two windows the
// client cannot close (see lib/attachments.ts): a remote row resurrected by an
// insert-if-absent hydration, or a late upsert from an upload that was already
// in flight when its row was replaced, is always OLDER than the row that
// replaced it and therefore can never win this read. And because it is a read
// fix, it repairs installs that already accumulated duplicates under the old
// behaviour on sight — no replace, and no migration, required.
export const EVENT_ATTACHMENT_ORDER = 'ORDER BY sort_order ASC, created_at DESC, id DESC';

const EVENT_ATTACHMENT_COLS = 'id, local_uri, storage_path, mime_type';

/** The single photo an event renders. */
export const EVENT_ATTACHMENT_QUERY =
  `SELECT ${EVENT_ATTACHMENT_COLS} FROM event_attachments
    WHERE event_id = ? ${EVENT_ATTACHMENT_ORDER} LIMIT 1`;

/**
 * Every attachment row on an event, newest-first — the replace path's input, so
 * it can sweep the rows it supersedes (including any left behind by the old
 * behaviour). Deliberately unbounded: seeing the duplicates is the point.
 */
export const EVENT_ATTACHMENTS_QUERY =
  `SELECT ${EVENT_ATTACHMENT_COLS} FROM event_attachments
    WHERE event_id = ? ${EVENT_ATTACHMENT_ORDER}`;
