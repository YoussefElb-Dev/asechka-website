import test from 'node:test';
import assert from 'node:assert/strict';
import { create, apply, view, simulate, TABLE, POCKETS } from '../server/games/rules/pool.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const ball = (id, x, y) => ({ id, x, y, pocketed: false });
function table(liveBalls, extra = {}) {
  const state = create();
  state.balls = state.balls.map(old => ({ ...old, pocketed: true, ...liveBalls.find(b => b.id === old.id) }));
  return { ...state, breakShot: false, ...extra };
}
const shoot = (state, shot = {}, player = state.turn) => apply(state, player, { type: 'shot', angle: 0, power: 0.2, ...shot });
const pot = (id, extra = [], settings = {}) => table([ball(0, 500, 180), ball(id, 500, 75), ...extra], settings);
const up = { angle: -Math.PI / 2, power: 0.2 };
const groups = ['solids', 'stripes'];

test('pool starts with a deterministic legal rack, eight in the center and opposite rear groups', () => {
  const state = create();
  assert.equal(state.turn, 0);
  assert.equal(state.winner, null);
  assert.equal(state.breakShot, true);
  assert.equal(state.ballInHand, false);
  assert.deepEqual(state.groups, [null, null]);
  assert.deepEqual(state.balls.map(b => b.id), Array.from({ length: 16 }, (_, id) => id));
  assert.equal(state.balls[8].y, 250);
  assert.equal(state.balls[6].x, state.balls[15].x);
  assert.deepEqual(copy(state), state);
  for (const [i, a] of state.balls.entries()) {
    for (const b of state.balls.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 22);
  }
  state.balls[0].x = 300;
  assert.equal(create().balls[0].x, 250);
});

test('free rolling stops under friction at the expected distance without mutating input', () => {
  const input = freeze([ball(0, 200, 200)]);
  const result = simulate(input, freeze({ angle: 0, power: 0.1 }));
  // v=180 units/s, friction=100 units/s^2: d=v^2/(2a), within one integrator step.
  assert.ok(Math.abs(result.balls[0].x - (200 + 162)) < 0.4);
  assert.equal(result.balls[0].y, 200);
  assert.ok(Math.abs(result.duration - 1.8) < 0.003);
  assert.deepEqual(result.rails, []);
  assert.deepEqual(result.contacts, []);
  assert.deepEqual(result.pockets, []);
  assert.deepEqual(input, [ball(0, 200, 200)]);
  const still = simulate(result.balls, { angle: 0, power: 0 });
  assert.deepEqual(still.balls, result.balls);
  assert.equal(still.duration, 0);
});

test('head-on and glancing collisions transfer momentum in two dimensions', () => {
  const direct = simulate([ball(0, 200, 200), ball(1, 300, 200)], { angle: 0, power: 0.12 });
  assert.equal(direct.firstContact, 1);
  assert.deepEqual(direct.firstContacts, [1]);
  assert.ok(direct.balls[0].x < 290);
  assert.ok(direct.balls[1].x > 400);
  assert.equal(direct.balls[1].y, 200);
  const glance = simulate([ball(0, 200, 200), ball(1, 300, 210)], { angle: 0, power: 0.16 });
  assert.equal(glance.firstContact, 1);
  assert.ok(glance.balls[0].y < 180);
  assert.ok(glance.balls[1].y > 280);
  assert.ok(glance.balls[1].x > 400);
});

test('maximum-power shots collide rather than tunneling through a nearby ball', () => {
  const result = simulate([ball(0, 200, 200), ball(1, 230, 200)], { angle: 0, power: 1 });
  assert.equal(result.firstContact, 1);
  assert.ok(result.contacts.length > 0);
  assert.ok(result.rails.some(event => event.id === 1));
});

test('cushions reflect balls and dissipate speed', () => {
  const result = simulate([ball(0, 900, 150)], { angle: 0, power: 0.2 });
  assert.deepEqual(result.rails.map(event => event.rail), ['right']);
  assert.ok(result.balls[0].x < 800);
  assert.equal(result.balls[0].y, 150);
  assert.ok(result.duration < 3.6);
});

test('all six pockets capture balls before the cushion can reflect them', () => {
  const shots = [
    [100, 100, -3 * Math.PI / 4], [500, 100, -Math.PI / 2], [900, 100, -Math.PI / 4],
    [900, 400, Math.PI / 4], [500, 400, Math.PI / 2], [100, 400, 3 * Math.PI / 4],
  ];
  assert.equal(POCKETS.length, 6);
  for (const [pocket, [x, y, angle]] of shots.entries()) {
    const result = simulate([ball(0, x, y)], { angle, power: 0.2 });
    assert.deepEqual(result.pocketed, [0]);
    assert.equal(result.pockets[0].pocket, pocket);
    assert.equal(result.balls[0].pocketed, true);
    assert.equal(result.rails.length, 0);
    const end = result.balls[0];
    assert.ok(end.x >= 11 && end.x <= 989 && end.y >= 11 && end.y <= 489);
  }
});

