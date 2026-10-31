import test from 'node:test';
import assert from 'node:assert/strict';
import { create, apply, view } from '../server/games/rules/checkers.mjs';

const move = (state, from, to) => apply(state, state.turn, { type: 'move', from, to });
function position(pieces, extra = {}) {
  const state = { ...create(), board: Array(64).fill(null), repetitions: {}, ...extra };
  for (const [cell, player, king = false] of pieces) state.board[cell] = { player, king };
  return state;
}

test('checkers initializes 12 independent men per side on dark squares and seven opening moves', () => {
  const state = create();
  assert.equal(state.board.length, 64);
  assert.equal(state.turn, 0);
  assert.equal(state.winner, null);
  assert.equal(state.forced, null);
  assert.deepEqual(state.moves, []);
  for (const player of [0, 1]) {
    assert.equal(state.board.filter(piece => piece?.player === player).length, 12);
  }
  state.board.forEach((piece, cell) => {
    if (piece) {
      assert.equal((Math.floor(cell / 8) + cell % 8) % 2, 1);
      assert.equal(piece.king, false);
    }
  });
  assert.deepEqual(view(state, 0).legal, [
    { from: 17, to: 24 }, { from: 17, to: 26 }, { from: 19, to: 26 },
    { from: 19, to: 28 }, { from: 21, to: 28 }, { from: 21, to: 30 }, { from: 23, to: 30 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.notEqual(state.board[1], state.board[3]);
  assert.notEqual(state.board[1], create().board[1]);
});

test('checkers rejects malformed, wrong-turn, wrong-owner, occupied, light-square and long moves atomically', () => {
  const state = create();
  const before = structuredClone(state);
  for (const action of [null, {}, { type: 'place', from: 17, to: 24 },
    ...[-1, 64, 1.5, '17', null, undefined, Infinity, NaN].flatMap(value => [
      { type: 'move', from: value, to: 24 }, { type: 'move', from: 17, to: value },
    ]),
    { type: 'move', from: 40, to: 33 }, { type: 'move', from: 16, to: 25 },
    { type: 'move', from: 17, to: 18 }, { type: 'move', from: 17, to: 10 },
    { type: 'move', from: 17, to: 35 }, { type: 'move', from: 17, to: 44 },
  ]) assert.throws(() => apply(state, 0, action), Error);
  for (const player of [1, 2, -1, null, '0']) assert.throws(() => apply(state, player, { type: 'move', from: 17, to: 24 }), Error);
  assert.deepEqual(state, before);
  const next = move(state, 17, 24);
  assert.equal(next.board[17], null);
  assert.deepEqual(next.board[24], { player: 0, king: false });
  assert.equal(next.turn, 1);
  assert.equal(next.quiet, 1);
  assert.deepEqual(state, before);
});

test('checkers men move and capture forward only; kings can move and capture backward', () => {
  const man = position([[35, 0], [26, 1], [60, 1]]);
  assert.throws(() => move(man, 35, 17), /Illegal/);
  assert.throws(() => move(man, 35, 28), /Illegal/);
  assert.equal(move(man, 35, 42).board[42].king, false);
  const king = position([[35, 0, true], [26, 1], [60, 1]]);
  assert.deepEqual(view(king, 0).legal, [{ from: 35, to: 17, captured: 26 }]);
  const captured = move(king, 35, 17);
  assert.equal(captured.board[26], null);
  assert.deepEqual(captured.board[17], { player: 0, king: true });
  const kingQuiet = position([[35, 0, true], [62, 1, true]]);
  assert.deepEqual(view(kingQuiet, 0).legal.map(candidate => candidate.to), [26, 28, 42, 44]);
  const second = position([[42, 1], [33, 0], [1, 0]], { turn: 1 });
  assert.equal(move(second, 42, 24).board[33], null);
  assert.throws(() => move(second, 42, 60), /Illegal/);
});

test('checkers captures are mandatory globally and players may choose any available chain', () => {
  const state = position([[17, 0], [21, 0], [26, 1], [30, 1], [44, 1], [60, 1]]);
  assert.deepEqual(view(state, 0).legal, [
    { from: 17, to: 35, captured: 26 }, { from: 21, to: 39, captured: 30 },
  ]);
  assert.throws(() => move(state, 21, 28), /mandatory/);
  const shorter = move(state, 21, 39);
  assert.equal(shorter.turn, 1);
  assert.equal(shorter.forced, null);
  assert.equal(shorter.board[30], null);
});

test('checkers multi-jumps retain the turn, restrict the same piece, remove victims and record each jump', () => {
  const state = position([[17, 0], [21, 0], [26, 1], [30, 1], [44, 1], [60, 1]], { quiet: 79 });
  const next = move(state, 17, 35);
  assert.equal(next.turn, 0);
  assert.equal(next.forced, 35);
  assert.equal(next.winner, null);
  assert.equal(next.quiet, 0);
  assert.deepEqual(view(next, 1).legal, [{ from: 35, to: 53, captured: 44 }]);
  assert.deepEqual(next.repetitions, {});
  assert.throws(() => move(next, 21, 39), /same piece/);
  assert.throws(() => move(next, 35, 42), /same piece/);
  assert.throws(() => apply(next, 1, { type: 'move', from: 44, to: 26 }), /turn/);
  const complete = move(next, 35, 53);
  assert.equal(complete.turn, 1);
  assert.equal(complete.forced, null);
  assert.equal(complete.board[26], null);
  assert.equal(complete.board[44], null);
  assert.equal(complete.quiet, 0);
  assert.equal(Object.values(complete.repetitions).reduce((sum, value) => sum + value, 0), 1);
  assert.deepEqual(complete.moves, [
    { from: 17, to: 35, captured: 26, player: 0, promoted: false },
    { from: 35, to: 53, captured: 44, player: 0, promoted: false },
  ]);
  assert.equal(state.board[17].player, 0);
  assert.equal(next.board[44].player, 1);
});

test('checkers crowns both colors and promotion ends a capture chain immediately', () => {
  const state = position([[40, 0], [49, 1], [51, 1]], { quiet: 79 });
  const promoted = move(state, 40, 58);
  assert.deepEqual(promoted.board[58], { player: 0, king: true });
  assert.equal(promoted.forced, null);
  assert.equal(promoted.turn, 1);
  assert.equal(promoted.quiet, 0);
  assert.equal(promoted.moves[0].promoted, true);
  assert.equal(promoted.winner, null);
  assert.throws(() => apply(promoted, 0, { type: 'move', from: 58, to: 44 }), /turn/);
  const second = move(position([[17, 1], [10, 0], [8, 0]], { turn: 1 }), 17, 3);
  assert.deepEqual(second.board[3], { player: 1, king: true });
  assert.equal(second.turn, 0);
  const quiet = move(position([[49, 0], [8, 1]], { quiet: 79 }), 49, 56);
  assert.equal(quiet.board[56].king, true);
  assert.equal(quiet.quiet, 0);
  assert.equal(quiet.winner, null);
});

test('checkers wins on elimination or immobilization, including player zero; win precedes quiet draw', () => {
  const eliminated = move(position([[17, 0], [26, 1]]), 17, 35);
  assert.equal(eliminated.winner, 0);
  assert.deepEqual(view(eliminated, 0).legal, []);
  assert.throws(() => move(eliminated, 35, 42), /finished/);
  const blocked = move(position([[17, 0], [1, 1]], { quiet: 79 }), 17, 24);
  assert.equal(blocked.winner, 0);
  const second = move(position([[42, 1], [33, 0]], { turn: 1 }), 42, 24);
  assert.equal(second.winner, 1);
});

test('checkers draws after 80 quiet half-moves and resets the clock on captures or crowning', () => {
  const state = position([[1, 0, true], [62, 1, true]], { quiet: 78 });
  const beforeDraw = move(state, 1, 8);
  assert.equal(beforeDraw.quiet, 79);
  assert.equal(beforeDraw.winner, null);
  const draw = move(beforeDraw, 62, 55);
  assert.equal(draw.quiet, 80);
  assert.equal(draw.winner, 'draw');
  assert.deepEqual(view(draw, 0).legal, []);
  assert.throws(() => move(draw, 8, 1), /finished/);
  const captured = move(position([[17, 0], [26, 1], [60, 1]], { quiet: 79 }), 17, 35);
  assert.equal(captured.quiet, 0);
  assert.equal(captured.winner, null);
});

test('checkers threefold repetition includes the turn and counts only completed turns', () => {
  // Put the fixture's initial position in the ledger, as create() does.
  let state = position([[1, 0, true], [62, 1, true]]);
  const key = `0:${state.board.map(piece => piece === null ? '.' : piece.player === 0 ? 'A' : 'B').join('')}`;
  state.repetitions[key] = 1;
  const cycle = [[1, 8], [62, 55], [8, 1], [55, 62]];
  for (const [from, to] of cycle) state = move(state, from, to);
  assert.equal(state.winner, null);
  assert.equal(state.repetitions[key], 2);
  for (const [from, to] of cycle) state = move(state, from, to);
  assert.equal(state.winner, 'draw');
  assert.equal(state.repetitions[key], 3);
  assert.equal(state.quiet, 8);
  const otherTurn = position([[1, 0, true], [62, 1, true]], { turn: 1, repetitions: { [key]: 100 } });
  assert.equal(move(otherTurn, 62, 55).winner, null);
});

test('checkers snapshots and successful/failed transitions do not share mutable pieces, history or legal lists', () => {
  const state = create();
  const next = move(state, 17, 24);
  const snapshot = view(next, 1);
  assert.equal(snapshot.repetitions, undefined);
  snapshot.board[24].king = true;
  snapshot.moves[0].from = 0;
  snapshot.legal[0].to = 0;
  assert.equal(next.board[24].king, false);
  assert.equal(next.moves[0].from, 17);
  assert.notEqual(view(next, 1).legal[0].to, 0);
  const replayed = next.moves.reduce((current, entry) => apply(current, entry.player, { type: 'move', ...entry }), create());
  assert.deepEqual(replayed, next);
});

test('checkers validates board edges, own-piece obstruction and forged client capture metadata', () => {
  const edge = position([[23, 0], [32, 1], [60, 1]]);
  assert.deepEqual(view(edge, 0).legal, [{ from: 23, to: 30 }]);
  assert.throws(() => move(edge, 23, 32), /Illegal/);
  assert.throws(() => move(edge, 23, 41), /Illegal/);
  const obstructed = position([[17, 0], [26, 0], [44, 1]]);
  assert.throws(() => move(obstructed, 17, 35), /Illegal/);
  const occupiedLanding = position([[17, 0], [26, 1], [35, 0], [60, 1]]);
  assert.throws(() => move(occupiedLanding, 17, 35), /Illegal/);
  const state = position([[17, 0], [26, 1], [60, 1]]);
  const next = apply(state, 0, { type: 'move', from: 17, to: 35, captured: 60, king: true, winner: 0 });
  assert.equal(next.board[26], null);
  assert.deepEqual(next.board[60], { player: 1, king: false });
  assert.deepEqual(next.board[35], { player: 0, king: false });
  assert.equal(next.winner, null);
});

test('checkers offers both continuation branches for a king and requires completing the chosen capture', () => {
  const state = position([[17, 0, true], [26, 1], [42, 1], [44, 1], [62, 1]]);
  const first = move(state, 17, 35);
  assert.equal(first.forced, 35);
  assert.deepEqual(view(first, 0).legal, [
    { from: 35, to: 49, captured: 42 }, { from: 35, to: 53, captured: 44 },
  ]);
  for (const [destination, victim] of [[49, 42], [53, 44]]) {
    const next = move(first, 35, destination);
    assert.equal(next.board[victim], null);
    assert.equal(next.forced, null);
    assert.equal(next.turn, 1);
    assert.equal(next.board[destination].king, true);
  }
});
