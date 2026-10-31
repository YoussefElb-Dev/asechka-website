import test from 'node:test';
import assert from 'node:assert/strict';
import { create, apply, view } from '../server/games/rules/battleship.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const horizontal = () => [
  { cells: [0, 1, 2, 3, 4] }, { cells: [20, 21, 22, 23] },
  { cells: [40, 41, 42] }, { cells: [60, 61, 62] }, { cells: [80, 81] },
];
const vertical = () => [
  { cells: [5, 15, 25, 35, 45] }, { cells: [6, 16, 26, 36] },
  { cells: [7, 17, 27] }, { cells: [8, 18, 28] }, { cells: [9, 19] },
];
const fleet = (state, player, ships) => apply(state, player, { type: 'fleet', ships });
const fire = (state, player, cell) => apply(state, player, { type: 'fire', cell });
const battle = () => fleet(fleet(create(), 0, horizontal()), 1, vertical());

test('Battleship creates independent JSON states with no submitted fleets', () => {
  const a = create();
  assert.deepEqual(a, {
    phase: 'placement', turn: 0, winner: null,
    fleets: [null, null], shots: [[], []], hits: [[], []], sunk: [[], []],
  });
  a.shots[0].push(5);
  assert.deepEqual(create().shots, [[], []]);
  assert.deepEqual(copy(create()), create());
});

test('players can commit in either order; cells normalize and ship indices stay stable', () => {
  const ships = vertical().reverse().map(ship => ({ cells: ship.cells.reverse(), private: 'discard' }));
  const action = freeze({ type: 'fleet', ships });
  const initial = freeze(create());
  const placed = apply(initial, 1, action);
  assert.equal(placed.phase, 'placement');
  assert.equal(placed.turn, 0);
  assert.deepEqual(placed.fleets[1][0], { cells: [9, 19] });
  assert.equal(placed.fleets[1].some(ship => 'private' in ship), false);
  assert.equal(initial.fleets[1], null);
  const ready = fleet(freeze(placed), 0, horizontal());
  assert.equal(ready.phase, 'battle');
  assert.equal(ready.turn, 0);
  assert.throws(() => fleet(placed, 1, vertical()), /committed/);
  assert.throws(() => fleet(ready, 0, horizontal()), /over/);
});

test('fleet validation rejects malformed lengths, cells, wrapping, bends, gaps and overlaps atomically', () => {
  const invalid = [null, [], horizontal().slice(1), [...horizontal(), { cells: [95, 96] }]];
  for (const cells of [
    [0, 1, 2, 3], [0, 1, 2, 3, 4, 5], [-1, 0, 1, 2, 3], [96, 97, 98, 99, 100],
    [0, 1, 2, 3, 3.5], [0, 1, 2, 3, '4'], [0, 1, 2, 3, null],
    [0, 1, 2, 3, NaN], [0, 1, 2, 3, Infinity], [0, 1, 2, 3, 3],
    [8, 9, 10, 11, 12], [0, 1, 2, 12, 22], [0, 1, 2, 3, 5], [0, 10, 20, 30, 50],
    [0, 11, 22, 33, 44], [20, 21, 22, 23, 24],
  ]) {
    const ships = horizontal();
    ships[0] = { cells };
    invalid.push(ships);
  }
  invalid.push([null, ...horizontal().slice(1)]);
  invalid.push([{ cells: '0,1,2,3,4' }, ...horizontal().slice(1)]);
  const initial = freeze(create());
  for (const ships of invalid) assert.throws(() => fleet(initial, 0, ships), Error);
  assert.deepEqual(initial, create());
});

test('touching ships and placements against all four grid boundaries are legal', () => {
  const ships = [
    { cells: [95, 96, 97, 98, 99] }, { cells: [9, 19, 29, 39] },
    { cells: [0, 10, 20] }, { cells: [1, 11, 21] }, { cells: [8, 18] },
  ];
  assert.deepEqual(fleet(create(), 0, ships).fleets[0], ships);
});

test('placement views reveal readiness without exposing the partner fleet or sharing objects', () => {
  const state = freeze(fleet(create(), 1, vertical()));
  const opponent = view(state, 0);
  assert.deepEqual(opponent.fleets, [null, null]);
  assert.deepEqual(opponent.placed, [false, true]);
  assert.deepEqual(opponent.sunkShips, [[], []]);
  const own = view(state, 1);
  assert.deepEqual(own.fleets[1], vertical());
  own.fleets[1][0].cells[0] = 99;
  opponent.shots[0].push(99);
  assert.deepEqual(state.fleets[1], vertical());
  assert.deepEqual(state.shots, [[], []]);
});

