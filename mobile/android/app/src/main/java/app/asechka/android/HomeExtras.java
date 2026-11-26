package app.asechka.android;

import android.animation.*;
import android.app.*;
import android.graphics.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.util.*;
import org.json.*;

/** Home hub: hearts + vibes + milestones, camera/vault, 4 shortcuts, location, daily prompt, Love Jar, song of the moment, and On This Day. */
final class HomeExtras {
  interface Open {
    void open(int destination);
  }

  static final String[][] VIBES = {
    {"miss-you", "🥺", "Miss you"},
    {"goodnight", "🌙", "Goodnight"},
    {"thinking", "💭", "Thinking"},
    {"proud", "✨", "Proud"},
    {"kiss", "💋", "Kiss"}
  };

  static String[] vibeMeta(String id) {
    if (id != null) {
      for (String[] v : VIBES) if (v[0].equals(id)) return new String[] {v[1], v[2]};
    }
    return new String[] {"♡", "Thinking of you"};
  }

  final Activity activity;
  final ApiClient api;
  final Ui u;
  final Open open;
  final Handler main = new Handler(Looper.getMainLooper());
  TextView counts, streak, milestoneText, partnerVibeText, elapsed, sinceLabel, cameraSub;
  LinearLayout promptSlot, loveJarSlot, momentSlot, throwbackSlot;
  LiveLocationCard locationCard;
  LinearLayout root;
  HeartRain rain;
  JSONObject bundledKeepsakes;
  final Runnable flush;
  final java.util.concurrent.ExecutorService heartWriter =
      java.util.concurrent.Executors.newSingleThreadExecutor();
  int pendingWrites, shownStreak;
  private long tapSerial;
  private boolean updating;
  private String lastPromptSignature = "", lastJarSignature = "", lastMomentSignature = "", lastThrowbackSignature = "";
  private boolean promptSubmitting;
  private final java.util.concurrent.ConcurrentLinkedQueue<String[]> taps =
      new java.util.concurrent.ConcurrentLinkedQueue<>();
  private final java.util.concurrent.atomic.AtomicBoolean writing =
      new java.util.concurrent.atomic.AtomicBoolean();
  long shownOwn, shownOther, shownTotalAllTime;
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

  String partnerKey() {
    return from().equals("me") ? "asechka" : "me";
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
    // 1. Heart Card + Vibes + Partner Vibe + Milestone
    LinearLayout heart = u.card(root, Ui.PALE);
    ((LinearLayout.LayoutParams) heart.getLayoutParams()).topMargin = 0;
    heart.setBackground(u.shape(Ui.PALE, 22));
    heart.setPadding(u.dp(12), u.dp(8), u.dp(12), u.dp(10));
    LinearLayout title = u.row(12), summary = u.column();
    summary.setMinimumHeight(u.dp(48));
    summary.setGravity(Gravity.CENTER_VERTICAL);
    counts = u.text("", 12, Ui.MUTED);
    summary.addView(counts);
    streak = u.text("", 12, Ui.PURPLE);
    Compat.font(streak, R.font.dm_sans, 600);
    u.add(summary, streak, 3);
    milestoneText = u.text("", 10, Ui.MUTED);
    milestoneText.setVisibility(View.GONE);
    u.add(summary, milestoneText, 2);
    summary.setContentDescription("Our heart history");
    summary.setOnClickListener(v -> history());
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
    send.setPadding(u.dp(14), 0, u.dp(14), 0);
    android.graphics.drawable.Drawable heartIcon = activity.getDrawable(R.drawable.ic_send_heart);
    heartIcon.setBounds(0, 0, u.dp(18), u.dp(18));
    send.setCompoundDrawablesRelative(heartIcon, null, null, null);
    send.setCompoundDrawablePadding(u.dp(8));
    android.graphics.drawable.GradientDrawable sendSurface = u.shape(Color.WHITE, 100);
    sendSurface.setStroke(u.dp(1), 0xffdfdaef);
    send.setBackground(
        new android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(0x196b5cb5), sendSurface, null));
    send.setContentDescription("Send a heart to " + partner());
    send.setOnClickListener(v -> send(v, ""));
    title.addView(send, new LinearLayout.LayoutParams(-2, u.dp(48)));
    heart.addView(title);

