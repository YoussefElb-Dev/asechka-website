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
- Android debug APK builds, installs and passes archive integrity checks.
- Android emulator: 102 Games/Photography assertions pass, including every
  Tic-tac-toe cell and Connect Four slot, cue pulling, ship dragging and bounds.
- Full Node suite: 250 pass, 4 Redis integration tests skipped (no local Redis).
- Actual emulator captures: `../android/qa/gameplay-polish/`.
- iOS artwork and rendering are integrated. An Xcode build and device check have
  not been run on this Windows machine.
