package app.asechka.android;

import android.animation.*;
import android.app.*;
import android.graphics.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.util.*;
import org.json.*;

/** Home destinations and a single bounded particle surface, with durable heart batches. */
final class HomeExtras {
  interface Open {
    void open(int destination);
  }

  final Activity activity;
  final ApiClient api;
  final Ui u;
  final Open open;
  final Handler main = new Handler(Looper.getMainLooper());
  TextView counts, streak, elapsed, sinceLabel;
  LinearLayout root;
  HeartRain rain;
  JSONObject bundledKeepsakes;
  final Runnable flush;
  final java.util.concurrent.ExecutorService heartWriter =
      java.util.concurrent.Executors.newSingleThreadExecutor();
  int pendingWrites, shownStreak;
  long shownOwn, shownOther;
  String shownDay;
  boolean closed, shownTodayComplete;
  int shownLives;
  final Runnable settle =
      () -> {
        if (!closed && pendingWrites == 0) update();
      };

  HomeExtras(Activity a, ApiClient api, Open open, Runnable flush) {
    activity = a;
    this.api = api;
    u = new Ui(a);
    this.open = open;
    this.flush = flush;
  }

  String from() {
    return activity
            .getSharedPreferences("preferences", 0)
            .getString("person", "asnat")
            .equals("asnat")
        ? "asechka"
        : "me";
  }

  String partner() {
    return from().equals("me") ? "Asnat" : "Youssef";
  }

  final Runnable tick =
      new Runnable() {
        public void run() {
          if (root != null && root.isAttachedToWindow()) {
            update();
            main.postDelayed(this, 1000);
          }
        }
      };

