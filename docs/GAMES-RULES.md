# Implemented Games rules

The authoritative implementations are `server/games/rules/*.mjs`. The rules below describe this application's house rules rather than claiming certification by a sporting federation. Player indices are 0 and 1; numeric zero is a valid winner. Each action is validated server-side for phase, turn, range, and game-specific legality. Both players must consent to a rematch. Best-of 1/3/5 settings track wins across rounds; draws add no win. After a completed series, an accepted rematch resets series scores. Hangman setter roles alternate on rematch.

## Eight-ball pool

The planar table is 1000 × 500 units with ball radius 11. The server uses fixed 1/480-second integration steps, equal-mass collision impulses, sliding friction, cushion restitution, circular pockets, and stable collision ordering. Playback samples are approximately 30 Hz and include timestamps, collisions, pocket events, and final positions. Native rendering can interpolate between them. This is a 2D model: it does not model spin, jumps, pocket jaws, cloth nap, or three-dimensional ball motion.

Player 0 breaks. A legal break pockets an object ball or drives at least four distinct object balls to cushions after contact. Groups stay open on the break. An eight pocketed on the break is spotted again; there is no automatic break win or rerack/kitchen option. An illegal break awards full-table ball in hand.

On an open table, contact a solid or stripe first. The first numbered object ball legally pocketed after the break assigns that player's solids/stripes, and the opposite group to their partner. Continue after a legal pocket from your group; otherwise the turn passes. A legal break pocket permits continuation.

Fouls include no object contact, the wrong first object, a cue scratch, and neither a pocket nor a qualifying rail after object contact. A rail contacted before the object does not satisfy that requirement; a ball frozen to a rail must leave it before that rail can count again. Fouls pass the turn and award ball in hand anywhere on the cloth. Cue placement must remain in bounds, outside pocket mouths, and clear of other balls.

Clear your group before attempting the eight. Only the eight requires a called pocket. Pocketing it early, in the wrong/uncalled pocket, or during a foul loses the round. Pocketing the last group ball and eight together loses, because eligibility is evaluated before the shot. Pocket IDs clockwise are 0 top-left, 1 top-middle, 2 top-right, 3 bottom-right, 4 bottom-middle, 5 bottom-left.

Actions: `{"type":"shot","angle":0.4,"power":0.6,"callPocket":2}` and ball-in-hand `{"type":"place","x":250,"y":250}`. Angles are radians clockwise from positive x; power is 0 through 1. The server provides final authoritative outcomes and clients must not manufacture their own results.

## Tic-tac-toe

Alternate placing a mark in an empty cell on a 3 × 3 board. Three matching marks horizontally, vertically, or diagonally win; a full board without a line is a draw. Cells are row-major 0–8. Action: `{"type":"place","cell":4}`. The state exposes the winning `line`. Room settings support best-of 1/3/5 and a native theme choice.

## Hangman

One player sets a secret English word/phrase and category or requests a category word from the server bank; the other guesses letters. Categories are `romance`, `movies`, `animals`, `science`, `geography`, `food`, `technology`, and `general`. Banks are keyed by language to support future localization; the current bank is English.

Custom input is trimmed, lowercased, and normalized to single spaces, with a maximum of 64 characters. It must contain at least two ASCII letters and may separate letter runs with spaces, apostrophes, or hyphens. Separators remain visible in the pattern. Each new wrong letter consumes one of six attempts; repeated or invalid letters are rejected. Reveal all letters to win; running out of attempts awards the setter the round.

The implemented rules provide **one free hint per round**: a category clue plus an unrevealed letter. It does not consume an attempt. An optional 30–600-second timer must use the server's deadline and clock, never client-supplied time. Timer expiry awards the setter the round. The guesser's view excludes the secret word until the result; the setter may see it. Rematches swap roles.

Actions: `word {word,category}`, `category {category}`, `guess {letter}`, or `hint`, each with a `type` field. The server owns timeout handling; clients display the deadline and restore it after reconnect.

## Connect Four

The board is seven columns by six rows. Drop a disc into a non-full column; it occupies the lowest empty cell. Four horizontally, vertically, or diagonally win. A full board without four is a draw. Action: `{"type":"drop","column":3}` with column 0–6. Board cells and the winning `line` are row-major.

## American checkers

Play on the dark squares of an 8 × 8 board, starting with twelve pieces each. Player 0 starts at the top and advances toward row 7. Men move one diagonal square forward and capture forward over one adjacent opposing piece onto a clear square. Kings move and capture diagonally in either direction; they do not fly along a diagonal.

Capture is compulsory when available. If several captures are possible, choose any; there is no longest-chain requirement. Continue a capture sequence with the same piece while another jump exists. Promotion at the far rank ends the turn, even if the new king could capture backward. Win when the opponent has no pieces or legal moves. Draw after three occurrences of the same position/turn or 80 quiet half-moves. The server view supplies legal destinations and the `forced` piece during a jump chain.

Action: `{"type":"move","from":17,"to":35}` using row-major cells 0–63. The server maintains move history, promotion, capture continuation, repetition, and quiet-move state.

## Battleship

Each player privately places five straight, contiguous ships of lengths 5, 4, 3, 3, and 2 on a 10 × 10 board. Ships may be horizontal or vertical, must stay in bounds, and may not overlap. Adjacent ships are allowed. Submit a complete fleet once; both fleets must be committed before firing begins.

Player 0 fires first. Players alternate one new cell per turn, including after a hit; a hit does not grant another shot. Every segment hit sinks that ship. Sink all five ships to win. Duplicate shots and shots before both fleets are committed are rejected. Opponent unsunk ship positions remain server-private; legitimate sunk cells and the complete fleet after game end may be revealed.

Actions: `{"type":"fleet","ships":[{"cells":[0,1,2,3,4]},…]}` and `{"type":"fire","cell":42}`. Cells are row-major 0–99. Local placement editing and rotation are input helpers; only the server accepts a fleet or shot. No optional Battleship clock or local AI is implied by these rules.
