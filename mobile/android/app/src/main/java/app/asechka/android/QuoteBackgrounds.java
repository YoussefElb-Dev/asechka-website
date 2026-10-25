package app.asechka.android;

/** Stable variety across platforms, with no matching neighboring quote backgrounds. */
final class QuoteBackgrounds {
  static final int COUNT = 10;

  static int next(String key, int previous) {
    int hash = 0;
    for (int i = 0; i < key.length(); i++) hash = (hash * 31 + key.charAt(i)) & 0x7fffffff;
    int choice = hash % COUNT;
    return choice == previous ? (choice + 1 + (hash / COUNT) % (COUNT - 1)) % COUNT : choice;
  }

  static String source(int index) {
    return String.format(java.util.Locale.US, "assets/quote-backgrounds/orbit-%02d.jpg", index + 1);
  }
}