test('fire requires completed placement, valid cell and the correct player', () => {
  assert.throws(() => fire(create(), 0, 5), /Both fleets/);
  assert.throws(() => fire(fleet(create(), 0, horizontal()), 0, 5), /Both fleets/);
  const state = freeze(battle());
  assert.throws(() => fire(state, 1, 5), /turn/);
  for (const cell of [-1, 100, 0.5, '5', null, undefined, NaN, Infinity]) {
    assert.throws(() => fire(state, 0, cell), /integer/);
  }
  for (const player of [-1, 2, '0', null]) {
    assert.throws(() => fire(state, player, 5), /player/);
    assert.throws(() => view(state, player), /player/);
  }
  for (const action of [null, {}, { type: 'win' }]) assert.throws(() => apply(state, 0, action), Error);
});

test('hits and misses are attacker-indexed and each consumes one alternating turn', () => {
  const initial = freeze(battle());
  const hit = fire(initial, 0, 5);
  assert.equal(hit.turn, 1);
  assert.deepEqual(hit.shots, [[5], []]);
  assert.deepEqual(hit.hits, [[5], []]);
  assert.deepEqual(hit.sunk, [[], []]);
  assert.deepEqual(view(hit, 0).fleets[1], null);
  assert.deepEqual(view(hit, 0).sunkShips, [[], []]);
  const miss = fire(freeze(hit), 1, 99);
  assert.equal(miss.turn, 0);
  assert.deepEqual(miss.shots, [[5], [99]]);
  assert.deepEqual(miss.hits, [[5], []]);
  assert.deepEqual(initial.shots, [[], []]);
  assert.deepEqual(hit.shots, [[5], []]);
});

test('duplicate hit and miss shots fail without consuming a turn', () => {
  for (const cell of [5, 99]) {
    const state = freeze(fire(fire(battle(), 0, cell), 1, 98));
    const before = copy(state);
    assert.throws(() => fire(state, 0, cell), /already/);
    assert.deepEqual(state, before);
  }
});

test('only an entirely sunk ship is revealed; unsunk ship segments stay secret', () => {
  let state = battle();
  const cells = vertical()[0].cells;
  for (let index = 0; index < cells.length; index++) {
    state = fire(freeze(state), 0, cells[index]);
    const visible = view(state, 0);
    assert.equal(visible.fleets[1], null);
    assert.deepEqual(visible.sunkShips[0], index === cells.length - 1 ? [{ index: 0, cells }] : []);
    if (index < cells.length - 1) state = fire(state, 1, 90 + index);
  }
  assert.deepEqual(state.sunk, [[0], []]);
  const visible = view(freeze(state), 1);
  visible.sunkShips[0][0].cells.push(99);
  assert.equal(state.fleets[1][0].cells.length, 5);
});

for (const winner of [0, 1]) {
  test(`a complete battle ends only after all 17 target cells are hit; player ${winner} wins`, () => {
    let state = battle();
    const targets = state.fleets[1 - winner].flatMap(ship => ship.cells);
    const occupied = new Set(state.fleets[winner].flatMap(ship => ship.cells));
    const misses = Array.from({ length: 100 }, (_, cell) => cell).filter(cell => !occupied.has(cell));
    let targetIndex = 0;
    let missIndex = 0;
    while (state.winner === null) {
      const player = state.turn;
      const cell = player === winner ? targets[targetIndex++] : misses[missIndex++];
      state = fire(freeze(state), player, cell);
      assert.deepEqual(copy(state), state);
      if (targetIndex < 17) assert.equal(state.winner, null);
    }
    assert.equal(targetIndex, 17);
    assert.equal(state.winner, winner);
    assert.deepEqual(state.sunk[winner], [0, 1, 2, 3, 4]);
    for (const player of [0, 1]) assert.deepEqual(view(state, player).fleets, state.fleets);
    assert.throws(() => fire(state, state.turn, 99), /over/);
    assert.throws(() => fleet(state, 0, horizontal()), /over/);
  });
}
