# Culprit — Veterinary Disclaimer

**Status: DRAFT** — pending PM review before hosting (B-273) and in-app acceptance wiring (B-270). Placeholders marked `[...]` must be filled before publication.

**Effective date:** [SET WHEN HOSTED]

This disclaimer is part of Culprit's [Terms of Service](./terms-of-service.md). It exists so there is no ambiguity about what Culprit is for — and what it must never be used for.

---

## Culprit is not a substitute for professional veterinary care

Culprit is an informational tool for recording what you observe about your pet and organizing it for your veterinarian. It is **not** a veterinary service. Nothing in Culprit — no log, trend, pattern finding, AI read, chart, or report — is a diagnosis, a treatment recommendation, medical advice, or a professional opinion of any kind. Using Culprit does not create a veterinarian–client–patient relationship with anyone.

Only a veterinarian who can examine your pet can diagnose or treat them. Culprit is built to make that visit more useful, not to replace it.

## Culprit never gives the all-clear

This is a design rule of the app, and it matters for how you read it:

- **A quiet app is not a healthy pet.** If Culprit shows no flag, no pattern, and no alert, that means nothing concerning was *detected in what you logged* — it does not mean your pet is well. Culprit only knows what you record, and many serious conditions produce nothing an owner can log.
- **AI reads describe one moment.** An AI read of a symptom photo describes what is visible in that single photo. It may flag the presence of something worth a call to your vet; it will never tell you the absence of a flag means your pet is fine — because it can't know that, and neither can any single photo.
- **Patterns are associations, not causes.** A pattern finding means two things tended to happen near each other in your logs. It is a conversation starter for your vet, not a conclusion.

If Culprit ever appears to tell you your pet is healthy, treat that as a bug in the app, not information about your pet.

## When to contact a veterinarian

Trust your judgment over the app, always. If your pet seems unwell, is behaving unusually, refuses food, or you are worried for any reason — contact your veterinarian, whether or not Culprit has flagged anything. In an emergency, contact a veterinarian or emergency animal hospital immediately; do not wait for, or consult, the app.

## Accuracy limits

Culprit's trends and findings are computed from what you logged, and are only as complete as your logging. AI-assisted features (photo reads, label extraction, phrasing) can be wrong or incomplete. Always verify AI-extracted medication details against the physical label before relying on them.

## Your acknowledgment

By using Culprit you acknowledge that you have read and understood this disclaimer, and that decisions about your pet's health belong with you and your veterinarian.

---

## Appendix — in-app acceptance copy (for the B-270 wiring PR; not part of the hosted document)

The one-line acknowledgment to render at the acceptance point (onboarding) and behind a Settings/About link, written in the app voice (nyx-voice checked: second-person owner, plain language, no exclamation marks, calm, never reassures):

> Culprit helps you notice and record — it can't examine your pet, and it never gives the all-clear. For diagnosis, treatment, or anything urgent, your vet is the call.

Acceptance control label (if a discrete acknowledgment is used):

> I understand Culprit is not a substitute for veterinary care.
