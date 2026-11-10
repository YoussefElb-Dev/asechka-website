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
  private final java.util.concurrent.ConcurrentLinkedQueue<String[]> taps =
      new java.util.concurrent.ConcurrentLinkedQueue<>();
  private final java.util.concurrent.atomic.AtomicBoolean writing =
      new java.util.concurrent.atomic.AtomicBoolean();
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
    LinearLayout heart=u.card(root,Ui.PALE);((LinearLayout.LayoutParams)heart.getLayoutParams()).topMargin=0;
    heart.setBackground(u.shape(Ui.PALE,22));heart.setPadding(u.dp(12),u.dp(8),u.dp(12),u.dp(8));
    LinearLayout title=u.row(12),summary=u.column();summary.setMinimumHeight(u.dp(48));summary.setGravity(Gravity.CENTER_VERTICAL);
    counts=u.text("",12,Ui.MUTED);summary.addView(counts);streak=u.text("",12,Ui.PURPLE);Compat.font(streak,R.font.dm_sans,600);u.add(summary,streak,3);
    summary.setContentDescription("Our heart history");summary.setOnClickListener(v->history());summary.setOnLongClickListener(v->{history();return true;});
    title.addView(summary,new LinearLayout.LayoutParams(0,-2,1));
    Button send=u.button("Send a heart",false,null);send.setTextSize(14);send.setTextColor(Ui.INK);send.setSingleLine(true);send.setPadding(u.dp(14),0,u.dp(14),0);
    android.graphics.drawable.Drawable heartIcon=activity.getDrawable(R.drawable.ic_send_heart);heartIcon.setBounds(0,0,u.dp(18),u.dp(18));send.setCompoundDrawablesRelative(heartIcon,null,null,null);send.setCompoundDrawablePadding(u.dp(8));
    android.graphics.drawable.GradientDrawable sendSurface=u.shape(Color.WHITE,100);sendSurface.setStroke(u.dp(1),0xffdfdaef);send.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x196b5cb5),sendSurface,null));
    send.setContentDescription("Send a heart to "+partner());send.setOnClickListener(v->send(v));title.addView(send,new LinearLayout.LayoutParams(-2,u.dp(48)));heart.addView(title);
    LinearLayout clock=u.card(root,Ui.BLUE);((LinearLayout.LayoutParams)clock.getLayoutParams()).topMargin=u.dp(6);clock.setPadding(u.dp(12),u.dp(10),u.dp(12),u.dp(10));
    LinearLayout timeRow=u.row(8);TextView together=u.text("Together ♡",12,Ui.PURPLE);timeRow.addView(together);
    elapsed=u.title("",18);elapsed.setFontFeatureSettings("tnum");elapsed.setSingleLine(true);elapsed.setEllipsize(android.text.TextUtils.TruncateAt.END);timeRow.addView(elapsed,new LinearLayout.LayoutParams(0,-2,1));clock.addView(timeRow);
    sinceLabel=u.text("",10,Ui.MUTED);sinceLabel.setSingleLine(true);sinceLabel.setEllipsize(android.text.TextUtils.TruncateAt.END);u.add(clock,sinceLabel,4);clock.setContentDescription("Our time together. Open Since us.");clock.setOnClickListener(v->open.open(0));
    LinearLayout special=u.row(7);
    LinearLayout camera=u.row(8);camera.setGravity(Gravity.CENTER_VERTICAL);camera.setPadding(u.dp(10),u.dp(10),u.dp(10),u.dp(10));camera.setBackground(u.shape(Ui.PALE,16));camera.setMinimumHeight(u.dp(64));camera.addView(Glyph.view(activity,"camera",Ui.PURPLE),new LinearLayout.LayoutParams(u.dp(23),u.dp(23)));
    LinearLayout cameraCopy=u.column();TextView cameraName=u.text("Our disposable camera",14,Ui.PURPLE);Compat.font(cameraName,R.font.dm_sans,600);cameraCopy.addView(cameraName);u.add(cameraCopy,u.text("24 secret moments",10,Ui.PURPLE),3);camera.addView(cameraCopy,new LinearLayout.LayoutParams(0,-2,1));camera.addView(Glyph.view(activity,"arrow.up.right",Ui.PURPLE),new LinearLayout.LayoutParams(u.dp(16),u.dp(16)));
    camera.setContentDescription("Our disposable camera");camera.setOnClickListener(v->activity.startActivity(new android.content.Intent(activity,DisposableCameraActivity.class)));special.addView(camera,new LinearLayout.LayoutParams(0,-2,1));
    LinearLayout vault=u.row(8);vault.setGravity(Gravity.CENTER);vault.setBackground(u.shape(Ui.BLUE,16));vault.addView(Glyph.view(activity,"vault",Ui.INK),new LinearLayout.LayoutParams(u.dp(18),u.dp(18)));TextView vaultName=u.text("Time vault",13,Ui.INK);Compat.font(vaultName,R.font.dm_sans,600);vault.addView(vaultName);vault.setContentDescription("Time vault");vault.setOnClickListener(v->activity.startActivity(new android.content.Intent(activity,TimeVaultActivity.class)));special.addView(vault,new LinearLayout.LayoutParams(0,u.dp(48),1));u.add(root,special,6);
    String[] names={"Secret vocab","Open when…","Tiny victories","Recipes for two","Little things","Our beginning"};
    String[] symbols={"book","envelope","sparkles","fork","heart","infinity"};int[] destinations={3,1,4,5,2,0};
    int columns=activity.getResources().getConfiguration().fontScale>1.3f?2:3;LinearLayout row=null;
    for(int i=0;i<names.length;i++){
      if(i%columns==0){row=u.row(7);u.add(root,row,7);}
      final int destination=destinations[i];LinearLayout tile=u.row(7);tile.setGravity(Gravity.CENTER);tile.setMinimumHeight(u.dp(44));tile.setPadding(u.dp(5),0,u.dp(5),0);
      android.graphics.drawable.GradientDrawable surface=u.shape(Color.WHITE,16);surface.setStroke(u.dp(1),0x176b5cb5);tile.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x196b5cb5),surface,null));
      tile.addView(Glyph.view(activity,symbols[i],Ui.PURPLE),new LinearLayout.LayoutParams(u.dp(16),u.dp(18)));
      TextView label=u.text(names[i],12,Ui.PURPLE);Compat.font(label,R.font.dm_sans,500);label.setGravity(Gravity.CENTER);label.setMaxLines(2);label.setBreakStrategy(android.text.Layout.BREAK_STRATEGY_SIMPLE);label.setHyphenationFrequency(android.text.Layout.HYPHENATION_FREQUENCY_NONE);tile.addView(label,new LinearLayout.LayoutParams(0,-2,1));
      tile.setContentDescription(names[i]);tile.setOnClickListener(v->open.open(destination));row.addView(tile,new LinearLayout.LayoutParams(0,u.dp(44),1));
    }
    locationCard=((MainActivity)activity).locationCard();u.add(root,locationCard.view(),6);
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
    tapSerial++;
    taps.add(new String[] {who, day});
    drainTaps();
  }

  private void drainTaps() {
    if (!writing.compareAndSet(false, true)) return;
    heartWriter.execute(
        () -> {
          do {
            Map<String, Integer> batches = new LinkedHashMap<>();
            String[] tap;
            while ((tap = taps.poll()) != null) {
              String key = tap[0] + "|" + tap[1];
              batches.put(key, batches.containsKey(key) ? batches.get(key) + 1 : 1);
            }
            int total = 0, failed = 0;
            for (Map.Entry<String, Integer> batch : batches.entrySet()) {
              int count = batch.getValue();
              total += count;
              String[] parts = batch.getKey().split("\\|");
              try {
                api.store.tapHearts(parts[0], parts[1], count);
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
    if (counts == null || closed || updating || pendingWrites > 0) return;
    updating = true;
    final long serial = tapSerial;
    heartWriter.execute(
        () -> {
          JSONObject d = data();
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
          final JSONObject savedKeepsakes = keepsakes;
          main.post(
              () -> {
                updating = false;
                if (closed || counts == null || pendingWrites > 0 || serial != tapSerial) return;
                String today = SharedHeartStreak.today(d, api.connected()), own = from();
                shownDay = today;
                shownOwn = HeartCounts.count(d, today, own);
                shownOther = HeartCounts.count(d, today, own.equals("me") ? "asechka" : "me");
                SharedHeartStreak shared = SharedHeartStreak.calculate(d, today);
                shownStreak = shared.days;
                shownLives = shared.lives;
                shownTodayComplete = shared.todayComplete;
                renderCounts();
                JSONObject since =
                    savedKeepsakes == null ? null : savedKeepsakes.optJSONObject("since");
                long start = since == null ? 0 : Dates.instant(since.optString("startedAt"));
                long seconds =
                    start <= 0 ? 0 : Math.max(0, (System.currentTimeMillis() - start) / 1000);
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
              });
        });
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
    if(locationCard!=null)locationCard.close();
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
