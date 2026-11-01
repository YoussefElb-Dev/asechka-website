# Original Games asset pipeline

`mobile/tools/games-assets.mjs` is the editable source for all six covers and ten sound effects. It uses Node built-ins only: no remote media, fonts, image-generation service, rendering package, or downloaded audio. The original Soft Orbit artwork shares a light lavender/blue background, soft rose/sea-glass/lilac objects, and gentle shadows matching the application. Cards and match sheets use the same packaged image on both platforms. Native game boards, pieces, labels, and animations are drawn procedurally by their game views, so no large sprite or 4K texture is needed.

## Rebuild and check

```sh
node mobile/tools/games-assets.mjs
node mobile/tools/games-assets.mjs --check
node mobile/tools/verify-games.mjs --assets-only
```

Generation writes the canonical files in `mobile/games-assets/` and both native `default/games/` bundles. Commit all three copies together. Do not edit generated files individually. The dependency-free scene exporter emits SVG shapes and a supersampled PNG. The WAV synthesizer uses a fixed random seed, short envelopes, and fades to silence at both ends.

| Output | Dimensions / encoding | In-app destination |
| --- | --- | --- |
| `covers/pool.{svg,png}` | SVG and RGB PNG 960 × 640; PNG sampled at 2× before downsampling | Pool card and match sheet |
| `covers/tictactoe.{svg,png}` | Same | Tic-tac-toe card |
| `covers/hangman.{svg,png}` | Same | Word game card; open book and letter tiles |
| `covers/connect4.{svg,png}` | Same | Connect Four card |
| `covers/checkers.{svg,png}` | Same | Checkers card |
| `covers/battleship.{svg,png}` | Same | Naval game card |
| `audio/*.wav` | 22,050 Hz, mono, signed 16-bit PCM; 55–550 ms | Optional native sound effects |
| `manifest.json` | JSON schema 1 | Provenance, game catalog, dimensions, hashes, destination mapping |

The manifest records each file's source generator, format, dimensions or audio parameters, byte length, SHA-256, attribution, and intended destination. All artwork and synthesized audio are original project assets; no third-party media credit is required. `mobile/games-assets/preview.png` is a review contact sheet and is not shipped in the native bundles.

## Audio cues

| Cue | Use |
| --- | --- |
| `tap` | Gentle control feedback |
| `invite` | New invitation |
| `collision`, `pocket` | Pool ball contact / pocket |
| `drop` | Falling disc landing |
| `move` | Board piece placement |
| `splash`, `hit` | Naval miss / hit |
| `win`, `lose` | Round result |

Load small effects once and reuse them; avoid triggering a sound on every frame or repeated reconnect event. Sound, haptics, and reduced-motion controls are the native client's responsibility. The pipeline checks click-free endpoints and nonzero unclipped PCM amplitude; it does not measure actual speaker loudness or haptic hardware.

## Size and integrity

The current manifest and runtime files occupy about 370 KiB per platform before APK/IPA compression. The checker caps the asset payload at 512 KiB, verifies vector and raster dimensions, rejects external/scripted SVG content, validates WAV headers/envelopes, regenerates outputs for comparison, and requires byte-identical canonical/iOS/Android copies. Package verification additionally reads every bundled file from the final archive and compares its length and SHA-256 with the canonical manifest. It fails on missing covers/sounds, stale manifests, extra payload files, or duplicate ZIP entries.
