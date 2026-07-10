import {
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
  });

  it('keeps the legal links gated OFF until the hosted docs are live (spec §D5)', () => {
    expect(LEGAL_LINKS_ENABLED).toBe(false);
  });
});
