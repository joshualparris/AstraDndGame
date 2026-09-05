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
