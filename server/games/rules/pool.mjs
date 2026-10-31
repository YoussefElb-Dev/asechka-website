/**
 * Deterministic, planar eight-ball. Coordinates are ball centers in table units.
 * Pockets 0..5 run clockwise: top-left, top-middle, top-right, bottom-right,
 * bottom-middle, bottom-left. Angles run clockwise from the positive x axis.
 *
 * Contract house rules: only the eight needs a called pocket (there is no
 * callBall action); on an open table the first legally potted numbered ball
 * determines groups. A break leaves groups open. An eight on the break is
 * automatically spotted; an illegal break gives full-table ball in hand.
 * There are no rerack/kitchen options, spin, jumps, pocket jaws or cloth nap.
 */
export const TABLE = Object.freeze({ width: 1000, height: 500, radius: 11 });
export const POCKETS = Object.freeze([
  { x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 },
  { x: 1000, y: 500 }, { x: 500, y: 500 }, { x: 0, y: 500 },
].map(Object.freeze));
const R = TABLE.radius;
const DIAMETER = 2 * R;
const POCKET_RADIUS = 28;
const STEP = 1 / 480;
const SAMPLE_STEPS = 16; // 30 Hz, timestamps in seconds.
const MAX_STEPS = 24 * 480;
const MAX_SPEED = 1800;
const FRICTION = 100;
const BALL_RESTITUTION = 0.98;
const CUSHION_RESTITUTION = 0.82;
const EPS = 1e-8;
const clone = value => JSON.parse(JSON.stringify(value));
const rounded = value => Math.round(value * 1e6) / 1e6;
const groupOf = id => id >= 1 && id <= 7 ? 'solids' : id >= 9 && id <= 15 ? 'stripes' : null;

function checkPlayer(player) {
  if (player !== 0 && player !== 1) throw new Error('Invalid player');
}

function checkShot(shot) {
  if (!shot || !Number.isFinite(shot.angle) || !Number.isFinite(shot.power)
    || shot.power < 0 || shot.power > 1) {
    throw new Error('Shot needs a finite angle and power from 0 to 1');
  }
  if (shot.callPocket !== undefined
    && (!Number.isInteger(shot.callPocket) || shot.callPocket < 0 || shot.callPocket > 5)) {
    throw new Error('Called pocket must be an integer from 0 to 5');
  }
}

function pocketAt(x, y) {
  return POCKETS.findIndex(pocket => (pocket.x - x) ** 2 + (pocket.y - y) ** 2 <= POCKET_RADIUS ** 2);
}

function positions(balls) {
  return balls.map(({ id, x, y, pocketed }) => ({ id, x: rounded(x), y: rounded(y), pocketed }));
}

/**
 * simulate(ballsOrState, {angle,power}) -> new JSON result, never mutates input.
 * Fixed 1/480 s steps keep even maximum relative travel below a ball radius.
 * Equal-mass impulses transfer normal velocity; sliding friction removes speed
 * linearly. Four stable, id-ordered solver passes resolve simultaneous contacts.
 * frames contain {t,balls}; rails/pockets record {id,rail|pocket,t} events.
 */
