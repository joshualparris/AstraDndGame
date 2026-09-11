# The Bell Beneath Blackthorn

An original solo fantasy text adventure inspired by fifth-edition tabletop play. Built for Josh.

The default experience is a Groq-powered open-world campaign in the original Hollow Marches setting: choose a level-2 Fighter, Rogue or Wizard, attempt any plausible fictional action, travel beyond Blackthorn, invent goals, level through play and keep playing after quests resolve. The original authored adventure remains available at `/classic.html`.

## Play and develop

Run `npm start` and visit http://localhost:3000. Node 22+ is required. The local server exposes the same `/api/turn` and `/api/tactical` routes used in production. Open-world AI turns require the server-side configuration below; the classic adventure needs no API key.

Run `npm test` for deterministic rules, progression, economy/inventory authority, signed-state, server-audit, API, tactical-depth, model-boundary, tactical-idempotency, DOM and engineering-principle checks. GitHub Actions adds Chromium playthroughs and the production branch adds a live deployment smoke test.

Deploy to Vercel with framework preset **Other** and output directory **dist**. `vercel.json` uses `npm ci`, runs a deterministic deployment-sanity build, supplies security headers and configures both API functions. Full behavioural/browser QA remains the GitHub Actions merge/release gate so a temporary test failure does not destroy every preview URL.

## Engineering standard

Astra is governed by the [26 engineering principles](docs/CODE_PRINCIPLES.md). The [principles audit](docs/PRINCIPLES_AUDIT.md) records the repository-wide structural/invariant pass and its limitations; deeper file-by-file audit work should be added without overstating unaudited areas. The most important AI-game rule is: **the engine owns truth; AI proposes fiction.**

That rule also applies to the economy. The model may propose narrative consequences, offers, purchases and rewards, but the server rejects unauthorised gold or inventory changes. A conversation cannot silently charge the player; a purchase must atomically spend affordable gold and add the item; a sale must remove the item before awarding gold; and an offered reward remains an offer until the player explicitly accepts it.

## Current roadmap

The [campaign experience review](docs/AI_IMPROVEMENT_SUMMARY.md) records the 2026-09-11 live-play review and current priorities. Story-first mobile play, ordinary-conversation adjudication, deterministic progression and class-aware tactical combat are implemented. The next large product work is automatic narrative-to-tactical encounter creation, richer structured equipment, durable campaign history and smoother accessible turn delivery.

The broader [improvement backlog](docs/IMPROVEMENTS.md) is intentionally historical and partly superseded. Treat its entries as research context, not the current source of truth.

## Architecture

- `dist/index.html`: open-world page structure and character creation.
- `dist/state-validation.js`: canonical browser boundary validation for local saves, backups and API campaign responses, including bounded progression reports.
- `dist/world.js`: open-world UI, local commands, transient level-up presentation, retry/idempotency client flow and incremental transcript rendering.
- `dist/extras.js`: explicit campaign backup/restore, save slots, safe undo, read-aloud and display preferences.
- `dist/aidm-port.js`: world/tactical presentation and class-specific tactical controls. Consequential actions are always resolved by the server.
- `dist/engine.js` / `dist/app.js` / `dist/classic.html`: self-contained authored classic adventure.
- `server/classes.cjs`: authoritative open-world class statistics used by server rules.
- `server/rules.cjs`: deterministic resources, conditions, damage, proficiency, progression, recognised equipment effects and death-save mechanics.
- `server/world.cjs`: versioned campaign state, signed saves, server dice, server-owned levelling, meaningful defeat consequences, bounded state updates and prompt context.
- `server/spatial.cjs`: authoritative exploration graph projection.
- `server/tactical.cjs`: authoritative tactical grid, reachability, enemy archetypes, cover, movement, class actions, spellcasting and enemy turns. Campaign `state.hp` is authoritative; tactical hero HP is a projection of it.
- `server/turn-contract.cjs`: bounded locally validated AI narration/state-update contract.
- `server/turn-authority.cjs`: deterministic player-agency checks for model-proposed gold and inventory changes.
- `server/model-output.cjs`: one bounded repair/fallback path for malformed or unauthorised model output.
- `server/http.cjs`: shared request-body, origin, trusted-proxy, rate-limit and cache helpers.
- `server/secret.cjs`: campaign-signing keyring and migration policy.
- `server/groq.cjs`: ordered provider-credential failover, model fallback, organisation-rate-limit backoff and redacted diagnostics.
- `api/turn.js`: character creation and narrative turns, including server-side economy/inventory validation.
- `api/tactical.js`: signed tactical operations with request-id best-effort per-instance idempotency.
- `qa/`: behaviour, progression, economy-authority, tactical-depth, browser, live-production and engineering-invariant regressions.

## Rules scope

This is a streamlined custom fifth-edition-inspired game, not a complete implementation of D&D. Open-world mode uses server-side cryptographic d20 rolls and bounded AI-authored fiction. Natural 20/1 special outcomes apply to attacks, not ordinary ability checks.

The AI Dungeon Master interprets creative intent and narrates consequences, but code remains authoritative for dice, checks, spell slots, potions, Fighter Second Wind, levelling, rest healing, attack damage, signed campaign state, economy/inventory mutations and tactical combat. Ordinary information-seeking — including asking the Dungeon Master to look at the character sheet or inventory — is normal in-world input, not prompt injection. Influence, deception, intimidation or meaningful uncertainty may still call for a roll.

