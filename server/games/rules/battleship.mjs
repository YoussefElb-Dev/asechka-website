// Single-shot Battleship: turns alternate after every shot, including hits.
const LENGTHS = [5, 4, 3, 3, 2];
const clone = value => JSON.parse(JSON.stringify(value));

function checkPlayer(player) {
  if (player !== 0 && player !== 1) throw new Error('Invalid player');
}

function cellNumber(cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < 100;
}

function validateFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== LENGTHS.length) {
    throw new Error('Place exactly five ships of lengths 5, 4, 3, 3, 2');
  }
  const lengths = ships.map(ship => Array.isArray(ship?.cells) ? ship.cells.length : 0)
    .sort((a, b) => b - a);
  if (lengths.some((length, index) => length !== LENGTHS[index])) {
    throw new Error('Ship lengths must be 5, 4, 3, 3, 2');
  }
  const occupied = new Set();
  return ships.map(ship => {
    if (!ship.cells.every(cellNumber)) throw new Error('Ship cells must be integers from 0 to 99');
    const cells = [...ship.cells].sort((a, b) => a - b);
    const horizontal = cells.every(cell => Math.floor(cell / 10) === Math.floor(cells[0] / 10));
    const vertical = cells.every(cell => cell % 10 === cells[0] % 10);
    const stride = horizontal ? 1 : 10;
    if ((!horizontal && !vertical) || cells.some((cell, i) => cell !== cells[0] + i * stride)) {
      throw new Error('Every ship must be straight and contiguous without wrapping rows');
    }
    for (const cell of cells) {
      if (occupied.has(cell)) throw new Error('Ships must not overlap');
      occupied.add(cell);
    }
    return { cells };
  });
}

export function create(settings = {}) {
  return {
    phase: 'placement', turn: 0, winner: null,
    fleets: [null, null], shots: [[], []], hits: [[], []], sunk: [[], []],
  };
}

export function apply(state, player, action, settings = {}) {
  checkPlayer(player);
  if (state.winner !== null) throw new Error('Game is over');
  if (!action || typeof action !== 'object') throw new Error('Invalid action');
  if (action.type === 'fleet') {
    if (state.phase !== 'placement') throw new Error('Fleet placement is over');
    if (state.fleets[player] !== null) throw new Error('Fleet is already committed');
    const ships = validateFleet(action.ships);
    const next = clone(state);
    next.fleets[player] = ships;
    if (next.fleets.every(fleet => fleet !== null)) next.phase = 'battle';
    return next;
  }
  if (action.type !== 'fire') throw new Error('Unknown Battleship action');
  if (state.phase !== 'battle') throw new Error('Both fleets must be placed before firing');
  if (state.turn !== player) throw new Error('Not your turn');
  if (!cellNumber(action.cell)) throw new Error('Shot cell must be an integer from 0 to 99');
  if (state.shots[player].includes(action.cell)) throw new Error('Cell has already been fired upon');

  const next = clone(state);
  const target = 1 - player;
  next.shots[player].push(action.cell);
  const shipIndex = next.fleets[target].findIndex(ship => ship.cells.includes(action.cell));
  if (shipIndex !== -1) {
    next.hits[player].push(action.cell);
    const ship = next.fleets[target][shipIndex];
    if (ship.cells.every(cell => next.hits[player].includes(cell))) next.sunk[player].push(shipIndex);
    if (next.sunk[player].length === LENGTHS.length) next.winner = player;
  }
  if (next.winner === null) next.turn = target;
  return next;
}

export function view(state, player) {
  checkPlayer(player);
  const visible = clone(state);
  // Sunk ship indices alone do not reveal any unhit segment of another ship.
  visible.sunkShips = state.sunk.map((indices, attacker) => indices.map(index => ({
    index, cells: [...state.fleets[1 - attacker][index].cells],
  })));
  visible.placed = state.fleets.map(fleet => fleet !== null);
  if (state.winner === null) visible.fleets[1 - player] = null;
  return visible;
}
