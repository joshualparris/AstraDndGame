# The Bell Beneath Blackthorn

An original solo fantasy text adventure inspired by fifth-edition tabletop play. Built for Josh.

Choose a level-2 Fighter, Rogue or Wizard. Investigate a village whose dead have risen, descend into an abbey, and decide how to end its bellkeeper’s vigil. The adventure has visible d20 checks, initiative, armour class, critical hits, turn-based combat, class abilities, consumables, a journal and multiple endings. A peaceful resolution is possible.

## Play and develop

No dependencies, API keys, account or paid AI service. The narrator is an authored branching story, not a live LLM. Commands match action IDs, full labels or displayed numbers; `help`, `look`, `journal`, `rest` and `potion` are also supported.

Run `npm start` (Python 3 required) and visit http://localhost:3000. Run `npm test` to verify story paths, combat and resource rules. All game assets are in `dist/`; opening `dist/index.html` directly also works, although browser save behaviour on file URLs varies.

Deploy the repository to Vercel with framework preset **Other**, no build command, and output directory **dist**. `vercel.json` supplies the output directory. The game stores a single save in localStorage on the current browser and origin. New adventure replaces that save; it does not sync across devices.

## Files

- `dist/engine.js`: serialisable state, story graph, dice and combat; also exports CommonJS for tests.
- `dist/app.js`: DOM rendering, input, local saves and character creation.
- `dist/style.css`: responsive interface and reduced-motion support.
- `dist/index.html`: accessible page structure, character choices and rules dialog.
- `test.cjs`: deterministic rules and playthrough checks.

## Rules scope

This is a streamlined custom 5e-inspired adventure, not a full rules implementation. Preset level-2 characters, single-enemy encounters, simplified hiding, a custom power strike and ward, a single healing rest, and immediate adventure defeat at 0 HP keep solo play concise. Checks fail forward. Natural 20/1 special outcomes apply to attacks, not ability checks. Potions consume an action in combat. Second Wind is a free once-per-adventure action. Class resources do not recharge during this adventure.

No analytics, external fonts, external images or network calls are used by gameplay. Dice use JavaScript Math.random; this is entertainment, not security-grade randomness. Text is rendered using textContent, including player names and commands.

## Attribution

This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Story, characters and setting are original. Rules have been adapted as described above. No official affiliation is claimed.

## Open-world mode (v2)

The home page now launches a Groq-powered, free-text open-world campaign. The original authored adventure remains at `/classic.html` and its old save is preserved separately.

Players can leave Blackthorn, travel, invent goals, talk freely, craft or attempt creative actions. A planning call sets the check before Node's cryptographic random dice resolve it. A narration call receives that result and returns validated world updates. The UI never sends provider keys. The API signs each complete campaign state, and only a successful full turn replaces the saved state. Progress, inventory, NPCs, places, quests, a rolling memory and six recent turns are carried forward.

### Server configuration

For normal deployments, configure these **server-side environment variables** in Vercel, then deploy:

- `GROQ_API_KEYS`: a JSON array of the authorised Groq keys (or comma-separated keys).
- `DND_SESSION_SECRET`: optional stable random signing secret of at least 32 bytes. If omitted, signing is derived from the first Groq key. Changing the signing secret (or first key when no secret is set) invalidates existing signed saves.
- `GROQ_MODEL`: optional, defaults to `openai/gpt-oss-120b`; fallback is `openai/gpt-oss-20b` on connection/server failures.

The repository and deployment contain no provider credentials. Configure the variables above in the Vercel project before enabling open-world play. Keep the signing secret stable across deployments.

`npm start` now runs a small Node development server with `/api/turn`; export the variables before starting. Node 22+ required. `npm test` checks both modes. `/api/turn` GET returns configuration status only; POST handles character creation and turns.

### Reliability and limitations

- The supplied keys belong to separate organisations. A 429 cools down only that organisation for its full `Retry-After`, then the request tries another available organisation. Requests rotate their starting key to spread load. If every organisation is cooling down, the UI receives the earliest retry time. Set `GROQ_QUOTA_MODE=shared` if replacing these with keys from one organisation; in that mode a 429 pauses the whole pool.
- Authentication failures disable that key for the current function instance and try a backup, with at most one pool pass plus a model fallback, within a 35-second budget per generation. Provider outages may fall back to the smaller model. No unlimited retry loops.
- A request has bounded action length, memory, output size and timeouts. Errors preserve the previous save and input. In-flight locks, 12 requests/minute/IP and a short idempotency cache reduce duplicate traffic per function instance; these are not distributed global limits. Larger public deployments should add a durable limiter and shared idempotency store.
- Saves are HMAC-signed and expire after 30 days without a successful turn. Storage remains local to the browser, not cross-device. Signed saves can be replayed by their owner; this is a single-player game, not a competitive economy.
- The AI adjudicates fiction and proposes bounded state changes. This is not a complete deterministic 5e combat simulator. Inventory and narrative continuity may occasionally need a player correction. Older history is summarised, not retained verbatim. Characters remain mechanically level 2; XP is tracked for narrative progression.
- Gameplay sends the player's actions and campaign context to Groq. The application does not log prompts or keys. There is no browser-to-Groq connection.
