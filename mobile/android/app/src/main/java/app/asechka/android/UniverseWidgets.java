package app.asechka.android;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.os.*;
import android.view.View;
import android.widget.RemoteViews;
import java.text.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

/** Six matching native widget families. Only cached public counters/quotes enter widget views. */
public class UniverseWidgets extends AppWidgetProvider {
  public static class Quote extends UniverseWidgets {}

  public static class YourHearts extends UniverseWidgets {}

  public static class BothHearts extends UniverseWidgets {}

  public static class Today extends UniverseWidgets {}

  public static class Together extends UniverseWidgets {}

  public static class Streak extends UniverseWidgets {}

  private static final Class<?>[] TYPES = {
    Quote.class, YourHearts.class, BothHearts.class, Today.class, Together.class, Streak.class
  };
  private static final String[] TITLES = {
    "Words to keep",
    "Your little hearts",
    "Hearts, from us both",
    "A little love today",
    "Our time together",
    "Our shared streak"
  };
  private static final ExecutorService worker = Executors.newSingleThreadExecutor();
  private static String previous = "";
  private static final AtomicBoolean queued = new AtomicBoolean();
  private static final AtomicBoolean dirty = new AtomicBoolean();

  @Override
  public void onUpdate(Context c, AppWidgetManager manager, int[] ids) {
    SyncJob.schedule(c);
    refreshFromReceiver(c);
  }

  @Override
  public void onEnabled(Context c) {
    SyncJob.schedule(c);
    refreshFromReceiver(c);
  }

  @Override
  public void onAppWidgetOptionsChanged(
      Context c, AppWidgetManager manager, int id, Bundle options) {
    refreshFromReceiver(c);
  }

  private void refreshFromReceiver(Context context) {
    // Keep the receiver alive until the encrypted offline snapshot reaches the launcher.
    PendingResult pending = goAsync();
    Context c = context.getApplicationContext();
    worker.execute(
        () -> {
          try {
            previous = "";
            render(c);
          } catch (Exception error) {
            android.util.Log.w("AsechkaWidget", "Widget snapshot unavailable");
          } finally {
            if (pending != null) pending.finish();
          }
        });
  }

  static void updateAll(Context context) {
    Context c = context.getApplicationContext();
    dirty.set(true);
    if (!queued.compareAndSet(false, true)) return;
    worker.execute(
        () -> {
          dirty.set(false);
          try {
            render(c);
          } catch (Exception e) {
            android.util.Log.w("AsechkaWidget", "Widget snapshot unavailable");
          } finally {
            queued.set(false);
            if (dirty.get()) updateAll(c);
          }
        });
  }

  static String number(long value) {
    return NumberFormat.getIntegerInstance(Locale.US).format(value);
  }

  static String time(String value) {
    if (value == null || value.isEmpty() || value.equals("null")) return "No hearts yet";
    long instant = Dates.instant(value);
    if (instant <= 0) return "No hearts yet";
    SimpleDateFormat f = new SimpleDateFormat("MMM d · h:mm a", Locale.US);
    f.setTimeZone(TimeZone.getTimeZone("America/New_York"));
    return f.format(new Date(instant)) + " ET";
  }

  private static void render(Context c) throws Exception {
    build(c, new ApiClient(c), false);
  }

  static java.util.List<RemoteViews> previews(Context c, ApiClient api) throws Exception {
    return build(c, api, true);
  }

