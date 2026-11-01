// Pure rules: the server supplies settings.now (epoch milliseconds), never a
// timestamp from the client action. Call expire(state, now) from the room timer.
// Inject an unpredictable settings.seed when creating a category challenge.
// The default seed is deterministic for callers that do not request randomness.
// Banks are keyed by language so another language can add its own normalization.
const BANKS = {
  en: {
    romance: [
      ['sweetheart', 'An affectionate name for someone you love.'],
      ['anniversary', 'A special date that returns each year.'],
      ['love letter', 'Affection sent in writing.'],
      ['butterflies', 'A fluttering feeling when someone special is near.'],
      ['soulmate', 'Someone who feels like your perfect companion.'],
      ['moonlight', 'A soft glow for an evening together.'],
    ],
    movies: [
      ['inception', 'A film about layers of dreams.'],
      ['the lion king', 'A young lion finds his place in the world.'],
      ['interstellar', 'A journey through space to find a future for humanity.'],
      ['spirited away', 'A girl enters a mysterious bathhouse for spirits.'],
      ['finding nemo', 'A father crosses the ocean to find his son.'],
      ['jurassic park', 'An island attraction brings ancient reptiles back.'],
    ],
    animals: [
      ['penguin', 'A flightless bird with flippers.'],
      ['elephant', 'A large mammal with a trunk.'],
      ['octopus', 'An ocean animal with eight arms.'],
      ['red panda', 'A small tree dweller with a striped tail.'],
      ['hummingbird', 'A tiny bird that can hover.'],
      ['platypus', 'An egg-laying mammal with a duck-like bill.'],
    ],
    science: [
      ['gravity', 'The force that draws masses together.'],
      ['photosynthesis', 'Plants turn light into chemical energy.'],
      ['molecule', 'Atoms joined by chemical bonds.'],
      ['supernova', 'An enormous stellar explosion.'],
      ['microscope', 'An instrument for seeing very small things.'],
      ['neutron', 'A neutral particle in an atomic nucleus.'],
    ],
    geography: [
      ['iceland', 'A North Atlantic island known for glaciers and volcanoes.'],
      ['amazon river', 'A vast waterway flowing through South America.'],
      ['himalayas', 'The mountain range that includes Everest.'],
      ['sahara', 'A vast desert across northern Africa.'],
      ['madagascar', 'A large island off the southeast coast of Africa.'],
      ['new zealand', 'A Pacific country with two main islands.'],
    ],
    food: [
      ['chocolate', 'A sweet treat made from cacao.'],
      ['avocado', 'A creamy green fruit with a large pit.'],
      ['croissant', 'A crescent-shaped flaky pastry.'],
      ['dumpling', 'A small parcel of dough with a filling.'],
      ['strawberry', 'A red fruit with seeds on its surface.'],
      ['cinnamon', 'A fragrant spice made from bark.'],
    ],
    technology: [
      ['algorithm', 'A sequence of steps for solving a problem.'],
      ['keyboard', 'An input device with letter keys.'],
      ['encryption', 'A way to protect information with a secret key.'],
      ['satellite', 'A device orbiting a planet.'],
      ['processor', 'The part of a computer that executes instructions.'],
      ['fiber optic', 'A technology that carries information as light.'],
    ],
    general: [
      ['rainbow', 'An arc of colors after rain.'],
      ['lighthouse', 'A coastal tower guiding ships.'],
      ['orchestra', 'A large group of musicians playing together.'],
      ['hourglass', 'A device that measures time with sand.'],
      ['compass', 'An instrument that points north.'],
      ['treasure', 'Something precious hidden away.'],
    ],
  },
};

function categoryName(category) {
  if (typeof category !== 'string' || !Object.hasOwn(BANKS.en, category)) {
    throw new Error('Choose romance, movies, animals, science, geography, food, technology, or general.');
  }
  return category;
}

function timestamp(now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('A server timestamp in milliseconds is required.');
  return now;
}

