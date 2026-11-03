package app.asechka.android;

import java.util.*;

/** Local placement draft only. The server remains the authority for all game rules. */
final class GamesFleet {
  static final int[] LENGTHS = {5, 4, 3, 3, 2};
  final int[][] ships = new int[5][];
  int selected;
  boolean vertical;
  String message = "";

  void select(int index) {
    selected=index;
    if(ships[index]!=null)vertical=ships[index][1]-ships[index][0]==10;
    message="";
  }
  boolean rotate() {
    boolean next=!vertical;
    if(ships[selected]!=null){
      int start=ships[selected][0];
      if(!problem(start,next).isEmpty()){message="Cannot rotate here: "+problem(start,next)+" Move the ship first.";return false;}
      vertical=next;ships[selected]=candidate(start);
    }else vertical=next;
    message="";return true;
  }

  boolean place(int cell) {
    int[] candidate = candidate(cell);
    if (candidate == null) { message=problem(cell,vertical)+" Your ship stayed in its last position.";return false; }
    boolean fresh=ships[selected]==null;
    ships[selected] = candidate;
    message="";
    if(fresh)for (int i = 1; i <= 5; i++) if (ships[(selected + i) % 5] == null) { select((selected + i) % 5); break; }
    return true;
  }
  int[] candidate(int cell) {
    if(!problem(cell,vertical).isEmpty())return null;
    int length = LENGTHS[selected];
    int[] candidate = new int[length];
    for (int i = 0; i < length; i++) candidate[i] = cell + (vertical ? i * 10 : i);
    return candidate;
  }
  String problem(int cell,boolean orientation) {
    int length=LENGTHS[selected];
    if(cell<0||cell>=100||(orientation?cell/10:cell%10)+length>10)return "Keep the whole ship inside the ocean.";
    for(int i=0;i<length;i++){
      int proposed=cell+(orientation?i*10:i);
      for (int j = 0; j < ships.length; j++) if (j != selected && ships[j] != null)
        for (int occupied : ships[j]) if (occupied == proposed) return "That position overlaps another ship.";
    }
    return "";
  }
  boolean complete() { for (int[] ship : ships) if (ship == null) return false; return true; }
  void reset() { Arrays.fill(ships, null); selected = 0; vertical=false; message=""; }
  void automatic() {
    reset();
    for (int i = 0; i < 5; i++) {
      ships[i] = new int[LENGTHS[i]];
      for (int j = 0; j < LENGTHS[i]; j++) ships[i][j] = i * 20 + j;
    }
  }
}
