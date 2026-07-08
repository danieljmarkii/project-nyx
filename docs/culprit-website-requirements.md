# Culprit — Web Presence Requirements

**Created:** 2026-07-08 · **Status:** Build-ready DRAFT — awaiting PM ratification of the §3 decisions (all recommend-and-proceed) and the §12 open calls.
**Owner lenses:** Dir. of Engineering (stack/hosting/DNS), Trust & Safety / Privacy (legal pages, email, analytics), Sr. Product Designer + `nyx-voice` (landing content), PM (positioning, pre-launch state).

**What this is:** the build-ready spec for standing up `getculprit.app` — a branded Culprit landing page plus the support / privacy / terms pages the App Store submission requires, plus email on the domain.

**Where it fits in the existing plan:** this is the elevated realization of **B-273** ("live web presence") = **step 3 of `docs/app-store-submission-guide.md`**. It also consumes **step 2** (the legal docs — B-229 privacy / B-230 terms / B-270 disclaimer — which this site *hosts*) and shares a DNS surface with **step 4** (production SMTP — B-152). The guide's original step 3 assumed a bare GitHub Pages/Carrd page with no custom domain; the PM's purchase of `getculprit.app` (Cloudflare Registrar, 2026-07-08) upgrades it to a real branded site. This spec supersedes the guide's step-3 "pick a host" note.

---

## 1. Goal & scope

**Two jobs, deliberately separated so polish never blocks the gate:**

- **Job A — unblock App Store submission (required).** App Review *visits* the Support URL, and the listing *requires* a Privacy Policy URL. We need three URLs that resolve to real pages with a contact path: `getculprit.app/support`, `/privacy`, `/terms`. This is the actual submission gate (steps 3 + 15).
- **Job B — a real Culprit landing page (brand).** A single-page site that explains what Culprit is, in the brand voice, pre-launch. Not required to submit, but the PM wants "at least a landing page," and the domain deserves more than a bare legal stub.

**In scope:** domain/DNS/TLS wiring on Cloudflare; hosting; the landing page; the three legal/support pages; email on the domain (receiving + sending); SEO/social meta; privacy-respecting analytics; the in-app link wiring that step 3 already specced.

**Out of scope (this pass):** the actual legal *copy* (that's step 2 / B-229/B-230/B-270 — this site hosts it, doesn't write it); a blog/CMS; e-commerce; account portal; localization; a marketing waitlist with stored emails (deferred — §12, B-275); Universal Links / `apple-app-site-association` deep-linking (future, noted §8).

### 1.1 What you might be missing — flagged (per the PM's ask)

| # | Flag | Where handled |
|---|---|---|
| 1 | **Brand hygiene: zero "Nyx" anywhere public.** The repo, app, and all internal docs are still "Nyx"; the public brand is **Culprit**. Every string, meta tag, email address, and asset on this domain must say Culprit. | §6.4 (B-274) |
| 2 | **"Email" is two different things.** A *support/contact address you receive at* (for the App Store contact + user help) is separate from *sending transactional mail* (Supabase auth emails). Both live on this domain but use different mechanisms. | §5 |
| 3 | **The submission gate ≠ the landing page.** Only the 3 resolving URLs + a contact path are *required*. The marketing landing is brand, not gate — build so the gate can go live even if the marketing copy is still cooking. | §1, §10 |
| 4 | **The legal pages depend on step 2.** `/privacy` and `/terms` are empty shells until the B-229/B-230 drafting pass produces content. The site *shell* can ship first; content drops in when step 2 lands. | §9 |
| 5 | **Social share card.** When someone texts/DMs `getculprit.app`, it should unfurl a branded Open Graph card, not a naked URL. Needs one OG image asset. | §7 |
| 6 | **Analytics ↔ privacy policy coupling.** Any analytics we add must be disclosed in the privacy policy and in the App Privacy label (B-268). Going cookieless avoids a cookie-consent banner entirely. | §3 D5, §5 |
| 7 | **Account-deletion is web-visible.** Apple looks kindly on a web-accessible deletion path. Deletion is in-app (B-039); the support page should still say so and offer an email fallback. | §6.2, §8 |
| 8 | **Go-live badge swap.** Pre-launch the page must NOT show a dead "Download on the App Store" button. It shows "Coming soon"; we swap to the real badge + link the day the app is approved. | §3 D4, §10 |

---

## 2. Required vs. nice-to-have (so nothing over-blocks)

| Element | Required to submit? | Notes |
|---|---|---|
| `/support` resolves, names the app, has a contact email | **Yes** | App Review visits it. Minimum bar is genuinely low. |
| `/privacy` resolves with a real policy | **Yes** | Listing field is mandatory; must match the B-268 label. |
| `/terms` resolves | Expected | Standard; pairs with the onboarding acceptance line. |
| Branded landing page (hero, positioning) | No | Job B — brand. |
| Support/contact email on the domain | Effectively yes | The support page needs *a* contact address; `support@getculprit.app` is the on-brand one. |
| SEO/OG meta, analytics, waitlist | No | Polish; sequence after the gate is live. |