    partnerVibeText = u.text("", 11, Ui.PURPLE);
    Compat.font(partnerVibeText, R.font.dm_sans, 600);
    partnerVibeText.setVisibility(View.GONE);
    u.add(heart, partnerVibeText, 6);

    HorizontalScrollView vibeScroll = new HorizontalScrollView(activity);
    vibeScroll.setHorizontalScrollBarEnabled(false);
    LinearLayout vibeRow = u.row(6);
    for (String[] vibe : VIBES) {
      final String vibeId = vibe[0], vibeSymbol = vibe[1], vibeLabel = vibe[2];
      TextView chip = u.text(vibeSymbol + " " + vibeLabel, 11, Ui.PURPLE);
      Compat.font(chip, R.font.dm_sans, 600);
      chip.setPadding(u.dp(10), u.dp(5), u.dp(10), u.dp(5));
      android.graphics.drawable.GradientDrawable bg = u.shape(Color.WHITE, 100);
      bg.setStroke(u.dp(1), 0x226b5cb5);
      chip.setBackground(bg);
      chip.setContentDescription("Send heart vibe: " + vibeLabel);
      chip.setOnClickListener(
          v -> {
            send(v, vibeId);
            Toast.makeText(activity, vibeSymbol + " Sent “" + vibeLabel + "” to " + partner(), Toast.LENGTH_SHORT)
                .show();
          });
      vibeRow.addView(chip);
    }
    vibeScroll.addView(vibeRow);
    u.add(heart, vibeScroll, 8);

    // 2. Clock Card
    LinearLayout clock = u.card(root, Ui.BLUE);
    ((LinearLayout.LayoutParams) clock.getLayoutParams()).topMargin = u.dp(6);
    clock.setPadding(u.dp(12), u.dp(10), u.dp(12), u.dp(10));
    LinearLayout timeRow = u.row(8);
    TextView together = u.text("Together ♡", 12, Ui.PURPLE);
    timeRow.addView(together);
    elapsed = u.title("", 18);
    elapsed.setFontFeatureSettings("tnum");
    elapsed.setSingleLine(true);
    elapsed.setEllipsize(android.text.TextUtils.TruncateAt.END);
    timeRow.addView(elapsed, new LinearLayout.LayoutParams(0, -2, 1));
    clock.addView(timeRow);
    sinceLabel = u.text("", 10, Ui.MUTED);
    sinceLabel.setSingleLine(true);
    sinceLabel.setEllipsize(android.text.TextUtils.TruncateAt.END);
    u.add(clock, sinceLabel, 4);
    clock.setContentDescription("Our time together. Open Since us.");
    clock.setOnClickListener(v -> open.open(0));

    // 3. Disposable Camera (8 weekly shots) + Time Vault
    LinearLayout special = u.row(7);
    LinearLayout camera = u.row(8);
    camera.setGravity(Gravity.CENTER_VERTICAL);
    camera.setPadding(u.dp(10), u.dp(10), u.dp(10), u.dp(10));
    camera.setBackground(u.shape(Ui.PALE, 16));
    camera.setMinimumHeight(u.dp(64));
    camera.addView(Glyph.view(activity, "camera", Ui.PURPLE), new LinearLayout.LayoutParams(u.dp(23), u.dp(23)));
    LinearLayout cameraCopy = u.column();
    TextView cameraName = u.text("Our disposable camera", 14, Ui.PURPLE);
    Compat.font(cameraName, R.font.dm_sans, 600);
    cameraCopy.addView(cameraName);
    cameraSub = u.text("8 weekly shots · Sun 8 PM", 10, Ui.PURPLE);
    u.add(cameraCopy, cameraSub, 3);
    camera.addView(cameraCopy, new LinearLayout.LayoutParams(0, -2, 1));
    camera.addView(Glyph.view(activity, "arrow.up.right", Ui.PURPLE), new LinearLayout.LayoutParams(u.dp(16), u.dp(16)));
    camera.setContentDescription("Our disposable camera");
    camera.setOnClickListener(
        v -> activity.startActivity(new android.content.Intent(activity, DisposableCameraActivity.class)));
    special.addView(camera, new LinearLayout.LayoutParams(0, -2, 1));