export function simulate(ballsOrState, shot) {
  checkShot(shot);
  const input = Array.isArray(ballsOrState) ? ballsOrState : ballsOrState?.balls;
  if (!Array.isArray(input) || input.length < 1 || input.length > 16) throw new Error('Invalid balls');
  const ids = new Set();
  const balls = input.map(ball => {
    if (!ball || !Number.isInteger(ball.id) || ball.id < 0 || ball.id > 15 || ids.has(ball.id)
      || !Number.isFinite(ball.x) || !Number.isFinite(ball.y) || typeof ball.pocketed !== 'boolean'
      || ball.x < R - EPS || ball.x > TABLE.width - R + EPS
      || ball.y < R - EPS || ball.y > TABLE.height - R + EPS) {
      throw new Error('Invalid ball id, position or pocketed flag');
    }
    ids.add(ball.id);
    return { id: ball.id, x: ball.x, y: ball.y, pocketed: ball.pocketed, vx: 0, vy: 0 };
  }).sort((a, b) => a.id - b.id);
  const cue = balls.find(ball => ball.id === 0);
  if (!cue || cue.pocketed) throw new Error('Place the cue ball before shooting');
  // A ball frozen to a rail must leave it before that same rail can count.
  const frozen = new Map(balls.map(ball => [ball.id, new Set([
    ...(ball.x <= R + EPS ? ['left'] : []),
    ...(ball.x >= TABLE.width - R - EPS ? ['right'] : []),
    ...(ball.y <= R + EPS ? ['top'] : []),
    ...(ball.y >= TABLE.height - R - EPS ? ['bottom'] : []),
  ])]));
  cue.vx = Math.cos(shot.angle) * shot.power * MAX_SPEED;
  cue.vy = Math.sin(shot.angle) * shot.power * MAX_SPEED;
  const frames = [{ t: 0, balls: positions(balls) }];
  const rails = [];
  const pockets = [];
  const contacts = [];
  let eventOrder = 0;
  let firstContact = null;
  let firstContactStep = null;
  const firstContacts = [];
  let steps = 0;

  function capture(ball, t) {
    const pocket = pocketAt(ball.x, ball.y);
    if (pocket < 0) return false;
    ball.pocketed = true;
    ball.vx = ball.vy = 0;
    // Keep centers on the cloth even for pocketed balls, for consistent views.
    ball.x = Math.min(TABLE.width - R, Math.max(R, ball.x));
    ball.y = Math.min(TABLE.height - R, Math.max(R, ball.y));
    pockets.push({ id: ball.id, pocket, t, order: eventOrder++ });
    return true;
  }

  function cushion(ball, t) {
    for (const [axis, velocity, low, high, lowRail, highRail] of [
      ['x', 'vx', R, TABLE.width - R, 'left', 'right'],
      ['y', 'vy', R, TABLE.height - R, 'top', 'bottom'],
    ]) {
      if (ball[axis] > low + EPS) frozen.get(ball.id).delete(lowRail);
      if (ball[axis] < high - EPS) frozen.get(ball.id).delete(highRail);
      if (ball[axis] < low) {
        ball[axis] = low;
        if (ball[velocity] < 0) {
          ball[velocity] *= -CUSHION_RESTITUTION;
          rails.push({ id: ball.id, rail: lowRail, t, order: eventOrder++, counts: !frozen.get(ball.id).has(lowRail) });
        }
      } else if (ball[axis] > high) {
        ball[axis] = high;
        if (ball[velocity] > 0) {
          ball[velocity] *= -CUSHION_RESTITUTION;
          rails.push({ id: ball.id, rail: highRail, t, order: eventOrder++, counts: !frozen.get(ball.id).has(highRail) });
        }
      }
    }
  }

  while (balls.some(ball => !ball.pocketed && (ball.vx !== 0 || ball.vy !== 0))) {
    if (steps >= MAX_STEPS) throw new Error('Pool simulation did not settle');
    steps++;
    const t = rounded(steps * STEP);
    for (const ball of balls) {
      if (ball.pocketed) continue;
      ball.x += ball.vx * STEP;
      ball.y += ball.vy * STEP;
      // Capture before reflecting: the circular mouth interrupts the cushion.
      if (!capture(ball, t)) cushion(ball, t);
    }

    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.pocketed) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (Math.abs(dx) > DIAMETER || Math.abs(dy) > DIAMETER) continue;
          const distance = Math.hypot(dx, dy);
          if (distance > DIAMETER + EPS) continue;
          const nx = distance > EPS ? dx / distance : 1;
          const ny = distance > EPS ? dy / distance : 0;
          const overlap = DIAMETER - distance;
          if (overlap > 0) {
            a.x -= nx * overlap / 2;
            a.y -= ny * overlap / 2;
            b.x += nx * overlap / 2;
            b.y += ny * overlap / 2;
          }
          const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (closing >= -EPS) continue;
          const impulse = -(1 + BALL_RESTITUTION) * closing / 2;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
          contacts.push({ a: a.id, b: b.id, t, order: eventOrder++ });
          if (a.id === 0 || b.id === 0) {
            const objectId = a.id === 0 ? b.id : a.id;
            if (firstContact === null) {
              firstContact = objectId;
              firstContactStep = steps;
            }
            if (steps === firstContactStep && !firstContacts.includes(objectId)) firstContacts.push(objectId);
          }
        }
      }
      for (const ball of balls) {
        if (!ball.pocketed && !capture(ball, t)) cushion(ball, t);
      }
    }
    for (const ball of balls) {
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed === 0) continue;
      const remaining = Math.max(0, speed - FRICTION * STEP);
      ball.vx *= remaining / speed;
      ball.vy *= remaining / speed;
    }
    if (steps % SAMPLE_STEPS === 0) frames.push({ t, balls: positions(balls) });
  }
  const duration = rounded(steps * STEP);
  if (frames.at(-1).t !== duration) frames.push({ t: duration, balls: positions(balls) });
  return {
    balls: positions(balls), frames, duration, firstContact, firstContacts,
    contacts, rails, pockets, pocketed: pockets.map(event => event.id),
  };
}

export function create(settings = {}) {
  const balls = [{ id: 0, x: 250, y: 250, pocketed: false }];
  // Eight in the center; opposite groups at the rear corners; no RNG needed.
  const rack = [[1], [9, 2], [3, 8, 10], [11, 4, 12, 5], [6, 13, 7, 14, 15]];
  for (let row = 0; row < rack.length; row++) {
    rack[row].forEach((id, column) => balls.push({
      id, x: rounded(700 + row * Math.sqrt(3) * 11.05),
      y: rounded(250 + (column - row / 2) * 22.1), pocketed: false,
    }));
  }
  balls.sort((a, b) => a.id - b.id);
  return {
    turn: 0, winner: null, balls, groups: [null, null],
    ballInHand: false, foul: null, lastShot: null, breakShot: true,
  };
}

