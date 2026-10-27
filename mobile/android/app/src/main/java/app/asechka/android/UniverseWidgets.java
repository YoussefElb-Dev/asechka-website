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

  @Override
  public void onUpdate(Context c, AppWidgetManager manager, int[] ids) {
    SyncJob.schedule(c);
    updateAll(c);
  }

  @Override
  public void onEnabled(Context c) {
    SyncJob.schedule(c);
    updateAll(c);
  }

  static void updateAll(Context context) {
    Context c = context.getApplicationContext();
    if (!queued.compareAndSet(false, true)) return;
    worker.execute(
        () -> {
          try {
            render(c);
          } catch (Exception e) {
            android.util.Log.w("AsechkaWidget", "Widget snapshot unavailable");
          } finally {
            queued.set(false);
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
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.universe_widget);
        v.setImageViewBitmap(
            R.id.widget_background, Artwork.bitmap(c, R.drawable.art_widget_orbit, true));
        v.setImageViewBitmap(
            R.id.widget_art,
            Artwork.bitmap(
                c,
                new int[] {
                      R.drawable.art_quote_words,
                      R.drawable.art_send_love,
                      R.drawable.art_send_love,
                      R.drawable.art_send_love,
                      R.drawable.art_our_time,
                      R.drawable.art_shared_streak
                    }
                    [kind]));
        v.setTextViewText(R.id.widget_title, TITLES[kind]);
        v.setTextViewText(R.id.widget_icon, kind == 5 ? "✦" : "♡");
        v.setViewVisibility(R.id.widget_timer, View.GONE);
        String primary = "Open Asechka ♡",
            detail = "Connect once to fill our little widget",
            extra = "";
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
            detail = "A different little thought every six hours";
          }
          if (kind == 1) {
            boolean a = actor.equals("asnat");
            primary = number(a ? asnat : youssef) + " ♡";
            detail = SocialFeed.nameOf(actor) + " · all hearts sent";
            JSONObject last = hearts == null ? null : hearts.optJSONObject(a ? "asechka" : "me");
            extra = "Last · " + time(last == null ? "" : last.optString("sentAt"));
          }
          if (kind == 2) {
            primary = "Asnat  " + number(asnat) + " ♡\nYoussef  " + number(youssef) + " ♡";
            JSONObject a = hearts == null ? null : hearts.optJSONObject("asechka"),
                y = hearts == null ? null : hearts.optJSONObject("me");
            detail = "Asnat · " + time(a == null ? "" : a.optString("sentAt"));
            extra = "Youssef · " + time(y == null ? "" : y.optString("sentAt"));
          }
          if (kind == 3) {
            primary =
                "Asnat  "
                    + number(daily == null ? 0 : daily.optLong("asechka"))
                    + " ♡\nYoussef  "
                    + number(daily == null ? 0 : daily.optLong("me"))
                    + " ♡";
            detail = today + " · Eastern time";
            extra = "Every little tap counts";
          }
          if (kind == 4) {
            primary =
                start > 0
                    ? number(Math.max(0, (System.currentTimeMillis() - start) / 86400000L))
                        + " days ♡"
                    : "Our beginning, kept close";
            detail = start > 0 ? "Since " + time(since) : "Set our beginning in the app";
            if (start > 0) {
              v.setViewVisibility(R.id.widget_timer, View.VISIBLE);
              v.setChronometer(
                  R.id.widget_timer,
                  SystemClock.elapsedRealtime() - (System.currentTimeMillis() - start),
                  "%s",
                  true);
            }
            extra = "A little more us, every second";
          }
          if (kind == 5) {
            primary = number(streak.days) + " days ✦";
            detail = number(streak.lives) + (streak.lives == 1 ? " saved life" : " saved lives");
            extra = streak.todayComplete ? "Today is covered ♡" : "Send a heart to cover today";
          }
        }
        v.setTextViewText(R.id.widget_main, primary);
        v.setTextViewTextSize(
            R.id.widget_main,
            android.util.TypedValue.COMPLEX_UNIT_SP,
            kind == 0 ? 18 : kind == 2 || kind == 3 ? 20 : 28);
        v.setInt(R.id.widget_main, "setMaxLines", kind == 0 ? 7 : 3);
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
