Alias: Fixture go

A run order built for the preflight and project go tests (CUL-2888). Every row's issue is made up.

## Run order

| PR | Issue(s) | What it is | After | Lane |
|---|---|---|---|---|
| 01 | CUL-9001 | The first printer | — | A |
| 02 | CUL-9002 | The second printer | PR-01 | A |
| 03 | CUL-9003 | Vomit escalation wording | PR-01 | A |
| 04 | CUL-9004 | A migration for the fixture column | PR-01 | A |
| 05 | CUL-9005 | The third printer | PR-02 | A |
| 06 | CUL-9006 | An off-path tidy | — | B |
| 07 | CUL-9007 | The fourth printer | — | B |

**PR-01:** Builds `scripts/dispatch/fixtureA.ts`. Done when: the first table prints. Verify with: the fixture jest suite.

**PR-02:** Builds `scripts/dispatch/fixtureB.ts`. Done when: the second table prints. Verify with: the fixture jest suite.

**PR-03:** Edits `scripts/dispatch/fixtureD.ts` so a vomit log escalates sooner. Done when: the wording reads as the ruling says. Verify with: the fixture jest suite.

**PR-04:** Migration `supabase/migrations/150_fixture_col.sql`. Done when: the column exists. Verify with: the fixture jest suite.

**PR-05:** Builds `scripts/dispatch/fixtureC.ts`. Hotspot: `scripts/dispatch/common.ts`. Verify with: the fixture jest suite.

**PR-06:** Builds `scripts/dispatch/fixtureE.ts`. Done when: the tidy lands. Verify with: the fixture jest suite.

**PR-07:** Builds `scripts/dispatch/fixtureF.ts`. Hotspot: `scripts/dispatch/common.ts`. Done when: the fourth table prints. Verify with: the fixture jest suite.

**Critical path:** PR-01 → PR-02 → PR-05; PR-01 → PR-03 → PR-04

Done means (rows): 01, 02, 03, 04, 05, 07

Ship bar: the fixture passes.
