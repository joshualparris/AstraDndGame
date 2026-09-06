# Independent AIDungeonMaster → Astra acceptance review

Status: **FAIL for merging/deploying as a completed full port**, audited 2026-09-06. Claude's implementation remains in progress; this is a completed review of the pinned snapshot, not certification of future commits.

QA branch: `qa/codex-full-aidm-port`. Isolated worktree: `C:/dev/Astra/CodexPortQA`.
Initial target: `1ff90ff` (`upgrade/full-aidm-port`, local Claude work); phase 2: `0d78862`; main: `f28e098`.
Source inspected: `C:/dev/AIDM`, `5a695733e7b322d4eb1fd38de1c29f32fa30fbf8`.
The supplied scratchpad source checkout resolves to the same SHA and has no tracked changes. Both source paths therefore represent the same reference.
No shared production files changed. Tests use exported production interfaces and synthetic data; no live providers or credentials.

## Reproduction

Run `node qa/codex-combat-parity.cjs`, `node qa/codex-ai-adversarial.cjs`, `node qa/codex-save-compat.cjs`, and `node qa/codex-long-campaign.cjs` from this worktree. All assertions express desired behavior, so unresolved defects exit nonzero. To test another checkout, set `ASTRA_QA_TARGET` to its absolute path. Baseline evidence is preserved in `qa/evidence/`.

## Confirmed defects (initial snapshot)

| ID / severity | Repro test | Observed behavior / likely cause | Suggested fix / source reference |
|---|---|---|---|
| D01 High | C04, C05 | `tactical.move` checks destination only: crosses a full blocked wall; charges 10 instead of 15 feet through difficult terrain. | Port path search and per-cell costs; source `src/lib/engine/spatial/tactical/movement.ts` implements Dijkstra. |
| D02 High | C13, C14 | `startEncounter` maps zero HP to one via `Number(s.hp)||1`; attack accepts zero-HP actor. | Preserve zero and gate actions; source engine rejects unconscious attacks. |
| D03 High | C15, C16 | First death ends battle with living enemy; only `enemy-1` takes a turn. Synthetic second actor tests planned multi-monster contract, not currently reachable UI creation. | Victory checks all hostiles; enumerate initiative actors. Source `engine/index.ts` has initiative/monster turns. |
| D04 Medium | C17, C18 | Rogue registry advertises shortbow but tactical attack is melee; wizard registry says 120 ft but tactical function permits 60. | Route all classes through consistent weapon profiles. |
| D05 Medium | C19 | Monster natural-20 OA deals 7 rather than 13 damage under maximum dice. | Double damage dice on critical; compare source OA engine. |
| D06 High | A03 | Unknown spell spends slot and is accepted. No spell-name or known-spell validation in plan contract. | Add typed spell request; source `cast_spell` checks recognized and character-known spells. |
| D07 High | A05 | Narrative-only object accepted despite required turn-schema fields. | Validate locally before committing. Source DM-turn validator checks requests. |
| D08 High | A06, A07 | Unrequested or blocked long rest restores slots. `characters.afterTurn` trusts `result.rest` after world layer blocks rest. | Apply resources only from accepted engine rest result. |
| D09 High | A08 | Invented opportunity-attack narration with `hpChange:-12` damages hero during harmless observation. | Engine-authored damage/targets; narration cannot authorize mechanics. |
| D10 High | A09 | With one gold, claimed 50-gold purchase awards armour and clamps gold to zero. | Reject unaffordable transaction atomically. Source `update_inventory` rejects insufficient gold. |
| D11 Medium | S03–S05 | Signing/verification accepts negative gold, HP above maximum, duplicate companion IDs. | Semantic save validation. Tests use legitimately signed synthetic invalid state; not a signature-forgery exploit. |

## Acceptance matrix (initial snapshot)

| Capability | Status | Evidence / limits |
|---|---|---|
| Move budget, Dash, Disengage, occupied destination | PASS | Independent C01–C03, C06, C11–C12; source movement/OA tests |
| Blocked path / difficult path costs | FAIL | D01 |
| Initiative order / multiple monsters | NOT YET PORTED | Fixed hero/enemy-1 loop; D03 demonstrates extensions are unsafe |
| Cover, melee reach, nat 1/20 player damage | PASS | C07–C10; simple static line cover only |
| Class-specific tactical ranges | FAIL | D04 |
| Unconscious tactical actor | FAIL | D02 |
| Death saves outside tactical encounter | PARTIAL | A04; tactical encounter closes at zero HP |
| Monster critical damage | FAIL | D05 |
| Six class creation | PARTIAL | Registries exist; full feature/spell parity absent |
| Typed known spells, per-level slots, class features | NOT YET PORTED | Scalar slots; only Second Wind explicitly tracked; source templates have features and spell levels |
| Exhausted slots / Second Wind | PASS | A02, A10 |
| Correct rest authorization | FAIL | D08 |
| Levels 1–20 / proficiency progression | NOT YET PORTED | Level 2 and +2 proficiency hard-coded; source `characters/level.ts` scales level/HP/attack proficiency |
| Automatic XP leveling | SOURCE DOES NOT ACTUALLY IMPLEMENT IT | Source level helper is explicit setup scaling; Astra explicitly calls XP narrative tracking |
| Valid legacy v3 saves | PARTIAL | 18 synthetic preservation cases + 256 missing optional-field combinations; no new migration schema yet |
| Save invariants | FAIL | D11 |
| AI plan repair/fail closed | PASS | A01, A11–A12 |
| AI narration/mechanical boundary | FAIL | D06–D10 |
| Long campaign retention | PARTIAL | Synthetic 10/30/100/300-turn runs; semantic retention review ongoing |
| Open-world command acceptance | PASS | Eight arbitrary commands pass through mocked plan/application; live narration not assessed |
| Large footprints | NOT YET PORTED | Source grid/movement supports 2×2; port stores single x/y |
| Huge footprints, concentration, resistances, monster multiattack | SOURCE DOES NOT ACTUALLY IMPLEMENT IT | Source coverage document and engine scope; not required to fabricate parity |
| Browser/mobile | PARTIAL | Existing DOM suite passes; independent browser run pending |

