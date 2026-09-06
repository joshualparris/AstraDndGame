# AIDungeonMaster → AstraDndGame port matrix

Source repo inspected: `parristechservices-prog/AIDungeonMaster` (Next.js/TypeScript,
cloned read-only for inspection at commit visible in its `main` branch as of
2026-09-06). Target repo: this one, branch `upgrade/full-aidm-port` (built on
top of `upgrade/aidm-port-phase2`, a prior session's in-progress port).

This document is a living checklist. Decisions are based on reading actual
source files and tests in both repos, not filenames or doc claims alone.

## Headline finding

AIDungeonMaster is **not** a repository containing an exhaustive D&D 5e content
database (all races/classes/subclasses/backgrounds/feats/spells, levels 1-20).
Its character layer (`src/lib/game/characters/templates.ts`) defines exactly
six hard-coded level-3 pregens (Fighter/Wizard/Rogue/Cleric/Paladin/Ranger),
each with 0-3 known spells — the same scale of content Astra already has after
the phase-2 merge. Its own `docs/5e-rules-coverage.md` explicitly lists what
its tactical engine does and does not implement, and that list is already at
parity with what a prior Astra session ported in `qa/aidm-port.cjs`.

**Consequence:** the user's original ask ("every race/class/subclass/
background/feat/spell from every book, Unearthed Arcana, and every edition,
levels 1-20") cannot be satisfied by porting AIDungeonMaster — that content
doesn't exist there. It has to be authored as new structured data in Astra,
scoped to what can legally ship in a public repo: the Open Game Content /
Creative Commons System Reference Document (SRD 5.1 and the considerably
larger 2024 SRD 5.2), not D&D Beyond's paywalled compiled text, not
Unearthed Arcana (WotC playtest material, not OGL/CC licensed), and not other
editions' proprietary text. Game mechanics/numbers are not copyrightable on
their own, but the specific published expression is, so content here is
original write-ups of SRD-covered mechanics, not copy-pasted book text.

## Subsystem matrix

| Subsystem | Source files (AIDM) | Astra equivalent | Decision | Status |
|---|---|---|---|---|
| Tactical combat (initiative, movement, dash, disengage, OA, cover, reach/range, crits, skill checks, death saves, rests, spell-slot decrement, conditions) | `src/lib/engine/**`, `src/lib/engine/spatial/tactical/**` | `server/tactical.cjs`, `server/rules.cjs`, `qa/aidm-port.cjs` | ALREADY PORTED (prior session) | Verified passing; parity confirmed against AIDM's own coverage doc |
| Six base classes w/ mechanical stat blocks | `game/characters/templates.ts` | `server/openworld-classes.cjs` | ALREADY PORTED (phase-2 branch) | Verified passing after fixing 3 real bugs (see below) |
| Provider abstraction (multi-provider, key rotation, fail-closed on quota) | `src/lib/llm/provider.ts`, `credentials.ts` | `server/providers.cjs` | ALREADY PORTED (phase-2 branch) | Verified passing |
| Canonical campaign memory (importance-ranked facts, pruning, summary) | no direct equivalent found (AIDM uses `game/recap.ts`, simpler) | `server/canon.cjs` | ASTRA NOW SUPERIOR | Fixed a syntax error and a broken importance regex; Astra's version is more structured than AIDM's recap approach |
| Adjudication validation / repair loop | `src/lib/orchestrator/validate-dm-turn.ts` | `server/adjudication.cjs`, `qa/adjudication.cjs` | ALREADY PORTED (earlier session, this conversation) | Verified passing |
| Narration validation | `src/lib/llm/validate-narration.ts` | none dedicated (adjudication.cjs covers some) | PARTIAL — NOT YET PORTED | Not started |
| Exploration/spatial graph (areas, exits, distance) | `src/lib/game/adventures/area-graphs.ts`, `engine/spatial/area-graph.ts` | `server/tactical.cjs` exploration graph fns (per `qa/aidm-port.cjs`: "derives exploration graph from current location and exits") | ALREADY PORTED at a comparable scope | Astra intentionally keeps this lighter to preserve open-world freedom, per mission ยง6 |
| NPC/faction structured records | not found as structured model — AIDM state uses similar string/array lists | Astra: string arrays in state (`npcs`, `factions`) | NOT YET PORTED | Needs structured `{id,name,disposition,knowledge,lastSeen}` model |
| Monster catalogue | `src/lib/game/monsters.ts` (199 lines — small hand-authored set, not a bestiary) | Astra: single hard-coded `enemy-1` in tactical encounters | PORT + EXTEND | Not started — AIDM's set is small; will build a broader original monster table rather than copy WotC Monster Manual stat blocks (copyrighted) |
| Full race/class/subclass/background/feat/spell content, levels 1-20 | Does not exist in AIDM (see headline finding) | Astra: 6 flavor-only races, 8 backgrounds, 6 classes with 0-3 spells each, no feats, no subclasses, no formal 1-20 progression | AUTHOR NEW (SRD-licensed) | In progress — next checkpoint |
| Persistence / DB | `src/lib/persistence/client-snapshot.ts`, `src/lib/db/**` (Postgres via Vercel Postgres) | Astra: signed local-storage/export saves, no server DB | NOT APPLICABLE for now | AIDM's Postgres persistence is Next.js/Vercel-Postgres specific; Astra's simpler static-Vercel-function architecture doesn't have a DB. Recorded honestly per mission ยง13 rather than faked |
| UI/HUD (combat, character sheet, battle map) | `src/components/play/**` (React/Next.js) | Astra: vanilla JS/DOM (`qa/dom.cjs`-tested) | ADAPT CONCEPTS ONLY | Not a direct port — different rendering stack entirely; will port *capabilities* (spell/resource display, condition display, death/unconscious feedback) into Astra's existing DOM UI |

## Bugs found and fixed while verifying the phase-2 branch

The prior session's `upgrade/aidm-port-phase2` branch (6 classes, party state,
canonical memory, provider abstraction) had never actually been run to a
green test suite. Three real defects were found and fixed:

1. `server/canon.cjs:38` — syntax error (missing closing paren in `summary()`),
   which crashed every test file loaded after it.
2. `server/canon.cjs` `rank()` — importance regex used `\b(promis|betray|...)\b`;
   the trailing `\b` never matches inside inflected words like "promised"
   since there's no word boundary between "promis" and "ed". Fixed by
   dropping the trailing boundary.
3. `qa/aidm-phase2.cjs` — Divine Smite test asserted an expected damage total
   (26) that didn't match the implementation's own deterministic-max-roll
   math (27 = 1d8+3 weapon + 2d8 smite, all at max). The assertion had never
   been exercised before (the script crashed earlier in the file every time).

All three are now fixed and the full suite (`npm test`) is green.

## Next checkpoints (this document will be updated as they land)

1. Build SRD-licensed race/class/subclass/background/feat/spell data modules
   and a level 1-20 progression table, sourced from the official Creative
   Commons SRD content (not hand-waved from memory alone where avoidable).
2. Wire that data into character creation (choose race/class/background/
   feats/spells) and into a real level-up flow (HP/proficiency/features/
   spells update, replacing the static "Level 2 · 0 XP" display).
3. Structured NPC/faction records.
4. Narration validation port.
5. Extend the monster model beyond a single hard-coded `enemy-1`.
6. Save-schema migration for all of the above.
