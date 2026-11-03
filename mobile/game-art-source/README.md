# Soft Orbit gameplay art

The six approved November 3 previews are the visual references: the existing
powder-blue, lilac, dusty-rose, mint and pearl illustrations, with cleaner edges
and very shallow depth. No realistic materials, scenery, or new visual theme.

`covers/` contains the approved imagegen originals. `kits/` contains the original
transparent gameplay sheets generated with the built-in imagegen tool. Generation
prompts and provenance are in `sources.json`. These masters are never packaged.

Run `node mobile/tools/gameplay-assets.mjs` with Sharp available to export the
sprites, exact geometric boards, resolution variants and optimized covers. This
cleans stray alpha flecks, crops, sizes and compresses the imagegen sheets.
Round silhouettes receive a circular alpha mask; the generated artwork stays intact.
Vector boards and cues use exact game coordinates so artwork matches hitboxes.
Then run `node mobile/tools/games-assets.mjs` to copy the complete manifest and
runtime assets into both native bundles. CI verifies hashes without needing Sharp.

Runtime boards are separate from the pieces. Server snapshots still determine
every position, private fleet reveal, guessed letter, result, and animation.

## Validation — November 3, 2026

- 93 bundled resources, about 3.4 MiB per platform; exact hashes match both copies.
- Android release 2.6.1 (26) builds, verifies and updates the existing installation
  with the original signing identity.
- Android emulator: 128 Games/Photography assertions pass at 1080×2400 and
  1080×1920, including all six focused layouts, the complete Hangman keyboard,
  every Tic-tac-toe cell and Connect Four slot, cue pulling, atomic fleet rotation,
  invalid-drop retention, automatic turn-aware Battleship charts and fresh
  fleet/chart state for a rematch.
- Full Node suite: 250 pass, 4 Redis integration tests skipped (no local Redis).
- Actual emulator captures: `../android/qa/focused-play/`.
- iOS arm64 Release 2.6.1 (26) compiles on the hosted Mac and passes IPA, embedded
  WidgetKit-extension and exact Games-payload verification. Apple-ID signing is
  required before installation. The 33 iOS unit tests pass; the complete focused
  gameplay screen checks run in the separate hosted simulator job.
