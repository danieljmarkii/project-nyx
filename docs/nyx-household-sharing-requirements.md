# Household sharing: Requirements

**Version:** 2.0 (draft) · **Last Updated:** 2026-10-15 · 🌱 Living
**Status:** DISCOVERY OUTPUT, awaiting the PM's decision round (§0). Nothing here is build-authorized until D1 is ruled. The build starts after 1.2.0 clears App Store review (PM, 2026-10-14).
**Supersedes:** the unmerged v1.0 draft "Household Shared Care (Minimal Primitive)" of 2026-08-21 (draft #692). The PM ruled this round a fresh start: the August draft is evidence, not the frame.
**Issues:** discovery [CUL-1935](https://linear.app/projectnyx/issue/CUL-1935); build [CUL-194](https://linear.app/projectnyx/issue/CUL-194) (B-292).
**Evidence:** `docs/research/2026-10-household-sharing.md` (pet apps, analogs, owner reviews, studies). A read-only code audit and six isolated lens reads (Designer with Motion and IA; Data Scientist with Dr. Chen; Trust & Safety; Dir. of Engineering with QA; the owner lenses; two consultants, a professional sitter and a pricing lead) are summarized in §2 and §3; their full text is on CUL-1935.
**Design authority:** `docs/culprit-household-sharing-mockups.html`, round 1.
**Reads with:** `docs/nyx-diet-trial-requirements.md` (the one off-diet predicate), `docs/nyx-med-strip-requirements.md` and `docs/nyx-medication-logging-requirements.md` (doses), `docs/nyx-vet-report-requirements.md` (the Owner line, Appendix G), `docs/monetization-and-throttling-requirements.md` §3 (the boundary table), `docs/nyx-notification-foundation-requirements.md` (server push), `docs/nyx-per-account-food-library-requirements.md` (the catalog boundary).

> **This file is public** (the repository is public, CUL-1491). It states controls and invariants. Security parameters (rate limits, binding mechanics, allowances), unfixed findings and anything about a real household live on CUL-1935 and its build issues, and every control here must hold with this text public.

---

## 0. Decision record

### 0.1 The round in one paragraph

Care for a pet is spread across people; the record is not. Culprit's answer is **everyone who cares for the pet, on one record**, through three ways in scaled to trust: **a card** anyone can be sent (the rules, no account), **a sitter link** for a sitter, walker or daycare (no account, no install, bound to one browser, today only), and **a login of their own for a partner** (everything a caregiver does, including recording what the vet said). Underneath sits one record that knows who saw what, takes the louder reading when two people's entries may overlap, and checks doses across people. All of it is free. Nobody gets a feed, an activity alert about a person, per-person stats or location. The research found three things no pet app or analog does, and this design does all three: sharing that knows about a diet trial, catching one health event logged by two people, and a path for the record when people separate.

### 0.2 Decision briefs

**D1. Adopt the shape, and its order.**
- **Deciding:** whether household sharing is built as three ways in over one record, and in what order.
- **Options:** (a) **Recommended:** the card, then readiness and the record's rules, then partners, then the sitter link, which is the riskiest piece and runs dark for the PM's household first; (b) the card and partners only, the sitter link later; (c) partners only, as August drew it.
- **Consequence:** (a) unblocks the run order in §9 and makes sharing free by construction (D10). (b) defers the round's main opening, trial-aware help for the sitter. (c) leaves sitters on the shared login or on nothing.
- **Forecast:** 25 rows (§9). Push, "Same one?", transfer and keep-a-copy are fast follows outside the forecast.

**D2. What a partner can do.**
- **Deciding:** whether a partner can change the care plan, not only log.
- **Options:** (a) **Recommended (every lens, with guards):** a partner can start, end or extend a trial and add or change a medicine, because the vet visit companion turns the vet's plan into records and the partner is often the one in the exam room; each change is a dated, named, undoable act both people see; only the pet's owner archives the pet, gives an account access or transfers it; (b) plan changes stay owner only (August's position); (c) two equal owners.
- **Consequence:** (a) needs two rule changes before partners ship: a food added to a trial's allowed set counts from the day it was added, not from the trial's start (B-456), and trial changes become append-only acts so two phones cannot silently undo each other.

**D3. Sitter links: two kinds.**
- **Deciding:** how long a sitter link lives and what its page shows.
- **Options:** (a) **Recommended (Trust & Safety and the sitter consultant, reconciled):** a **stay** link ends the morning after its date and one tap extends it; a **regular** link for a walker or daycare has no date, but ends after 30 days unused, when the person who made it loses access, or when the owner does not keep it at a 90-day check in the app. Both are bound to the first browser that starts them, show today only, name nobody in the household ("Given 7:02"; the sitter's own entries say "by you") and never say the owner is away; (b) stay links only; (c) links that never end.
- **Consequence:** (a) a regular link's feedings count as exposures but never make a day "covered", because a daycare's lunches cannot speak for a home's dinners (Data). An ended page names no pet; the rules stay in the message the owner sent.

**D4. Safety without push in v1.**
- **Deciding:** whether v1 needs server push so an escalation reaches the owner when someone else logs it.
- **Options:** (a) **Recommended, with a condition:** no cross-person push in v1. The person logging always sees the escalation; the sitter page runs the same escalation rules on every entry and hands off by person ("Culprit doesn't alert Jordan. Call or text Jordan now", with the numbers the owner typed), and the sitter can send a visit text built from their taps. Safety alerts become the first server push right after; (b) build safety push in v1 (about 4 more rows, a review cycle, and the open push provider question answered now); (c) no sitter link until push exists.
- **Consequence:** (a) holds only while the sitter page carries the escalation and no copy implies the owner was told (Data and Dr. Chen's condition).

**D5. The record's rules when several people log one pet (adopt as a set).**
- **Deciding:** how counts, intake and doses stay honest with more than one logger.
- **Options:** (a) **Recommended:** adopt §4.4 as a set: one record, one answer (nothing depends on who is signed in); entries that may overlap take the louder reading until a person resolves them (both count, the lower intake, every flag); doses are checked across people by medicine, not by each person's copy of it, with no one-to-two hour clamp; days only a sitter logged never count as days symptoms were watched; "fed" never records how much was eaten; (b) the partner rules now, the sitter rules in the sitter phase.
- **Consequence:** (a) changes the engine's inputs and the report, so every such build PR carries an adversarial review.

**D6. A check before saving a second dose of a critical medicine.** *Persona conflict; no team recommendation.*
> **Sr. Product Designer:** people log after the pill is in or the injection is done. A question before saving lands too late to prevent anything and adds a decision at the moment of event (Principle 1). Prevention lives at rest: "Given 8:02 · Alex" on the card, and the button reads "Log another dose".
> **Dr. Chen:** for insulin and drugs like it, one stopped double dose is worth the friction. The check should fire before saving, for critical medicines only.
> **PM decision needed:** (a) no check before saving, prevention at rest (Designer); (b) a check before saving for critical medicines only (Dr. Chen).
- **Consequence:** (b) needs "critical" defined first, which is the open owner-toggle question on CUL-272.

**D7. Who shows by name.**
- **Deciding:** where a person's name appears.
- **Options:** (a) **Recommended:** names in the app (others by first name on the row, the reader's own rows unnamed, and an entry's detail always says who, "You" included), never on the off-diet list and never on a sitter's page; the vet report uses roles, with initials only in its observation appendix; a person who leaves becomes a role; (b) names on the report as well; (c) no names anywhere.
- **Consequence:** (a) answers "did you log the treat?" without turning the trial's off-diet list into a list of who slipped.

**D8. AI reads on a shared pet.**
- **Deciding:** whose yes a photo or note needs before it goes to the AI.
- **Options:** (a) **Recommended (Trust & Safety):** a photo or free text goes only with a yes from the owner, the person sending it and the person who wrote it; the Signal needs the owner and the caller; a sitter answers once on first open, with no default; AI use on a pet is charged to its owner, with a small allowance per sitter link; (b) the owner and the caller only (the 2026-10-13 recommendation on CUL-194); (c) the owner only.
- **Consequence:** (a) the photo reads, the Signal and Ask each read up to three answers, and the consent sheet copy names the rule. It must ship before any account gains access to another's pet (§4.1 R1).

**D9. When people separate.**
- **Deciding:** what each person keeps when a couple splits or someone leaves.
- **Options:** (a) **Recommended (Trust & Safety and Data, reconciled):** in v1, removing someone or leaving ends access at once, offers the owner a password change and a sign-out of other phones, and lets the person leaving save the vet report first. Next, "Keep a copy" (a frozen copy of the record as a new pet: names become roles, no future appointments, re-derived identically, disclosed at invite and never marked on the original) and transfer to someone who accepts. A pet that lives in two homes keeps shared access instead of a copy; (b) the owner keeps the record and the other person exports only their own entries; (c) nothing leaves.
- **Consequence:** (a) gives a person leaving a bad home their pet's history without telling the other person; (b) strands whoever takes the pet and costs the vet the history.

**D10. Price.**
- **Deciding:** whether any part of sharing is paid.
- **Options:** (a) **Recommended (every lens, the pricing consultant included):** all of sharing is free forever and is written into the boundary table. A future Premium covers everyone on a pet, decided by the pet, never by who is signed in. The 4-pet gate counts pets you own, never pets you can see. Up to 4 accounts on every tier; (b) partners free, sitter links Premium; (c) free up to N people, Premium above.
- **Consequence:** (a) forecloses a family plan priced per seat. (b) puts a purchase in front of an owner packing to leave, on the exposures a trial most needs recorded.

### 0.3 Team calls (logged on CUL-1935; the PM can reverse any)

- **Wording.** The app says "Sharing", "share" and the person's name; never "household", "caregiver" or "member" (Designer, nyx-voice).
- **Partner invites activate on the owner's confirmation**, by name, before anything syncs (Trust & Safety; replaces August's notify-and-revoke and the Engineering read's "Alex joined" notice).
- **A person who leaves becomes a role** on the entries they wrote ("a household member"), in the app and the report (Trust & Safety; the Designer's removal copy changes to match).
- **The owner-only wall is an inert line that explains**, never a dimmed control ("Only Jordan can archive Mochi") (Designer, C-7).
- **"Same one?" is never answered on Home**; Home shows a quiet mark and the question is one tap in (Designer; a Home answer would be a fourth write class, a Tier-2 amendment).
- **Where a name sits on the shared row, the sitter page's layout, and the widget's dose tile** follow the Designer's recommended options in mock round 1 (§0.4).
- **Copies and the original.** A copy prints "Copied from a shared record on {date}; later entries are not included"; the original never shows a copy exists. Copies are for clean breaks; a pet in two homes keeps shared access (Trust & Safety's and Data's conditions, both met).
- **The ended sitter page names no pet**; the card the owner sent carries the rules past the link's end (Trust & Safety and Data, both met).
- **A partner removing a photo they added** is a hard delete of that photo only (Engineering), pending the spec-stage privacy review (§7); otherwise a member never hard-deletes.

### 0.4 Visual choices in mock round 1 (team calls, recommended option first)

| Frame | Choice | Recommended |
|---|---|---|
| F3 | Where a name sits on the shared row | a tag under the time, where "found" already sits |
| F5 | An unresolved pair on Home | a quiet mark; the question one tap in |
| F7 | The widget's dose tile with two loggers | an "as of" time |
| F9 | The sitter page's first screen | the rules up top, the buttons in the thumb zone |
| F13 | The owner-only wall | an inert line that explains |

---

## 1. The problem and the scope

**The problem.** Each person who cares for a pet witnesses a subset of what happens. A single-login record undercounts exactly the exposures a diet trial's verdict depends on, and the people doing the care do not have the rules, so they cause those exposures. Undisclosed feeding by other people is the first of seven tips in a prescription diet maker's owner handout; a parent reporting food they did not see matched about four in five foods eaten (research brief §7). Medicines add a third failure: giving a dose twice is 27% of home medication errors in children under 6, and no pet rate is measured.

**The PM's scoping answers (2026-10-14).**
- **Start fresh.** August is evidence, not the frame; roles and pricing are open.
- **Two invitees:** the partner or second owner, and the sitter, walker or daycare. A family helper and the vet were not picked: the model must not foreclose them, and neither is designed for v1. The vet stays where October's D6 ruled it.
- **A household on one shared login is the first migration case.**
- **Timing:** rulings now; the build starts after 1.2.0 clears review.

**The jobs.**

| Person | Job |
|---|---|
| Owner | Everyone who cares for my pet logs into one record and knows the rules. While I'm away, I know what happened and the trial stayed clean. |
| Partner | Care for our pet as fully as you do, on my own login: log, see, act on what the vet said. |
| Sitter, walker, daycare | Tell me exactly what to do and what not to feed. Let me record what happened in seconds. Don't make me install anything or create an account, and don't blame or track me. |

## 2. What the code requires (verified 2026-10-14, repo at 9344eab)

Any design where a second person writes to a pet's record must absorb these. Each is a requirement in §4.

**Blockers.**
- **AI consent reads only the caller.** Photo reads refuse a caller who is not the pet's owner, so a partner's photos are never read; the Signal and Ask read only the caller's answer, so a partner's yes would send the owner's pet record to the AI over the owner's no.
- **Four guards added since August check that the caller owns the pet** (the care record, Noticed's looks, intake checks, and the capture-change RPC). Unchanged, every partner write is refused and quarantined. Two guard tests pin their current text.
- **Food and medicine libraries are per account.** A partner's picker starts empty; a re-added trial food gets a different id and can read as "not on the trial list"; a re-added medicine gets a different id, so the double-dose check never pairs two people's doses.
- **Feature flags resolve for the signed-in user on the phone and for the pet's owner on the server.** A partner off an allowlist writes no urgent-check marker, so the call-now floor can skip their vomit and lethargy logs.
- **The double-dose check clamps its window to one to two hours and reads only this phone's copy,** so a dose given hours apart by two people, or not yet synced, is not caught.
- **A new account goes straight into creating a pet,** so an invitee makes a duplicate pet; and **Settings' sign-out is global,** so leaving a shared login would also sign out the other phone and wipe what it had not sent.

**High.**
- Nine pet-scoped tables and 17 policies arrived since August; 47 policies in all key on the owner (34 on tables, 13 on Storage).
- The may-wait take-backs run as the caller and need a member's update on the incident read.
- The vet report says on its face that one account records everything, and its Owner line names whoever generated it.
- Removing a photo is a hard delete.
- Copy such as "You said" assumes the reader wrote the entry. Home and History share one row component, so attribution appears in both or neither.
- A food added to a running trial counts from the trial's start (B-456), so adding a treat retroactively permits past exposures.
- Supabase cannot serve an HTML page on its default domain, so a sitter page lives on getculprit.app.
- No phone number is stored anywhere.

**Already safe.** The widget prunes per pet; the server's engine flags resolve for the owner; the report's household pull is per pet.

## 3. The design

### 3.1 Three ways in

| Way in | Who | Needs | Sees | Does |
|---|---|---|---|---|
| **The card** | anyone who feeds the pet | nothing: a text or a printout | the rules: what the pet can eat, what not to give, how to give each medicine, who to call | nothing logs back |
| **The sitter link** | a sitter, walker or daycare | a phone's browser; no account, no install | the rules; today's care for the linked pets, with times and no names; doses due; the owner's instructions and numbers; its own entries | one-tap entries from a fixed set; a hand-off to call or text when something needs a vet; a visit text built from its taps |
| **The partner** | someone the owner lives with | their own login | everything for the pets shared with them | everything a caregiver does, including the care plan (D2); never archive, grant access or transfer |

### 3.2 One record

- **Author and witness.** Every entry knows who recorded it (server-stamped, write-once) and, as today, whether it was seen or found. A sitter's entry carries its link and the label the owner typed. History from a shared login stays unattributed.
- **Names.** In the app, others by first name on the row; the reader's own rows carry no name; an entry's detail always says who ("You", "Alex", or "recorded on a shared login, who isn't known"). Never on the off-diet list; never on a sitter's page. The vet report uses roles.
- **Overlap.** Entries that may be one event count as two until someone says otherwise; intake reads the lower answer; flags combine.
- **Doses.** Checked across people by medicine, with freshness shown on this phone.

### 3.3 Invariants and guardrails

- **I1. One record, one answer.** No count, flag, card or report line depends on who is signed in.
- **I2. The louder reading.** Where entries may overlap or disagree, every lane takes the louder reading until a person resolves it.
- **G1. Not a social layer.** No feed, no alert about a person's activity, no per-person counts, no "X hasn't logged", no presence ("X's phone last synced"), no location, no visit lengths, no "late".
- **G2. Attribution is a fact, never a lever.** A name is metadata on an entry; it never ranks, compares or nudges.
- **G3. No fabricated authorship.** Unknown stays unknown; authorship is never client-supplied.
- **G4. Ending access stops the future and never reaches the past.**
- **G5. Neither the invite nor the sitter link is ever an RLS predicate.** A service-role function validates both (migration 026's precedent).
- **G6. The owner of record is the root.** `pets.user_id` does not move except by transfer; a row's `pet_id` never changes; access never travels more than one hop.
- **G7. Per-person stays per-person.** Legal acceptance, notification preferences, AI consent answers and beta opt-ins never pool.
- **G8. A sitter is never blamed, tracked, scored, or asked to confirm the pet is well.**
- **G9. Anyone can shrink access; only the pet's owner grants an account.**
- **G10. Every control holds with this spec public.**

## 4. Requirements

### 4.1 Readiness (ship first; each is a no-op for a single-person household)

- **R1. The owner's answer joins every AI door.** Photo reads, the Signal and Ask resolve the pet's owner from the pet and read the answers D8 requires. Missing means no.
- **R2. Flags and consent resolve for the pet's owner on the phone,** as they already do on the server. The phone's pet carries its owner. A registry says which flags are per pet and which per person (Ask is per person).

### 4.2 The card (phase 0)

- **P1.** From the trial screen and the pet's page, "Send the rules" opens the share sheet with plain text: what the pet can eat (named foods), what not to give (treats, chews and dental chews, flavoured toothpaste, pill pockets, table food, another pet's bowl), how to give each medicine ("always give it, in a spoon of the trial food; if that doesn't work, use what works and tell us"), and the owner's and vet's numbers as the owner types them.
- **P2.** A printable version for a fridge, a food bin or a kennel card.
- **P3.** Food names only: no symptoms, no indication, no link to the record. A note warns against adding door or alarm codes.
- **P4.** The share sheet suggests the pickup question for daycares: "Did she eat anything besides what I sent?"

### 4.3 Partners

- **H1. Membership per pet.** Access is a row per pet and person with its role. The owner stays `pets.user_id`. "All pets, including ones I add later" is an explicit choice at invite; a new pet joins only under it. When a partner who owns pets joins, they are offered to share theirs back, explicitly.
- **H2. Widen by adding.** The owner's policies stay byte-identical (a guard pins them). Member policies are added beside them: read, insert and update through one helper. Hard delete stays owner only, except a photo its author added (§0.3). Every pet-scoped table makes `pet_id` immutable. The four caller checks call a shared `can_write_pet()`, and the two guard tests are amended in the same PR. Members may update the incident read for the may-wait take-backs. Pet-to-pet guards stay untouched. Access never travels more than one hop.
- **H3. The invite.** Only the pet's owner invites. Through the share sheet; a single-use, short-lived token carried so it never reaches a server log; redeemed by an explicit tap, never on load. Nothing syncs until the owner confirms the person by name. The invitee confirms they are 13 or older. The invite says it is free for both people.
- **H4. Joining.** The invite survives an App Store install. An invitee is never routed into creating a pet; onboarding's first door asks "Joining someone's pet?". The landing reads "Care for Mochi with Jordan".
- **H5. Leaving a shared login.** "Give this phone its own login": the invite is held in memory; the phone sends everything it holds and stops if anything is unsent; quarantined entries are named and continue only on an explicit yes; it signs out of this phone only; the person signs up (legal acceptance and AI consent are per person) and redeems; the owner confirms; the owner is then offered a password change and a sign-out of other phones. Shared-login history stays the owner's, unattributed.
- **H6. One pantry.** A partner reads the owner's food and medicine libraries from day one. A pet's record only ever references rows owned by the pet's owner: a partner's own food is copied into the owner's library before anything references it. Bare food references on meals and trials gain the ownership check. Recents stay each person's own.
- **H7. The care plan (D2).** A partner can start, end and extend a trial and add or change a medicine. Each change is an append-only act, dated and named; an early end is undoable to the same trial; "Trial ended by Alex on day 41" stays on the owner's screen until seen. The trial's disclosure line reaches every person who logs feedings, not only the one who started it.
- **H8. The wall.** An owner-only action shows an inert line that explains, never a dimmed button.
- **H9. Losing access.** When the accessible pets shrink, the phone sends what it holds, runs the sign-out wipe without signing out, and re-hydrates. Local notifications naming a removed pet are cancelled. A phone offline at the time keeps its copy until it next syncs (a named limitation).
- **H10. The pet's weight snapshot** moves into a trigger on weight checks, so a partner's weigh-in updates it.
- **H11. Deleting an account.** An owner with partners is offered transfer first once transfer exists, and is never blocked. A partner who deletes their account leaves their entries on the pet's record, unattributed, with a role kept for the report.

### 4.4 The record (D5)

- **RC1. Author on every record family:** events, the care record (acknowledgements, vet calls, follow-up answers), intake answers, Noticed's looks (its reserved observer column), visits and appointments. Server-stamped through column grants and a trigger, write-once, never in a sync payload. Stamped only on pets with a second person, so a partner's entries from before they joined are never attributed to the owner.
- **RC2. Rendering.** One helper picks "You said", "Alex said" or a neutral form for unknown authorship; a single-person pet keeps today's strings byte-identical. The shared row (Home and History together) carries another person's name per F3 and none on the reader's own rows; detail always names the author, "You" included; the off-diet list and the sitter page never do.
- **RC3. Possible duplicates.** Same pet, same type, different authors, and: a vomit or stool within 30 minutes between seen times, or up to 3 hours before a found time; a meal of the same food within 90 minutes; a treat of the same food within 30 minutes. Detection runs at save, on hydration and in the server's pass.
- **RC4. The louder reading.** An unresolved pair counts as two in every count, reads the lower intake in every intake lane and carries the union of flags; the report notes it ("logged by two people N minutes apart; may be one").
- **RC5. "Same one?" (fast follow).** Asked where both entries are visible: the completion card when the other is already on the phone, both entries' detail, the Signal's evidence. A merge is a reversible link that keeps both authors, both photos, the seen time, the lower intake and every flag; "Not sure" stays unresolved. Doses never merge ("Given twice" or "Logged twice").
- **RC6. Doses across people.** The check keys on the regimen, else the medicine's canonical active ingredient, never one person's copy. It flags two given doses by different people closer than half the scheduled interval, with no one-to-two hour clamp, and any day with more given doses than the regimen's daily count. It re-runs on hydration and in the server's pass. At log time it settles "no conflict" only when this phone's last pull is newer than the dose slot; otherwise it is unknown. The regimen card at rest reads "Given 8:02 · Alex", or "No dose logged as of 8:31" (freshness is this phone's, never another person's). Opening the medicine pulls that pet's doses. Inside a dose window the button reads "Log another dose". D6 decides whether critical medicines also get a check before saving.
- **RC7. Urgent checks for entries from others.** A phone hydrating a vomit, lethargy or meal it did not write enqueues the urgent-check marker; the check only raises a read and never calls a model.
- **RC8. Days only a sitter logged** count toward coverage and never as days symptoms were watched in a falling comparison. Days with a household entry are not sitter-only. A regular sitter link's feedings count as exposures and never make a day covered.
- **RC9. Trial integrity.** A food added to the allowed set counts from the day it was added (B-456). A sitter's "Ate something else" writes an off-diet feeding, dated, with an identity row the pet's owner owns ("something else", in the sitter's words); a sitter's "No" writes nothing.
- **RC10. Intake.** "Fed" never writes how much was eaten. A cat's sitter is asked about the last bowl (empty, some left, untouched); two untouched answers send the sitter to call the owner, never to "picky". "Didn't eat / ate less" is a plain fact.
- **RC11. The owner's timezone** reaches server reads through a pet-owner context function, never the caller's profile.

### 4.5 The sitter link

- **SL1. Two kinds (D3).** A stay link ends the morning after its date; one tap extends it. A regular link has no date and ends after 30 days unused, when the person who made it loses access, or when the owner does not keep it at a 90-day check in the app. Any person with access to the pet ends a link at once.
- **SL2. Making a link.** The owner or a partner makes it; one link per person, labelled by the owner ("Maria, sitter"); it covers the pets chosen, on one page ("Fed everyone"; "Which cat? / Not sure" on anything found); at most three live per owner; every link is listed, with who made it, for everyone with access. Notes are prefilled from the trial and the regimens, with a preview of the sitter's page.
- **SL3. The token.** Unguessable, stored hashed, carried so it never reaches a server log or a link preview, sent in the request body, one error for every failure. The first browser to tap Start is the only one that can use it; the owner sees that first open once, never a visit log. The page carries no preview data, asks not to be indexed and loads nothing from third parties.
- **SL4. Hosting.** A static page on getculprit.app (the culprit-web repo, deployed from its main) calls a JSON Edge Function. The pet and the scope come from the token's row, never from the request.
- **SL5. Start.** Before anything shows: what is kept (the label, the entries and photos), that the owner sees the entries, how to ask for removal (the label then becomes "a sitter"), and the photo question (two equal buttons, no default). Then the page shows.
- **SL6. What the page shows.** The pet's name and photo, served through the function; the rules; today's care for the linked pets with times and no names ("Breakfast 7:10"; "Evening dose: given 6:10"; the sitter's own entries "by you", across extensions); doses due, with their exact state (refused never reads as given); the owner's instructions; the owner's and vet's numbers as typed; an escalation's result. A stay link shows its own end only after Start, worded about the link ("This link works until Sun 9 am"); a regular link shows no date. Never: history, appointments, AI reads, the report, notes, other pets, household names, the owner's email, or any word that says the owner is away. The page refetches on open and focus and says "as of".
- **SL7. What the page writes.** Append-only, from a fixed set: Fed as planned ("Fed everyone" with several pets); Ate something else (seen or found, an optional photo of the wrapper); Didn't eat or ate less; Vomit (found by default, its window ending now); Stool (normal, soft, diarrhea, blood); Dose given, or given in something else; the cat bowl question; Note (plain text). Server-stamped provenance. Each entry's id derives from the link and the tap, so a retry never doubles a dose. A ten-minute undo; after that, the owner corrects. One action removes everything a link added.
- **SL8. Offline.** Taps queue on the phone with their times and send on reconnect or reopen. Each button says "Sent" or "Saved on this phone, not sent yet".
- **SL9. Escalation on the page.** Each write runs the same escalation rules the app runs (no model) and returns the tier. Call now and call today show as "Call the vet now" or "Call Jordan today", with the numbers and a prefilled text from the sitter's own phone. The page never says or implies that Culprit told the owner, and never reassures (no "all good").
- **SL10. The visit text.** "Send to Jordan" builds a message from the visit's taps in the sitter's own messaging app ("Bella, 5:10: fed as planned. Pill 5:13."), in the words of what the sitter did, never "all good".
- **SL11. Photos (their own PR).** Re-encoded on the server, so location and device data never stay; size, type and count limited per link; read by the AI only with the owner's yes and the sitter's yes, charged to the owner from the link's allowance.
- **SL12. Ending.** Checked on every request. A link ended by a person refuses everything after; a natural end accepts entries tapped before it for a short grace. At the end the binding and the instructions are deleted, and no network addresses are kept. An ended page names no pet.
- **SL13. The owner's side.** Entries arrive on the ordinary pull. During a stay, Home's context line reads "Maria is helping with Mochi", and the evening Day Summary carries the stay. No owner surface ever says "nothing else eaten".

### 4.6 The vet report

- **VR1.** The owner of record comes from `pets.user_id`, in the signalment and every footer; never the caller's profile or email.
- **VR2.** A contributors line in roles: "Recorded by the owner and 1 household member; a sitter reported 11 entries, Mar 3 to 7."
- **VR3.** Appendix G gives each entry an observer initial and says: "Two people's entries on one day are two observations, not a change. Entries before {date} were made on a shared login; who recorded them is not known." Initials appear nowhere else.
- **VR4.** Incident and exposure rows carry a "sitter" tag only, never a household name. The footer reads "owner- and sitter-reported" when sitter entries exist.
- **VR5.** Unresolved possible duplicates are noted in the appendix.
- **VR6.** Sitter entries read "reported by a sitter" with their found-time window. The trial block names sitter windows with their feedings count. A sitter's "No" answers never print. Sitters get no Noticed baseline.
- **VR7.** A copy's report says "Copied from a shared record on {date}; later entries are not included" and states no clean trial across the copy date.

### 4.7 Consent, cost and price

- **CP1. Consent (D8).** As ruled. The phone shows the combined answer; a partner whose yes is overruled by the owner's no sees a line saying the owner turned reading off.
- **CP2. Cost.** AI use on a pet is charged to its owner; a sitter link draws from its own small allowance, so a link holder can never use up the owner's reads before an emergency. The per-pet Signal cap is unchanged.
- **CP3. Entitlements resolve on the pet.** When the pet's owner or a partner on that pet has Premium, everyone on that pet gets Premium on that pet. Never keyed on the caller. Ask's free allowance becomes the household's and its meter says so.
- **CP4. The 4-pet gate counts pets you own,** never pets you can see.
- **CP5. Caps, the same on every tier:** 4 accounts per pet (the owner and 3); 3 live sitter links per owner. Caps exist for safety and support, never as a paywall line.
- **CP6. The boundary table** gains a Free forever row: household sharing (partners, sitter links, the card, attribution, duplicate and dose checks, safety alerts once push exists, transfer, copies).

### 4.8 Ending access

- **EA1.** Removing a person (the owner), leaving (anyone) or ending a link (anyone with access) ends access at once and purges the device on its next sync. Entries stay; the person who left becomes a role.
- **EA2.** Removal and the shared-login move end by offering the owner a password change and a sign-out of other phones.
- **EA3.** A person leaving can save the vet report first.
- **EA4 (fast follow). Keep a copy.** At a clean break, the person losing access can keep a frozen copy as a new pet in their account: other people's names become roles; no future-dated items; the copy's past re-derives identically (stored reads verbatim, photos never re-read, referenced library rows materialized, both records tested to print the same report up to the copy date); author-only items never copy; nothing can link or merge the two records. The rule is disclosed at invite; the original never shows that a copy exists.
- **EA5 (fast follow). Transfer.** The owner names the recipient, who accepts; the history moves with the pet, and so do the library rows it references and the medicine photos; earlier names travel as roles.

### 4.9 Notifications

- **N1. v1 has no cross-person push.** The person logging sees every escalation; the sitter page hands off by person (SL9); the Day Summary carries a stay.
- **N2. The first server push (fast follow):** safety alerts to everyone with access, about the pet and never the logger, with no health detail in the payload, mutable without leaving, cancelled when access ends. Then an owner's opt-in for updates during a sitter's stay, which the sitter is told about and which ends with the link.
- **N3. Never:** "Tell me when someone logs", which in a two-adult home is a live signal of where one person is.
- **N4.** A follow-up question is scheduled on one phone per pet, never on two.

## 5. Permission matrix (the QA contract; every cell is a SQL or deno test)

"Ended" covers a removed person, an ended link, a stranger and the bare public key.

| Action | Owner | Partner | Other household, or a partner of two | Sitter link | Ended |
|---|---|---|---|---|---|
| Read the record | ✓ | ✓ | own pets only | today, linked pets, no names | ✗ |
| Log, edit, soft-delete | ✓ | ✓ | ✗ | fixed set; own undo for ten minutes | ✗ |
| Hard delete | ✓ | own photos only (pending §7) | ✗ | ✗ | ✗ |
| Change a row's `pet_id` | ✗ | ✗ | ✗ (bridge tested) | ✗ | ✗ |
| Trial and regimen changes | ✓ | ✓ (D2) | ✗ | ✗ | ✗ |
| Archive the pet, grant an account, transfer | ✓ | ✗ (leave only) | ✗ | ✗ | ✗ |
| Make or end a sitter link | ✓ | ✓ | ✗ | ✗ | ✗ |
| AI reads, Ask | per D8 | per D8 | ✗ | per D8, from its allowance | ✗ |
| Reference another account's library row | ✗ | through a copy only | ✗ | ✗ | ✗ |

Also tested: a removed person's phone purges on its next sync; the helper's argument forms are uncallable; A to B to C finds nothing; a single-person household is byte-identical with sharing off.

## 6. Out of v1

Server push (N2, fast follow) · "Same one?" (RC5, fast follow; the louder reading ships in v1) · keep a copy and transfer (EA4, EA5, fast follow) · a family helper or child role · a vet link · an App Clip · realtime sync · alerts about a person's activity (never) · a household-scoped library migration.

## 7. Privacy review (spec stage)

To run before the PM's rulings are written in: the `rls-privacy-reviewer` over §4.1, §4.3, §4.5 and §4.8, and the `adversarial-reviewer` over §4.4. Findings land here and on CUL-1935, with anything unfixed kept on Linear (G10).

## 8. Acceptance criteria (track level)

1. A partner invited by link joins in under ten minutes without creating a pet, sees the shared pets and their trial foods and medicines, and logs a meal that reaches the owner's phone on its next open.
2. Every §5 cell passes as owner, partner, a partner of two households, a sitter link and an ended party.
3. The PM's household leaves its shared login with nothing unsent lost, the owner's phone still signed in, and the history unattributed.
4. A partner's vomit, lethargy or meal raises the same urgent check as the owner's; a partner's 8:30 dose after the owner's 8:00 dose of the same medicine is flagged on both phones.
5. A sitter's escalation shows on the sitter page with the hand-off, without any text implying the owner was told.
6. Removal ends access at once and purges the removed phone on its next sync; the owner is offered a password change.
7. A single-person household is byte-identical with every flag off.
8. `logged_by` is never fabricated or client-supplied; no name appears on the off-diet list or a sitter's page.

## 9. Build plan (forecast: 25 rows)

**Order:** phase 0, then readiness and the record, then partners, then the sitter link. Schema PRs stay isolated; every migration is applied on the PM's typed number.

| Phase | Rows |
|---|---|
| **0. The card** (1) | P0 the card, client only (CUL-1293) |
| **1. Readiness and the record** (5) | R1 the owner's answer joins every AI door · R2 flags and consent by owner on the phone · RC-A the allowed set counts from the day a food was added (B-456) · RC-B doses across people · RC-C possible duplicates and the louder reading, engine and report |
| **2. Partners** (14) | S1 schema, dark: memberships, invites, secrets, helpers, the owner context function, AI use charged to the owner · F1 the invite function, held until C2 · S2 schema: the event family, pets, Storage, immutability, reports, attachments · S3 schema: the care record, looks, intake, capture changes, and both guard tests · S4 schema: library reads, copy-on-use, reference guards · S5 schema: the author column · E1 the report's Owner line, Appendix G, the contributors line, the may-wait timezone · C1 membership reads, the onboarding door, the library pre-sync · C2 the Sharing screens and leaving a shared login · C3 the purge · C4 attribution and author-aware copy · C5 dose freshness and "Given 8:02 · Alex" · T1 delete-account both ways and the dogfood cut · L1 the privacy policy, terms and App Store label |
| **3. The sitter link** (5) | SS1 schema: links, secrets, provenance, contacts · SF1 the link function, with the escalation rules in process · SW1 the page on getculprit.app (culprit-web) · SC1 the owner's link screens, foreign-row urgent checks, sitter-only days · SF2 sitter photos |

**Fast follows, outside the forecast:** push (about 4 rows) · "Same one?" · keep a copy and transfer.

**Reviews:** schema PRs get the `rls-privacy-reviewer`, the Migration Safety Pre-flight, the PM's `apply NNN` and the advisors. Functions get `code-reviewer` and deno tests (redeem race, cap race, replay, rate limit). R1, C3, SF1 and SF2 get the `rls-privacy-reviewer`. E1 gets `vet-report-cold-read`. RC-A, RC-B, RC-C, C5, SC1 and the sitter page's escalation copy get the `adversarial-reviewer` and the clinical-guardrails skill. P0, C2, C4 and SW1 get `nyx-voice` and `pm-feature-review`.

## 10. Known limitations

- A phone offline when access ends keeps its copy until it next syncs; sign-out is the backstop.
- Screenshots cannot be prevented; the sitter page minimizes what any screenshot can hold.
- culprit-web builds only from main and there is one Supabase project, so the sitter link has no staging; it runs dark for the PM's household first.
- A partner's edit and the owner's edit of the same row resolve by server arrival (last write wins), now with two authors; the true-authorship fix waits for evidence of real collisions.

## 11. Ripples

- **Tier 1 (`CLAUDE.md`), on D1:** the household Open Question moves to the decisions archive; the hard-constraints line on new tables notes the sitter link tables (per link, with a per-pet join) as the documented shape.
- **Tier 2, proposed and not written:** `docs/monetization-and-throttling-requirements.md` §3 (CP6, CP4, CP3); `docs/nyx-vet-report-requirements.md` (VR1 to VR7); `docs/nyx-diet-trial-requirements.md` (B-456, asserted exposures, sitter windows); `docs/nyx-med-strip-requirements.md` and `docs/nyx-medication-logging-requirements.md` (RC6); `docs/nyx-notification-foundation-requirements.md` (N2); `docs/culprit-competitive-landscape-2026-10.md` §V (household sharing "free at Tend & Mend" and ThePawcess's fridge card could not be confirmed on 2026-10-14; research brief §9).
- **Legal (L1, counsel to confirm):** privacy policy §1, §2, §4, §5 and §7; terms §2 retires login sharing; the App Store privacy label; a second demo account for App Review.
- **Linear, on D1:** the build project with this run order; CUL-1293 joins it as P0; a comment on CUL-194 pointing here.