Source limitations are not automatically port bugs. Source uses a bounded spell whitelist and simplified healing/feature behavior, level scaling does not scale spell slots, and its documentation explicitly excludes several full-5e systems. This review targets actual implementation, not full D&D rules.

## Final snapshot and independent evidence

Final target: **`323173594533e2f779799fd043daab3560b1e7ff`**, `origin/upgrade/full-aidm-port`. Tested from a detached snapshot at `C:/dev/Astra/CodexPortSnapshot` to avoid changes during a run. Origin was fetched before the baseline and again during/following the audit. Main and phase-2 references remain `f28e098` and `0d78862`; phase 2 is exactly 13 commits ahead of main.

Phase 2 adds three class definitions, companion scaffolding, bounded canonical memory, provider abstraction, and browser/API wiring. The local `ffee759` correction fixed canonical-memory syntax and inaccurate assertions before this audit began. `1ff90ff` adds Claude's port document, which was not used as the acceptance oracle. `3231735` adds SRD datasets and lookup functions: 12 classes, 319 spells and level tables. **Those new tables are not imported into the active turn/tactical mechanics at this SHA.** Data availability does not establish playable feature parity. Existing runtime defects reproduce unchanged.

| Suite | Checks | Pass | Fail |
|---|---:|---:|---:|
| Independent combat | 24 | 13 | 11 |
| Independent AI boundary | 17 | 8 | 9 |
| Legacy saves / invariants | 22 | 19 | 3 |
| Long campaigns / open-world | 12 | 8 | 4 |
| Classes / progression | 16 | 12 | 4 |
| Provider failure / API retry | 8 | 8 | 0 |
| Executed source/port comparisons | 4 | 0 | 4 |
| Browser regression | 25 | 25 | 0 |
| **Independent total** | **128** | **93** | **35** |
| Reference AIDM Vitest suite | 413 | 413 | 0 |

In addition, all **11 existing Astra npm-test entrypoints** pass at the final SHA, including SRD tests. Their internal assertions are not added to the named-test total because several scripts do not publish counts. Thus 541 explicitly counted checks ran (506 pass, 35 fail), plus the 11 existing script entrypoints. Repeated baseline runs are not double-counted. The 1,000 coordinate, 500 malformed-plan and 256 optional-save combinations are iterations inside three counted checks, not 1,756 additional tests.

Raw final outputs: `qa/evidence/latest-*.txt`; source suite: `qa/evidence/source-vitest.json`. Screenshots: `qa/evidence/browser-1366.png`, `browser-768.png`, `browser-360.png`. All data and credentials in the custom tests are synthetic. Save compatibility tests sign the untouched legacy object directly, avoiding accidentally upgrading it before exercising verification.

## Additional confirmed defects and limits

| ID / severity | Exact reproduction | Source vs Astra / likely cause / suggested fix |
|---|---|---|
| D12 High | `node qa/codex-long-campaign.cjs`, M01 | Hidden item under Blackthorn bridge disappears by turn 10; Mira's favour disappears by turn 30, also absent at 100/300. Checks scan all serialized state for semantic terms, not just exact canonical IDs. Input deliberately stops repeating earlier facts, exercising retained memory. `canon.prune` keeps only eight low-importance facts; hidden items/favours are ranked low. Preserve unresolved obligations and hidden-object facts with explicit records. Vane's betrayal and Greyhaven promise survive these runs. Bounded memory passes; durable retention fails. This is an Astra promise/regression requirement, not proof of arbitrary-duration source memory. |
| D13 High | R02 at 5/10/20; X04 | Source executed proficiency is 3/4/6; port remains 2. Newly imported SRD data is unused by `world.resolve`. Derive mechanical proficiency from the authoritative character level. Levels 1–4 tests only establish modifier/save acceptance, not supported creation at those levels. |
| D14 High | A13 | After deterministic natural-1 miss, narration saying the attack hit and killed the enemy is accepted. No local outcome-to-narration validation. Source has `llm/validate-narration.ts` and orchestration validation. Reject/repair contradiction before committing narration. |
| D15 Medium | A14, A15 | Local `validPlan` accepts extra `characterId`/`targetId` values despite `additionalProperties:false`. Current engine ignores these fields, so this is contract-validation failure, not demonstrated arbitrary-target damage. Validate exact schema plus actor references when typed requests arrive. Unknown NPC / condition-target semantics cannot yet be represented. |
| D16 High | C21 | A second enemy never makes an OA or consumes a reaction. `move` only looks up `enemy-1`. Enumerate eligible hostile actors along movement path. Multi-enemy fixture is synthetic because creation currently supports only one. |
| D17 High | C22 | `tacticalAttack(state,'hero')` succeeds, damaging the hero combat actor while top-level hero HP remains unchanged. Validate hostile target identity and keep authoritative HP synchronized. Source character attack resolves monster targets. |