test('sampled frames are deterministic, timestamped, JSON-safe and reconcile to the final positions', () => {
  const state = freeze(create());
  const shot = freeze({ angle: 0, power: 1 });
  const first = simulate(state, shot);
  const repeated = simulate(copy(state), copy(shot));
  assert.deepEqual(first, repeated);
  assert.deepEqual(first, simulate([...state.balls].reverse(), shot));
  assert.deepEqual(copy(first), first);
  assert.equal(first.frames[0].t, 0);
  assert.deepEqual(first.frames[0].balls, state.balls);
  assert.equal(first.frames.at(-1).t, first.duration);
  assert.deepEqual(first.frames.at(-1).balls, first.balls);
  assert.ok(first.frames.length > 30 && first.frames.length <= 721);
  assert.ok(first.duration <= 24);
  for (let i = 1; i < first.frames.length; i++) {
    assert.ok(first.frames[i].t > first.frames[i - 1].t);
    assert.ok(first.frames[i].t - first.frames[i - 1].t <= 0.033335);
  }
  first.frames[0].balls[0].x = 10;
  assert.equal(state.balls[0].x, 250);
});

test('rack simulations at varied angles and powers settle with finite, separated balls inside the table', () => {
  for (const angle of [0, 0.04, -0.08, Math.PI / 2, Math.PI]) {
    const result = simulate(create(), { angle, power: 1 });
    for (const frame of result.frames) {
      for (const b of frame.balls) {
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
        assert.ok(b.x >= TABLE.radius && b.x <= TABLE.width - TABLE.radius);
        assert.ok(b.y >= TABLE.radius && b.y <= TABLE.height - TABLE.radius);
      }
    }
    const live = result.balls.filter(b => !b.pocketed);
    for (const [i, a] of live.entries()) {
      for (const b of live.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 21.99);
    }
  }
});

test('simulation rejects invalid ball data and missing or pocketed cue balls', () => {
  for (const balls of [
    [], null, [ball(1, 200, 200)], [{ ...ball(0, 200, 200), pocketed: true }],
    [ball(0, 200, 200), ball(0, 300, 200)], [ball(0, NaN, 200)],
    [ball(0, 10, 200)], [ball(0, 200, 490)], [ball(16, 200, 200)],
    [{ ...ball(0, 200, 200), pocketed: 0 }],
  ]) assert.throws(() => simulate(balls, { angle: 0, power: 0.2 }), Error);
});

test('invalid actions, powers, pocket calls and actors are rejected without changing state', () => {
  const state = freeze(create());
  for (const shot of [
    { power: -0.1 }, { power: 1.1 }, { power: '0.5' }, { power: NaN }, { power: Infinity },
    { angle: NaN }, { angle: Infinity }, { angle: '0' }, { angle: null },
    { callPocket: -1 }, { callPocket: 6 }, { callPocket: 1.5 }, { callPocket: null }, { callPocket: '1' },
  ]) assert.throws(() => shoot(state, shot), Error);
  for (const player of [-1, 1, 2, '0', null]) assert.throws(() => shoot(state, {}, player), Error);
  for (const action of [null, {}, { type: 'teleport' }, { type: 'shot', angle: 0 }]) {
    assert.throws(() => apply(state, 0, action), Error);
  }
  assert.deepEqual(state, create());
});

test('a strong legal break touches four distinct object balls to rails, leaving groups open', () => {
  const state = freeze(create());
  const next = shoot(state, { power: 1 });
  assert.equal(next.foul, null);
  assert.equal(next.ballInHand, false);
  assert.equal(next.lastShot.firstContact, 1);
  assert.ok(new Set(next.lastShot.rails.filter(event => event.id !== 0 && event.counts).map(event => event.id)).size >= 4);
  assert.deepEqual(next.groups, [null, null]);
  assert.equal(next.breakShot, false);
  assert.equal(next.lastShot.isBreak, true);
  assert.equal(next.turn, next.lastShot.pocketed.length ? 0 : 1);
  assert.deepEqual(next.lastShot.frames.at(-1).balls, next.balls);
  assert.deepEqual(state, create());
});

test('a weak break is a foul; a legal break pot retains the turn without assigning groups', () => {
  const weak = shoot(create(), { power: 0 });
  assert.match(weak.foul, /Illegal break/);
  assert.match(weak.foul, /No object/);
  assert.equal(weak.turn, 1);
  assert.equal(weak.ballInHand, true);
  const made = shoot({ ...pot(1), breakShot: true }, up);
  assert.equal(made.foul, null);
  assert.equal(made.turn, 0);
  assert.deepEqual(made.groups, [null, null]);
});

