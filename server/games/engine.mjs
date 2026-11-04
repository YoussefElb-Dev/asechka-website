import * as pool from './rules/pool.mjs';
import * as tictactoe from './rules/tictactoe.mjs';
import * as hangman from './rules/hangman.mjs';
import * as connect4 from './rules/connect4.mjs';
import * as checkers from './rules/checkers.mjs';
import * as battleship from './rules/battleship.mjs';
import * as drawing from './rules/drawing.mjs';
const modules={pool,tictactoe,hangman,connect4,checkers,battleship,drawing};
export const games=Object.freeze(Object.keys(modules));
function rule(game){if(!Object.hasOwn(modules,game))throw new Error('Unknown game.');return modules[game];}
export const createGame=(game,settings={})=>rule(game).create(settings);
export const applyAction=(game,state,player,action,settings={})=>rule(game).apply(structuredClone(state),player,action,settings);
export const publicState=(game,state,player)=>rule(game).view(structuredClone(state),player);
export const expireGame=(game,state,now)=>typeof rule(game).expire==='function'?rule(game).expire(structuredClone(state),now):state;