    LinearLayout vault = u.row(8);
    vault.setGravity(Gravity.CENTER);
    vault.setBackground(u.shape(Ui.BLUE, 16));
    vault.addView(Glyph.view(activity, "vault", Ui.INK), new LinearLayout.LayoutParams(u.dp(18), u.dp(18)));
    TextView vaultName = u.text("Time vault", 13, Ui.INK);
    Compat.font(vaultName, R.font.dm_sans, 600);
    vault.addView(vaultName);
    vault.setContentDescription("Time vault");
    vault.setOnClickListener(
        v -> activity.startActivity(new android.content.Intent(activity, TimeVaultActivity.class)));
    special.addView(vault, new LinearLayout.LayoutParams(0, u.dp(48), 1));
    u.add(root, special, 6);

    // 4. Streamlined 4 shortcuts (2x2 grid)
    String[] names = {"Secret vocab", "Open when…", "Little things", "Our beginning"};
    String[] symbols = {"book", "envelope", "heart", "infinity"};
    int[] destinations = {3, 1, 2, 0};
    int columns = 2;
    LinearLayout row = null;
    for (int i = 0; i < names.length; i++) {
      if (i % columns == 0) {
        row = u.row(7);
        u.add(root, row, 7);
      }
      final int destination = destinations[i];
      LinearLayout tile = u.row(7);
      tile.setGravity(Gravity.CENTER);
      tile.setMinimumHeight(u.dp(44));
      tile.setPadding(u.dp(8), 0, u.dp(8), 0);
      android.graphics.drawable.GradientDrawable surface = u.shape(Color.WHITE, 16);
      surface.setStroke(u.dp(1), 0x176b5cb5);
      tile.setBackground(
          new android.graphics.drawable.RippleDrawable(
              android.content.res.ColorStateList.valueOf(0x196b5cb5), surface, null));
      tile.addView(Glyph.view(activity, symbols[i], Ui.PURPLE), new LinearLayout.LayoutParams(u.dp(16), u.dp(18)));
      TextView label = u.text(names[i], 12, Ui.PURPLE);
      Compat.font(label, R.font.dm_sans, 500);
      label.setGravity(Gravity.CENTER);
      label.setMaxLines(2);
      label.setBreakStrategy(android.text.Layout.BREAK_STRATEGY_SIMPLE);
      label.setHyphenationFrequency(android.text.Layout.HYPHENATION_FREQUENCY_NONE);
      tile.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
      tile.setContentDescription(names[i]);
      tile.setOnClickListener(v -> open.open(destination));
      row.addView(tile, new LinearLayout.LayoutParams(0, u.dp(44), 1));
    }

    // 5. Live Location Card (kept right below shortcuts so both remain visible above fold)
    locationCard = ((MainActivity) activity).locationCard();
    u.add(root, locationCard.view(), 6);

    // 6. Dynamic 2.8.0 Cards: Daily Prompt, Love Jar Pinned Notes, Song of the Moment, On This Day
    promptSlot = u.column();
    u.add(root, promptSlot, 8);
    loveJarSlot = u.column();
    u.add(root, loveJarSlot, 8);
    momentSlot = u.column();
    u.add(root, momentSlot, 8);
    throwbackSlot = u.column();
    u.add(root, throwbackSlot, 8);

