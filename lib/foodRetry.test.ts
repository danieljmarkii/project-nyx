import { foodCapCopy } from '../constants/monetizationCopy';
import {
  RETRY_CAP_TITLE,
  RETRY_READING_OFF_NOTICE,
  RETRY_TRANSPORT_NOTICE,
  RETRY_UNAVAILABLE_NOTICE,
  retryNoticeOf,
} from './foodRetry';

const row = (granted: boolean) => ({ granted, copyVersion: 'v', source: 'settings', decidedAt: '2026-10-12T00:00:00Z' });

describe('retryNoticeOf (CUL-769): every outcome but a read that ran is said', () => {
  it('a transport fault says try again, whatever the consent', () => {
    expect(retryNoticeOf({ kind: 'transport_error' }, row(false))).toBe(RETRY_TRANSPORT_NOTICE);
    expect(retryNoticeOf({ kind: 'transport_error' }, undefined)).toBe(RETRY_TRANSPORT_NOTICE);
  });
  it('the cap carries the shipped cap copy for its period', () => {
    expect(retryNoticeOf({ kind: 'answered', gate: { kind: 'cap_reached', cap: 'monthly', resetsAt: null } }, row(true))).toEqual({
      title: RETRY_CAP_TITLE,
      body: foodCapCopy('monthly'),
    });
  });
  it('feature_disabled names the setting only under a recorded no', () => {
    const gate = { kind: 'feature_disabled' } as const;
    expect(retryNoticeOf({ kind: 'answered', gate }, row(false))).toBe(RETRY_READING_OFF_NOTICE);
    expect(retryNoticeOf({ kind: 'answered', gate }, row(true))).toBe(RETRY_UNAVAILABLE_NOTICE);
    expect(retryNoticeOf({ kind: 'answered', gate }, null)).toBe(RETRY_UNAVAILABLE_NOTICE);
    expect(retryNoticeOf({ kind: 'answered', gate }, undefined)).toBe(RETRY_UNAVAILABLE_NOTICE);
  });
  it('a read that ran says nothing: the row it wrote is the answer', () => {
    expect(retryNoticeOf({ kind: 'answered', gate: { kind: 'ok' } }, row(true))).toBeNull();
  });
  it('no notice carries an exclamation mark', () => {
    for (const n of [RETRY_TRANSPORT_NOTICE, RETRY_READING_OFF_NOTICE, RETRY_UNAVAILABLE_NOTICE]) {
      expect(`${n.title} ${n.body}`).not.toContain('!');
    }
  });
});
