package app.asechka.android;

import org.json.*;

/** Reconstructs a checkers round from the server's validated move history. */
final class GamesReplay {
  static JSONArray board(JSONArray moves, int step) {
    JSONArray board = new JSONArray();
    for (int cell=0; cell<64; cell++) {
      int row=cell/8;
      board.put((row+cell%8)%2==1 && (row<3 || row>4)
          ? GamesData.obj("player",row<3?0:1,"king",false) : JSONObject.NULL);
    }
    for (int i=0; i<Math.min(moves.length(),Math.max(0,step)); i++) {
      JSONObject move=moves.optJSONObject(i); if(move==null)break;
      int from=move.optInt("from",-1),to=move.optInt("to",-1);
      if(from<0||from>=64||to<0||to>=64)break;
      JSONObject piece=board.optJSONObject(from);
      if(piece==null)break;
      try {
        board.put(from,JSONObject.NULL);
        if(move.optBoolean("promoted"))piece.put("king",true);
        board.put(to,piece);
        int captured=move.optInt("captured",-1);
        if(captured>=0&&captured<64)board.put(captured,JSONObject.NULL);
      } catch(JSONException invalid) { break; }
    }
    return board;
  }
  static String notation(JSONObject move) {
    int from=move.optInt("from"),to=move.optInt("to");
    return (from/8*4+from%8/2+1)+(move.has("captured")?"×":"–")+(to/8*4+to%8/2+1)+(move.optBoolean("promoted")?" ♛":"");
  }
}