    update();
    return root;
  }

  void send(View anchor) {
    send(anchor, "");
  }

  void send(View anchor, String vibe) {
    if (closed) return;
    main.removeCallbacks(settle);
    String who = from(), day = HeartCounts.day(System.currentTimeMillis());
    if (counts != null) {
      if (!day.equals(shownDay)) update();
      shownOwn++;
      shownTotalAllTime++;
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
    tapSerial++;
    taps.add(new String[] {who, day, vibe == null ? "" : vibe});
    drainTaps();
  }

  private void drainTaps() {
    if (!writing.compareAndSet(false, true)) return;
    heartWriter.execute(
        () -> {
          do {
            Map<String, Integer> batches = new LinkedHashMap<>();
            Map<String, String> batchVibes = new LinkedHashMap<>();
            String[] tap;
            while ((tap = taps.poll()) != null) {
              String key = tap[0] + "|" + tap[1];
              batches.put(key, batches.containsKey(key) ? batches.get(key) + 1 : 1);
              if (tap.length > 2 && tap[2] != null && !tap[2].isEmpty()) batchVibes.put(key, tap[2]);
            }
            int total = 0, failed = 0;
            for (Map.Entry<String, Integer> batch : batches.entrySet()) {
              int count = batch.getValue();
              total += count;
              String[] parts = batch.getKey().split("\\|");
              String vibe = batchVibes.containsKey(batch.getKey()) ? batchVibes.get(batch.getKey()) : "";
              try {
                api.store.tapHearts(parts[0], parts[1], count, vibe);
              } catch (Exception error) {
                failed += count;
              }
            }
            final int savedCount = total, failedCount = failed;
            main.post(
                () -> {
                  pendingWrites -= savedCount;
                  if (activity.isDestroyed()) return;
                  if (failedCount > 0) {
                    shownOwn = Math.max(0, shownOwn - failedCount);
                    shownTotalAllTime = Math.max(0, shownTotalAllTime - failedCount);
                    renderCounts();
                    Toast.makeText(
                            activity,
                            "Your phone couldn’t save those hearts. Please try again.",
                            Toast.LENGTH_SHORT)
                        .show();
                  }
                  if (pendingWrites == 0) {
                    if (!closed) main.postDelayed(settle, 80);
                    main.removeCallbacks(flush);
                    main.postDelayed(flush, closed ? 0 : 35);
                  }
                });
            writing.set(false);
          } while (!taps.isEmpty() && writing.compareAndSet(false, true));
        });
  }

  void awaitHeartWrites() throws Exception {
    heartWriter.submit(() -> {}).get(20, java.util.concurrent.TimeUnit.SECONDS);
  }

  static long nextHeartMilestone(long total) {
    long[] marks = {100, 500, 1000, 2500, 5000, 10000, 20000, 30000, 40000, 50000, 75000, 100000, 250000, 500000, 1000000};
    for (long m : marks) if (total < m) return m;
    return ((total / 100000) + 1) * 100000;
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
    if (milestoneText != null && shownTotalAllTime > 0) {
      long next = nextHeartMilestone(shownTotalAllTime);
      long pct = Math.min(99, (shownTotalAllTime * 100) / Math.max(1, next));
      milestoneText.setText(String.format(Locale.US, "%,d / %,d hearts (%d%%) · tap for 7-day recap", shownTotalAllTime, next, pct));
      milestoneText.setVisibility(View.VISIBLE);
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
    if (counts == null || closed || updating || pendingWrites > 0) return;
    updating = true;
    final long serial = tapSerial;
    heartWriter.execute(
        () -> {
          JSONObject d = data();
          JSONObject keepsakes = null, music = null, daily = null, camera = null;
          try { keepsakes = api.cached("/api/keepsakes", !api.connected()); } catch (Exception ignored) {}
          try { music = api.cached("/api/music", !api.connected()); } catch (Exception ignored) {}
          try { daily = api.cached("/api/daily-memory", !api.connected()); } catch (Exception ignored) {}
          try { camera = api.cached("/api/camera", !api.connected()); } catch (Exception ignored) {}
          if (camera == null) try { camera = api.store.read("film-collection"); } catch (Exception ignored) {}
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
          final JSONObject savedKeepsakes = keepsakes;
          final JSONObject savedMusic = music;
          final JSONObject savedDaily = daily;
          final JSONObject savedCamera = camera;
          main.post(
              () -> {
                updating = false;
                if (closed || counts == null || pendingWrites > 0 || serial != tapSerial) return;
                String today = SharedHeartStreak.today(d, api.connected()), own = from();
                shownDay = today;
                shownOwn = HeartCounts.count(d, today, own);
                shownOther = HeartCounts.count(d, today, partnerKey());
                long totalAll = 0;
                JSONObject heartDays = d.optJSONObject("heartDays");
                if (heartDays != null) {
                  Iterator<String> it = heartDays.keys();
                  while (it.hasNext()) {
                    String k = it.next();
                    totalAll += HeartCounts.count(d, k, "me") + HeartCounts.count(d, k, "asechka");
                  }
                }
                shownTotalAllTime = totalAll;
                SharedHeartStreak shared = SharedHeartStreak.calculate(d, today);
                shownStreak = shared.days;
                shownLives = shared.lives;
                shownTodayComplete = shared.todayComplete;
                renderCounts();

                // Partner active vibe (within 24 hours, matching backend)
                JSONObject vibes = d.optJSONObject("heartVibes");
                JSONObject partnerVibe = vibes == null ? null : vibes.optJSONObject(partnerKey());
                if (partnerVibe != null && !partnerVibe.optString("vibe").isEmpty()) {
                  long sentMs = Dates.instant(partnerVibe.optString("sentAt"));
                  if (sentMs <= 0 || System.currentTimeMillis() - sentMs <= 24L * 3600L * 1000L) {
                    String[] meta = vibeMeta(partnerVibe.optString("vibe"));
                    String sym = partnerVibe.optString("symbol", meta[0]);
                    String lbl = partnerVibe.optString("label", meta[1]);
                    partnerVibeText.setText(sym + " " + partner() + " sent “" + lbl + "”");
                    partnerVibeText.setVisibility(View.VISIBLE);
                  } else {
                    partnerVibeText.setVisibility(View.GONE);
                  }
                } else {
                  partnerVibeText.setVisibility(View.GONE);
                }

                // Camera subtitle badge (matches server/camera-store.js rolls array)
                if (cameraSub != null && savedCamera != null) {
                  JSONArray rolls = savedCamera.optJSONArray("rolls");
                  JSONObject activeRoll = null;
                  if (rolls != null) {
                    for (int i = rolls.length() - 1; i >= 0; i--) {
                      JSONObject candidate = rolls.optJSONObject(i);
                      if (candidate != null && (candidate.isNull("developedAt") || candidate.optString("developedAt").isEmpty())) {
                        activeRoll = candidate;
                        break;
                      }
                    }
                  }
                  if (activeRoll != null) {
                    int cap = activeRoll.optInt("capacity", 8);
                    JSONArray shotList = activeRoll.optJSONArray("shots");
                    int count = shotList == null ? 0 : shotList.length();
                    boolean ready = activeRoll.optBoolean("sundayReady") || count >= cap;
                    if (ready) cameraSub.setText("Roll ready to develop! ✨");
                    else if (count > 0) {
                      String lastBy = activeRoll.optString("lastShotActor", "");
                      boolean partnerShot = !lastBy.isEmpty() && !lastBy.equals(actorId());
                      cameraSub.setText(count + "/" + cap + " shots" + (partnerShot ? " · " + partner() + " shot ✨" : " · Sun 8 PM"));
                    } else cameraSub.setText(cap + " weekly shots · Sun 8 PM");
                  } else {
                    cameraSub.setText("8 weekly shots · Sun 8 PM");
                  }
                }

                // Clock
                JSONObject since = savedKeepsakes == null ? null : savedKeepsakes.optJSONObject("since");
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
                        : "Since " + shortBeginning(start) + " · Eastern");

                // Dynamic 2.8.0 cards (rebuilt only when their content signature changes)
                renderDailyPrompt(d);
                renderLoveJar(d);
                renderMomentSong(savedMusic);
                renderThrowbacks(savedDaily);
              });
        });
  }

  private String actorId() {
    return from().equals("asechka") ? "asnat" : "youssef";
  }

  private void renderDailyPrompt(JSONObject d) {
    if (promptSlot == null) return;
    JSONObject prompt = d.optJSONObject("dailyPrompt");
    String day = prompt == null ? "" : prompt.optString("day", "");
    boolean alreadySaved = !day.isEmpty() && activity.getSharedPreferences("preferences", 0).getBoolean("prompt-saved:" + day, false);
    String sig = (prompt == null ? "none" : prompt.toString()) + "|" + actorId() + "|" + alreadySaved;
    if (sig.equals(lastPromptSignature)) return;
    lastPromptSignature = sig;
    promptSlot.removeAllViews();
    if (prompt == null) return;
    String question = prompt.optString("prompt", prompt.optString("question", ""));
    if (question.isEmpty()) return;
    LinearLayout card = u.card(promptSlot, Color.WHITE);
    ((LinearLayout.LayoutParams) card.getLayoutParams()).topMargin = 0;
    u.add(card, u.label("TODAY’S 1-TAP QUESTION"), 0);
    u.add(card, u.title(question, 18), 6);
    String myActor = actorId(), otherActor = myActor.equals("asnat") ? "youssef" : "asnat";
    JSONObject answers = prompt.optJSONObject("answers");
    JSONObject mine = answers == null ? null : answers.optJSONObject(myActor);
    JSONObject theirs = answers == null ? null : answers.optJSONObject(otherActor);
    String myText = mine == null || mine.isNull("text") ? "" : mine.optString("text", "").trim();
    String theirText = theirs == null || theirs.isNull("text") ? "" : theirs.optString("text", "").trim();
    boolean revealed = prompt.optBoolean("revealed") || (!myText.isEmpty() && !theirText.isEmpty());
    boolean partnerAnswered = theirs != null && (theirs.optBoolean("answered") || !theirText.isEmpty());

    if (!myText.isEmpty()) {
      u.add(card, u.text("You: " + myText, 14, Ui.INK), 10);
    }
    if (revealed && !theirText.isEmpty()) {
      u.add(card, u.text(partner() + ": " + theirText, 14, Ui.PURPLE), 6);
      if (!alreadySaved) {
        Button saveBtn = u.button("Save both answers to Quotes ♡", false, () -> savePromptToQuotes(day, question, myText, theirText));
        u.add(card, saveBtn, 10);
      } else {
        u.add(card, u.text("Saved in Quotes ♡", 12, Ui.PURPLE), 8);
      }
    } else if (partnerAnswered) {
      u.add(card, u.text(partner() + " answered — reply to reveal ✨", 13, Ui.PURPLE), 8);
    } else if (!myText.isEmpty()) {
      u.add(card, u.text("Waiting for " + partner() + "’s reply…", 13, Ui.MUTED), 8);
    }

    if (myText.isEmpty()) {
      LinearLayout row = u.row(8);
      EditText input = u.input("Your answer…", "", 400, false);
      row.addView(input, new LinearLayout.LayoutParams(0, -2, 1));
      Button submit = u.button("Reply", true, () -> {
        String text = input.getText().toString().trim();
        if (text.isEmpty() || promptSubmitting) return;
        submitPromptAnswer(day, text);
      });
      row.addView(submit, new LinearLayout.LayoutParams(-2, u.dp(46)));
      u.add(card, row, 10);
    } else {
      Button editBtn = u.textButton("Edit your reply", () -> {
        EditText edit = u.input("Your answer…", myText, 400, true);
        new AlertDialog.Builder(activity)
            .setTitle("Today’s question")
            .setMessage(question)
            .setView(edit)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save", (dlg, w) -> {
              String text = edit.getText().toString().trim();
              if (!text.isEmpty()) submitPromptAnswer(day, text);
            })
            .show();
      });
      u.add(card, editBtn, 4);
    }
  }

  private void submitPromptAnswer(String day, String text) {
    promptSubmitting = true;
    heartWriter.execute(() -> {
      try {
        api.post("/api/together", OfflineStore.json(
            "action", "answerPrompt",
            "actor", actorId(),
            "day", day,
            "text", text,
            "operationId", UUID.randomUUID().toString()));
      } catch (Exception ignored) {
      }
      main.post(() -> {
        promptSubmitting = false;
        lastPromptSignature = "";
        update();
        flush.run();
      });
    });
  }

  private void savePromptToQuotes(String day, String question, String myText, String partnerText) {
    String you = actorId().equals("youssef") ? "Youssef" : "Asnat";
    String body = question + "\n" + you + ": “" + myText + "”\n" + partner() + ": “" + partnerText + "”";
    heartWriter.execute(() -> {
      try {
        api.post("/api/memories", OfflineStore.json(
            "action", "addQuote",
            "text", body,
            "note", "Daily question · " + day,
            "date", day,
            "author", actorId(),
            "operationId", UUID.randomUUID().toString()));
        activity.getSharedPreferences("preferences", 0).edit().putBoolean("prompt-saved:" + day, true).apply();
      } catch (Exception ignored) {
      }
      main.post(() -> {
        Toast.makeText(activity, "Saved both answers to Quotes ♡", Toast.LENGTH_SHORT).show();
        lastPromptSignature = "";
        update();
      });
    });
  }

  private void renderLoveJar(JSONObject d) {
    if (loveJarSlot == null) return;
    JSONArray msgs = d.optJSONArray("messages");
    ArrayList<JSONObject> pinned = new ArrayList<>();
    if (msgs != null) {
      for (int i = 0; i < msgs.length(); i++) {
        JSONObject m = msgs.optJSONObject(i);
        if (m != null && "jar".equals(m.optString("mode")) && m.optBoolean("pinned")) pinned.add(m);
      }
    }
    StringBuilder sig = new StringBuilder();
    for (JSONObject m : pinned) sig.append(m.optString("id")).append(':').append(m.optString("text", m.optString("preview"))).append('|');
    if (sig.toString().equals(lastJarSignature)) return;
    lastJarSignature = sig.toString();
    loveJarSlot.removeAllViews();
    LinearLayout card = u.card(loveJarSlot, Ui.PALE);
    ((LinearLayout.LayoutParams) card.getLayoutParams()).topMargin = 0;
    LinearLayout head = u.row(8);
    head.addView(u.label(pinned.isEmpty() ? "OUR LOVE JAR" : "PINNED FROM OUR LOVE JAR"), new LinearLayout.LayoutParams(0, -2, 1));
    TextView openJar = u.text("Open jar →", 12, Ui.PURPLE);
    Compat.font(openJar, R.font.dm_sans, 600);
    head.addView(openJar);
    card.addView(head);
    if (pinned.isEmpty()) {
      u.add(card, u.text("Pin a favorite note from your Love Jar to keep it right here on Home.", 13, Ui.MUTED), 6);
    } else {
      int shown = Math.min(2, pinned.size());
      for (int i = 0; i < shown; i++) {
        JSONObject m = pinned.get(i);
        String fromRaw = m.optString("from");
        String who = "asnat".equals(fromRaw) || "asechka".equals(fromRaw) ? "Asnat" : "Youssef";
        String body = m.optString("text", m.optString("preview", ""));
        u.add(card, u.text("📌 “" + body + "” — " + who, 14, Ui.INK), 8);
      }
    }
    card.setOnClickListener(v -> {
      if (activity instanceof MainActivity) ((MainActivity) activity).openLoveJar();
    });
  }

  private void renderMomentSong(JSONObject music) {
    if (momentSlot == null) return;
    JSONObject moment = music == null ? null : music.optJSONObject("moment");
    String sig = moment == null ? "empty" : moment.toString();
    if (sig.equals(lastMomentSignature)) return;
    lastMomentSignature = sig;
    momentSlot.removeAllViews();
    LinearLayout card = u.card(momentSlot, Color.WHITE);
    ((LinearLayout.LayoutParams) card.getLayoutParams()).topMargin = 0;
    LinearLayout top = u.row(8);
    top.addView(u.label("SONG OF THE MOMENT"), new LinearLayout.LayoutParams(0, -2, 1));
    TextView swap = u.text(moment == null ? "Pick one →" : "Swap →", 12, Ui.PURPLE);
    Compat.font(swap, R.font.dm_sans, 600);
    top.addView(swap);
    card.addView(top);
    if (moment == null || moment.optString("title").isEmpty()) {
      u.add(card, u.text("Drop whatever song is stuck in your head right now.", 13, Ui.MUTED), 6);
      card.setOnClickListener(v -> {
        if (activity instanceof MainActivity) ((MainActivity) activity).searchMomentMusic();
      });
      return;
    }
    LinearLayout row = u.row(12);
    row.setGravity(Gravity.CENTER_VERTICAL);
    ImageView art = new ImageView(activity);
    art.setScaleType(ImageView.ScaleType.CENTER_CROP);
    art.setBackground(u.shape(Ui.PALE, 12));
    art.setClipToOutline(true);
    row.addView(art, new LinearLayout.LayoutParams(u.dp(50), u.dp(50)));
    if (activity instanceof MainActivity) ((MainActivity) activity).feedImages().load(moment.optString("artworkUrl"), art);
    LinearLayout copy = u.column();
    copy.addView(u.title(moment.optString("title"), 15));
    u.add(copy, u.text(moment.optString("artist"), 13, Ui.MUTED), 2);
    if (!moment.optString("note").isEmpty()) u.add(copy, u.text(moment.optString("note"), 12, Ui.PURPLE), 4);
    row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
    u.add(card, row, 8);
    swap.setOnClickListener(v -> {
      if (activity instanceof MainActivity) ((MainActivity) activity).searchMomentMusic();
    });
    card.setOnClickListener(v -> {
      String url = moment.optString("trackUrl");
      if (!url.isEmpty()) {
        try { activity.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))); } catch (Exception ignored) {}
      } else if (activity instanceof MainActivity) ((MainActivity) activity).searchMomentMusic();
    });
  }

  private void renderThrowbacks(JSONObject daily) {
    if (throwbackSlot == null) return;
    JSONObject item = daily == null ? null : daily.optJSONObject("throwback");
    if (item == null && daily != null) {
      JSONArray arr = daily.optJSONArray("throwbacks");
      if (arr != null && arr.length() > 0) item = arr.optJSONObject(0);
    }
    String sig = item == null ? "none" : item.toString();
    if (sig.equals(lastThrowbackSignature)) return;
    lastThrowbackSignature = sig;
    throwbackSlot.removeAllViews();
    if (item == null) return;
    LinearLayout card = u.card(throwbackSlot, Ui.BLUE);
    ((LinearLayout.LayoutParams) card.getLayoutParams()).topMargin = 0;
    String badge = item.optString("throwbackLabel", item.optString("label", "THROWBACK"));
    u.add(card, u.label("ON THIS DAY · " + badge.toUpperCase(Locale.US)), 0);
    String text = item.optString("text", item.optString("caption", item.optString("title", "")));
    if (!text.isEmpty()) u.add(card, u.title(text, 16), 6);
    if (!item.optString("date").isEmpty()) u.add(card, u.text(item.optString("date"), 12, Ui.MUTED), 4);
  }

  private String shortBeginning(long start) {
    java.text.SimpleDateFormat format =
        new java.text.SimpleDateFormat("MMMM d, yyyy 'at' h:mm a", Locale.US);
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
    long total = me + her;
    long nextMark = nextHeartMilestone(total);
    sheet.note("All time · Youssef " + me + " ♡  ·  Asnat " + her + " ♡  (Total " + total + ")");
    sheet.note("Next milestone · " + total + " / " + nextMark + " hearts (" + Math.min(99, (total * 100) / Math.max(1, nextMark)) + "%)");
    SharedHeartStreak shared =
        SharedHeartStreak.calculate(d, SharedHeartStreak.today(d, api.connected()));
    sheet.note(
        "Our shared streak · "
            + shared.days
            + " days · "
            + shared.lives
            + (shared.lives == 1 ? " life" : " lives"));

    // 7-day weekly heart recap chart
    String today = SharedHeartStreak.today(d, api.connected());
    String[] weekDays = new String[7];
    long[] weekTotals = new long[7];
    long maxDay = 1;
    String cursor = today;
    for (int i = 6; i >= 0; i--) {
      weekDays[i] = cursor;
      weekTotals[i] = HeartCounts.count(d, cursor, "me") + HeartCounts.count(d, cursor, "asechka");
      if (weekTotals[i] > maxDay) maxDay = weekTotals[i];
      cursor = HeartCounts.previous(cursor);
    }
    LinearLayout chartCard = u.card(sheet.items, Color.WHITE);
    u.add(chartCard, u.label("7-DAY HEART RECAP"), 0);
    for (int i = 0; i < 7; i++) {
      LinearLayout barRow = u.row(8);
      barRow.setGravity(Gravity.CENTER_VERTICAL);
      TextView dayLbl = u.text(weekDays[i].length() >= 10 ? weekDays[i].substring(5) : weekDays[i], 11, Ui.MUTED);
      barRow.addView(dayLbl, new LinearLayout.LayoutParams(u.dp(42), -2));
      FrameLayout track = new FrameLayout(activity);
      track.setBackground(u.shape(Ui.PALE, 6));
      View fill = new View(activity);
      fill.setBackground(u.shape(Ui.PRIMARY, 6));
      int pct = (int) Math.max(weekTotals[i] > 0 ? 8 : 0, (weekTotals[i] * 100) / maxDay);
      LinearLayout fillWrap = new LinearLayout(activity);
      fillWrap.setOrientation(LinearLayout.HORIZONTAL);
      fillWrap.addView(fill, new LinearLayout.LayoutParams(0, u.dp(10), pct));
      fillWrap.addView(new View(activity), new LinearLayout.LayoutParams(0, u.dp(10), Math.max(0, 100 - pct)));
      track.addView(fillWrap, new FrameLayout.LayoutParams(-1, u.dp(10)));
      barRow.addView(track, new LinearLayout.LayoutParams(0, u.dp(10), 1));
      TextView numLbl = u.text(String.valueOf(weekTotals[i]), 11, Ui.PURPLE);
      barRow.addView(numLbl, new LinearLayout.LayoutParams(u.dp(36), -2));
      u.add(chartCard, barRow, 6);
    }

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
    if (locationCard != null) locationCard.close();
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
