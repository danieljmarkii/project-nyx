import {
  DISCLAIMER_URL,
  LEGAL_LINKS_ENABLED,
  PRIVACY_POLICY_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
} from './links';

// These are load-bearing external strings (a wrong support address silently drops
// every "Contact support" mail; a wrong legal path 404s an App Review visit), and
// LEGAL_LINKS_ENABLED gates a store-submission concern — so pin them explicitly.
describe('constants/links', () => {
  it('routes support to the one Culprit inbox', () => {
    expect(SUPPORT_EMAIL).toBe('support@getculprit.app');
  });

  it('points legal links at the canonical getculprit.app paths (web-presence spec)', () => {
    expect(PRIVACY_POLICY_URL).toBe('https://getculprit.app/privacy');
    expect(TERMS_URL).toBe('https://getculprit.app/terms');
    expect(DISCLAIMER_URL).toBe('https://getculprit.app/disclaimer');
  });

  it('keeps the legal links ON now the hosted docs are live (5.1.1(i) — flipped 2026-07-16)', () => {
    expect(LEGAL_LINKS_ENABLED).toBe(true);
  });
});
