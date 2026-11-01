import test from 'node:test';
import assert from 'node:assert/strict';
import { create, apply, view } from '../server/games/rules/tictactoe.mjs';

const place = (state, cell) => apply(state, state.turn, { type: 'place', cell });
const play = cells => cells.reduce(place, create());

test('tic-tac-toe initializes independent JSON states and supports room best-of settings', () => {
  for (const bestOf of [1, 3, 5]) {
    const settings = { bestOf, theme: 'midnight' };
    const before = structuredClone(settings);
    const state = create(settings);
    assert.deepEqual(state, { board: Array(9).fill(null), line: [], turn: 0, winner: null });
    assert.deepEqual(settings, before);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  }
  for (const bestOf of [0, 2, '3', 7, NaN]) assert.throws(() => create({ bestOf }), Error);
  const a = create();
  a.board[0] = 1;
  assert.equal(create().board[0], null);
});

test('tic-tac-toe rejects malformed, wrong-turn, occupied, and finished actions without mutation', () => {
  const state = create();
  const before = structuredClone(state);
  for (const cell of [-1, 9, 0.5, '0', null, NaN, Infinity, undefined]) {
    assert.throws(() => apply(state, 0, { type: 'place', cell }), Error);
  }
  for (const action of [null, {}, { type: 'drop', cell: 0 }]) assert.throws(() => apply(state, 0, action), Error);
  for (const player of [1, -1, 2, '0', null]) assert.throws(() => apply(state, player, { type: 'place', cell: 0 }), Error);
  assert.deepEqual(state, before);
  const next = place(state, 0);
  assert.throws(() => apply(next, 1, { type: 'place', cell: 0 }), /occupied/);
  assert.deepEqual(state, before);
  const won = play([0, 3, 1, 4, 2]);
  assert.equal(won.winner, 0);
  assert.deepEqual(won.line, [0, 1, 2]);
  assert.throws(() => place(won, 8), /finished/);
  const publicState = view(won, 1);
  publicState.line[0] = 8;
  publicState.board[0] = 1;
  assert.deepEqual(won.line, [0, 1, 2]);
  assert.equal(won.board[0], 0);
});

test('tic-tac-toe handles player-one wins, draws, and a winning ninth move', () => {
  const secondWins = play([0, 3, 1, 4, 8, 5]);
  assert.equal(secondWins.winner, 1);
  assert.deepEqual(secondWins.line, [3, 4, 5]);
  const draw = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(draw.winner, 'draw');
  assert.deepEqual(draw.line, []);
  const lastMoveWins = play([0, 1, 2, 3, 4, 5, 7, 6, 8]);
  assert.equal(lastMoveWins.winner, 0);
  assert.deepEqual(lastMoveWins.line, [0, 4, 8]);
});

test('tic-tac-toe exhaustively resolves all 5,478 reachable boards against an independent oracle', () => {
  const seen = new Set();
  const terminal = { 0: 0, 1: 0, draw: 0 };
  const oracle = board => {
    const triples = [];
    for (let i = 0; i < 3; i++) triples.push([3 * i, 3 * i + 1, 3 * i + 2], [i, i + 3, i + 6]);
    triples.push([0, 4, 8], [2, 4, 6]);
    for (const cells of triples) {
      const value = board[cells[0]];
      if (value !== null && cells.every(cell => board[cell] === value)) return value;
    }
    return board.includes(null) ? null : 'draw';
  };
  function visit(state) {
    const key = state.board.map(value => value === null ? '.' : value).join('');
    if (seen.has(key)) return;
    seen.add(key);
    assert.equal(state.winner, oracle(state.board), key);
    if (state.winner !== null) {
      terminal[state.winner]++;
      assert.throws(() => place(state, state.board.indexOf(null)), /finished/);
      if (state.winner !== 'draw') {
        assert.equal(state.line.length, 3);
        assert.ok(state.line.every(cell => state.board[cell] === state.winner));
      }
      return;
    }
    state.board.forEach((value, cell) => { if (value === null) visit(place(state, cell)); });
  }
  visit(create());
  assert.equal(seen.size, 5478);
  assert.deepEqual(terminal, { 0: 626, 1: 316, draw: 16 });
});
