// A single board is a round; best-of scores and rematches belong to the room.
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function create(settings = {}) {
  const bestOf = settings.bestOf ?? 1;
  if (![1, 3, 5].includes(bestOf)) throw new Error('bestOf must be 1, 3, or 5.');
  return { board: Array(9).fill(null), line: [], turn: 0, winner: null };
}

export function apply(state, player, action, settings = {}) {
  if (player !== 0 && player !== 1) throw new Error('Invalid player.');
  if (state.winner !== null) throw new Error('This round is finished.');
  if (state.turn !== player) throw new Error('It is not your turn.');
  if (!action || action.type !== 'place' || !Number.isInteger(action.cell)
      || action.cell < 0 || action.cell > 8) throw new Error('Choose a cell from 0 to 8.');
  if (state.board[action.cell] !== null) throw new Error('That cell is occupied.');

  const next = structuredClone(state);
  next.board[action.cell] = player;
  next.line = [...(LINES.find(line => line.every(cell => next.board[cell] === player)) ?? [])];
  next.winner = next.line.length ? player : next.board.every(cell => cell !== null) ? 'draw' : null;
  next.turn = next.winner === null ? 1 - player : player;
  return next;
}

export function view(state, player) {
  return structuredClone(state);
}
