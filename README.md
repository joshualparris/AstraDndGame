# The Bell Beneath Blackthorn

An original solo fantasy text adventure inspired by fifth-edition tabletop play. Built for Josh.

The default experience is a Groq-powered open-world campaign in the original Hollow Marches setting: choose a level-2 Fighter, Rogue or Wizard, then attempt any plausible fictional action, travel beyond Blackthorn, invent goals and keep playing after quests resolve. The original authored adventure remains available at `/classic.html`.

## Play and develop

Run `npm start` and visit http://localhost:3000. Node 22+ is required. Run `npm test` to verify the authored adventure, open-world rules/state, provider recovery, API validation and executable DOM playthroughs.

Open-world play requires server-side Groq configuration described below. The classic adventure at `/classic.html` needs no API key or external AI service and can also be opened from the static files. Saves are stored in localStorage on the current browser and origin; they do not sync across devices.

Deploy the repository to Vercel with framework preset **Other** and output directory **dist**. `vercel.json` supplies the build command, runs the full deterministic/DOM QA suite before deployment, configures the output directory, and defines the `/api/turn` function. A deployment fails rather than publishing when those tests fail.

## Files

- `dist/engine.js`: serialisable rules and story graph for the classic adventure; also exports CommonJS for tests.
- `dist/app.js`: classic adventure UI and local save handling.
- `dist/world.js`: open-world UI, local-save validation, retry handling and signed-campaign client state.
- `dist/style.css`: responsive interface and reduced-motion support.
- `dist/index.html`: open-world page structure and character creation.
- `dist/classic.html`: original authored adventure.
- `server/world.cjs`: open-world state validation, signed saves, server dice, tracked resources and bounded world updates.
- `server/groq.cjs`: Groq request handling, model fallback, provider backoff and safe diagnostics.
- `api/turn.js`: Vercel API endpoint for campaign creation and turns.
- `test.cjs` and `test-world.cjs`: deterministic classic/open-world rules, playthrough and provider-recovery checks.
- `test-api.cjs`: API method, origin, validation, idempotency and error-mapping checks.
- `qa/rules.cjs`: open-world resource, dice, rest, state-bound and provider edge-case regression tests.
- `qa/dom.cjs`: executable front-end playtest covering creation, turns, resource controls, local saves, corrupt-save recovery and a complete classic route.
- `qa/live-smoke.cjs`: production smoke test for environments where CI execution is enabled.

## Rules scope

This is a streamlined custom fifth-edition-inspired game, not a complete implementation of D&D. Open-world mode uses server-side cryptographic d20 rolls and bounded AI-authored state changes. The classic adventure uses preset level-2 characters, single-enemy encounters, simplified hiding, custom class abilities and authored branches. Natural 20/1 special outcomes apply to attacks, not ordinary ability checks.

The AI Dungeon Master may adjudicate creative fictional actions, but the server remains authoritative for dice, available spell slots/potions, Fighter Second Wind, rest healing and bounded HP, gold and XP changes. Open-world characters currently remain mechanically level 2 while XP is tracked for narrative progression.

Fighters have a tracked Second Wind that heals `1d10 + 2` once and refreshes after a successful short or long rest. Healing potions cannot be consumed at full HP. Potion, Second Wind and rest healing are applied by the server once so narration cannot accidentally double-heal a character. Wizards regain spell slots on a successful long rest.

## Attribution

This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Story, characters and setting are original. Rules have been adapted as described above. No official affiliation is claimed.

## Open-world mode (v3)

The home page launches a free-text open-world campaign. Players can leave Blackthorn, travel, invent goals, talk freely, craft or attempt creative actions. A planning call determines whether a test is needed before Node's cryptographic random dice resolve it. A narration call receives that authoritative result and returns validated world updates.

The browser never receives provider keys. The API signs each complete campaign state, and only a successful full turn replaces the saved state. Progress, inventory, NPCs, places, quests, rolling memory and recent turns are carried forward. The opening scene is retained in the visible transcript after later turns, while long-term context is kept bounded for provider calls.

### Server configuration

For normal deployments, configure these **server-side environment variables** in Vercel, then deploy:

- `GROQ_API_KEY`: preferred primary Groq credential.
- `GROQ_API_KEYS`: optional JSON array (or comma-separated list) of additional authorised credentials used as availability backups. They are tried in order; requests are not rotated across credentials for throughput, and a provider 429 pauses the whole pool rather than moving to another organisation.
- `DND_SESSION_SECRET`: optional stable random signing secret of at least 32 bytes. If omitted, signing is derived from the first configured Groq key. Changing the signing secret (or first key when no secret is set) invalidates existing signed saves.
- `GROQ_MODEL`: optional primary model, default `openai/gpt-oss-120b`.
- `GROQ_FALLBACK_MODEL`: optional model fallback, default `openai/gpt-oss-20b`.

The repository contains no provider credentials. Keep all Groq keys in Vercel environment variables only. Keep `DND_SESSION_SECRET` stable across deployments when possible.

`npm start` runs the development server with `/api/turn`. `/api/turn` GET returns configuration/build status only; POST handles character creation and turns.

### Reliability and limitations

- Credentials are ordered primary → backup. A 401 disables the rejected credential for the current function instance and tries a backup. A 403 first tries the fallback model, then may try a backup credential to recover from project/model-permission differences.
- A Groq 429 honours `Retry-After` and pauses the **entire credential pool** for the current function instance. Backup credentials are not used to multiply provider quota.
- Both GPT-OSS models use strict JSON Schema output. If Groq returns a structured-output-related 400, the provider layer makes one compatibility retry using JSON Object mode; the normal server-side world validators still reject malformed or incomplete state before any save is changed.
- Malformed or incomplete successful model output can fall through to the configured fallback model instead of immediately losing the turn.
- Provider failures are logged server-side with safe diagnostics: HTTP status, provider error code/type/message, model, turn stage and retry delay. Keys, prompts, player actions and signed saves are not logged by this diagnostic path.
- A request has bounded action length, memory, output size and timeouts. Errors preserve the previous save and input. In-flight locks, 12 requests/minute/IP and a short idempotency cache reduce duplicate traffic per function instance; these are not distributed global limits. Larger public deployments should add a durable limiter and shared idempotency store.
- Saves are HMAC-signed and expire after 30 days without a successful turn. Storage remains local to the browser, not cross-device. Invalid/corrupt browser saves are discarded safely instead of being rendered as a campaign. Signed saves can be replayed by their owner; this is a single-player game, not a competitive economy.
- Gameplay sends the player's action and bounded campaign context to Groq. There is no browser-to-Groq connection.
- AI adjudication is intentionally bounded but is not a complete deterministic tabletop rules engine. Narrative continuity may occasionally need correction; older provider context is summarised rather than retained verbatim.
