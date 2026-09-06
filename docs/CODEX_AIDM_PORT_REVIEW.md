# Independent AIDungeonMaster → Astra acceptance review

Status: IN PROGRESS — do not merge/deploy as a completed full port.

QA branch: `qa/codex-full-aidm-port`. Isolated worktree: `C:/dev/Astra/CodexPortQA`.
Initial target: `1ff90ff` (`upgrade/full-aidm-port`, local Claude work); phase 2: `0d78862`; main: `f28e098`.
Source inspected: `C:/dev/AIDM`, `5a695733e7b322d4eb1fd38de1c29f32fa30fbf8`.
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
