import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GamesService } from '../server/games/service.mjs';

const ACTORS = ['asnat', 'youssef'];
const wire = value => JSON.parse(JSON.stringify(value));
const without = (value, ...keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

// The clients use the production command queue and event projections, with a
// JSON boundary in each direction as a WebSocket has. No disk, ports or sleeps.
async function clients(t) {
  let now = 1_800_000_000_000;
  const service = await new GamesService({ now: () => now }).init();
  const inboxes = [[], []];
  const stop = service.onEvent((actor, event) => {
    const player = ACTORS.indexOf(actor);
    const message = wire(event);
    inboxes[player].push(message);
    const rooms = message.type === 'room' ? [message.room] : message.rooms ?? [];
    for (const room of rooms) {
      const authoritative = service.data.rooms.find(candidate => candidate.id === room.id);
      assertFilteredState(room, authoritative, player);
    }
  });
  t.after(stop);
  ACTORS.forEach(actor => service.online(actor, 1));

  async function send(player, body) {
    const command = wire({ ...body, id: randomUUID() });
    const inputBefore = wire(command);
    const previous = service.data;
    const before = wire(previous);
    try {
      return wire(await service.command(ACTORS[player], command));
    } finally {
      // Accepted commands replace state. Previously stored boards/history must
      // remain unchanged, as must command objects and failed/read-only commands.
      assert.deepEqual(previous, before, 'A command mutated previously stored data.');
      assert.deepEqual(command, inputBefore, 'A command mutated the client payload.');
    }
  }

  async function views(id) {
    const previous = service.data;
    const before = wire(previous);
    const lists = await Promise.all([0, 1].map(player => send(player, { type: 'list' })));
    const rooms = lists.map(list => list.rooms.find(room => room.id === id));
    assert.ok(rooms.every(Boolean), 'Both clients must discover the room.');
    assert.deepEqual(service.data, before, 'Listing rooms must not change a match.');
    assert.strictEqual(service.data, previous);
    assert.deepEqual(without(rooms[0], 'state'), without(rooms[1], 'state'));
    for (const player of [0, 1]) {
      const messages = inboxes[player].flatMap(message => message.type === 'room' ? [message.room] : message.rooms ?? []);
      const latest = messages.findLast(room => room.id === id);
      assert.deepEqual(latest, rooms[player], 'Published and listed client projections diverged.');
      assertFilteredState(rooms[player], service.data.rooms.find(room => room.id === id), player);
    }
    if (rooms[0].state) {
      const privateKey = rooms[0].game === 'hangman' ? 'word' : rooms[0].game === 'battleship' ? 'fleets' : null;
      assert.deepEqual(without(rooms[0].state, privateKey), without(rooms[1].state, privateKey));
    }
    return rooms;
  }

  async function change(player, body) {
    const previous = body.room && service.data.rooms.find(room => room.id === body.room);
    const seq = previous?.seq;
    const ack = await send(player, body);
    assert.equal(ack.type, 'ack');
    const id = ack.room ?? body.room;
    const result = await views(id);
    assert.equal(ack.seq, result[0].seq);
    if (seq !== undefined) assert.equal(result[0].seq, seq + 1);
    return result;
  }

  async function move(player, id, action) {
    const [room] = await views(id);
    return change(player, { type: 'move', room: id, seq: room.seq, action });
  }

  async function rejectMove(player, id, action, error) {
    const [room] = await views(id);
    const before = wire(service.data);
    await assert.rejects(send(player, { type: 'move', room: id, seq: room.seq, action }), error);
    assert.deepEqual(service.data, before, 'A rejected move changed the room or receipts.');
    await views(id);
  }

  async function start(game, settings = {}) {
    const created = await send(0, { type: 'create', game, settings });
    assert.equal(created.type, 'ack');
    const id = created.room;
    const invitation = (await send(0, { type: 'list' })).rooms.find(room => room.id === id);
    assert.equal(invitation.status, 'lobby');
    assert.equal(invitation.state, null);
    assert.equal(invitation.players.length, 1);
    await change(1, { type: 'join', code: invitation.code });
    await change(0, { type: 'ready', room: id, ready: true });
    await change(1, { type: 'ready', room: id, ready: true });
    const [playing] = await change(0, { type: 'start', room: id });
    assert.equal(playing.status, 'playing');
    assert.equal(playing.result, null);
    assert.equal(playing.state.winner, null);
    assert.deepEqual(playing.scores, [0, 0]);
    assert.ok(playing.players.every(player => player.ready && player.online));
    return id;
  }

  async function sync(id) {
    const before = wire(service.data);
    for (const player of [0, 1]) {
      const ack = await send(player, { type: 'sync', room: id });
      assert.equal(ack.type, 'ack');
    }
    assert.deepEqual(service.data, before, 'Sync must not mutate the match.');
    return views(id);
  }

  async function rematch(id) {
    const [finished] = await views(id);
    assert.equal(finished.status, 'finished');
    const [waiting] = await change(0, { type: 'rematch', room: id });
    assert.equal(waiting.status, 'finished');
    assert.deepEqual(waiting.state, finished.state);
    assert.deepEqual(waiting.scores, finished.scores);
    assert.deepEqual(waiting.rematchReady, [ACTORS[0]]);
    const result = await change(1, { type: 'rematch', room: id });
    assert.equal(result[0].status, 'playing');
    assert.equal(result[0].result, null);
    assert.equal(result[0].state.winner, null);
    assert.deepEqual(result[0].rematchReady, []);
    if (finished.seriesWinner === null) {
      assert.deepEqual(result[0].scores, finished.scores);
      assert.equal(result[0].round, finished.round + 1);
    } else {
      assert.deepEqual(result[0].scores, [0, 0]);
      assert.equal(result[0].seriesWinner, null);
      assert.equal(result[0].round, 1);
    }
    return result;
  }

  return { service, send, start, views, move, rejectMove, sync, rematch,
    advance: milliseconds => { now += milliseconds; } };
}

function assertFilteredState(room, authoritative, player) {
  assert.ok(authoritative, 'Published room must exist in the authoritative store.');
  const state = room.state;
  if (!state) return;
  assert.equal(state.winner, authoritative.state.winner);
  assert.equal(state.turn, authoritative.state.turn);
  assert.equal(room.result, authoritative.result);
  assert.equal(room.seq, authoritative.seq);
  if (room.game === 'hangman') {
    const allowed = ['phase', 'setter', 'turn', 'winner', 'language', 'category', 'pattern',
      'guesses', 'remaining', 'hint', 'hintUsed', 'timedSeconds', 'deadline', 'reason', 'word'];
    allowed.push('personal');
    assert.equal(typeof state.personal, 'boolean', 'Only the mode flag is public, never the personal answer.');
    assert.ok(Object.keys(state).every(key => allowed.includes(key)), 'Unexpected Hangman public field.');
    assert.equal(state.seed, undefined);
    assert.equal(state.secretHint, undefined);
    assert.equal(room.settings.seed, undefined);
    assert.ok(!JSON.stringify(room).includes(authoritative.state.seed), 'Private category seed escaped.');
    if (state.winner !== null || player === state.setter) assert.equal(state.word, authoritative.state.word);
    else assert.equal(Object.hasOwn(state, 'word'), false, 'The guesser received the secret word.');
    assert.equal(state.pattern, authoritative.state.pattern);
    assert.deepEqual(state.guesses, authoritative.state.guesses);
  } else if (room.game === 'battleship') {
    const source = authoritative.state;
    const allowed = ['phase', 'turn', 'winner', 'fleets', 'shots', 'hits', 'sunk', 'placed', 'sunkShips'];
    assert.ok(Object.keys(state).every(key => allowed.includes(key)), 'Unexpected Battleship public field.');
    assert.deepEqual(state.fleets[player], source.fleets[player]);
    assert.deepEqual(state.fleets[1 - player], source.winner === null ? null : source.fleets[1 - player]);
    assert.deepEqual(state.placed, source.fleets.map(fleet => fleet !== null));
    for (const field of ['shots', 'hits', 'sunk']) assert.deepEqual(state[field], source[field]);
    assert.deepEqual(state.sunkShips, source.sunk.map((ships, attacker) => ships.map(index => {
      const cells = source.fleets[1 - attacker][index].cells;
      assert.ok(cells.every(cell => source.hits[attacker].includes(cell)), 'An unsunk ship was revealed.');
      return { index, cells };
    })));
  } else if (room.game === 'checkers') {
    assert.equal(state.repetitions, undefined);
    assert.deepEqual(without(state, 'legal'), without(authoritative.state, 'repetitions'));
    assert.ok(Array.isArray(state.legal));
  } else assert.deepEqual(state, authoritative.state);
}

const CONNECT_WINS = [
  [0, 0, 1, 1, 2, 2, 3],
  [6, 0, 6, 1, 5, 2, 5, 3],
];

for (const [bestOf, winners] of [[1, [0]], [3, [0, 1, 0]], [5, [1, 0, 1, 1]]]) {
  test(`Connect Four: two clients complete best-of-${bestOf}, retain round scores and reset the next series`, async t => {
    const game = await clients(t);
    const id = await game.start('connect4', { bestOf, theme: 'ocean' });
    const scores = [0, 0];
    for (let round = 0; round < winners.length; round++) {
      if (round) await game.rematch(id);
      const winner = winners[round];
      for (const column of CONNECT_WINS[winner]) {
        const [before] = await game.views(id);
        await game.move(before.state.turn, id, { type: 'drop', column });
      }
      scores[winner]++;
      const snapshots = await game.sync(id);
      const [finished] = snapshots;
      assert.deepEqual(snapshots[0], snapshots[1]);
      assert.equal(finished.status, 'finished');
      assert.equal(finished.result, winner);
      assert.equal(finished.state.winner, winner);
      assert.deepEqual(finished.state.line, [35, 36, 37, 38]);
      assert.deepEqual(finished.scores, scores);
      assert.equal(finished.round, round + 1);
      assert.equal(finished.seriesWinner, scores[winner] >= Math.floor(bestOf / 2) + 1 ? winner : null);
      await game.rejectMove(winner, id, { type: 'drop', column: 4 }, /not in progress/);
    }
    const [nextSeries] = await game.rematch(id);
    assert.deepEqual(nextSeries.state.board, Array(42).fill(null));
    assert.deepEqual(nextSeries.state.line, []);
    assert.deepEqual(nextSeries.scores, [0, 0]);
  });
}

test('Hangman: both filtered clients finish custom/category rounds, use hints, swap setter and score a series', async t => {
  const game = await clients(t);
  const id = await game.start('hangman', { bestOf: 3, setter: 0, timedSeconds: 30 });
  await game.move(0, id, { type: 'word', word: 'moonlight', category: 'romance' });
  await game.rejectMove(0, id, { type: 'guess', letter: 'm' }, /turn/);
  await game.move(1, id, { type: 'guess', letter: 'z' });
  const [hinted] = await game.move(1, id, { type: 'hint' });
  assert.equal(hinted.state.remaining, 5);
  assert.equal(hinted.state.hintUsed, true);
  assert.match(hinted.state.hint, /Revealed letter: M/);
  await game.rejectMove(1, id, { type: 'guess', letter: 'Z' }, /already/);
  await game.rejectMove(1, id, { type: 'hint' }, /already/);
  for (const letter of ['o', 'n', 'l', 'i', 'g', 'h', 't']) await game.move(1, id, { type: 'guess', letter });
  let [finished, partner] = await game.sync(id);
  assert.deepEqual(finished, partner);
  assert.equal(finished.result, 1);
  assert.equal(finished.state.pattern, 'moonlight');
  assert.equal(finished.state.word, 'moonlight');
  assert.deepEqual(finished.scores, [0, 1]);
  assert.equal(finished.seriesWinner, null);

  const [rematch] = await game.rematch(id);
  assert.equal(rematch.state.setter, 1);
  assert.equal(rematch.state.turn, 1);
  assert.equal(rematch.state.phase, 'choose');
  assert.equal(rematch.settings.setter, 1);
  assert.equal(rematch.state.hint, null);
  assert.deepEqual(rematch.state.guesses, []);
  assert.equal(rematch.state.remaining, 6);
  assert.equal(rematch.state.deadline, undefined);
  const categoryViews = await game.move(1, id, { type: 'category', category: 'science' });
  assert.equal(categoryViews[0].state.category, 'science');
  assert.equal(categoryViews[0].state.word, undefined);
  assert.match(categoryViews[1].state.word, /^[a-z]+$/);
  // This harness controls both people. Its guess script uses the legitimate
  // setter response to finish a server-chosen word, never the private store.
  for (const letter of new Set(categoryViews[1].state.word)) await game.move(0, id, { type: 'guess', letter });
  [finished] = await game.sync(id);
  assert.equal(finished.result, 0);
  assert.deepEqual(finished.scores, [1, 1]);
  assert.equal(finished.seriesWinner, null);

  const [thirdRound] = await game.rematch(id);
  assert.equal(thirdRound.state.setter, 0);
  await game.move(0, id, { type: 'word', word: 'cocoa', category: 'food' });
  for (const letter of ['b', 'd', 'e', 'f', 'g', 'h']) await game.move(1, id, { type: 'guess', letter });
  [finished, partner] = await game.sync(id);
  assert.deepEqual(finished, partner);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.result, 0);
  assert.equal(finished.state.remaining, 0);
  assert.equal(finished.state.word, 'cocoa');
  assert.deepEqual(finished.scores, [2, 1]);
  assert.equal(finished.seriesWinner, 0);
  assert.equal((await game.rematch(id))[0].state.setter, 1);
});