test('a miss or zero-power shot fouls and requires the incoming player to place the cue', () => {
  const next = shoot(table([ball(0, 200, 200), ball(1, 300, 300)]), { power: 0 });
  assert.equal(next.lastShot.firstContact, null);
  assert.equal(next.turn, 1);
  assert.equal(next.ballInHand, true);
  assert.match(next.foul, /No object/);
  assert.throws(() => shoot(next), /Place the cue/);
});

test('correct contact without a later rail or pot fouls; a later rail makes a legal safety', () => {
  const foul = shoot(table([ball(0, 200, 200), ball(1, 300, 200)]), { power: 0.1 });
  assert.equal(foul.lastShot.firstContact, 1);
  assert.match(foul.foul, /No pocket or rail/);
  const legal = shoot(table([ball(0, 700, 200), ball(1, 850, 200)], { groups }), { power: 0.4 });
  assert.equal(legal.foul, null);
  assert.equal(legal.turn, 1);
  assert.equal(legal.ballInHand, false);
});

test('a rail before first object contact does not satisfy the rail requirement', () => {
  const next = shoot(table([ball(0, 50, 200), ball(1, 100, 200)]), { angle: Math.PI, power: 0.15 });
  assert.equal(next.lastShot.firstContact, 1);
  assert.equal(next.lastShot.rails.length, 1);
  assert.ok(next.lastShot.rails[0].order < next.lastShot.contacts[0].order);
  assert.match(next.foul, /No pocket or rail/);
});

test('a post-contact cushion in the same physics step counts, but a frozen ball on its original rail does not', () => {
  const near = shoot(table([ball(0, 950, 200), ball(1, 988.9, 200)]), { power: 0.2 });
  const contact = near.lastShot.contacts[0];
  assert.ok(near.lastShot.rails.some(event => event.t === contact.t && event.order > contact.order));
  assert.equal(near.foul, null);
  const frozen = shoot(table([ball(0, 950, 200), ball(1, 989, 200)]), { power: 0.08 });
  assert.ok(frozen.lastShot.rails.some(event => !event.counts));
  assert.match(frozen.foul, /No pocket or rail/);
});

test('first contact must match the assigned group, and the eight is illegal first on an open table', () => {
  const wrong = shoot(pot(9, [], { groups }), up);
  assert.match(wrong.foul, /Wrong first/);
  assert.equal(wrong.turn, 1);
  assert.equal(wrong.ballInHand, true);
  assert.equal(wrong.balls[9].pocketed, true);
  const open = shoot(table([ball(0, 200, 200), ball(8, 300, 200)]), { power: 0.12 });
  assert.match(open.foul, /Wrong first/);
  assert.equal(open.winner, null);
  assert.deepEqual(open.groups, [null, null]);
});

test('a legal non-break pot assigns solids or stripes and keeps the shooter at the table', () => {
  for (const [id, expected] of [[1, ['solids', 'stripes']], [9, ['stripes', 'solids']]]) {
    const state = freeze(pot(id));
    const next = shoot(state, up);
    assert.deepEqual(next.groups, expected);
    assert.equal(next.foul, null);
    assert.equal(next.turn, 0);
    assert.deepEqual(next.lastShot.pocketed, [id]);
    assert.equal(state.balls[id].pocketed, false);
  }
  const next = shoot({ ...pot(9), turn: 1 }, up);
  assert.deepEqual(next.groups, ['solids', 'stripes']);
  assert.equal(next.turn, 1);
});

test('an existing group is preserved and an own-group pot continues the turn', () => {
  const next = shoot(pot(1, [], { groups }), up);
  assert.equal(next.foul, null);
  assert.deepEqual(next.groups, groups);
  assert.equal(next.turn, 0);
});

test('scratches persist the cue as pocketed and do not assign a group', () => {
  const state = table([ball(0, 500, 100), ball(1, 800, 200)]);
  const next = shoot(state, up);
  assert.match(next.foul, /scratched/);
  assert.equal(next.balls[0].pocketed, true);
  assert.equal(next.ballInHand, true);
  assert.equal(next.turn, 1);
  assert.deepEqual(next.groups, [null, null]);
  const placed = apply(freeze(next), 1, { type: 'place', x: 300, y: 250 });
  assert.deepEqual(placed.balls[0], ball(0, 300, 250));
  assert.equal(placed.ballInHand, false);
  assert.equal(placed.turn, 1);
  assert.throws(() => apply(placed, 1, { type: 'place', x: 350, y: 250 }), /ball in hand/);
});

