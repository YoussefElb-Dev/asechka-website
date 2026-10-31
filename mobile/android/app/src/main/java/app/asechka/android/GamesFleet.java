package app.asechka.android;

import java.util.*;

/** Local placement draft only. The server remains the authority for all game rules. */
final class GamesFleet {
  static final int[] LENGTHS = {5, 4, 3, 3, 2};
  final int[][] ships = new int[5][];
  int selected;
  boolean vertical;

  boolean place(int cell) {
    if (cell < 0 || cell >= 100) return false;
    int length = LENGTHS[selected];
    if ((vertical ? cell / 10 : cell % 10) + length > 10) return false;
    int[] candidate = new int[length];
    for (int i = 0; i < length; i++) {
      candidate[i] = cell + (vertical ? i * 10 : i);
      for (int j = 0; j < ships.length; j++) if (j != selected && ships[j] != null)
        for (int occupied : ships[j]) if (occupied == candidate[i]) return false;
    }
    ships[selected] = candidate;
    for (int i = 1; i <= 5; i++) if (ships[(selected + i) % 5] == null) { selected = (selected + i) % 5; break; }
    return true;
  }
  boolean complete() { for (int[] ship : ships) if (ship == null) return false; return true; }
  void reset() { Arrays.fill(ships, null); selected = 0; }
  void automatic() {
    reset();
    for (int i = 0; i < 5; i++) {
      ships[i] = new int[LENGTHS[i]];
      for (int j = 0; j < LENGTHS[i]; j++) ships[i][j] = i * 20 + j;
    }
  }
}