function indexFor(seed, length) {
  let hash = 2166136261;
  for (const character of String(seed)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash % length;
}

function patternFor(word, guesses) {
  return [...word].map(letter => /[a-z]/.test(letter) && !guesses.includes(letter) ? '_' : letter).join('');
}

function settle(state) {
  state.pattern = patternFor(state.word, state.guesses);
  if (!state.pattern.includes('_')) state.winner = 1 - state.setter;
  else if (state.remaining === 0) state.winner = state.setter;
  if (state.winner !== null) state.phase = 'finished';
  return state;
}

export function create(settings = {}) {
  const setter = settings.setter ?? 0;
  if (setter !== 0 && setter !== 1) throw new Error('Setter must be player 0 or 1.');
  if (settings.language !== undefined && settings.language !== 'en') throw new Error('Only English is currently supported.');
  if (settings.timedSeconds !== undefined && (!Number.isInteger(settings.timedSeconds)
      || settings.timedSeconds < 1 || settings.timedSeconds > 3600)) {
    throw new Error('timedSeconds must be an integer from 1 to 3600.');
  }
  if (settings.seed !== undefined && typeof settings.seed !== 'string'
      && !(typeof settings.seed === 'number' && Number.isFinite(settings.seed))) {
    throw new Error('The server seed must be a string or finite number.');
  }
  const state = {
    phase: 'choose', setter, turn: setter, winner: null, language: 'en',
    category: null, pattern: '', guesses: [], remaining: 6, hint: null,
    hintUsed: false, word: null, secretHint: null, seed: settings.seed ?? 0,
  };
  if (settings.timedSeconds !== undefined) state.timedSeconds = settings.timedSeconds;
  return state;
}

// A timeout is a separate server-driven transition, including when neither
// player sends a move. It is safe to run repeatedly or on a finished round.
export function expire(state, now) {
  timestamp(now);
  const next = structuredClone(state);
  if (next.phase === 'guess' && next.winner === null && next.deadline !== undefined && now >= next.deadline) {
    next.phase = 'finished';
    next.winner = next.setter;
    next.reason = 'timeout';
  }
  return next;
}

export function apply(state, player, action, settings = {}) {
  if (player !== 0 && player !== 1) throw new Error('Invalid player.');
  if (state.winner !== null || state.phase === 'finished') throw new Error('This round is finished.');
  if (!action || typeof action !== 'object') throw new Error('An action is required.');
  if (action.type === 'timeout') {
    if (state.phase !== 'guess' || state.deadline === undefined) throw new Error('No active timer.');
    const next = expire(state, timestamp(settings.now));
    if (next.winner === null) throw new Error('The timer has not expired.');
    return next;
  }
  if (state.turn !== player) throw new Error('It is not your turn.');

  if (state.phase === 'choose') {
    if (player !== state.setter || !['word', 'category'].includes(action.type)) {
      throw new Error('The setter must choose a word or category.');
    }
    const category = categoryName(action.category ?? (action.type === 'word' ? 'general' : undefined));
    let word;
    let secretHint;
    if (action.type === 'word') {
      if (typeof action.word !== 'string' || action.word.length > 128) throw new Error('Enter an English word or phrase.');
      word = action.word.trim().toLowerCase().replace(/\s+/g, ' ');
      if (word.length > 64 || !/^[a-z]+(?:[ '-][a-z]+)*$/.test(word) || word.replace(/[^a-z]/g, '').length < 2) {
        throw new Error('Use 2 to 64 English letters, spaces, hyphens, or apostrophes.');
      }
      secretHint = `An English word or phrase in the ${category} category.`;
    } else {
      const words = BANKS[state.language][category];
      [word, secretHint] = words[indexFor(settings.seed ?? state.seed, words.length)];
    }
    const next = structuredClone(state);
    next.category = category;
    next.word = word;
    next.secretHint = secretHint;
    next.pattern = patternFor(word, []);
    next.phase = 'guess';
    next.turn = 1 - state.setter;
    if (state.timedSeconds !== undefined) {
      next.deadline = timestamp(settings.now) + state.timedSeconds * 1000;
      if (!Number.isSafeInteger(next.deadline)) throw new Error('Timer deadline is out of range.');
    }
    return next;
  }

  if (state.phase !== 'guess' || player === state.setter || !['guess', 'hint'].includes(action.type)) {
    throw new Error('The guesser must choose a letter or request a hint.');
  }
  let letter;
  if (action.type === 'guess') {
    if (typeof action.letter !== 'string' || !/^[a-z]$/i.test(action.letter)) throw new Error('Guess one English letter.');
    letter = action.letter.toLowerCase();
    if (state.guesses.includes(letter)) throw new Error('That letter has already been guessed.');
  } else if (state.hintUsed) throw new Error('The hint has already been used.');

  let next = state.deadline === undefined ? structuredClone(state) : expire(state, timestamp(settings.now));
  if (next.winner !== null) return next;
  if (action.type === 'hint') {
    // One free hint per round gives a category clue and reveals an unused letter.
    // Add it to guesses so keyboard, pattern, repeated-letter, and victory rules
    // are identical for a hinted letter and an ordinary correct guess.
    letter = [...state.word].find(character => /[a-z]/.test(character) && !state.guesses.includes(character));
    next.hint = `${state.secretHint} Revealed letter: ${letter.toUpperCase()}.`;
    next.hintUsed = true;
  }
  next.guesses.push(letter);
  if (!state.word.includes(letter)) next.remaining--;
  return settle(next);
}

export function view(state, player) {
  // Whitelist public data: private hints/seeds and future server-only fields
  // must never be copied into an opponent or spectator response.
  const result = {
    phase: state.phase, setter: state.setter, turn: state.turn, winner: state.winner,
    language: state.language, category: state.category, pattern: state.pattern,
    guesses: [...state.guesses], remaining: state.remaining, hint: state.hint,
    hintUsed: state.hintUsed,
  };
  for (const key of ['timedSeconds', 'deadline', 'reason']) {
    if (state[key] !== undefined) result[key] = state[key];
  }
  if (player === state.setter || state.winner !== null) result.word = state.word;
  return result;
}
