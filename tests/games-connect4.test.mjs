import test from 'node:test';
import assert from 'node:assert/strict';
import { create, apply, view } from '../server/games/rules/connect4.mjs';

const drop = (state, column) => apply(state, state.turn, { type: 'drop', column });
const play = columns => columns.reduce(drop, create());

test('connect four initializes row-major grid and discs obey gravity', () => {
  const state = create();
  assert.deepEqual(state, { board: Array(42).fill(null), line: [], turn: 0, winner: null });
  let next = drop(state, 3);
  assert.equal(next.board[38], 0);
  assert.equal(next.turn, 1);
  next = drop(next, 3);
  assert.equal(next.board[31], 1);
  assert.deepEqual(state, create());
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
  assert.notEqual(create().board, state.board);
});

test('connect four rejects invalid actions, players, columns and full columns atomically', () => {
  const state = create();
  for (const column of [-1, 7, 1.1, '1', null, undefined, Infinity, NaN]) {
    assert.throws(() => apply(state, 0, { type: 'drop', column }), Error);
  }
  for (const action of [null, {}, { type: 'place', column: 0 }]) assert.throws(() => apply(state, 0, action), Error);
  for (const player of [1, 2, -1, null, '0']) assert.throws(() => apply(state, player, { type: 'drop', column: 0 }), Error);
  const filled = play([0, 0, 0, 0, 0, 0]);
  const before = structuredClone(filled);
  assert.throws(() => drop(filled, 0), /full/);
  assert.deepEqual(filled, before);
  assert.deepEqual(state, create());
});

test('connect four detects horizontal, vertical, and both diagonal wins with real drops', () => {
  const diagonal = [0, 1, 1, 2, 4, 2, 2, 3, 4, 3, 5, 3, 3];
  for (const [columns, winner, line] of [
    [[0, 0, 1, 1, 2, 2, 3], 0, [35, 36, 37, 38]],
    [[6, 0, 6, 1, 5, 2, 5, 3], 1, [35, 36, 37, 38]],
    [[0, 1, 0, 1, 0, 1, 0], 0, [14, 21, 28, 35]],
    [diagonal, 0, [35, 29, 23, 17]],
    [diagonal.map(column => 6 - column), 0, [41, 33, 25, 17]],
  ]) {
    const state = play(columns);
    assert.equal(state.winner, winner, String(columns));
    assert.deepEqual([...state.line].sort((a, b) => a - b), [...line].sort((a, b) => a - b));
    assert.ok(state.line.every(cell => state.board[cell] === winner));
    assert.throws(() => drop(state, 6), /finished/);
  }
});

test('connect four highlights the entire winning run when a drop bridges five discs', () => {
  const state = play([0, 0, 1, 1, 3, 3, 4, 4, 2]);
  assert.equal(state.winner, 0);
  assert.deepEqual(state.line, [35, 36, 37, 38, 39]);
});

test('connect four does not wrap across rows and draws on a full non-winning board', () => {
  const state = create();
  state.board[34] = 0;
  state.board[35] = 0;
  state.board[36] = 0;
  const next = drop(state, 2);
  assert.equal(next.board[37], 0);
  assert.equal(next.winner, null);
  const filled = create();
  filled.board = ['0011001', '1100110', '0011001', '1100110', '0011001', '1100110']
    .join('').split('').map(Number);
  filled.board[2] = null;
  filled.turn = 1;
  const draw = drop(filled, 2);
  assert.equal(draw.winner, 'draw');
  assert.deepEqual(draw.line, []);
});

test('connect four public snapshots cannot mutate authoritative board or line', () => {
  const state = play([0, 1, 0, 1, 0, 1, 0]);
  const snapshot = view(state, 1);
  snapshot.board[35] = null;
  snapshot.line.length = 0;
  assert.equal(state.board[35], 0);
  assert.equal(state.line.length, 4);
});

test('connect four agrees with an independent whole-board oracle through 300 seeded legal games', () => {
  let seed = 0x43ab9187;
  const random = maximum => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % maximum;
  };
  function oracle(board) {
    const groups = [];
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 7; column++) {
        const start = row * 7 + column;
        if (column <= 3) groups.push([start, start + 1, start + 2, start + 3]);
        if (row <= 2) groups.push([start, start + 7, start + 14, start + 21]);
        if (row <= 2 && column <= 3) groups.push([start, start + 8, start + 16, start + 24]);
        if (row <= 2 && column >= 3) groups.push([start, start + 6, start + 12, start + 18]);
      }
    }
    for (const cells of groups) {
      if (board[cells[0]] !== null && cells.every(cell => board[cell] === board[cells[0]])) return board[cells[0]];
    }
    return board.includes(null) ? null : 'draw';
  }
  let transitions = 0;
  for (let game = 0; game < 300; game++) {
    let state = create();
    while (state.winner === null) {
      const columns = Array.from({ length: 7 }, (_, column) => column).filter(column => state.board[column] === null);
      state = drop(state, columns[random(columns.length)]);
      transitions++;
      assert.equal(state.winner, oracle(state.board));
      for (let row = 0; row < 5; row++) {
        for (let column = 0; column < 7; column++) {
          if (state.board[row * 7 + column] !== null) assert.notEqual(state.board[(row + 1) * 7 + column], null);
        }
      }
    }
  }
  assert.ok(transitions > 5000);
});
