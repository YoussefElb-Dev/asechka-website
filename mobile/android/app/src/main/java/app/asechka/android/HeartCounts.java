package app.asechka.android;

import java.text.SimpleDateFormat;
import java.util.*;
import org.json.*;

final class HeartCounts {
  static String day(long now) {
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    f.setTimeZone(TimeZone.getTimeZone("America/New_York"));
    return f.format(new Date(now));
  }

  static String previous(String day) {
    Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
    c.setTimeInMillis(Dates.instant(day + "T12:00:00Z"));
    c.add(Calendar.DATE, -1);
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    f.setTimeZone(c.getTimeZone());
    return f.format(c.getTime());
  }

  static long count(JSONObject data, String day, String from) {
    JSONObject days = data == null ? null : data.optJSONObject("heartDays"),
        values = days == null ? null : days.optJSONObject(day);
    return values == null ? 0 : values.optLong(from);
  }

  static int streak(JSONObject data, String from, String today) {
    String cursor = count(data, today, from) > 0 ? today : previous(today);
    int days = 0;
    while (count(data, cursor, from) > 0) {
      days++;
      cursor = previous(cursor);
    }
    return days;
  }

  static void apply(JSONObject data, JSONObject body, long time) throws Exception {
    String op = body.optString("operationId"),
        from = body.optString("from"),
        day = body.optString("day", day(time));
    JSONArray receipts = data.optJSONArray("heartReceipts");
    if (receipts != null)
      for (int i = 0; i < receipts.length(); i++) if (op.equals(receipts.optString(i))) return;
    JSONObject hearts = data.optJSONObject("hearts");
    if (hearts == null) hearts = new JSONObject();
    JSONObject last = hearts.optJSONObject(from);
    if (last != null && op.equals(last.optString("id"))) return;
    JSONObject days = data.optJSONObject("heartDays");
    if (days == null) days = new JSONObject();
    JSONObject values = days.optJSONObject(day);
    if (values == null) values = new JSONObject();
    values.put(from, values.optLong(from) + body.optLong("count", 1));
    days.put(day, values);
    data.put("heartDays", days);
    hearts.put(from, OfflineStore.json("id", op, "sentAt", Dates.timestamp(time), "pending", true));
    data.put("hearts", hearts);
  }
}
