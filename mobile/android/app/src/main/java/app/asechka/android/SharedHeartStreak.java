package app.asechka.android;

import java.util.*;
import org.json.*;

/** A projection of the website ledger. Devices never spend or mint lives independently. */
final class SharedHeartStreak {
  int days, lives, livesEarned, livesUsed;
  boolean todayComplete;
  String today, nextLifeOn, lastResetOn;
  final ArrayList<String> protectedDays = new ArrayList<>();

  private static Calendar date(String day) {
    Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US);
    c.setTimeInMillis(Dates.instant(day + "T12:00:00Z"));
    return c;
  }

  private static String iso(Calendar c) {
    return String.format(
        Locale.US,
        "%04d-%02d-%02d",
        c.get(Calendar.YEAR),
        c.get(Calendar.MONTH) + 1,
        c.get(Calendar.DAY_OF_MONTH));
  }

  private static String anniversary(String start, String day, int offset) {
    Calendar c = date(day);
    c.set(Calendar.DAY_OF_MONTH, 1);
    c.add(Calendar.MONTH, offset);
    c.set(
        Calendar.DAY_OF_MONTH,
        Math.min(Integer.parseInt(start.substring(8)), c.getActualMaximum(Calendar.DAY_OF_MONTH)));
    return iso(c);
  }

  private static int earned(String start, String day) {
    if (day.compareTo(start) < 0) return 0;
    Calendar a = date(start), b = date(day);
    return Math.max(
        0,
        1
            + (b.get(Calendar.YEAR) - a.get(Calendar.YEAR)) * 12
            + b.get(Calendar.MONTH)
            - a.get(Calendar.MONTH)
            - (day.compareTo(anniversary(start, day, 0)) < 0 ? 1 : 0));
  }

  static String today(JSONObject data, boolean online) {
    JSONObject status = data.optJSONObject("streakStatus");
    return online
            && status != null
            && Math.abs(System.currentTimeMillis() - Dates.instant(status.optString("asOf")))
                < 90000
        ? status.optString("today", HeartCounts.day(System.currentTimeMillis()))
        : HeartCounts.day(System.currentTimeMillis());
  }

  static SharedHeartStreak calculate(JSONObject data, String today) {
    SharedHeartStreak r = new SharedHeartStreak();
    r.today = today;
    JSONObject policy = data.optJSONObject("heartStreak");
    String start = policy == null ? "2026-10-12" : policy.optString("startedOn", "2026-10-12");
    String seed = policy == null ? "2026-10-25" : policy.optString("seededThrough", "2026-10-25");
    r.days = policy == null ? 13 : policy.optInt("seedDays", 13);
    r.lives = earned(start, seed);
    if (today.compareTo(seed) <= 0) {
      r.days =
          Math.max(
              0,
              r.days
                  - (int)
                      ((date(seed).getTimeInMillis() - date(today).getTimeInMillis()) / 86400000L));
      r.lives = earned(start, today);
    } else {
      int grants = r.lives;
      Calendar cursor = date(seed);
      cursor.add(Calendar.DATE, 1);
      for (String day = iso(cursor);
          day.compareTo(today) < 0;
          cursor.add(Calendar.DATE, 1), day = iso(cursor)) {
        int available = earned(start, day);
        r.lives += available - grants;
        grants = available;
        if (sent(data, day)) r.days = r.days > 0 ? r.days + 1 : 1;
        else if (r.days > 0 && r.lives > 0) {
          r.lives--;
          r.livesUsed++;
          r.days++;
          r.protectedDays.add(day);
        } else if (r.days > 0) {
          r.days = 0;
          r.lastResetOn = day;
        }
      }
      r.lives += earned(start, today) - grants;
      if (sent(data, today)) r.days = r.days > 0 ? r.days + 1 : 1;
    }
    r.livesEarned = earned(start, today);
    r.nextLifeOn =
        anniversary(start, today, today.compareTo(anniversary(start, today, 0)) < 0 ? 0 : 1);
    r.todayComplete = today.compareTo(seed) <= 0 || sent(data, today);
    return r;
  }

  private static boolean sent(JSONObject data, String day) {
    return HeartCounts.count(data, day, "me") > 0 || HeartCounts.count(data, day, "asechka") > 0;
  }
}
