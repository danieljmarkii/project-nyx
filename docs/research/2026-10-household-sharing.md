# Household sharing: what pet apps ship, what other caregiving products learned, and what owners say

**Date:** 2026-10-14 · **Issue:** [CUL-1935](https://linear.app/projectnyx/issue/CUL-1935) (discovery; build issue [CUL-194](https://linear.app/projectnyx/issue/CUL-194)) · **Scope:** US market

**Method.** Two isolated web sweeps run in parallel on 2026-10-14, each under the evidence rule below:
- **Pet apps:** 43 live US App Store listings (iTunes Lookup), 2,585 US reviews from 11 apps (the iTunes customer reviews feed), 4 help-center articles (Zendesk API) and 7 pages from 5 first-party websites; 36 web tool calls, seven of them batched shell calls carrying about 120 requests to the iTunes endpoints.
- **Analogs outside pets:** baby trackers, medication and caregiving apps, Apple Health and Family Sharing, sitter platforms and shared-list apps, plus published studies; about 40 web calls. Only 5 pages were fetched in full; most analog claims rest on search excerpts of first-party pages and are marked weaker.

> **Status.** 🧊 Frozen, dated evidence. No product recommendations: those live in the household sharing requirements spec that this discovery produces. **Review text is paraphrased** because the repository is public ([CUL-1491](https://linear.app/projectnyx/issue/CUL-1491)); the verbatim set sits on CUL-1935.
>
> **Evidence key.** `[E·L]` live store listing (counts as shipping) · `[E·H]` first-party help page dated on or after 2026-07-14 (shipping) · `[E·W]` undated first-party website (marketed only) · `[E·R]` review text · `[E~]` search-engine excerpt of a first-party page, not fetched in full (weaker) · `[A]` reasoned assumption · n/s not stated in anything fetched.

---

## 1. What the evidence says, in brief

1. **Sharing is ordinary in small and mid-size pet trackers and absent from some of the largest.** WagWatch, Everkin, Cat360, DogLog, DogNote, Doggy Time, Petfetti, Hau, Sirrius, PupSavvy and a cluster of feeding boards ship it; PetDesk (507,043 ratings), GreatPetCare, CompanAIn, 11pets and PawTrial (on-device only) show none in their live listings.
2. **Time-limited sitter access already ships** in three small entrants: WagWatch (a log-only pass that ends on a chosen date; the sitter never sees history, photos or billing), Everkin (feeding, medicines and emergency contacts; access expires on its own) and Cat360 (Pro). Each appears to need an account. Hau ships a static sitter card PDF instead.
3. **Outside pets, the default is a shared space where everyone sees and edits everything, synced instantly.** The better products tie each invite to one person, show the logger's name as quiet metadata, and alert about others only when something goes wrong. When a product adds a second role, it is a sitter or helper who views or logs but does not manage.
4. **Published member caps run from 3 to 12, or none.** Pet apps: Pet Feeder 3, Petfetti 5, PupSavvy 5 (paid), Tractive and Everkin none stated. Analogs: Yogasleep Grow 4 others per child, Cradlewise 10, Cozi 12, Baby Connect none, Apple Family Sharing about 6 `[A]`.
5. **Pricing splits three ways.** Free (WagWatch, DogNote, Doggy Time, Sirrius, PetLog, Nara, MyTherapy, Huckleberry's shared login); owner pays, invitees free (Tractive, Everkin, Baby Daybook's inherited Premium); paid for the sharing itself (Cat360's sitter access, PetDocs, PupSavvy, Wonderdog, Glow Baby's family plan).
6. **Owners' sharing complaints are mostly about reliability and access, not features.** Of 65 sharing-specific reviews: sync failures 9, cannot share or must share a login 8, sharing behind a paywall 8 (three of them praising free sharing), account burden on the second member 8, sitters and walkers 12, alerts 6, duplicates and double feeding 5, attribution 4, clinical or diet context 4, two homes 1.
7. **Giving a medicine twice is a large share of home medication errors in humans;** no pet rate is measured. A parent reporting food they did not see matched about four in five foods eaten.
8. **Five things nobody was found doing:** sharing that knows about a diet trial; duplicate detection for health events across members; a documented path for the record when co-owners separate; a child or limited-logger role in a pet app; a diet-trial fridge card. Outside pets, nobody warns of a likely duplicate as it is entered, expires a caregiver, or documents moving a record to another owner.

## 2. Pet apps: the matrix

| App (US ratings) | Who can be invited | Roles and permissions | Invite mechanics | Cap | Price of sharing | Who logged it | Alerts on others' logs | Duplicates | Revocation | Transfer, two homes |
|---|---|---|---|---|---|---|---|---|---|---|
| **WagWatch** (10) | partner, family, carers, sitter, vet | members equal; anyone can edit or delete any entry `[E·W]`; sitter pass "temporary, log-only", ends on a chosen date `[E·L]`, never sees history, photos or billing `[E·W]`; vet read-only link, Premium, no account `[E·L]` | email (3 at setup), then a link; own sign-in each `[E·L]` | n/s | free; Premium $3.99/mo covers the household `[E·L, E·W]` | every entry `[E·W]` | n/s | n/s | owner only `[E·W]`; what a leaver keeps n/s | owner can transfer; one household at a time; a split pet keeps one history `[E·W]` |
| **Everkin** (6) | family, partner, sitter | Owner and Administrator roles `[E·W]`; sitter gets feeding, medicines, emergency contacts; access expires on its own `[E·L]` | link or code `[E·W]` | any number `[E·W]` | creating a household needs Everkin+ ($6.99/mo); joining is free `[E·W]` | n/s | n/s | n/s | auto-expiry `[E·L]` | n/s |
| **Cat360** (2) | partner, family, sitter | time-limited sitter access `[E·L]` | n/s | Pro adds more caregivers `[E·L]` | sitter sharing is Pro `[E·L]` | everyone sees whoever logged `[E·L]` | n/s | n/s | time limit `[E·L]` | n/s |
| **DogLog** (1,367) | family, sitters, walkers `[E·L]`; vets `[E·W]` | equal `[A]` | invite; account needed `[E·R]` | n/s | free tier works for a household `[E·R]` | n/s | members notified when activities are logged `[E·L]` | n/s | n/s | n/s |
| **DogNote** (916) | couples, families, sitters | n/s | Family Hub invite `[E·L]` | n/s | sharing free; more than one pet is paid `[E·R]` | filter by member `[E·L]` | n/s | n/s | sitters easily removed `[E·R]` | one person in several families `[E·L]` |
| **Doggy Time** (605) | family, walkers, sitters | care tasks assigned per caregiver `[E·L]` | invite `[E·R]` | n/s | no charge for a partner `[E·R]` | name on the push, not the log `[E·R, 2020]` | alert when a partner logs `[E·R]` | n/s | n/s | n/s |
| **Tractive** (45,907) | family, friends, sitters | owner-only: profile, fences, subscription, invite and remove; members view and track `[E·H]` | link through any app; invitee needs a free account and the app `[E·H]` | none `[E·H]` | owner needs Premium; invitees free `[E·H]` | n/a | n/a | n/a | the removed person is not notified; members can leave `[E·H]` | n/s |
| **Fi** (41,473) | other owners, household, walkers, sitters | Full Access (location, health, billing), View Only, Restricted `[E·H]` | phone number `[E·H]` | n/s | n/s | only the owner's name shows `[E·R]` | n/a | n/a | removing ends access `[E·H]` | several Full Access owners `[E·H]` |
| **Feeding boards:** PetSync, FedYet, Fed?, Did I Feed The Dog?, Pawfolio, Pet Feeder App, Paws (2 or fewer ratings each) | partner, kids, roommate, parents, sitter | equal; FedYet: the owner approves who gets in `[E·L]` | code (PetSync); code or QR, no emails (FedYet); iCloud (Fed?, Did I Feed The Dog?) `[E·L]` | Fed? free tier 1 member; Pet Feeder 3 `[E·L]` | free (PetSync, Pet Feeder) to $2.99/mo (FedYet) `[E·L]` | yes; PetSync announces who just fed which pet `[E·L]` | yes: PetSync, Fed?, Paws, Pet Feeder `[E·L]` | shown by visibility; Pawfolio counts a feed up to 30 minutes early as that meal; PetSync has Undo `[E·L]` | n/s | PetSync: a sole member's pets can come with them `[E·L]` |

**Sharing in the listing, most other fields n/s** (all `[E·L]`): Petfetti (30): up to 5 people and 10 pets; family, sitters or vets. PetDocs (0): a paid Family tier; shows who updated information and when. PetLog by Nooon (0): invitation; account required; free. Wonderdog (22): family and caregivers; paid membership required. Sirrius (1): iCloud invite; free. Hau (2): iCloud; every entry shows who added it; a sitter card PDF. PupSavvy (8): 5 members on Premium; everyone is notified of logged events. Pawprint Pet Services (9; not the original Pawprint): link, code or QR; co-owners can edit the pet and book care. Pup to Date (882): sharing appears only in reviews; a paid unlock reaches a partner only through iCloud Family Sharing `[E·R]`.

**No household sharing in the live listing:** PetDesk (507,043; a 1★ review says multiple pet parents must share one login); The Pack by Zoetis (9,956; a review asks for sharing); GreatPetCare (2,163; the seller is Pawprint Acquisition, LLC, so likely the former Pawprint `[A]`); CompanAIn (25); 11pets (77; its features page returned 404); PawTrial (0; on-device only); TendTail (on-device only). **Marketed only:** Collie (a third-party directory, 2026-05-04): admins and members, sitters for exact dates, a second tap silently discarded.

**Not found:** Tend & Mend and ThePawcess (iTunes plus two web searches each). Reddit was not reachable (JSON search 403; the search tool refuses the domain), so owner forum evidence is absent.

## 3. Pet apps: the patterns

1. **Equal co-owner household,** one administrator (WagWatch, DogLog, DogNote, Doggy Time, PupSavvy, Sirrius, Hau, PetLog, the feeding boards). Fits couples; no decision at invite time. Anyone can edit or delete anyone's entry, with no audit trail (WagWatch). Sync is the failure point: seven of nine sync complaints are Doggy Time's.
2. **Tiered access** (Fi: Full, View Only, Restricted; Tractive: settings owner-only; Everkin: Owner and Administrator; Pawprint Pet Services: co-owners). Protects billing and settings; adds a choice at invite time. Fi's added members must still grant always-on location before the app opens `[E·R]`.
3. **Time-boxed sitter pass** (WagWatch, Everkin, Cat360). Least privilege and nothing to clean up. A sitter who never sees history cannot see what the pet ate yesterday `[A]`.
4. **Expiring read-only vet link, no account** (WagWatch, Premium, can be ended early; Cat360, a 7-day passcode, Pro). Paid in both.
5. **iCloud-native sharing** (Sirrius, Hau, Fed?, Did I Feed The Dog?, PetPilot). No sign-up; data stays off the vendor's servers; Apple only `[A]`.
6. **Code or QR join** (PetSync, FedYet, Everkin, Pawprint Pet Services). Fast for kids and roommates; identity is weak; FedYet adds an owner-approval step.
7. **Status-first feeding board** (the feeding boards). Prevents double feeding through visibility, time windows, Undo and missed-meal alerts. Works only for scheduled tasks; a vomit logged by two people is not a task `[A]`.
8. **Alerts on others' logs** (DogLog, PupSavvy, PetSync, Fed?, Paws, Pet Feeder). Reviews ask for per-member toggles and report reminders that keep firing after deletion.
9. **Static handoff card** (Hau's sitter card PDF: food, allergies, medicines, quirks, vet contacts). Works with no account; goes stale; nothing logs back.
10. **Membership in several households** (DogNote; Everkin's 2026-07-12 guide, marketed: helpers work across clients without mixing records). The opposite: WagWatch, one household at a time.

## 4. Analogs outside pets

**Baby trackers.**
- **Huckleberry** `[E·H]`: caregivers sign in to the same account on each phone; sync is free (Plus $5.74/mo, Premium $9.99/mo, billed yearly). No invite, role or attribution flow found. The category leader ships a shared login.
- **Nara Baby** `[E~]`: free; invite partners, grandparents and caregivers; a view of the baby's recent activity when caregivers switch. Unverified aggregator reports of overwritten entries and dropped members.
- **Glow Baby** `[E~]`: add a caregiver by email; the partner installs and logs in with it; linked per baby; needs the Premium Family Plan (about $89.99/yr). Community posts: a running sleep timer cannot be stopped from the other phone; invites stick on pending.
- **Baby Connect** `[E~]`: per child, add a parent or caregiver by email or an invitation code; everybody views and enters information; no caregiver limit. Paid: preventing other users from modifying your entries; end-of-day summary emails.
- **Baby Daybook** `[E~]`: Family Sync is Premium, and connected caregivers inherit it without a separate purchase; entries sync instantly.
- **Adjacent:** Cradlewise (Admin, View and control, View only; up to 10) `[E~]`; Yogasleep Grow (1 co-parent and 3 caretakers per child; only the parents add data) `[E~]`; DailyConnect (childcare; defaults by relationship: a sitter views and gets a daily email, cannot edit the profile; adjustable) `[E~]`; Milk Monster (each entry carries its logger; a feed logged by both parents shows twice, never merged) `[E~]`. Baby Tracker by Amila: no sharing found in the listing excerpt (unverified).

**Medication and caregiving.**
- **Medisafe Medfriend** `[E~]`: the patient invites the Medfriend, who gets a push only after several alerts go unanswered.
- **MyTherapy Team** `[E~]`: free; relatives the user chooses see doses taken and can send reminders.
- **Caring Village** `[E~]` (marketing only): a village around one person with role-based permissions; free, with tiers at $14.99 to $24.99 a month.
- **Lotsa Helping Hands** `[E~]`: Leader (full admin; can hand over or step down), Coordinators (limited admin), Members (invited or approved, own password), Public (views chosen sections, never posts). Private by default.
- **CaringBridge** `[E~]`: the author sets visibility (strictest: by invitation only) and sees who visits; co-authors post; no documented hand-over on death or separation.

**Apple.**
- **Health Sharing** `[E~]`: per person, per topic; recipients mute alerts, trends or updates without leaving; stopping sharing removes the shared data from the other device; deleting the contact does not stop sharing.
- **Family Sharing** `[E~]`: organizer-run, about six people `[A]`; a child under 13 leaves only by transfer to another family group or account deletion; a removed member loses shared content at once; a person can join two family groups a year; Apple covers leaving in its Personal Safety guide.

**Sitter platforms.**
- **Rover Cards** `[E~]`: the sitter taps pee, poo, food and water during the visit, then sends photos, a note and a route map; the owner gets a push. The map is deliberately not live; only walker, owner and Rover see the card; Rover does not compile time data on individual sitters; cards are optional. The August notification research rated the sitter's photo update as arguably the most loved notification in the pet category (`docs/research/2026-08-notification-type-portfolios.md` §1.3).
- **Wag** `[E~]`: live GPS, photos and chat; its walker guide says reports should always say whether the dog used the bathroom and flag diarrhea; the form does not require it.
- **Time To Pet** `[E~]`: business-defined report cards per pet (yes or no, counts, multiple choice) arrive in real time by push, email or text; a client portal in any browser; GPS at check-in and out.

**Shared lists.**
- **AnyList** `[E~]`: share by email; a non-user gets a download link, and the list appears once they register with the same address; changes show instantly.
- **Cozi** `[E~]`: one family account, own email, shared password; Cozi warns that tapping Sign Up instead of Sign In creates a stray account; up to 12 people, all able to view, add, edit and delete; change alerts go only to members tagged on an event.
- **OurHome** `[E~]`: parents assign chores and can require adult approval before a child earns points.

## 5. Analogs: patterns and failure modes

**Patterns seen:** an invite tied to one person and redeemed after install (AnyList, Baby Connect, Glow, Lotsa); separate accounts rather than a shared login (Baby Connect, Glow, AnyList, Apple; against Huckleberry and Cozi); two roles named by relationship, the second being a helper who views or logs but does not manage (Grow, DailyConnect, Cradlewise, Lotsa); one plan covering everyone (Baby Daybook) against paying to add a partner (Glow); the logger's name as quiet metadata, sometimes with edits locked to the author (Milk Monster tags without merging; Baby Connect sells author locking; Cozi lets anyone delete anything); alerts about others only when something goes wrong, mutable by the receiver (Medisafe, Cozi, Apple Health, the daily digests of Baby Connect and DailyConnect, Rover's one card per visit); a handoff summary (Nara's switch-over view; visit reports; daily emails); the owner writing the checklist for an occasional helper (Time To Pet's custom questions in a browser portal; Rover's one-tap events); clear leave, remove and transfer with the data staying on the record (Apple; Lotsa's handed-over leader role).

**Failure modes seen:** surveillance by feed (per-event pings or per-person counts turning a partner into an auditor; in an insulin-pump data-sharing study, parents of mid-teens held back until a worrying pattern, and both sides wanted ground rules; a family tracking study found tension alongside collaboration); nagging escalation (sending missed doses to another person works only when the watched person chose the watcher, and even then 2 of 30 used it in one trial arm); duplicates and silent merges (two people log one breakfast; a latest-edit-wins sync drops a partner's edit, reported for Nara, unverified); stale sync followed by a second dose `[A]`; shared logins (no attribution, broken per-person reminders, no clean exit); invite dead ends (Cozi's Sign Up versus Sign In, Glow's stuck pending invites, AnyList's email mismatch, and `[A]` a Sign in with Apple relay address that matches nothing); custody fights (no single owner or transfer path, so support referees the breakup).

## 6. What owners say (paraphrased; counts from 65 sharing-specific reviews among 2,585)

Separately, 54 reviews of 4 or 5 stars in five logging apps praise shared logging generally (keyword count). The feeds reach back to 2017.

| Theme (count) | Paraphrased examples (app, stars, date) |
|---|---|
| **Sync failures and lag** (9, all complaints) | A spouse's entries stop syncing, so the dogs look as if nothing happened all day (Doggy Time, 2★, 2026-07-30). Pets vanish from the app and re-inviting does not bring them back (Doggy Time, 1★, 2026-05-23). Two members of the same pack cannot save their logs (DogLog, 1★, 2026-02-05). |
| **Cannot share, or must share one login** (8) | The only way for two pet parents to use the app is one person logging in with the other's credentials, which pushes the invisible labor of pet care onto one person (PetDesk, 1★, 2026-07-08). A spouse's attempt to share the dog's account fails (Pet Care Tracker, 1★, 2026-04-08). A family member can never accept the invite because of a Bluetooth discovery loop (Tractive, 1★, 2025-09-04). An owner asks to share a pet across two accounts (The Pack, 5★, 2024-11-10). |
| **Sharing behind a paywall** (8; 3 praise free sharing) | Other apps locked seeing each other's activity behind a paywall (DogNote, 5★, 2026-06-02). The app does not charge to add a partner (Doggy Time, 5★, 2026-05-26). A husband cannot track unless he also upgrades (Pup to Date, 2★, 2021-06-14). |
| **Privacy and account burden on the second member** (8: Fi 3, DogLog 5) | A family member cannot see the pet unless the app gets always-on precise location (Fi, 1★, 2026-05-21). An owner will not link a Google or Facebook account to share (DogLog, 1★, 2018-11-28). |
| **Sitters and walkers** (12; all 4 complaints about Fi) | An owner asks for a dog-sitter profile (Fi, 1★, 2025-11-25). Sitters join and are removed easily (DogNote, 5★, 2025-11-08). Several walkers and sitters rotate through one household (DogNote, 5★, 2026-04-17). |
| **Alerts** (6) | An owner asks whether reminders should go to every pack member (DogLog, 3★, 2022-05-23). Reminders keep reaching both partners twice a day (DogNote, 4★, 2025-07-28). |
| **Duplicates and double feeding** (5; 4 credit the app with preventing them) | Dogs were getting chubby because both partners fed them (DogLog, 5★, 2017-09-23). Logging one walk for several dogs creates several entries (DogNote, 5★, 2024-04-03). |
| **Attribution** (4) | An owner cannot tell who the dogs are with when it is not them (Fi, 4★, 2026-02-10). The person's name shows on the push but not on the log (Doggy Time, 5★, 2020-12-05). |
| **Clinical or diet context** (4, plus one IBD review) | A dog on a food trial; both partners see and update the data in real time (DogCat, 5★, 2022-07-02). An IBD dog with new food reactions; the owner gets a small alert when the partner enters something (Doggy Time, 5★, 2022-08-09). |
| **Two homes** (1) | Co-raising a service dog on alternating days (Doggy Time, 5★, 2020-10-18). |

## 7. Studies

**Giving a medicine twice.**
- Smith et al., *Pediatrics* 2014;134(5):867–876 (US poison centers, 2002 to 2012, children under 6): 696,937 out-of-hospital medication errors, almost all at home; inadvertently taking or being given a medication twice made up 27% `[E~]`. Caregiver counts were not recorded, so a link to homes with several caregivers is inference `[A]`.
- Hodges et al., *Clinical Toxicology* 2017 (2000 to 2012, all ages, serious outcomes, n=67,603): incorrect dose 19.8%, wrong drug 18.4%, given twice 15.7%; 0.6% died `[E~]`.
- In the same database, 52.6% of cardiovascular drug errors were a medication taken or given twice, highest in older adults `[E~]`.
- Pets: no measured home double-dose rate was found. Poison Control's pet guidance tells households with more than one dosing person to keep a schedule or checklist so the pet is neither dosed twice nor missed `[E]`. The September medication brief recorded the same gap (`docs/research/2026-09-medication-competitive-landscape.md`, open question 2).

**A second logger and completeness.**
- Wallace et al., *Nutrients* 2018 (40 children aged 2 to 5 at daycare): parents reporting a lunch and snack they did not see matched 79.2% of the foods eaten (exact or close) and overestimated energy `[E~]`.
- NCT07227272 (University of Tennessee, recruiting): phone-prompted food recall with a named second caregiver recording at least two eating occasions, against weighed food; no results yet `[E~]`.
- No study was found measuring the duplicates or conflict a second logger adds in consumer apps.

**Couples, memory and accountability.**
- Margrett, Reese-Melancon and Rendell, *Zeitschrift für Psychologie* 2011;219(2):100–107: in 11 married couples (14 per the press release), spouses acted as each other's memory aids; middle-aged couples gained more than older ones; no effect sizes `[E~]`.
- FamilyBloom, CHI 2026 (12 families, about three months): shared tracking brought both collaboration and tension `[E~]`. Lin et al., DIS 2025 (10 couples): current tools do not adequately support closeness in co-parenting `[E]`. Lu et al., CSCW 2024 (20 pregnancy apps, 4,709 reviews): apps were used to share logistics, but gendered role assumptions got in the way `[E~; URL match unconfirmed]`.

**Escalation to a caregiver.**
- Medisafe's own 2015 data (users below 80% adherence, two weeks before and after adding a Medfriend): about 71% improved and intake rose 17% on average; no sample size, no control `[E]`.
- *JMIR Human Factors* 2025 (NCT05098743; 30 patients, one month): 2 used Medfriend `[E~]`.
- Insulin-pump data sharing (18 adolescents, 19 parents): parents of younger teens watched live; parents of mid-teens reviewed later and held back until a worrying pattern appeared `[E~]`.

## 8. What nobody was found doing (each pet claim checked by a regex over the 43 listings and a second web search)

1. **Diet-trial-aware sharing:** no app limits a member's or sitter's view to the trial's allowed foods, or flags an off-trial item someone else logged. Listing regex `(diet|food|elimination) trial` matched only PawTrial, which has no sharing; the web search for an elimination diet tracker that shares with family or a sitter and alerts on off-diet food found none.
2. **Duplicate detection for health events across members:** dedupe exists only for scheduled feedings (Pawfolio's window, Collie's discarded second tap). Regex `duplicat|double[- ]?(feed|log|entr)` found only double-feeding visibility and import or media dedupe. Outside pets, no analog warns of a likely duplicate as it is entered.
3. **The record when co-owners separate:** nearest are WagWatch's marketed owner transfer and PetSync's sole-member note. Regex `separat|divorc|custody|transfer|two homes|move with you` returned no owner-related hits; the web search returned legal articles only. Outside pets, Apple's child transfer between family groups is the closest model, and no baby tracker or CaringBridge documents a transfer.
4. **A child or limited-logger role in a pet app:** kids appear only as invitees.
5. **A diet-trial fridge card:** only Hau's generic sitter PDF and paper templates turned up; ThePawcess remains unverified.

## 9. Claims in earlier briefs this pass could not confirm

- `docs/culprit-competitive-landscape-2026-10.md` §8 item 5 lists household sharing as "free at Tend & Mend, WagWatch, Sirrius, Hau and Cat360". On 2026-10-14: WagWatch and Sirrius free (confirmed); Hau shares through iCloud (price n/s); **Cat360's sitter sharing is Pro**; **Tend & Mend could not be found**.
- Matrix A of the same brief marks ThePawcess with a household fridge card (demo); **ThePawcess could not be found**.
- `docs/research/2026-08-home-screen-competitive-teardown.md` records caregiver sharing in The Pack's v0.65.0 release notes (February 2026); the live listing on 2026-10-14 shows no sharing, and a review asks for it. Either the feature is unlisted or it was removed; unresolved.

Per `.claude/rules/docs.md`, the frozen briefs are corrected additively (a §V row and an inline ⚠ pointer), not here.

## 10. Sources (all accessed 2026-10-14)

**Pet app listings** (`https://itunes.apple.com/lookup?id=<ID>&country=us`): WagWatch 6787262395 · Sirrius 6760633823 · Hau 6797011878 · Cat360 6761681633 · Everkin 6751292489 · Petfetti 6471319447 · CompanAIn 6747678727 · Wonderdog 6802365685 · DogLog 1229529595 · The Pack by Zoetis 1633459819 · PetDocs 6757140711 · 11pets 1232470530 · GreatPetCare 934948619 · PetDesk 631377773 · PetLog (Nooon) 6756508276 · PawTrial 6793021377 · Tractive 921588809 · PawPrints 6757833617 · Fi 1438036784 · DogNote 1527756855 · Pup to Date 1515338968 · Doggy Time 1514159866 · PupSavvy 6760433022 · DogCat 1551003273 · Pawprint Pet Services 6760276561 · PetSync 6757567165 · FedYet 6790178285 · Fed? 6760776848 · Did I Feed The Dog? 6764600152 · Pawfolio 6743056578 · Pet Feeder App 6758022385 · Paws 6759272028 · PetPilot 6749286937 · TendTail 6776025573 · Whisker 1475805212.

**Pet app reviews** (`https://itunes.apple.com/us/rss/customerreviews/page=N/id=<ID>/sortby=mostrecent/json`): DogLog, DogNote, Doggy Time, Pup to Date, DogCat, The Pack, Tractive, Fi, PetDesk, Whisker, 11pets.

**Pet app help centers and sites:** help.tractive.com articles 211739365 (updated 2026-10-13) and 33913781166482 (updated 2026-10-07); support.fitracking.com articles 360023796753 (updated 2026-08-12) and 42437511322003 (updated 2026-10-09); wagwatch.app and /shared-pet-care-log; everkin.io and /guides/pet-sitter-caregiver-access (2026-07-12); cat360.app; doglogapp.com; petfetti.com; peerpush.com/p/collie; 11pets.com/en/features/ (404).

**Analogs** (F full fetch, X search excerpt only):
- Baby trackers: F https://huckleberrycare.com/pricing · X https://apps.apple.com/US/app/id1444639029 (Nara) · X https://support.glowing.com/hc/en-us/articles/360002003667-How-do-I-add-my-partner-to-Glow-Baby · X https://support.glowing.com/hc/en-us/articles/115000246147-Do-I-need-to-have-Glow-Premium-to-connect-with-my-partner-on-Glow-Baby · X https://glowing.com/community/topic/72057594039752359/adding-caregivers-and-syncing-info-in-glow-baby · X https://baby-connect.com/faqa?lg=en · X https://babydaybook.app/premium/ · X https://cradlewise.com/blog/stay-connected-through-cradlewise-app · X https://support.yogasleep.com/hc/en-us/articles/48882767934619-Grow-s-Co-Parent-Caretaker-Features-Q-A · X https://support.dailyconnect.com/support/solutions/articles/48001232474-relationships-and-permissions · X https://www.producthunt.com/products/milk-monster
- Medication and caregiving: X https://medisafeapp.com/pro-tip-add-a-medfriend/ · F https://medisafeapp.com/the-value-of-a-medfriend/ · X https://humanfactors.jmir.org/2025/1/e63653/PDF · X https://www.munich-startup.de/en/10034/smartpatient-brings-the-family-on-board-with-digital-care/ · X https://caringvillage.com/app/ · X https://alzheimers.lotsahelpinghands.com/help/pe_members_coordinators.html · X https://www.caringbridge.org/legal/terms-of-use
- Apple: X https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios · X https://support.apple.com/en-us/102652 · X https://support.apple.com/en-us/102634 · X https://support.apple.com/guide/personal-safety/manage-family-sharing-ips75b3b794f/web
- Sitter platforms: X https://support.rover.com/hc/en-us/articles/211573246-What-are-Rover-Cards-and-how-do-I-send-them · X https://support.rover.com/hc/en-us/articles/211587446-How-does-the-dog-walking-map-feature-work · X https://wagwalking.com/daily/pet-caregiving-101-writing-the-pawfect-report-card · X https://help.timetopet.com/article/138-visit-report-cards · X https://www.timetopet.com/client-management/client-portal
- Shared lists: X https://help.anylist.com/articles/share-list/ · X https://www.cozi.com/faq/ · X https://www.cozi.com/blog/how-to-add-family-to-cozi/ · X https://www.smartcompany.com.au/startupsmart/ourhome-plans-to-make-households-nag-free
- Studies: X https://psnet.ahrq.gov/issue/out-hospital-medication-errors-among-young-children-united-states-2002-2012 · X https://psnet.ahrq.gov/issue/non-health-care-facility-medication-errors-resulting-serious-medical-outcomes · X https://connect.jcoinctc.org/display/n35097 · F https://www.poison.org/articles/pets-and-medication-errors · X https://uwspace.uwaterloo.ca/items/f48b5072-7796-408a-9c96-08a8c9408de0 · X https://clinicaltrials.gov/study/NCT07227272 · X https://acuresearchbank.acu.edu.au/item/8v2xy/examining-collaborative-dialogue-among-couples-a-window-into-prospective-memory-processes · X https://researchconnect.buffalo.edu/en/publications/examining-the-social-aspects-of-pregnancy-tracking-applications/ · X https://iro.uiowa.edu/esploro/outputs/conferenceProceeding/FamilyBloom-Examining-Ecologies-of-Collaboration-in/9985152241202771 · X https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8252900/ · F https://arxiv.org/abs/2505.22428