No newly reported defect was fixed by Claude during this audited interval. **17 grouped defects remain unresolved**; 35 failing checks include repeated manifestations and four differential confirmations. No production fixes were applied by Codex.

## Updated acceptance and completion answers

1. **Full source port? NO.** Core action schemas, initiative, multi-monster actors, large footprints, per-level slots, known spells, features and progression are incomplete. New SRD data exceeds source content breadth but is not connected to play.
2. **Correct behavior? NO overall.** Basic turn economy, cover, player crits, exhaustion gates and death-save redirection pass; listed defects fail.
3. **Old Astra regressions? No failures found in exercised browser/old suites.** This does not validate untested paths. Phone composer sits below a long sidebar and requires scrolling; the screenshot records this usability concern rather than treating it as a new port regression.
4. **Old saves survive? YES for tested valid v3 variants.** 18 synthetic legacy scenarios and 256 optional-field combinations preserve tested data. Invalid-state semantic checks fail. There is no new schema migration at this SHA to certify. Expired saves remain expired by existing policy.
5. **Combat deterministic? PARTIAL.** Injected dice are repeatable; mechanics are wrong for paths, downed actions, class ranges, monster crits and multiple actors. Fleeing has no exported deterministic end-combat operation; large creatures are not ported.
6. **Can AI errors corrupt mechanics? YES.** Unrequested rest, invented damage, illegal purchases and unknown spells reproduce. Signature integrity cannot repair incorrect server-authorized changes.
7. **Multiple classes work? PARTIAL.** All six create/save/render and have basic profiles; detailed feature/spell/level parity is absent. Starting stats deliberately differ from source level-3 templates; no false demand for identical starting HP. No verified six-class full-rule acceptance.
8. **Multiple monsters work? NO.** Creation is singular and synthetic two-enemy states fail turns, victory and OA behavior.
9. **Long-term campaign state survives? NO for all required facts.** M01 proves two important facts are lost; bounded growth and canonical ID deduplication pass.
10. **Still open-world? YES at tested interfaces.** Eight free-form actions are accepted; browser bakery/ignore-quest commands work through real handlers. No authored-scene whitelist was introduced. Live model willingness and narrative quality were not tested.

## Browser and provider scope

Browser tests use real API handlers, real HMAC save signing/verification and real UI; only DM generation is mocked. Chromium checks cover six classes × desktop 1366×768 / tablet 768×1024 / phone 360×800, creation, free text, local saves, reload, downloaded backup, map, safe undo, file import, tactical start/HUD, wizard spell consumption, suggestion buttons, unconscious action/death saves, and a 100-entry imported transcript with log accessibility semantics. Input is interactable after scrolling, with no horizontal overflow or page exceptions. This does not prove screen-reader announcement quality, no scroll jumps, complete death/recovery paths, or multiple-monster UI behavior. Browser save-slot writing is tested; slot-load behavior also has coverage in the existing suite, but was not newly exercised by the independent browser suite.

Provider tests mock timeout exceptions (not a real wall-clock timeout), HTTP 500/401/429, malformed JSON, next model/key/provider, exhaustion, failed narration rollback, retry and duplicate-response caching. Rate limit deliberately fails closed, without key/provider rotation to bypass quota. Idempotency is verified in one handler process; distributed/cold-start replay remains unverified because cache/locks are in-memory Maps.

## Re-running against Claude's next commit

Set `ASTRA_QA_TARGET` to a clean checkout of the target SHA. Run `node qa/codex-run.cjs`; add `--browser` when Playwright is installed. Set `SOURCE_AIDM_ROOT` to a source checkout with its `tsx` dependency to include live differential checks. Browser/dependency resolution uses ordinary Node resolution (`NODE_PATH` can reference existing dependency folders without changing package.json). Nonzero exit means acceptance is not met. Preserve baseline evidence and write each new revision's outputs separately; do not overwrite this snapshot's conclusions without a fresh run.

Final recommendation: **FAIL / do not merge or deploy this snapshot as the completed AIDungeonMaster port.** QA branch additions are reviewable independently and do not modify Claude's production systems.
