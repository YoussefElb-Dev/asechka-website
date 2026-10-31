const ROWS = 6;
const COLUMNS = 7;

export function create(settings = {}) {
  return { board: Array(ROWS * COLUMNS).fill(null), line: [], turn: 0, winner: null };
}

function winningLine(board, row, column, player) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [row * COLUMNS + column];
    for (const direction of [-1, 1]) {
      for (let distance = 1; ; distance++) {
        const r = row + dr * distance * direction;
        const c = column + dc * distance * direction;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLUMNS || board[r * COLUMNS + c] !== player) break;
        if (direction === -1) line.unshift(r * COLUMNS + c);
        else line.push(r * COLUMNS + c);
      }
    }
    if (line.length >= 4) return line;
  }
  return [];
}

export function apply(state, player, action, settings = {}) {
  if (player !== 0 && player !== 1) throw new Error('Invalid player.');
  if (state.winner !== null) throw new Error('This round is finished.');
  if (state.turn !== player) throw new Error('It is not your turn.');
  if (!action || action.type !== 'drop' || !Number.isInteger(action.column)
      || action.column < 0 || action.column >= COLUMNS) throw new Error('Choose a column from 0 to 6.');
  let row = ROWS - 1;
  while (row >= 0 && state.board[row * COLUMNS + action.column] !== null) row--;
  if (row < 0) throw new Error('That column is full.');

  const next = structuredClone(state);
  next.board[row * COLUMNS + action.column] = player;
  next.line = winningLine(next.board, row, action.column, player);
  next.winner = next.line.length ? player : next.board.every(cell => cell !== null) ? 'draw' : null;
  next.turn = next.winner === null ? 1 - player : player;
  return next;
}

export function view(state, player) {
  return structuredClone(state);
}