  LinearLayout view() {
    rain = ((MainActivity) activity).hearts();
    root = u.column();
    root.setPadding(u.dp(16), 0, u.dp(16), 0);
    root.addOnAttachStateChangeListener(
        new View.OnAttachStateChangeListener() {
          public void onViewAttachedToWindow(View v) {
            main.removeCallbacks(tick);
            tick.run();
          }

          public void onViewDetachedFromWindow(View v) {
            main.removeCallbacks(tick);
          }
        });
    LinearLayout heart = u.card(root, Ui.PALE);
    ((LinearLayout.LayoutParams) heart.getLayoutParams()).topMargin = 0;
    heart.setPadding(u.dp(12), u.dp(8), u.dp(12), u.dp(8));
    LinearLayout title = u.row();
    LinearLayout summary = u.column();
    summary.setMinimumHeight(u.dp(48));
    summary.setGravity(Gravity.CENTER_VERTICAL);
    counts = u.text("", 12, Ui.MUTED);
    summary.addView(counts);
    streak = u.text("", 12, Ui.PURPLE);
    summary.addView(streak);
    streak.setContentDescription("Heart streak. Long press for our heart history.");
    summary.setOnLongClickListener(
        v -> {
          history();
          return true;
        });
    title.addView(summary, new LinearLayout.LayoutParams(0, -2, 1));
    Button send = u.button("Send a heart", false, null);
    send.setTextSize(14);
    send.setTextColor(Ui.INK);
    send.setSingleLine(true);
    send.setIncludeFontPadding(false);
    send.setMinWidth(0);
    send.setMinimumWidth(0);
    send.setPadding(u.dp(14), 0, u.dp(14), 0);
    android.graphics.drawable.Drawable heartIcon = activity.getDrawable(R.drawable.ic_send_heart);
    heartIcon.setBounds(0, 0, u.dp(18), u.dp(18));
    send.setCompoundDrawablesRelative(heartIcon, null, null, null);
    send.setCompoundDrawablePadding(u.dp(8));
    android.graphics.drawable.GradientDrawable sendSurface = u.shape(Color.WHITE, 24);
    sendSurface.setStroke(u.dp(1), 0xffdfdaef);
    send.setBackground(
        new android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(0x196b5cb5), sendSurface, null));
    send.setContentDescription("Send a heart to " + partner());
    send.setOnClickListener(v -> send(v));
    title.addView(send, new LinearLayout.LayoutParams(-2, -2));
    heart.addView(title);
    LinearLayout clock = u.card(root, Ui.BLUE);
    ((LinearLayout.LayoutParams) clock.getLayoutParams()).topMargin = u.dp(7);
    clock.setPadding(u.dp(12), u.dp(6), u.dp(12), u.dp(6));
    clock.setMinimumHeight(u.dp(48));
    android.graphics.drawable.GradientDrawable clockSurface =
        new android.graphics.drawable.GradientDrawable(
            android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
            new int[] {Ui.BLUE, 0xfff0edfb});
    clockSurface.setCornerRadius(u.dp(20));
    clock.setBackground(clockSurface);
    LinearLayout timeRow = u.row(10);
    timeRow.addView(
        new HomeGlyph(activity, 5, Ui.PURPLE, Color.WHITE),
        new LinearLayout.LayoutParams(u.dp(32), u.dp(32)));
    LinearLayout timeCopy = u.column();
    elapsed = u.title("", 18);
    elapsed.setFontFeatureSettings("tnum");
    elapsed.setIncludeFontPadding(false);
    timeCopy.addView(elapsed);
    sinceLabel = u.text("", 10, Ui.MUTED);
    sinceLabel.setTextSize(9.5f);
    sinceLabel.setIncludeFontPadding(false);
    sinceLabel.setSingleLine(true);
    sinceLabel.setEllipsize(android.text.TextUtils.TruncateAt.END);
    u.add(timeCopy, sinceLabel, 2);
    timeRow.addView(timeCopy, new LinearLayout.LayoutParams(0, -2, 1));
    clock.addView(timeRow);
    clock.setContentDescription("Our time together. Open Since us.");
    clock.setOnClickListener(v -> open.open(0));
    String[] names = {
      "Secret vocab",
      "Open when…",
      "Tiny victories",
      "Recipes for two",
      "Little things",
      "Our beginning"
    };
    int[] accents = {Ui.PURPLE, 0xff9373ab, 0xff748bc1, 0xff8b80b1, 0xffaa759d, 0xff6f92b7};
    int[] tints = {Ui.PALE, 0xfff3ebf7, Ui.BLUE, 0xffeeecf7, 0xfff7ecf3, 0xffeaf1f8};
    int[] destinations = {3, 1, 4, 5, 2, 0};
    int columns = activity.getResources().getConfiguration().fontScale > 1.3f ? 2 : 3;
    LinearLayout row = null;
    for (int i = 0; i < names.length; i++) {
      if (i % columns == 0) {
        row = u.row(7);
        u.add(root, row, 7);
      }
      final int destination = destinations[i];
      LinearLayout tile = u.column();
      tile.setPadding(u.dp(6), u.dp(8), u.dp(6), u.dp(8));
      tile.setMinimumHeight(u.dp(56));
      tile.setGravity(Gravity.CENTER);
      android.graphics.drawable.GradientDrawable shape = u.shape(Color.WHITE, 18);
      shape.setStroke(u.dp(1), 0xffe6e2f1);
      tile.setBackground(
          new android.graphics.drawable.RippleDrawable(
              android.content.res.ColorStateList.valueOf(0x196b5cb5), shape, null));
      LinearLayout heading = u.row(5);
      heading.addView(
          new HomeGlyph(activity, i, accents[i], tints[i]),
          new LinearLayout.LayoutParams(u.dp(26), u.dp(30)));
      TextView label = u.text(names[i].replaceFirst(" ", "\n"), 13, Ui.INK);
      label.setTextSize(Build.VERSION.SDK_INT < 26 ? 12f : 12.5f);
      label.setBreakStrategy(android.text.Layout.BREAK_STRATEGY_SIMPLE);
      label.setHyphenationFrequency(android.text.Layout.HYPHENATION_FREQUENCY_NONE);
      Compat.font(label, R.font.dm_sans, 650);
      label.setGravity(Gravity.CENTER_VERTICAL);
      label.setIncludeFontPadding(false);
      label.setLineSpacing(0, 1.04f);
      label.setMaxLines(2);
      heading.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
      tile.addView(heading);
      tile.setContentDescription(names[i]);
      tile.setOnClickListener(v -> open.open(destination));
      row.addView(tile, new LinearLayout.LayoutParams(0, -1, 1));
    }
    update();
    return root;
  }

  void send(View anchor) {
    if (closed) return;
    main.removeCallbacks(settle);
    String who = from(), day = HeartCounts.day(System.currentTimeMillis());
    if (counts != null) {
      if (!day.equals(shownDay)) update();
      shownOwn++;
      if (!shownTodayComplete) {
        shownStreak = shownStreak > 0 ? shownStreak + 1 : 1;
        shownTodayComplete = true;
      }
      renderCounts();
    }
    Motion.haptic(anchor, false);
    if (Motion.enabled(activity)) {
      if (rain == null) rain = ((MainActivity) activity).hearts();
      rain.emit(anchor);
    }
    pendingWrites++;
    heartWriter.execute(
        () -> {
          Exception failure = null;
          try {
            api.store.tapHeart(who, day);
          } catch (Exception e) {
            failure = e;
          }
          final Exception error = failure;
          main.post(
              () -> {
                pendingWrites--;
                if (activity.isDestroyed()) return;
                if (error != null) {
                  shownOwn = Math.max(0, shownOwn - 1);
                  renderCounts();
                  Toast.makeText(
                          activity,
                          "Your phone couldn’t save that heart. Please try again.",
                          Toast.LENGTH_SHORT)
                      .show();
                }
                if (pendingWrites == 0) {
                  if (!closed) main.postDelayed(settle, 120);
                  main.removeCallbacks(flush);
                  main.postDelayed(flush, closed ? 0 : 900);
                }
              });
        });
  }

  void awaitHeartWrites() throws Exception {
    heartWriter.submit(() -> {}).get(20, java.util.concurrent.TimeUnit.SECONDS);
  }

  void renderCounts() {
    if (counts == null) return;
    counts.setText("You " + shownOwn + "  ♡  " + partner() + " " + shownOther);
    streak.setText(
        "✦ " + shownStreak + " days · " + shownLives + (shownLives == 1 ? " life" : " lives"));
    streak.setContentDescription(
        "Our shared streak, "
            + shownStreak
            + " days. "
            + shownLives
            + " lives available. Long press for history.");
  }

  JSONObject data() {
    try {
      JSONObject d = api.cached("/api/together", !api.connected());
      return d == null ? new JSONObject() : d;
    } catch (Exception e) {
      return new JSONObject();
    }
  }

  void update() {
    if (counts == null) return;
    if (pendingWrites == 0) {
      JSONObject d = data();
      String today = SharedHeartStreak.today(d, api.connected()),
          own = from(),
          other = own.equals("me") ? "asechka" : "me";
      shownDay = today;
      shownOwn = HeartCounts.count(d, today, own);
      shownOther = HeartCounts.count(d, today, other);
      SharedHeartStreak shared = SharedHeartStreak.calculate(d, today);
      shownStreak = shared.days;
      shownLives = shared.lives;
      shownTodayComplete = shared.todayComplete;
      renderCounts();
    }
    JSONObject keepsakes = null;
    try {
      keepsakes = api.cached("/api/keepsakes", !api.connected());
    } catch (Exception ignored) {
    }
    if (keepsakes == null && bundledKeepsakes == null)
      try {
        java.io.InputStream in = activity.getAssets().open("default/keepsakes.json");
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] b = new byte[4096];
        int n;
        while ((n = in.read(b)) != -1) out.write(b, 0, n);
        in.close();
        bundledKeepsakes = new JSONObject(out.toString("UTF-8"));
      } catch (Exception ignored) {
      }
    if (keepsakes == null) keepsakes = bundledKeepsakes;
    JSONObject since = keepsakes == null ? null : keepsakes.optJSONObject("since");
    long start = since == null ? 0 : Dates.instant(since.optString("startedAt"));
    long seconds = start <= 0 ? 0 : Math.max(0, (System.currentTimeMillis() - start) / 1000);
    elapsed.setText(
        String.format(
            Locale.US,
            "%d days · %02d:%02d:%02d",
            seconds / 86400,
            seconds / 3600 % 24,
            seconds / 60 % 60,
            seconds % 60));
    sinceLabel.setText(
        start <= 0
            ? "Set our beginning in Since us"
            : "Together since " + shortBeginning(start) + " ET");
  }

  private String shortBeginning(long start) {
    java.text.SimpleDateFormat format =
        new java.text.SimpleDateFormat("MMM d, yyyy · h:mm a", Locale.US);
    format.setTimeZone(TimeZone.getTimeZone("America/New_York"));
    return format.format(new Date(start));
  }

  Ui.Sheet history() {
    JSONObject d = data(), days = d.optJSONObject("heartDays");
    ArrayList<String> keys = new ArrayList<>();
    if (days != null) {
      Iterator<String> it = days.keys();
      while (it.hasNext()) keys.add(it.next());
    }
    Collections.sort(keys, Collections.reverseOrder());
    Ui.Sheet sheet =
        u.sheet("Our little heart history", "Every heart counts. Days follow Eastern time.");
    long me = 0, her = 0;
    for (String day : keys) {
      me += HeartCounts.count(d, day, "me");
      her += HeartCounts.count(d, day, "asechka");
    }
    sheet.note("All time · Youssef " + me + " ♡  ·  Asnat " + her + " ♡");
    SharedHeartStreak shared =
        SharedHeartStreak.calculate(d, SharedHeartStreak.today(d, api.connected()));
    sheet.note(
        "Our shared streak · "
            + shared.days
            + " days · "
            + shared.lives
            + (shared.lives == 1 ? " life" : " lives"));
    sheet.note(
        "One heart from either of us keeps our day. A missed day uses a life; without one, we start"
            + " again. Unused lives stack.");
    sheet.note("Next life · " + shared.nextLifeOn + " · one more every month on the 12th");
    for (String day : shared.protectedDays) sheet.note(day + " · protected with a life ♡");
    if (keys.isEmpty()) sheet.note("Your first heart starts our story here.");
    for (String day : keys)
      sheet.note(
          day
              + "\nYoussef  "
              + HeartCounts.count(d, day, "me")
              + " ♡    Asnat  "
              + HeartCounts.count(d, day, "asechka")
              + " ♡");
    sheet.show();
    return sheet;
  }

  void close() {
    if (closed) return;
    closed = true;
    main.removeCallbacksAndMessages(null);
    heartWriter.execute(
        () ->
            main.post(
                () -> {
                  if (!activity.isDestroyed()) flush.run();
                }));
    heartWriter.shutdown();
  }

  static final class HeartRain extends HeartOverlay {
    HeartRain(Activity activity) {
      super(activity);
    }
  }
}