---

## 3. Architecture decisions (recommend-and-proceed — flagged for PM ratification)

| ID | Decision | Recommendation | Why |
|---|---|---|---|
| **D1** | Hosting | **Cloudflare Pages** | The domain + DNS already live at Cloudflare, so Pages is one dashboard, auto-wired DNS, free, automatic HTTPS, and per-PR preview deploys. Supersedes the guide's GitHub Pages/Carrd suggestion (made before the domain purchase). Deploys straight from the site repo on push. |
| **D2** | Framework | **Astro** | Static, ships zero JS by default (fast, calm — on brand vs Calm/Oura), and it renders Markdown → pages natively, so the step-2 legal `.md` docs become `/privacy` and `/terms` with almost no glue. Lighter and more appropriate than Next.js for a content landing; more maintainable than hand-rolled HTML. |
| **D3** | Repo | **New separate public repo `culprit-web`** | A static marketing site and an Expo app are different stacks with different deploy targets; mixing them in `project-nyx` is friction. Public is required for some free hosts and is harmless for a marketing site (no secrets). **PM action:** create the repo and grant this session's tooling access (current GitHub scope is `project-nyx` only — see §13). |
| **D4** | Pre-launch state | **Branded landing in "coming soon" state + live `/support` `/privacy` `/terms`** | The app isn't approved yet, so no App Store badge (a dead badge is worse than none). Lead with positioning + "Coming soon to the App Store"; swap in the real badge at launch. The legal/support pages go fully live now (they're the gate). |
| **D5** | Analytics | **Cloudflare Web Analytics** (cookieless) | Free, privacy-respecting, no cookie-consent banner required, and philosophically on-brand for a health app. Must still be named in the privacy policy. Avoid GA4 (cookies → consent banner → contradicts the Trust & Safety posture). |

None of D1–D5 is load-bearing enough to block on; proceeding on the recommendations unless overruled.

---

## 4. Domain, DNS & TLS

- **Registrar:** Cloudflare (purchased 2026-07-08). Because it's Cloudflare Registrar, **DNS is already on Cloudflare** — no nameserver move needed.
- **Custom domain on Pages:** bind `getculprit.app` (apex) to the Pages project; redirect `www.getculprit.app` → apex (or vice-versa — pick one canonical host and 301 the other).
- **TLS/HTTPS:** automatic (Cloudflare universal SSL + Pages). `.app` is on the HSTS preload list, so HTTPS is forced everywhere by design — no config, and no plain-HTTP endpoints ever (a permanent, accepted trait of `.app`).
- **DNS records created across this work:** the Pages CNAME/route (auto), plus the email records in §5.4. All managed in the Cloudflare dashboard.

---

## 5. Email on the domain

The PM's ask ("an email address for App Store contact and support") is **§5.1**. There's an adjacent need the submission guide already tracks (**§5.2**, step 4) — documented here so the DNS is set up once, coherently.

### 5.1 Receiving / support mail — Cloudflare Email Routing (free)

