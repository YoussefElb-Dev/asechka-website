import test from 'node:test';
import assert from 'node:assert/strict';
import { create, apply, view, expire } from '../server/games/rules/hangman.mjs';

const choose = (word = 'balloon', settings = {}) => {
  const state = create(settings);
  return apply(state, state.setter, { type: 'word', word, category: 'general' }, settings);
};
const guess = (state, letter, settings = {}) => apply(state, 1 - state.setter, { type: 'guess', letter }, settings);

test('hangman creates JSON choose-phase state with configurable setter and validated settings', () => {
  const state = create();
  assert.equal(state.phase, 'choose');
  assert.equal(state.turn, 0);
  assert.equal(state.setter, 0);
  assert.equal(state.winner, null);
  assert.equal(state.remaining, 6);
  assert.equal(state.deadline, undefined);
  assert.deepEqual(state.guesses, []);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal(create({ setter: 1 }).turn, 1);
  for (const setter of [-1, 2, '0', false]) assert.throws(() => create({ setter }), Error);
  for (const timedSeconds of [0, -1, 0.5, '30', NaN, Infinity, 3601, null]) assert.throws(() => create({ timedSeconds }), Error);
  assert.throws(() => create({ language: 'fr' }), /English/);
  for (const seed of [null, {}, [], NaN, Infinity]) assert.throws(() => create({ seed }), Error);
});

test('hangman normalizes English phrases and displays separators without revealing letters', () => {
  const state = choose("  Mother's  IN-LAW  ");
  assert.equal(state.word, "mother's in-law");
  assert.equal(state.pattern, "______'_ __-___");
  assert.equal(state.category, 'general');
  assert.equal(state.phase, 'guess');
  assert.equal(state.turn, 1);
  assert.equal(state.hint, null);
  assert.equal(state.deadline, undefined);
  const next = guess(state, 'M');
  assert.equal(next.pattern, "m_____'_ __-___");
  assert.deepEqual(next.guesses, ['m']);
  assert.equal(next.remaining, 6);
});

test('hangman validates words, categories, role ownership, phases and action payloads atomically', () => {
  const state = create();
  const before = structuredClone(state);
  for (const word of ['', 'a', 'a-', '-ab', 'ab!', '123', 'café', '_secret', 'a'.repeat(65), null, {}, ['ab']]) {
    assert.throws(() => apply(state, 0, { type: 'word', word, category: 'general' }), Error);
  }
  for (const category of ['__proto__', 'constructor', 'unknown', 'ANIMALS', 0, null]) {
    assert.throws(() => apply(state, 0, { type: 'category', category }), Error);
  }
  for (const player of [1, 2, -1, '0', null]) assert.throws(() => apply(state, player, { type: 'word', word: 'hello' }), Error);
  for (const action of [null, {}, { type: 'guess', letter: 'a' }, { type: 'hint' }, { type: 'timeout' }]) {
    assert.throws(() => apply(state, 0, action), Error);
  }
  assert.deepEqual(state, before);
  const guessing = choose();
  for (const action of [{ type: 'word', word: 'other' }, { type: 'category', category: 'animals' }, { type: 'unknown' }]) {
    assert.throws(() => apply(guessing, 1, action), Error);
  }
  assert.throws(() => apply(guessing, 0, { type: 'guess', letter: 'b' }), /turn/);
  for (const letter of ['', 'ab', ' a', 'a ', 'é', '1', '?', null, 1, undefined]) assert.throws(() => guess(guessing, letter), Error);
});

test('hangman correct guesses reveal every occurrence and wrong guesses consume exactly one attempt', () => {
  const state = choose();
  const correct = guess(state, 'l');
  assert.equal(correct.pattern, '__ll___');
  assert.equal(correct.remaining, 6);
  assert.equal(correct.turn, 1);
  assert.equal(correct.winner, null);
  const incorrect = guess(correct, 'x');
  assert.equal(incorrect.pattern, '__ll___');
  assert.equal(incorrect.remaining, 5);
  assert.deepEqual(incorrect.guesses, ['l', 'x']);
  assert.throws(() => guess(incorrect, 'L'), /already/);
  assert.throws(() => guess(incorrect, 'X'), /already/);
  assert.deepEqual(state.guesses, []);
  assert.equal(state.pattern, '_______');
});