test('Hangman: the service clock completes a timed round without client input and scores it only once', async t => {
  const game = await clients(t);
  const id = await game.start('hangman', { setter: 0, timedSeconds: 30 });
  await game.move(0, id, { type: 'word', word: 'hourglass', category: 'general' });
  const [before] = await game.views(id);
  game.advance(29_999);
  await game.service.tick();
  assert.deepEqual((await game.views(id))[0], before);
  game.advance(1);
  const previous = game.service.data;
  const snapshot = wire(previous);
  await game.service.tick();
  assert.deepEqual(previous, snapshot);
  const [finished, partner] = await game.sync(id);
  assert.deepEqual(finished, partner);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.result, 0);
  assert.equal(finished.state.reason, 'timeout');
  assert.equal(finished.state.word, 'hourglass');
  assert.deepEqual(finished.scores, [1, 0]);
  assert.equal(finished.seq, before.seq + 1);
  const settled = wire(game.service.data);
  await game.service.tick();
  assert.deepEqual(game.service.data, settled);
});

function randomIndex(seed) {
  return length => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % length;
  };
}

test('Checkers: seeded legal play completes from the opening and replays through two fresh clients', async t => {
  const game = await clients(t);
  const id = await game.start('checkers');
  const pick = randomIndex(0x5eed2026);
  const replay = [];
  let captures = 0;
  let promotions = 0;
  let chains = 0;
  let [room] = await game.views(id);
  await game.rejectMove(1, id, { type: 'move', from: 17, to: 24 }, /turn/);
  // No crafted positions: every board comes from a legal production command.
  while (room.result === null && replay.length < 1500) {
    const previous = wire(room.state);
    assert.ok(previous.legal.length > 0, 'An unfinished position must have a legal move.');
    const selected = previous.legal[pick(previous.legal.length)];
    const player = previous.turn;
    const action = { type: 'move', from: selected.from, to: selected.to };
    const expectedBoard = wire(previous.board);
    const piece = expectedBoard[selected.from];
    assert.equal(piece.player, player);
    expectedBoard[selected.from] = null;
    expectedBoard[selected.to] = piece;
    if (selected.captured !== undefined) {
      assert.equal(expectedBoard[selected.captured].player, 1 - player);
      expectedBoard[selected.captured] = null;
      captures++;
    }
    const promoted = !piece.king && Math.floor(selected.to / 8) === (player === 0 ? 7 : 0);
    if (promoted) { piece.king = true; promotions++; }
    [room] = await game.move(player, id, action);
    replay.push({ player, action });
    assert.deepEqual(room.state.board, expectedBoard);
    assert.deepEqual(room.state.moves.slice(0, -1), previous.moves);
    assert.deepEqual(room.state.moves.at(-1), { ...selected, player, promoted });
    assert.equal(room.state.moves.length, replay.length);
    if (room.state.forced !== null) {
      chains++;
      assert.equal(room.state.turn, player);
      assert.equal(room.state.forced, selected.to);
      assert.equal(promoted, false);
      assert.ok(room.state.legal.every(move => move.from === selected.to && move.captured !== undefined));
    } else assert.equal(room.state.turn, 1 - player);
  }
  assert.ok(replay.length < 1500, 'Seeded checkers did not terminate within 1,500 legal actions.');
  assert.ok([0, 1, 'draw'].includes(room.result));
  assert.equal(room.status, 'finished');
  assert.equal(room.state.winner, room.result);
  assert.deepEqual(room.state.legal, []);
  assert.ok(captures > 0);
  assert.ok(promotions > 0);
  assert.ok(chains > 0);
  assert.equal(room.state.board.filter(Boolean).length, 24 - captures);
  assert.deepEqual(room.scores, [room.result === 0 ? 1 : 0, room.result === 1 ? 1 : 0]);
  const snapshots = await game.sync(id);
  assert.deepEqual(snapshots[0], snapshots[1]);
  await game.rejectMove(room.state.turn, id, replay[0].action, /not in progress/);

  const replayGame = await clients(t);
  const replayId = await replayGame.start('checkers');
  for (const { player, action } of replay) await replayGame.move(player, replayId, action);
  const [replayed] = await replayGame.sync(replayId);
  assert.deepEqual(replayed.state, room.state);
  assert.equal(replayed.result, room.result);
  assert.deepEqual(replayed.scores, room.scores);
  t.diagnostic(`${replay.length} actions; result ${room.result}; ${captures} captures, ${promotions} promotions, ${chains} continued jumps; replay matched.`);
});

