# Focused gameplay — November 3, 2026

Actual iPhone 16 Pro simulator captures of the six native games using isolated
public test fixtures. Pool uses landscape; the remaining games use portrait.
Pool returns the game hub to portrait when the player leaves the match.

The Games journey covers all six play screens, the complete Hangman keyboard,
ship dragging, immediate rotation, retention after an invalid drop, access to
the placement controls, and leaving every match. Fleet-grid checks also require
square cells wider than 24 points and an ocean spanning most of the screen.

All 33 unit tests and four Games UI journeys passed for source `cd0550e` in
[the hosted simulator run](https://github.com/YoussefElb-Dev/asechka-website/actions/runs/41727834207).

The release IPA contains the native arm64 app, its WidgetKit extension, and all
93 verified Games resources. Apple-ID signing is required before installation;
these simulator captures do not claim installation on a physical iPhone.

Screens: `pool.png`, `tictactoe.png`, `hangman.png`, `connect4.png`,
`checkers.png`, and `battleship.png`. `preview.jpg` combines those captures and
respects the landscape screenshot's orientation metadata.
