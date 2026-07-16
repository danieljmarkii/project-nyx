// Outbound links + the legal-links gate for the "You"/settings surface (B-283).
// One discoverable home so the support address and the (not-yet-live) legal URLs
// have a single source of truth, and the flip point for the legal links is obvious.

// Where "Contact support" and "Share feedback" compose their mailto (spec §D6/§D8).
// One inbox: feedback is disambiguated by a [Feedback] subject tag (Cloudflare
// routing), so there is no separate feedback@ address to maintain.
export const SUPPORT_EMAIL = 'support@getculprit.app';

// Hosted legal docs (canonical paths from the web-presence spec,
// docs/culprit-website-requirements.md §6.3). Live at getculprit.app since
// 2026-07-16 (B-273/229/230/270 hosting).
export const PRIVACY_POLICY_URL = 'https://getculprit.app/privacy';
export const TERMS_URL = 'https://getculprit.app/terms';
export const DISCLAIMER_URL = 'https://getculprit.app/disclaimer';

// ON since 2026-07-16 — the hosted docs above are live (verified 200s). While this
// was off, the Privacy/Terms rows rendered a non-interactive "Coming soon" rather
// than linking to a dead URL — App Review visits these, so a 404 is worse than an
// honest not-yet (spec §D5). The gate stays in the code so a hosting outage or a
// staging build can flip the rows back to honest-inert without a re-layout.
export const LEGAL_LINKS_ENABLED = true;
