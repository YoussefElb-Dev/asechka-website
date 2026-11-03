# Focused gameplay — November 3, 2026

Actual Android emulator captures of the six native games using isolated public
test fixtures. Pool uses landscape; the remaining games use portrait. The
Hangman keyboard and Battleship captures use the shorter 1080×1920 phone.

All 128 native Games/Photography assertions passed at both 1080×2400 and
1080×1920. Checks cover viewport fit, primary controls, exact grid hitboxes,
cue pulling, ship dragging, immediate atomic rotation, invalid-placement
retention, automatic turn-aware chart switching with firing guards, and
fresh fleet/chart state when a new round begins.

The release APK was verified against every resource hash and the original
release signing certificate, then installed over the existing emulator app.
Rules, scoring, turn authority, physics and multiplayer services are unchanged.

Screens: `pool.png`, `tictactoe.png`, `connect4.png`, `checkers.png`,
`hangman-keyboard-small.png`, and `battleship.png`.