  private static java.util.List<RemoteViews> build(Context c, ApiClient api, boolean preview)
      throws Exception {
    java.util.List<RemoteViews> result = new java.util.ArrayList<>();
    AppWidgetManager manager = AppWidgetManager.getInstance(c);
    boolean installed = false;
    for (Class<?> type : TYPES)
      if (manager.getAppWidgetIds(new ComponentName(c, type)).length > 0) installed = true;
    if (!installed && !preview) return result;
    JSONObject data = api.canOpen() ? api.cached("/api/together", true) : null;
    JSONObject memories = api.canOpen() ? api.cached("/memories.json", true) : null;
    JSONObject keepsakes = api.canOpen() ? api.cached("/api/keepsakes", true) : null;
    String actor =
        c.getSharedPreferences("preferences", Context.MODE_PRIVATE).getString("person", "asnat");
    JSONObject days = data == null ? new JSONObject() : data.optJSONObject("heartDays");
    long asnat = 0, youssef = 0;
    if (days != null) {
      Iterator<String> keys = days.keys();
      while (keys.hasNext()) {
        JSONObject day = days.optJSONObject(keys.next());
        if (day != null) {
          asnat += day.optLong("asechka");
          youssef += day.optLong("me");
        }
      }
    }
    String today = HeartCounts.day(System.currentTimeMillis());
    JSONObject daily = days == null ? null : days.optJSONObject(today),
        hearts = data == null ? null : data.optJSONObject("hearts");
    SharedHeartStreak streak = data == null ? null : SharedHeartStreak.calculate(data, today);
    String since =
        keepsakes == null || keepsakes.optJSONObject("since") == null
            ? ""
            : keepsakes.optJSONObject("since").optString("startedAt");
    long start = since.isEmpty() ? 0 : Dates.instant(since);
    long saved = data == null ? 0 : data.optLong("_savedAt");
    StringBuilder identity = new StringBuilder();
    for (Class<?> type : TYPES)
      identity.append(
          java.util.Arrays.toString(manager.getAppWidgetIds(new ComponentName(c, type))));
    String fingerprint =
        actor
            + today
            + days
            + hearts
            + since
            + (memories == null ? "" : memories.optJSONArray("quotes"))
            + System.currentTimeMillis() / 21600000L
            + identity.toString();
    if (!preview && previous.equals(fingerprint)) return result;
    if (!preview) previous = fingerprint;
    for (int kind = 0; kind < TYPES.length; kind++)
      for (int id :
          preview ? new int[] {kind} : manager.getAppWidgetIds(new ComponentName(c, TYPES[kind]))) {
        boolean compact =
            !preview
                && manager
                        .getAppWidgetOptions(id)
                        .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 164)
                    < 130;
        RemoteViews v =
            new RemoteViews(
                c.getPackageName(),
                compact ? R.layout.universe_widget_compact : R.layout.universe_widget);
        v.setTextViewText(R.id.widget_title, TITLES[kind]);
        v.setTextViewText(R.id.widget_icon, kind == 5 ? "✦" : "♡");
        v.setViewVisibility(R.id.widget_timer, View.GONE);
        v.setViewVisibility(R.id.widget_secondary, View.VISIBLE);
        v.setViewVisibility(
            R.id.widget_right, data == null || kind == 0 ? View.GONE : View.VISIBLE);
        v.setViewVisibility(
            R.id.widget_divider, data == null || kind == 0 ? View.GONE : View.VISIBLE);
        v.setViewVisibility(
            R.id.widget_left_label, data == null || kind == 0 ? View.GONE : View.VISIBLE);
        String primary = "Open Asechka ♡",
            detail = "Connect once to fill our little widget",
            extra = "",
            secondary = "",
            leftLabel = "",
            rightLabel = "";
        if (data != null) {
          if (kind == 0) {
            JSONArray quotes = memories == null ? null : memories.optJSONArray("quotes");
            if (quotes != null && quotes.length() > 0) {
              int index = (int) ((System.currentTimeMillis() / 21600000L) % quotes.length());
              Object raw = quotes.opt(index);
              primary =
                  "“"
                      + (raw instanceof JSONObject
                          ? ((JSONObject) raw).optString("text")
                          : String.valueOf(raw))
                      + "”";
            } else primary = "A little life, a lot of love.";
            detail = "";
          }
          if (kind == 1) {
            boolean a = actor.equals("asnat");
            primary = number(a ? asnat : youssef) + " ♡";
            leftLabel = SocialFeed.nameOf(actor);
            detail = "all hearts sent";
            JSONObject last = hearts == null ? null : hearts.optJSONObject(a ? "asechka" : "me");
            rightLabel = "Last sent";
            secondary = time(last == null ? "" : last.optString("sentAt"));
            extra = "a little love, kept close";
          }
          if (kind == 2) {
            leftLabel = "Asnat";
            rightLabel = "Youssef";
            primary = number(asnat) + " ♡";
            secondary = number(youssef) + " ♡";
            JSONObject a = hearts == null ? null : hearts.optJSONObject("asechka"),
                y = hearts == null ? null : hearts.optJSONObject("me");
            detail = time(a == null ? "" : a.optString("sentAt"));
            extra = time(y == null ? "" : y.optString("sentAt"));
          }
          if (kind == 3) {
            leftLabel = "Asnat";
            rightLabel = "Youssef";
            primary = number(daily == null ? 0 : daily.optLong("asechka")) + " ♡";
            secondary = number(daily == null ? 0 : daily.optLong("me")) + " ♡";
            detail = "hearts today";
            extra = "hearts today · ET";
          }
          if (kind == 4) {
            leftLabel = "Together";
            rightLabel = "And counting";
            primary =
                start > 0
                    ? number(Math.max(0, (System.currentTimeMillis() - start) / 86400000L))
                    : "—";
            secondary = "Set our beginning";
            detail = "days of us";
            if (start > 0) {
              v.setViewVisibility(R.id.widget_timer, View.VISIBLE);
              v.setViewVisibility(R.id.widget_secondary, View.GONE);
              v.setChronometer(
                  R.id.widget_timer,
                  SystemClock.elapsedRealtime() - (System.currentTimeMillis() - start),
                  "%s",
                  true);
            }
            extra = "hours · minutes · seconds";
          }
          if (kind == 5) {
            leftLabel = "Our streak";
            rightLabel = "Saved lives";
            primary = number(streak.days);
            secondary = number(streak.lives) + " ✦";
            detail = "days together";
            extra = streak.todayComplete ? "Today is covered ♡" : "Send a heart to cover today";
          }
        }
        v.setTextViewText(R.id.widget_main, primary);
        v.setTextViewText(R.id.widget_secondary, secondary);
        v.setTextViewText(R.id.widget_left_label, leftLabel);
        v.setTextViewText(R.id.widget_right_label, rightLabel);
        v.setTextViewTextSize(
            R.id.widget_main,
            android.util.TypedValue.COMPLEX_UNIT_SP,
            compact
                ? kind == 0 ? 16 : 20
                : kind == 0 || data == null ? 18 : primary.length() > 9 ? 20 : 26);
        v.setTextViewTextSize(
            R.id.widget_secondary,
            android.util.TypedValue.COMPLEX_UNIT_SP,
            compact ? 16 : kind == 1 ? 16 : secondary.length() > 9 ? 20 : 26);
        v.setInt(
            R.id.widget_main, "setMaxLines", kind == 0 ? compact ? 2 : 3 : data == null ? 2 : 1);
        v.setInt(R.id.widget_secondary, "setMaxLines", kind == 1 ? 2 : 1);
        v.setViewVisibility(R.id.widget_detail, detail.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.widget_detail, detail);
        v.setTextViewText(R.id.widget_extra, extra);
        v.setTextViewText(
            R.id.widget_updated,
            saved > 0 ? "Saved · " + time(Dates.timestamp(saved)) : "asechka. · tap to open");
        Intent intent =
            new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(
            R.id.widget_surface,
            PendingIntent.getActivity(
                c,
                100 + kind,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        if (preview) result.add(v);
        else manager.updateAppWidget(id, v);
      }
    return result;
  }
}
