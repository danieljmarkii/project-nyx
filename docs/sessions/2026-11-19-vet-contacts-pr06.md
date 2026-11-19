# Vet contacts PR-06: a call, text or email reads as itself on the record

**Date:** 2026-11-19
**One thing:** G1 L1 — A commit is a saved snapshot, so what you have not committed has no copy to come back from · check: pending

Shipped via #1570 ([CUL-2768](https://linear.app/projectnyx/issue/CUL-2768)). A dispatched routine row, and this round's teach row. The PR body carries the Definition of Done and the QA script.

## What shipped

Behind the Vet contacts flag and the owner's Early access switch:

- **The list** tags each past row Visit, Phone, Text or Email, and a call says "No exam" on its own line.
- **The contact's page** is titled by its channel ("Nyx's call"), says "no exam" under the title, and splits into *What the vet sent* and *What the vet started*.
- **A medication's page** says where a course came from: "Started after a call with the vet, Nov 9".
- **History** titles a call "Phone call with the vet · … · no exam", never "Vet visit".
- **Share** sends a call as a call, with "no exam".

## How it went

- **The product review caught two quiet overclaims,** both fixed before CI finished:
  - Share sent a call as "vet visit". That is the one surface built for a second reader, often a second vet.
  - A course whose source channel the phone never learned printed "Started after a visit". It now draws no row, and the type system now refuses an unknown channel at that call site.
- **One near miss in the session:** a test file name collided with PR-03's, and the write replaced it. The restore came from the last commit, which is today's teach.

## Residual

The flag gates the surfaces, and the Early access switch is per phone. So on a phone where the owner never switched it on, a call logged on another phone still reads "Vet visit". Added to [CUL-2829](https://linear.app/projectnyx/issue/CUL-2829), the class of surfaces that still call a contact a visit.

## Teach

Re-ask first, from PR-03, still ungraded: a phone running an older app pulled a call before the "how did you hear" field existed. Why does its next sync leave that field out, rather than send "at the clinic"?

### One thing — A commit is a saved snapshot (G1, L1)
A commit is a photograph of every file at one moment, with a note saying why. Git can always hand you back any file exactly as it was in a photograph. It cannot hand back anything you changed after the last one, because no photograph of that exists. Today that cut both ways. A file from PR-03 got overwritten by mistake and came back whole, because PR-03 had committed it. Minutes earlier, the same restore command wiped an hour's edits to the list row, because those edits were not committed yet. Only a spare copy made by hand saved them.

**Like:** a camera roll. Delete a photo you took and it comes back from the album. The scene you were about to shoot was never on the roll.

**In today's work:** the restore that saved PR-03's test
```
git checkout HEAD -- lib/vetContacts.test.ts   # put this file back exactly as the last commit holds it
```

**Why it matters to you as PM:** a session's work is safe only once it is committed and pushed. A session that ends before its commit loses whatever it has not committed, and nothing recovers it.

**Check:** a session edits three files, commits two and pushes that commit, and then the container is reclaimed. Which of the three can the next session get back, and from where?
