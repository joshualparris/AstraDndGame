# SRD content attribution

The data files under `server/srd/data/` (spells, classes, subclasses, races,
backgrounds, feats, fighting styles, epic boons) are derived from the D&D 5th
Edition System Reference Document 5.1 ("SRD 5.1"), which Wizards of the Coast
released as Open Game Content and, since 2023, also under the Creative
Commons Attribution 4.0 International License (CC-BY-4.0).

The structured JSON was sourced from the community project
[5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT License),
which compiles the SRD into machine-readable form. Astra's
`server/srd/data/*.json` files are a slimmed transform of that data (URLs and
cross-reference wrapper objects stripped, kept to the fields gameplay needs),
generated once from a local checkout and committed here rather than fetched
at runtime.

This project does not include, and must not have added to it, any text or
mechanics from:

- D&D Beyond's compiled/paywalled content beyond what SRD 5.1 itself covers
- Unearthed Arcana (WotC playtest material — not OGL/CC-licensed)
- Any other tabletop edition's proprietary rulebook text

Feat/fighting-style/epic-boon entries were re-categorized from the upstream
2024 SRD `Feats.json`, which bundles true feats, fighting styles, the
baked-in ability-score-improvement level option, and 20th-level epic boons
together; only true feats are exposed as `listFeats()`.

Content: Copyright Wizards of the Coast LLC, used under CC-BY-4.0.
