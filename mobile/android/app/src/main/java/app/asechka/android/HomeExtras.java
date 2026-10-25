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
    root = u.column();
    root.setPadding(u.dp(20), 0, u.dp(20), u.dp(8));
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
    heart.setPadding(u.dp(18), u.dp(16), u.dp(18), u.dp(16));
    LinearLayout title = u.row();
    title.addView(u.title("A little love, anytime.", 19), new LinearLayout.LayoutParams(0, -2, 1));
    streak = u.text("", 12, Ui.PURPLE);
    streak.setPadding(u.dp(9), u.dp(9), u.dp(9), u.dp(9));
    streak.setBackground(u.shape(Color.WHITE, 18));
    streak.setContentDescription("Heart streak. Long press for our heart history.");
    streak.setOnLongClickListener(
        v -> {
          history();
          return true;
        });
    title.addView(streak);
    heart.addView(title);
    counts = u.text("", 12, Ui.MUTED);
    u.add(heart, counts, 8);
    Button send = u.button("♡  Send a heart to " + partner(), true, null);
    send.setTextSize(17);
    send.setContentDescription("Send a heart to " + partner());
    send.setOnClickListener(v -> send(v));
    u.add(heart, send, 12);
    LinearLayout clock = u.card(root, Ui.BLUE);
    clock.setPadding(u.dp(18), u.dp(16), u.dp(18), u.dp(16));
    clock.addView(u.label("OUR TIME TOGETHER  ↗"));
    elapsed = u.title("", 24);
    elapsed.setFontFeatureSettings("tnum");
    u.add(clock, elapsed, 7);
    sinceLabel = u.text("", 12, Ui.MUTED);
    u.add(clock, sinceLabel, 5);
    clock.setContentDescription("Our time together. Open Since us.");
    clock.setOnClickListener(v -> open.open(0));
    u.add(root, u.label("OUR LITTLE SHORTCUTS"), 20);
    String[] names = {
      "Secret vocab",
      "Open when…",
      "Tiny victories",
      "Recipes for two",
      "Little things",
      "Our beginning"
    };
    String[] notes = {
      "Our inside-joke dictionary",
      "A letter for every feeling",
      "Celebrate the small wins",
      "What shall we cook?",
      "Things we love about us",
      "Since that little yes"
    };
    String[] symbols = {"Aa", "✉", "✦", "♧", "♡", "∞"};
    int[] destinations = {3, 1, 4, 5, 2, 0};
    boolean stacked =
        activity.getResources().getConfiguration().screenWidthDp < 340
            || activity.getResources().getConfiguration().fontScale > 1.3f;
    LinearLayout row = null;
    for (int i = 0; i < names.length; i++) {
      if (stacked || i % 2 == 0) {
        row = u.row(10);
        u.add(root, row, 10);
      }
      final int destination = destinations[i];
      LinearLayout tile = u.column();
      tile.setPadding(u.dp(14), u.dp(13), u.dp(14), u.dp(13));
      tile.setMinimumHeight(u.dp(97));
      android.graphics.drawable.GradientDrawable shape = u.shape(Color.WHITE, 22);
      shape.setStroke(u.dp(1), 0xffe6e7f2);
      tile.setBackground(
          new android.graphics.drawable.RippleDrawable(
              android.content.res.ColorStateList.valueOf(0x196b5cb5), shape, null));
      LinearLayout heading = u.row(7);
      TextView icon = u.text(symbols[i], 19, Ui.PURPLE);
      heading.addView(icon);
      heading.addView(u.title(names[i], 14), new LinearLayout.LayoutParams(0, -2, 1));
      tile.addView(heading);
      u.add(tile, u.text(notes[i], 11, Ui.MUTED), 6);
      tile.setContentDescription(names[i]);
      tile.setOnClickListener(v -> open.open(destination));
      row.addView(tile, new LinearLayout.LayoutParams(0, -1, 1));
    }
    update();
    return root;
  }

  void send(View anchor) {
    try {
      api.store.tapHeart(from(), HeartCounts.day(System.currentTimeMillis()));
      update();
      Motion.haptic(anchor, true);
      if (Motion.enabled(activity)) {
        if (rain == null) rain = new HeartRain(activity);
        rain.emit(anchor);
      }
      main.removeCallbacks(flush);
      main.postDelayed(flush, 900);
    } catch (Exception e) {
      Toast.makeText(
              activity,
              "Your phone couldn’t save that heart. Please try again.",
              Toast.LENGTH_SHORT)
          .show();
    }
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
    JSONObject d = data();
    String today = HeartCounts.day(System.currentTimeMillis()),
        own = from(),
        other = own.equals("me") ? "asechka" : "me";
    counts.setText(
        "Today · you "
            + HeartCounts.count(d, today, own)
            + "  ♡  "
            + partner()
            + " "
            + HeartCounts.count(d, today, other));
    int days = HeartCounts.streak(d, own, today);
    streak.setText("✦ " + days + " day" + (days == 1 ? "" : "s"));
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
            : "Since " + BookViews.displayDate(start, true) + " · Eastern");
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
    sheet.note(
        "Together streak · "
            + HeartCounts.streak(d, "both", HeartCounts.day(System.currentTimeMillis()))
            + " days");
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
    main.removeCallbacksAndMessages(null);
    if (rain != null) rain.stop();
  }

  static final class HeartRain extends View {
    final ArrayList<float[]> particles = new ArrayList<>();
    final Random random = new Random();
    final Paint paint = new Paint(3);
    final Path heart = new Path();
    ValueAnimator animator;
    ViewGroup host;

    HeartRain(Activity a) {
      super(a);
      setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
      heart.moveTo(0, 8);
      heart.cubicTo(-22, -6, -18, -23, -7, -19);
      heart.cubicTo(-3, -18, 0, -14, 0, -12);
      heart.cubicTo(4, -23, 21, -22, 20, -10);
      heart.cubicTo(19, -2, 8, 5, 0, 13);
      heart.close();
    }

    void emit(View anchor) {
      View root = anchor.getRootView();
      if (!(root instanceof ViewGroup)) return;
      host = (ViewGroup) root;
      int[] a = new int[2], b = new int[2];
      anchor.getLocationOnScreen(a);
      host.getLocationOnScreen(b);
      if (getParent() == null && animator == null) {
        layout(0, 0, host.getWidth(), host.getHeight());
        host.getOverlay().add(this);
      }
      if (particles.size() >= 60) particles.remove(0);
      particles.add(
          new float[] {
            a[0] - b[0] + anchor.getWidth() * (.3f + random.nextFloat() * .4f),
            a[1] - b[1],
            SystemClock.uptimeMillis(),
            random.nextFloat() * 6.28f,
            random.nextFloat() * .4f + .65f,
            random.nextInt(3)
          });
      if (animator == null) {
        animator = ValueAnimator.ofFloat(0, 1);
        animator.setDuration(1800);
        animator.setRepeatCount(ValueAnimator.INFINITE);
        animator.addUpdateListener(
            v -> {
              long now = SystemClock.uptimeMillis();
              for (int i = particles.size() - 1; i >= 0; i--)
                if (now - particles.get(i)[2] > 1700) particles.remove(i);
              invalidate();
              if (particles.isEmpty()) stop();
            });
        animator.start();
      }
    }

    void stop() {
      if (animator != null) {
        animator.cancel();
        animator = null;
      }
      particles.clear();
      if (host != null) host.getOverlay().remove(this);
    }

    protected void onDraw(Canvas canvas) {
      float density = getResources().getDisplayMetrics().density;
      long now = SystemClock.uptimeMillis();
      for (float[] p : particles) {
        float t = (now - p[2]) / 1700f;
        int save = canvas.save();
        canvas.translate(
            p[0] + (float) Math.sin(t * 6 + p[3]) * 32 * density, p[1] - t * 320 * density);
        float size = density * p[4] * (.35f + Math.min(1, t * 8) * .65f);
        canvas.scale(size, size);
        canvas.rotate((float) Math.sin(t * 5 + p[3]) * 18);
        paint.setColor(p[5] == 0 ? 0xffa18bd3 : p[5] == 1 ? 0xff889fce : 0xffd393bd);
        paint.setAlpha((int) (255 * (1 - t)));
        canvas.drawPath(heart, paint);
        canvas.restoreToCount(save);
      }
    }
  }
}