function respotEight(balls) {
  const eight = balls.find(ball => ball.id === 8);
  // Prefer the foot spot, then search the foot string toward either cushion.
  const candidates = [700];
  for (let offset = 1; offset <= 689; offset++) {
    if (700 + offset <= TABLE.width - R) candidates.push(700 + offset);
    if (700 - offset >= R) candidates.push(700 - offset);
  }
  const x = candidates.find(x => balls.every(ball => ball.id === 8 || ball.pocketed
    || Math.hypot(ball.x - x, ball.y - 250) >= DIAMETER + 0.01));
  if (x === undefined) throw new Error('Cannot spot the eight ball');
  Object.assign(eight, { x, y: 250, pocketed: false });
}

export function apply(state, player, action, settings = {}) {
  checkPlayer(player);
  if (state.winner !== null) throw new Error('Game is over');
  if (state.turn !== player) throw new Error('Not your turn');
  if (!action || typeof action !== 'object') throw new Error('Invalid action');
  if (action.type === 'place') {
    if (!state.ballInHand) throw new Error('Cue placement requires ball in hand');
    const { x, y } = action;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < R || x > TABLE.width - R
      || y < R || y > TABLE.height - R || pocketAt(x, y) !== -1) {
      throw new Error('Place the cue ball inside the cloth, outside the pockets');
    }
    if (state.balls.some(ball => ball.id !== 0 && !ball.pocketed
      && Math.hypot(ball.x - x, ball.y - y) < DIAMETER)) {
      throw new Error('Cue ball must not overlap another ball');
    }
    const next = clone(state);
    Object.assign(next.balls.find(ball => ball.id === 0), { x, y, pocketed: false });
    next.ballInHand = false;
    return next;
  }
  if (action.type !== 'shot') throw new Error('Unknown pool action');
  if (state.ballInHand) throw new Error('Place the cue ball before shooting');
  checkShot(action);
  const result = simulate(state.balls, action);
  const next = clone(state);
  next.balls = result.balls;
  next.breakShot = false;
  const isBreak = state.breakShot === true;
  const group = state.groups[player];
  // Eligibility is evaluated BEFORE the shot: last group ball + eight loses.
  const onEight = group !== null && !state.balls.some(ball => !ball.pocketed && groupOf(ball.id) === group);
  const legalFirst = id => isBreak ? id !== 0 : onEight ? id === 8
    : group === null ? groupOf(id) !== null : groupOf(id) === group;
  const fouls = [];
  if (result.firstContact === null) fouls.push('No object ball contacted');
  else if (!result.firstContacts.some(legalFirst)) fouls.push('Wrong first contact');
  if (result.pocketed.includes(0)) fouls.push('Cue ball scratched');
  const firstEvent = result.contacts.find(event => event.a === 0 || event.b === 0);
  // A rail before the first object contact never satisfies the rail requirement.
  if (firstEvent && !result.pockets.some(event => event.id !== 0 && event.order > firstEvent.order)
    && !result.rails.some(event => event.counts && event.order > firstEvent.order)) {
    fouls.push('No pocket or rail after contact');
  }
  if (isBreak && !result.pockets.some(event => event.id !== 0)
    && new Set(result.rails.filter(event => event.counts && event.id !== 0 && event.order > (firstEvent?.order ?? Infinity)).map(event => event.id)).size < 4) {
    fouls.push('Illegal break: pocket a ball or drive four object balls to cushions');
  }
  next.foul = fouls.length ? fouls.join('; ') : null;
  next.ballInHand = fouls.length > 0;
  next.lastShot = { ...result, callPocket: action.callPocket ?? null, isBreak, fouls };
  // Keep only one copy of the final ball positions in authoritative state.
  delete next.lastShot.balls;
  const eightPocket = result.pockets.find(event => event.id === 8);
  if (eightPocket && !isBreak) {
    const won = fouls.length === 0 && onEight && action.callPocket === eightPocket.pocket;
    next.winner = won ? player : 1 - player;
    next.ballInHand = false;
    if (!won) {
      if (!onEight) fouls.push('Eight ball pocketed early');
      else if (action.callPocket !== eightPocket.pocket) fouls.push('Eight ball in an uncalled pocket');
      next.foul = fouls.join('; ');
    }
    return next;
  }
  if (eightPocket) respotEight(next.balls);
  if (fouls.length > 0) {
    next.turn = 1 - player;
    return next;
  }
  const made = result.pocketed.filter(id => groupOf(id) !== null);
  if (group === null && !isBreak && made.length > 0) {
    next.groups[player] = groupOf(made[0]);
    next.groups[1 - player] = next.groups[player] === 'solids' ? 'stripes' : 'solids';
  }
  const continuing = isBreak ? result.pocketed.some(id => id !== 0)
    : made.some(id => groupOf(id) === next.groups[player]);
  if (!continuing) next.turn = 1 - player;
  return next;
}

export function view(state, player) {
  checkPlayer(player);
  return clone(state);
}