Open-world characters start at level 2 and can progress to level 5. The server converts XP into levels at **15 / 35 / 60 XP**. The model may award only **0–3 XP per turn**: 0 for trivial activity, 1 for useful progress, 2 for meaningful risk or discovery, and 3 only for a major objective. The model is explicitly forbidden from granting or announcing levels itself. Level gains increase maximum HP, wizard spell slots and class features. Fighters gain Improved Critical at level 3 and Second Wind heals `1d10 + level`; Rogues gain larger Sneak Attack pools at levels 3 and 5; Wizards gain additional spell slots as they level and Fire Bolt becomes 2d10 at level 5; proficiency rises to +3 at level 5.

Tactical encounters now use deterministic level-scaled enemy archetypes rather than one permanent enemy stat block. Bruisers, skirmishers and archers differ in durability, armour, movement, attack profile and preferred range. Cover affects ranged attacks. Rogues can use bonus-action Dash, Disengage and Hide; Fighters can use Second Wind as a bonus action; Wizards can cast Magic Missile; healing potions can be used in combat; and the normal attack action remains Longsword, Shortbow or Fire Bolt by class. Tactical defeat remains playable rather than deleting the campaign, but three failed death saves now impose a bounded server-owned setback: the hero returns at 1 HP, gains Exhausted and loses up to 5 gold. A long rest clears Exhausted.

Inventory is no longer wholly fictional, but it is not yet a generic item engine. A conservative recognised-equipment layer makes specific names mechanically real: `+1 Longsword`, `Flaming Longsword` / `Flame-touched Longsword`, `+1 Shortbow`, and a `+1 Wand`, `+1 Staff` or `+1 Arcane Focus`. Arbitrary custom items can still exist in the fiction without automatically inventing combat statistics; richer structured equipment remains roadmap work.

Healing potions cannot be consumed at full HP. Wizards regain their current level’s spell slots on a successful long rest. Tactical encounters are server-authoritative but are not yet created automatically from narrative encounters; integrating those two systems remains a roadmap item.

## Open-world state and persistence

The home page launches a free-text open-world campaign. A planning call decides whether one d20 test is needed; Node resolves any authoritative roll/resource consequence; a narration call receives that result and may propose only bounded, schema-validated world updates. Gold and inventory proposals also pass deterministic player-agency checks before they can reach the save. One bounded repair attempt lets the model correct an invalid proposal; a second invalid result fails closed and preserves the prior save.

Only a completely validated turn replaces the previous save. The browser never receives provider keys. Campaign states are HMAC-signed and expire after 30 days without a successful turn. Saves, backup files and slot imports are validated before rendering. The current signed-state format is v3; missing fields from supported v3 saves are explicitly upgraded before validation. Level-up reports are response-only metadata: they are stripped before signing and before browser local persistence, so a refresh cannot replay an old level-up notification.

Normal turns and tactical actions carry request IDs. Per-function-instance response caches make ordinary retries on the same warm instance return the same response. This is **not** distributed global idempotency: a retry routed to another Vercel instance can resolve the same signed pre-turn save again and therefore make another provider call. A larger multi-instance service should use durable shared idempotency/rate-limit storage.

## Server configuration

Configure these **server-side environment variables** in Vercel:

- `GROQ_API_KEY`: preferred primary Groq credential.
- `GROQ_API_KEYS`: optional JSON array (or comma-separated list) of additional authorised credentials used in order for availability failover.
- `DND_SESSION_SECRET`: stable primary campaign-signing secret of at least 32 characters/bytes. This should be configured explicitly and kept stable across deployments.
- `DND_SESSION_SECRET_PREVIOUS`: optional JSON array or comma-separated list of previous explicit signing secrets retained temporarily during a planned rotation.
- `GROQ_MODEL`: optional primary model, default `openai/gpt-oss-120b`.
- `GROQ_FALLBACK_MODEL`: optional model fallback, default `openai/gpt-oss-20b`.

During migration from older deployments, `server/secret.cjs` can still verify saves signed with the legacy Groq-key-derived secret while that Groq key remains configured. Once `DND_SESSION_SECRET` is present, all **new** saves use the explicit stable secret. **Set `DND_SESSION_SECRET` and redeploy before revoking or rotating any Groq credential that may have signed an existing save.** Keep any legacy provider key needed for old-save verification until the 30-day save window has elapsed, then the provider-derived fallback can be removed in a later migration.

The repository contains no provider credentials. Keep all Groq keys and signing secrets in server environment variables only. Public API health responses intentionally report readiness/features/build information without revealing provider-key counts or signing mode.

### Reliability and privacy

- Credentials are tried in configured order for availability. A 401 temporarily marks the rejected credential unhealthy; network failures, timeouts, 403 project/model differences and upstream 5xx responses can progress through fallback models/credentials within the bounded request deadline.
- A Groq 429 honours `Retry-After` and pauses the provider pool for that function instance. Groq documents organisation-level ceilings, so the app does not try to bypass a 429 by hopping API keys.
- Structured model output is validated locally before domain logic. One bounded repair attempt uses the configured fallback model; two invalid responses fail closed and preserve the prior save.
- Provider diagnostics retain safe status/code/type/cause/model/stage/retry metadata. Keys, provider response text, prompts, player actions and signed saves are not logged by the API diagnostic path, and provider codes are not echoed in player-facing errors.
- Action length, request body size, model context/output, histories, state arrays, caches, retries and network timeouts are bounded.
- Invalid browser saves and backups are discarded/rejected safely rather than rendered as trusted state.
- Gameplay sends the player's action and bounded campaign context to Groq. There is no browser-to-Groq connection.

## Attribution

This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Story, characters and setting are original. Rules have been adapted as described above. No official affiliation is claimed.
