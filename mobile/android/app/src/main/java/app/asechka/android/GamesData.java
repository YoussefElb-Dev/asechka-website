package app.asechka.android;

import org.json.*;

final class GamesData {
  static final String[] IDS = {"pool", "tictactoe", "hangman", "connect4", "checkers", "battleship", "drawing"};
  static final String[] TITLES = {"Velvet Eight", "Three Little Marks", "Between the Letters", "Four in Orbit", "Crown & Capture", "Midnight Fleet", "Scribble Together"};
  static final String[] TAGS = {"8-BALL POOL", "TIC TAC TOE", "HANGMAN", "CONNECT FOUR", "CHECKERS", "BATTLESHIP", "DRAW & GUESS"};
  static final String[] NOTES = {"A little angle. A perfect evening.", "Your move, my favorite rival.", "A secret only you can guess.", "Find your constellation of four.", "Make a move worth crowning.", "Two oceans. One worthy opponent.", "A little doodle. A very good guess."};
  static final int[] COLORS = {0xff2e746a, 0xff6b5cb5, 0xff9f4b6f, 0xff6b5cb5, 0xff9f4b6f, 0xff2e746a,0xff6b5cb5};
  static JSONObject obj(Object... pairs) {
    JSONObject value = new JSONObject();
    try { for (int i = 0; i < pairs.length; i += 2) value.put((String) pairs[i], pairs[i + 1]); }
    catch (JSONException error) { throw new IllegalArgumentException(error); }
    return value;
  }
  static JSONArray array(JSONObject object, String key) {
    JSONArray result = object == null ? null : object.optJSONArray(key);
    return result == null ? new JSONArray() : result;
  }
  static JSONObject state(JSONObject room) {
    JSONObject state = room == null ? null : room.optJSONObject("state");
    return state == null ? new JSONObject() : state;
  }
  static int index(String id) { for (int i = 0; i < IDS.length; i++) if (IDS[i].equals(id)) return i; return 0; }
  static String name(String actor) { return "asnat".equals(actor) ? "Asnat" : "youssef".equals(actor) ? "Youssef" : "Your partner"; }
  static int player(JSONObject room, String actor) {
    JSONArray players = array(room, "players");
    for (int i = 0; i < players.length(); i++)
      if (players.optJSONObject(i) != null && actor.equals(players.optJSONObject(i).optString("actor"))) return i;
    return -1;
  }
  static boolean finished(JSONObject state) { return state.has("winner") && !state.isNull("winner"); }
  static String result(JSONObject room, String actor) {
    Object result = room.opt("result");
    if (result == null || result == JSONObject.NULL) result = state(room).opt("winner");
    if ("draw".equals(result)) return "A lovely draw";
    if (result instanceof Number) return ((Number) result).intValue() == player(room, actor) ? "You won. Beautifully played." : "Your partner takes this one.";
    return "Round complete";
  }
  static final String[] RULES = {
    "Drag from the cue ball to aim, or use the aim slider. Set power and a called pocket, then Shoot. Only the eight needs a called pocket. Clear your group before the eight. A break keeps groups open; after the break, the first legally potted numbered ball determines groups. A legal break pots a ball or sends four object balls to cushions. The eight on a break is respotted. Scratching, wrong first contact, or no pocket or cushion after contact is a foul and gives ball in hand. Tap a clear cue-ball position or use the coordinates. This is planar house-rules eight-ball: cue-ball follow/draw and side spin; no jumps, kitchen or rerack options. The server calculates each shot; sampled positions replay locally.",
    "Take turns placing a mark in an empty square. Make three across, down or diagonally. A full board without a line is a draw. Choose a single round or a best-of-three/five when creating your room.",
    "The setter chooses a category for a server-picked word, or enters an English word and category. Their partner guesses one letter at a time. One free hint reveals a letter. The secret is hidden from the guesser until the round ends. Rematches swap the setter. An optional timer is selected before creating the room.",
    "Drop a disc into any column that has space. It falls to the lowest empty position. Connect four horizontally, vertically or diagonally. The server highlights the winning four. A full board is a draw.",
    "American checkers: select a highlighted piece, then its destination. Captures are mandatory; men move and capture forward, kings in both directions. Continue a forced capture with the same piece. Promotion ends the turn. Eighty quiet half-moves or a repeated position three times produces a draw.",
    "Place your five ships (5, 4, 3, 3 and 2 cells) on a 10 by 10 ocean. Select a ship, rotate, then tap its starting square. Ships cannot overlap or leave the board. Confirm your fleet; both players must submit before battle. Fire once per turn on the target ocean. The lower ocean shows your fleet and incoming shots. Sink every opposing ship to win.",
    "Take turns choosing a secret word and drawing it. Your partner types guesses before time runs out. Faster correct guesses earn more points; the artist earns points too. Letter hints appear as the clock runs. Use the pen, eraser, bucket fill, brush sizes, undo and clear. After both of you draw, a new round begins. Most points wins. Words and choices stay hidden from the guesser. Custom words and rounds can be chosen before starting."
  };
}
