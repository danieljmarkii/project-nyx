import { failureCode } from './uploadDiagnostics';

// The point of this helper is that one `catch` on the pet-photo path can be
// handed four unrelated error shapes, and the standing 42501 open question makes
// "the 42501 bug is back" the default misdiagnosis of any of them (CUL-193).
// So the cases below are the real shapes the providers throw, not invented ones:
// a Storage rejection reports `statusCode` as a STRING, Postgrest reports a
// non-numeric `code` and no status, and a network failure reports neither.

describe('failureCode', () => {
  it('reports a Postgrest code over the HTTP status that carries it', () => {
    // The shape behind the standing bug. `42501` is the whole answer; the `403`
    // wrapping it says nothing a reader did not already know.
    //
    // Both fields are present ON PURPOSE. A fixture carrying only `code` cannot
    // tell precedence from coincidence — reordering the reads under it changed
    // no assertion, so the sentence in this test's name was measuring nothing.
    const err = {
      name: 'PostgrestError',
      code: '42501',
      status: 403,
      message: 'new row violates row-level security policy',
    };
    expect(failureCode(err)).toBe('PostgrestError 42501');
  });

  it('reports a Storage rejection by its string statusCode', () => {
    // StorageApiError puts the HTTP status in `statusCode`, as a string, and has
    // no `code` at all — the field order in the helper is what makes this land.
    const err = { name: 'StorageApiError', statusCode: '413', message: 'Payload too large' };
    expect(failureCode(err)).toBe('StorageApiError 413');
  });

  it('reads a NUMERIC status rather than dropping it', () => {
    // The regression this pins: a `typeof v === 'string'` test alone reports
    // 'unknown' for a status that arrived as a number, which is precisely the
    // undiagnosable log line this helper was written to stop producing.
    expect(failureCode({ name: 'FetchError', status: 415 })).toBe('FetchError 415');
  });

  it('falls back to the error name when there is no code at all', () => {
    // A dropped connection: no status, no code. The name still separates it from
    // a rejection, which is the distinction the log has to carry.
    expect(failureCode(new TypeError('Network request failed'))).toBe('TypeError');
  });

  it('survives the shapes that are not errors', () => {
    // A `catch` takes whatever was thrown. None of these may produce a crash
    // inside a catch block — that would replace a bad log line with no log line.
    expect(failureCode(null)).toBe('unknown');
    expect(failureCode(undefined)).toBe('unknown');
    expect(failureCode('boom')).toBe('boom');
    expect(failureCode({})).toBe('unknown');
  });

  it('ignores an empty code field instead of reporting it', () => {
    // Present-but-useless. Falls through to the name.
    expect(failureCode({ name: 'StorageApiError', code: '' })).toBe('StorageApiError');
  });

  it('ignores a WHITESPACE-ONLY code rather than logging a trailing space', () => {
    // Split from the case above deliberately. Held in one fixture with a blank
    // `code` first, this never ran: the empty string short-circuits the field
    // scan, so the whitespace value below is never reached and dropping the trim
    // guard altogether left the suite green. The two blanks have to be probed on
    // their own field, one fixture each.
    expect(failureCode({ name: 'StorageApiError', statusCode: '  ' })).toBe('StorageApiError');
  });
});