test('ball-in-hand placement rejects pocket mouths, overlaps, nonfinite values, boundaries and wrong turns', () => {
  const state = freeze(table([ball(0, 250, 250), ball(1, 300, 200)], { turn: 1, ballInHand: true }));
  for (const [x, y] of [[10, 200], [990, 200], [200, 10], [200, 490], [500, 11], [11, 11],
    [300, 200], [321, 200], [NaN, 200], [200, Infinity], ['200', 200], [null, 200]]) {
    assert.throws(() => apply(state, 1, { type: 'place', x, y }), Error);
  }
  assert.throws(() => apply(state, 0, { type: 'place', x: 200, y: 200 }), /turn/);
  const next = apply(state, 1, { type: 'place', x: 322, y: 200 });
  assert.equal(next.ballInHand, false);
  assert.equal(next.balls[0].x, 322);
  assert.equal(state.balls[0].x, 250);
  assert.throws(() => apply(create(), 0, { type: 'place', x: 200, y: 200 }), /ball in hand/);
});

test('the eight wins for either player only after clearing their group and calling its actual pocket', () => {
  for (const player of [0, 1]) {
    const state = pot(8, [], { groups, turn: player });
    const next = shoot(freeze(state), { ...up, callPocket: 1 });
    assert.equal(next.winner, player);
    assert.equal(next.foul, null);
    assert.equal(next.ballInHand, false);
    assert.deepEqual(next.lastShot.pocketed, [8]);
    assert.throws(() => shoot(next), /over/);
    assert.throws(() => apply(next, player, { type: 'place', x: 200, y: 200 }), /over/);
  }
});

test('early eight, wrong called pocket and absent call lose the rack', () => {
  const early = shoot(pot(8, [ball(1, 800, 350)], { groups }), { ...up, callPocket: 1 });
  assert.equal(early.winner, 1);
  assert.match(early.foul, /early/);
  for (const call of [{ callPocket: 4 }, {}]) {
    const next = shoot(pot(8, [], { groups }), { ...up, ...call });
    assert.equal(next.winner, 1);
    assert.match(next.foul, /uncalled/);
    assert.equal(next.ballInHand, false);
  }
});

test('eight eligibility is determined before the stroke, even when the last group ball also moves', () => {
  const state = table([ball(0, 500, 240), ball(1, 500, 150), ball(8, 500, 75)], { groups });
  const next = shoot(state, { angle: -Math.PI / 2, power: 0.3, callPocket: 1 });
  assert.equal(next.lastShot.firstContact, 1);
  assert.ok(next.lastShot.pocketed.includes(8));
  assert.equal(next.winner, 1);
  assert.match(next.foul, /early/);
});

test('scratching while potting a correctly called eight loses, but scratching without potting it only fouls', () => {
  const state = table([ball(0, 480, 160), ball(8, 490, 30)], { groups });
  const next = shoot(state, { angle: -Math.PI / 2, power: 1, callPocket: 1 });
  assert.equal(next.lastShot.firstContact, 8);
  assert.ok(next.lastShot.pocketed.includes(0) && next.lastShot.pocketed.includes(8));
  assert.equal(next.winner, 1);
  assert.match(next.foul, /scratched/);
  const scratch = shoot(table([ball(0, 500, 100), ball(8, 800, 200)], { groups }), up);
  assert.equal(scratch.winner, null);
  assert.equal(scratch.ballInHand, true);
});

test('eight on the break is spotted with groups open, including a scratched break', () => {
  const legal = shoot({ ...pot(8), breakShot: true }, up);
  assert.equal(legal.winner, null);
  assert.equal(legal.foul, null);
  assert.equal(legal.turn, 0);
  assert.deepEqual(legal.balls[8], ball(8, 700, 250));
  assert.deepEqual(legal.groups, [null, null]);
  const scratch = shoot(table([ball(0, 480, 160), ball(8, 490, 30)], { breakShot: true }),
    { angle: -Math.PI / 2, power: 1 });
  assert.equal(scratch.winner, null);
  assert.equal(scratch.balls[8].pocketed, false);
  assert.equal(scratch.ballInHand, true);
  assert.equal(scratch.turn, 1);
  assert.match(scratch.foul, /scratched/);
});

test('pool views are independent complete JSON snapshots, including winner zero', () => {
  const state = freeze(shoot(pot(8, [], { groups }), { ...up, callPocket: 1 }));
  assert.equal(view(state, 1).winner, 0);
  assert.deepEqual(view(state, 0), state);
  const visible = view(state, 1);
  visible.balls[0].x = 100;
  visible.groups[0] = null;
  visible.lastShot.frames[0].balls[0].x = 200;
  assert.deepEqual(view(state, 0), state);
  assert.deepEqual(copy(visible), visible);
  assert.throws(() => view(state, 2), /player/);
});