const FLEETS = [
  [[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]],
  [[5, 15, 25, 35, 45], [6, 16, 26, 36], [7, 17, 27], [8, 18, 28], [9, 19]],
].map(fleet => fleet.map(cells => ({ cells })));

for (const winner of [0, 1]) {
  test(`Battleship: two clients keep fleets private through placement, hits and sinking until player ${winner} wins`, async t => {
    const game = await clients(t);
    const id = await game.start('battleship');
    await game.rejectMove(0, id, { type: 'fire', cell: 5 }, /Both fleets/);
    await game.move(1, id, { type: 'fleet', ships: FLEETS[1] });
    const oneFleet = await game.sync(id);
    assert.deepEqual(oneFleet[0].state.fleets, [null, null]);
    assert.deepEqual(oneFleet[0].state.placed, [false, true]);
    assert.deepEqual(oneFleet[1].state.fleets[1], FLEETS[1]);
    await game.move(0, id, { type: 'fleet', ships: FLEETS[0] });
    let [room] = await game.views(id);
    assert.equal(room.state.phase, 'battle');
    await game.rejectMove(1, id, { type: 'fire', cell: 99 }, /turn/);
    const targets = FLEETS[1 - winner].flatMap(ship => ship.cells);
    const occupied = new Set(FLEETS[winner].flatMap(ship => ship.cells));
    const misses = Array.from({ length: 100 }, (_, cell) => cell).filter(cell => !occupied.has(cell));
    let hits = 0;
    let missed = 0;
    let checkedDuplicate = false;
    while (room.result === null) {
      const player = room.state.turn;
      if (!checkedDuplicate && room.state.shots[player].length) {
        await game.rejectMove(player, id, { type: 'fire', cell: room.state.shots[player][0] }, /already/);
        checkedDuplicate = true;
      }
      const cell = player === winner ? targets[hits++] : misses[missed++];
      const previousShots = wire(room.state.shots);
      [room] = await game.move(player, id, { type: 'fire', cell });
      previousShots[player].push(cell);
      assert.deepEqual(room.state.shots, previousShots);
      assert.equal(room.state.hits[winner].length, hits);
      assert.equal(room.state.hits[1 - winner].length, 0);
      if (hits < 17) assert.equal(room.result, null);
      if (room.result === null) assert.equal(room.state.turn, 1 - player);
    }
    const [finished, partner] = await game.sync(id);
    assert.deepEqual(finished, partner);
    assert.equal(finished.status, 'finished');
    assert.equal(finished.result, winner);
    assert.equal(finished.state.winner, winner);
    assert.equal(hits, 17);
    assert.deepEqual(finished.state.sunk[winner], [0, 1, 2, 3, 4]);
    assert.deepEqual(finished.state.fleets, FLEETS);
    assert.deepEqual(finished.scores, [winner === 0 ? 1 : 0, winner === 1 ? 1 : 0]);
    assert.equal(finished.seriesWinner, winner);
    await game.rejectMove(winner, id, { type: 'fire', cell: 99 }, /not in progress/);
    const rematch = await game.rematch(id);
    assert.deepEqual(rematch[0].state.fleets, [null, null]);
    assert.deepEqual(rematch[1].state.fleets, [null, null]);
    assert.equal(rematch[0].state.phase, 'placement');
  });
}
