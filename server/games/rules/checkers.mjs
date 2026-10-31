// American checkers: player 0 starts at the top and moves toward row 7.
// Men move/capture forward, kings in either direction. Captures are compulsory,
// but a player may choose any capture, not necessarily the longest chain.
// Crowning ends a turn even when the new king could capture backward.
const SIZE = 8;

function isCell(value) {
  return Number.isInteger(value) && value >= 0 && value < SIZE * SIZE;
}

function destinations(board, from, capturesOnly) {
  const piece = board[from];
  if (!piece) return [];
  const row = Math.floor(from / SIZE);
  const column = from % SIZE;
  const result = [];
  for (const dr of piece.king ? [-1, 1] : [piece.player === 0 ? 1 : -1]) {
    for (const dc of [-1, 1]) {
      const r = row + dr;
      const c = column + dc;
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      const adjacent = r * SIZE + c;
      if (board[adjacent] === null) {
        if (!capturesOnly) result.push({ from, to: adjacent });
      } else if (board[adjacent].player !== piece.player) {
        const landingRow = r + dr;
        const landingColumn = c + dc;
        if (landingRow >= 0 && landingRow < SIZE && landingColumn >= 0 && landingColumn < SIZE) {
          const to = landingRow * SIZE + landingColumn;
          if (board[to] === null) result.push({ from, to, captured: adjacent });
        }
      }
    }
  }
  return result;
}

function legalMoves(state) {
  if (state.winner !== null) return [];
  if (state.forced !== null) return destinations(state.board, state.forced, true);
  const moves = [];
  for (let from = 0; from < state.board.length; from++) {
    if (state.board[from]?.player === state.turn) moves.push(...destinations(state.board, from, false));
  }
  const captures = moves.filter(move => move.captured !== undefined);
  return captures.length ? captures : moves;
}

// The side to move is part of a repetition position; only completed turns count.
function positionKey(state) {
  return `${state.turn}:${state.board.map(piece => piece === null ? '.'
    : piece.player === 0 ? piece.king ? 'A' : 'a' : piece.king ? 'B' : 'b').join('')}`;
}

export function create(settings = {}) {
  const board = Array(64).fill(null);
  for (let row = 0; row < SIZE; row++) {
    if (row > 2 && row < 5) continue;
    for (let column = 0; column < SIZE; column++) {
      if ((row + column) % 2 === 1) board[row * SIZE + column] = { player: row < 3 ? 0 : 1, king: false };
    }
  }
  const state = { board, forced: null, moves: [], quiet: 0, repetitions: {}, turn: 0, winner: null };
  state.repetitions[positionKey(state)] = 1;
  return state;
}

export function apply(state, player, action, settings = {}) {
  if (player !== 0 && player !== 1) throw new Error('Invalid player.');
  if (state.winner !== null) throw new Error('This round is finished.');
  if (state.turn !== player) throw new Error('It is not your turn.');
  if (!action || action.type !== 'move' || !isCell(action.from) || !isCell(action.to)) {
    throw new Error('Choose valid from and to cells.');
  }
  const move = legalMoves(state).find(candidate => candidate.from === action.from && candidate.to === action.to);
  if (!move) throw new Error(state.forced !== null
    ? 'Continue capturing with the same piece.' : 'Illegal move; available captures are mandatory.');

  const next = structuredClone(state);
  const piece = next.board[move.from];
  next.board[move.from] = null;
  next.board[move.to] = piece;
  if (move.captured !== undefined) next.board[move.captured] = null;
  const promoted = !piece.king && Math.floor(move.to / SIZE) === (player === 0 ? 7 : 0);
  if (promoted) piece.king = true;
  next.moves.push({ ...move, player, promoted });
  // A capture chain is one half-move; never count its intermediate jumps.
  next.quiet = move.captured !== undefined || promoted ? 0 : (state.quiet ?? 0) + 1;
  next.forced = null;
  if (move.captured !== undefined && !promoted && destinations(next.board, move.to, true).length) {
    next.forced = move.to;
    return next;
  }

  next.turn = 1 - player;
  if (!legalMoves(next).length) {
    next.winner = player;
    return next;
  }
  const key = positionKey(next);
  next.repetitions ??= {};
  next.repetitions[key] = (next.repetitions[key] ?? 0) + 1;
  if (next.quiet >= 80 || next.repetitions[key] >= 3) next.winner = 'draw';
  return next;
}

export function view(state, player) {
  const result = structuredClone(state);
  delete result.repetitions;
  result.legal = legalMoves(state);
  return result;
}