- **Mechanism:** Cloudflare **Email Routing** — forwards inbound mail on the domain to an existing inbox (the PM's Gmail). Free, no mailbox to run, set up in the Cloudflare dashboard.
- **Addresses (recommended):**
  - `support@getculprit.app` → the **App Store Connect support contact** + the user-facing help address. This is the one that must exist for Job A.
  - `privacy@getculprit.app` → the "contact us" address named in the privacy policy (data/GDPR requests). Can also just be `support@` if the PM prefers one inbox.
  - `hello@getculprit.app` → general/press (optional).
- All forward to the PM's Gmail; a catch-all can bounce or forward per preference.

### 5.2 Sending / transactional mail — Supabase auth via SMTP (this is step 4 / B-152)

- Supabase sends account-confirmation and password-reset emails. The built-in service is rate-limited (testing only). Production needs a real SMTP provider — **Resend** is the guide's default.
- Verifying `getculprit.app` as a sending domain in Resend adds DKIM/SPF records (§5.4). Sender address: `noreply@getculprit.app` (or `hello@`).
- **This spec's only job here** is to note that the sending-domain DNS records live at Cloudflare alongside §5.1, so they're added together. The provider choice + Supabase config remain **step 4 / B-152** (PM action).

### 5.3 Replying *as* support@ (minor, flag)

Cloudflare Email Routing is **receive-only** — you can read `support@` mail in Gmail but can't natively *reply from* that address. Options: (a) Gmail "Send mail as" through an SMTP relay (Resend/Brevo) so replies come from `support@getculprit.app`; (b) reply from personal Gmail initially and add "send-as" later. Not a launch blocker. → §12 open call.

### 5.4 DNS records summary (all at Cloudflare)

| Record | Purpose | Set up during |
|---|---|---|
| MX + Cloudflare routing TXT | Receive mail (Email Routing) | §5.1 (PM, now) |
| SPF (TXT) | Authorize senders | §5.1 auto + §5.2 |
| DKIM (TXT/CNAME) | Sign outbound (Resend) | §5.2 (step 4) |
| DMARC (TXT) | Anti-spoof policy (`p=none` to start, tighten later) | §5.1/§5.2 |

---

## 6. Site content & structure (Designer + `nyx-voice`)

**Visual system:** inherit the app's design language for brand continuity — the `constants/theme.ts` palette (teal accent `#00C2A8` on grayscale, no decorative colour), **Geist** body / **Newsreader** display, generous whitespace, Calm/Oura restraint. The site is the owner's first impression of the brand; it must feel like the app.

**Voice:** run all copy through `nyx-voice`. Marketing register is warmer/broader than in-app microcopy but the invariants hold — no exclamation marks, plain language over jargon, and **no medical/diagnostic claims** (read against Guideline 1.4.1: Culprit helps you *track and notice*, it does not diagnose or treat).

### 6.1 Landing page (`/`)

1. **Hero** — the Culprit wordmark; a one-line value prop built on the name ("Find the culprit behind your pet's symptoms" / the trigger food or pattern); a calm sub-line naming the wedge (owners on a diet trial or symptom watch); **pre-launch CTA** = "Coming soon to the App Store" (no dead badge — D4).
2. **The problem** — vets can't diagnose what they can't measure; owners fail to track because tools ask too much. (The core insight from CLAUDE.md, in owner language.)
3. **How it works** — three beats: *log in seconds* → *see the trend* → *hand your vet a clinical-grade report*. Mirror the real product (Signal / Patterns / vet report).
4. **Pets > $** — core logging, health alerts, trends, and the vet report are always free. State it plainly; it's a brand differentiator, not fine print.
5. **Footer** — links to `/support`, `/privacy`, `/terms`; `support@getculprit.app`; "© 2026 Culprit"; (post-launch) the App Store badge.

### 6.2 Support page (`/support`)

Minimum bar for App Review, done warmly: what Culprit is (one sentence); how to get help → `support@getculprit.app`; a short FAQ (optional); and an **account-deletion note** — "You can delete your account and all its data anytime in the app: Settings → … . Or email us and we'll handle it." (Deletion is B-039, in-app; this makes it web-visible — §8.)

### 6.3 Legal pages (`/privacy`, `/terms`, disclaimer)

- Render the **step-2** documents (B-229 privacy, B-230 terms, B-270 veterinary disclaimer). The disclaimer can be its own page or a section within terms.
- The privacy policy must name processors (**Supabase**, **Anthropic**), describe deletion (B-039) and retention, and **stay consistent with the App Privacy label (B-268)** — a mismatch is a rejection trigger.
- Until step 2 lands, these are shells (D4) — see sequencing (§9).

### 6.4 Brand hygiene (B-274) — hard requirement

No public surface may say "Nyx": not the title bar, meta tags, OG image, email addresses, copy, or filenames a user could see. Everything is **Culprit**. (Internal repo/doc references to "Nyx" are fine — low external visibility, per B-274.)

---

## 7. SEO / social / meta

- `<title>` + meta description (Culprit-branded, wedge-oriented, no medical claims).
- **Open Graph + Twitter card** tags + one **1200×630 OG image** (design asset — Culprit wordmark on brand background) so shared links unfurl a card.
- Favicon set (from the app icon, re-exported — no "Nyx" in the filename served).
- `robots.txt` (allow) + `sitemap.xml` (trivial in Astro).

---

## 8. App Store integration points

| ASC field (step 15) | Value |
|---|---|
| Support URL | `https://getculprit.app/support` |
| Privacy Policy URL | `https://getculprit.app/privacy` |
| Marketing URL (optional) | `https://getculprit.app` |

- **Consistency gate:** `/privacy` content must match the B-268 App Privacy questionnaire answers (same processors, same data categories). One factual base, two surfaces.
- **Account deletion:** in-app (B-039) satisfies Guideline 5.1.1(v); the §6.2 web note is the recommended belt-and-suspenders.
- **Future (noted, not scoped):** the domain can later host `/.well-known/apple-app-site-association` for Universal Links — `.app`'s forced HTTPS makes this clean. Backlog if/when deep linking is built.

---

## 9. Dependencies & sequencing

- **Independent, startable now:** repo creation (D3), Astro scaffold + brand tokens, Cloudflare Pages deploy + custom domain (§4), landing page (§6.1), support page (§6.2), email routing (§5.1), SEO/analytics (§7, §3 D5).
- **Gated on step 2 (legal drafting):** the *content* of `/privacy`, `/terms`, disclaimer (§6.3). The page *shells* ship first; content drops in when B-229/B-230/B-270 land.
- **Gated on step 4 (B-152):** the §5.2 sending-domain records (Resend provisioning is PM/step 4).
- **The in-app link wiring** (replace the `signup.tsx` "on its way" stubs with real `getculprit.app/...` links via `expo-linking`) is the guide's step-3 **Claude part** — it lives in `project-nyx`, runs after the URLs are live + step 2 is merged, and is a separate PR from the site build.
- **Go-live swap:** "Coming soon" → App Store badge, the day the app is approved.

---

## 10. Build plan

The **site code lives in the new `culprit-web` repo**, so its build "PRs" are there. This requirements doc, the guide/backlog/STATUS updates ride in `project-nyx` (this session's PR).

| Phase | Where | Work |
|---|---|---|
| **0 — PM setup** | Cloudflare + GitHub | Create `culprit-web` repo (D3); set up Email Routing `support@`/`privacy@` → Gmail (§5.1). (Resend = step 4.) |
| **1 — Shell + gate** | `culprit-web` | Astro scaffold + brand tokens; deploy to Pages on `getculprit.app`; landing (coming-soon state) + `/support` live; `/privacy` `/terms` as shells. **Job A gate can go green here** (support + a placeholder privacy that's replaced in Phase 2). |
| **2 — Content + polish** | `culprit-web` | Drop step-2 legal content into `/privacy` `/terms`/disclaimer; SEO/OG image; Cloudflare Web Analytics. |
| **3 — In-app + launch** | `project-nyx` | Wire real in-app links (guide step 3 Claude part); at approval, swap coming-soon → App Store badge. |

Phases 1–2 are independent of the app repo and can run as their own sessions once the repo exists.

---

## 11. Cost

| Item | Cost |
|---|---|
| Domain `getculprit.app` | ~$15/yr (already purchased) |
| Cloudflare Pages hosting | $0 |
| Cloudflare Email Routing (receive) | $0 |
| Cloudflare Web Analytics | $0 |
| Resend (transactional, step 4) | $0 (free tier) |
| **Ongoing total** | **~$15/yr** (domain only) |

vs. a Squarespace-style bundle at ~$200–280/yr. The decoupled approach holds.

---

## 12. Open decisions for PM

1. **D1–D5** (§3): ratify or overrule. Defaults proceed if silent.
2. **Waitlist / email capture on the landing page?** Adds a form + somewhere to store addresses + a privacy-policy line. Recommendation: **defer** — a "coming soon" + `support@` contact is enough for v1; revisit if pre-launch demand-collection becomes a goal. → backlog **B-275**.
3. **Reply-as-`support@`** (§5.3): set up Gmail "send-as" now, or reply from personal until launch? Recommendation: **defer** to a send-as setup once Resend exists (step 4).
4. **Canonical host:** apex `getculprit.app` (recommended) vs `www.` — pick one; the other 301-redirects.

---

## 13. PM action items

- [ ] **Create the `culprit-web` GitHub repo** (public) and grant this session access, or authorize `add_repo` for it — current GitHub scope is `project-nyx` only, so the site can't be scaffolded until the repo exists. — *unblocks Phase 1.*
- [ ] **Cloudflare Email Routing:** enable on `getculprit.app`; route `support@` (and optionally `privacy@`/`hello@`) → your Gmail. — *provides the App Store support contact (§5.1).*
- [ ] **Step 4 / B-152 (adjacent):** provision Resend, verify `getculprit.app` as a sending domain (adds DKIM/SPF at Cloudflare), configure Supabase SMTP. — *tracked separately; noted here so the DNS is coherent.*
- [ ] **Confirm the §12 decisions** (or accept defaults).

---

## Persona sign-off

- **Dir. of Engineering** — stack (Astro/Cloudflare Pages) is the low-maintenance, secret-free, free-tier path; separate repo keeps the app stack clean. DNS/TLS is automatic on `.app` at Cloudflare.
- **Trust & Safety / Privacy** — cookieless analytics (no consent banner), privacy page must mirror the B-268 label and name Supabase + Anthropic, web-visible deletion note. The legal *content* is gated on step 2 — this spec hosts, doesn't author.
- **Sr. Product Designer + `nyx-voice`** — the site inherits the app's design system and voice; no medical claims (Guideline 1.4.1); no exclamation marks; Culprit, never Nyx.
- **Sr. Product Manager** — separates the submission gate (3 URLs) from the brand landing so neither blocks the other; pre-launch state avoids a dead App Store badge.