test('hangman wins by revealing all letters, loses on sixth mistake and handles winner zero explicitly', () => {
  for (const setter of [0, 1]) {
    let won = choose('letter', { setter });
    for (const letter of ['l', 'e', 't', 'r']) won = guess(won, letter);
    assert.equal(won.pattern, 'letter');
    assert.equal(won.phase, 'finished');
    assert.equal(won.winner, 1 - setter);
    assert.equal(won.remaining, 6);
    assert.throws(() => guess(won, 'x'), /finished/);
    let lost = choose('letter', { setter });
    for (const letter of ['a', 'b', 'c', 'd', 'f', 'g']) lost = guess(lost, letter);
    assert.equal(lost.remaining, 0);
    assert.equal(lost.winner, setter);
    assert.equal(lost.phase, 'finished');
    assert.equal(view(lost, 1 - setter).word, 'letter');
    assert.throws(() => guess(lost, 'l'), /finished/);
  }
});

test('hangman covers all eight categories with deterministic server-seeded English word sets and useful hints', () => {
  for (const category of ['romance', 'movies', 'animals', 'science', 'geography', 'food', 'technology', 'general']) {
    const words = new Set();
    for (let seed = 0; seed < 40; seed++) {
      const settings = { setter: 1, seed: `private-${seed}` };
      const initial = create(settings);
      const action = { type: 'category', category };
      const state = apply(initial, 1, action, settings);
      assert.deepEqual(apply(initial, 1, action, settings), state);
      assert.equal(state.category, category);
      assert.match(state.word, /^[a-z]+(?:[ '-][a-z]+)*$/);
      assert.equal(state.pattern, state.word.replace(/[a-z]/g, '_'));
      const hinted = apply(state, 0, { type: 'hint' });
      assert.ok(hinted.hint.length > 20);
      assert.ok(!hinted.pattern.includes('_') || hinted.pattern !== state.pattern);
      words.add(state.word);
    }
    assert.equal(words.size, 6, category);
  }
});

test('hangman allows one free hint, reveals an unguessed letter everywhere, and can win from a hint', () => {
  const state = guess(choose('balloon'), 'b');
  const hinted = apply(state, 1, { type: 'hint' });
  assert.equal(hinted.hintUsed, true);
  assert.match(hinted.hint, /Revealed letter: A/);
  assert.equal(hinted.pattern, 'ba_____');
  assert.equal(hinted.remaining, 6);
  assert.deepEqual(hinted.guesses, ['b', 'a']);
  assert.throws(() => apply(hinted, 1, { type: 'hint' }), /already/);
  assert.throws(() => guess(hinted, 'a'), /already/);
  const won = apply(choose('aa'), 1, { type: 'hint' });
  assert.equal(won.winner, 1);
  assert.equal(won.pattern, 'aa');
});

test('hangman hides word, private hint and seed from opponents and spectators until game over', () => {
  for (const setter of [0, 1]) {
    const state = choose('soulmate', { setter, seed: 'super-secret-seed' });
    state.futurePrivateField = 'soulmate';
    for (const viewer of [1 - setter, null, undefined, -1, '0']) {
      const snapshot = view(state, viewer);
      assert.equal(snapshot.word, undefined);
      assert.equal(snapshot.seed, undefined);
      assert.equal(snapshot.secretHint, undefined);
      assert.equal(snapshot.futurePrivateField, undefined);
      assert.ok(!JSON.stringify(snapshot).includes('soulmate'));
      assert.ok(!JSON.stringify(snapshot).includes('super-secret-seed'));
    }
    const setterView = view(state, setter);
    assert.equal(setterView.word, 'soulmate');
    assert.equal(setterView.seed, undefined);
    assert.equal(setterView.secretHint, undefined);
    const finished = [...new Set(state.word)].reduce((current, letter) => guess(current, letter), state);
    assert.equal(view(finished, null).word, 'soulmate');
    assert.equal(view(finished, null).seed, undefined);
    const snapshot = view(state, 1 - setter);
    snapshot.guesses.push('s');
    assert.deepEqual(state.guesses, []);
  }
});

test('hangman starts the timer when a word is chosen and uses only authoritative server time', () => {
  const settings = { setter: 1, timedSeconds: 30, now: 1000 };
  const initial = create(settings);
  assert.equal(initial.deadline, undefined);
  const state = apply(initial, 1, { type: 'word', word: 'clock', category: 'technology', now: 9999999 }, settings);
  assert.equal(state.deadline, 31000);
  assert.equal(state.turn, 0);
  assert.equal(view(state, 0).deadline, 31000);
  const before = apply(state, 0, { type: 'guess', letter: 'c', now: 9999999 }, { now: 30999 });
  assert.equal(before.winner, null);
  assert.equal(before.pattern, 'c__c_');
  const timedOut = apply(state, 0, { type: 'guess', letter: 'l', now: 0 }, { now: 31000 });
  assert.equal(timedOut.winner, 1);
  assert.equal(timedOut.phase, 'finished');
  assert.equal(timedOut.reason, 'timeout');
  assert.deepEqual(timedOut.guesses, []);
  assert.equal(state.winner, null);
  assert.deepEqual(state.guesses, []);
  for (const now of [undefined, NaN, Infinity, -1, '1000', 0.5]) {
    assert.throws(() => apply(initial, 1, { type: 'word', word: 'clock' }, { now }), Error);
    assert.throws(() => guess(state, 'c', { now }), Error);
  }
});

test('hangman timeout transitions work without a guess and either player can request an expired timeout', () => {
  const state = choose('timer', { timedSeconds: 1, now: 100 });
  assert.deepEqual(expire(state, 1099), state);
  for (const player of [0, 1]) {
    assert.throws(() => apply(state, player, { type: 'timeout', now: 999999 }, { now: 1099 }), /not expired/);
    const finished = apply(state, player, { type: 'timeout' }, { now: 1100 });
    assert.equal(finished.winner, 0);
    assert.equal(finished.phase, 'finished');
    assert.equal(finished.reason, 'timeout');
    assert.equal(view(finished, 1).word, 'timer');
    assert.deepEqual(expire(finished, 1200), finished);
  }
  const swept = expire(state, 1100);
  assert.equal(swept.winner, 0);
  assert.equal(state.winner, null);
  assert.throws(() => apply(choose('untimed'), 0, { type: 'timeout' }, { now: 100000 }), /No active timer/);
  assert.deepEqual(expire(create(), 1000), create());
  const won = ['t', 'i', 'm', 'e', 'r'].reduce((current, letter) => guess(current, letter, { now: 1099 }), state);
  assert.equal(won.winner, 1);
  assert.deepEqual(expire(won, 1100), won);
});

test('hangman ignores forged result and seed fields in actions and rejects deadline overflow', () => {
  const initial = create({ seed: 'server-secret' });
  const normal = apply(initial, 0, { type: 'category', category: 'animals' });
  const forged = apply(initial, 0, { type: 'category', category: 'animals', seed: 'client', word: 'cheat', winner: 0 });
  assert.deepEqual(forged, normal);
  const state = choose('letter');
  const next = apply(state, 1, { type: 'guess', letter: 'x', winner: 1, remaining: 100, word: 'x' });
  assert.equal(next.winner, null);
  assert.equal(next.word, 'letter');
  assert.equal(next.remaining, 5);
  assert.throws(() => choose('clock', { timedSeconds: 1, now: Number.MAX_SAFE_INTEGER }), /out of range/);
});
