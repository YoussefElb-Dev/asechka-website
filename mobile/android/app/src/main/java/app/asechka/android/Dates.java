package app.asechka.android;

import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.regex.*;

/** Calendar days use UTC only for arithmetic; today's date and display use the phone's timezone. */
final class Dates {
  private static final long DAY = 86400000L;
  private static final TimeZone UTC = TimeZone.getTimeZone("UTC");
  private static final Pattern INSTANT =
      Pattern.compile(
          "^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2})(?:\\.(\\d{1,9}))?(Z|[+-]\\d{2}:\\d{2})$");

  private static SimpleDateFormat formatter(String pattern, TimeZone zone, Locale locale) {
    SimpleDateFormat format = new SimpleDateFormat(pattern, locale);
    format.setTimeZone(zone);
    format.setLenient(false);
    return format;
  }

  private static Date parse(SimpleDateFormat format, String text) {
    ParsePosition position = new ParsePosition(0);
    Date value = format.parse(text, position);
    if (value == null || position.getIndex() != text.length())
      throw new IllegalArgumentException("Invalid date");
    return value;
  }

  static long day(String iso) {
    if (!iso.matches("\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException("Invalid date");
    return parse(formatter("yyyy-MM-dd", UTC, Locale.US), iso).getTime() / DAY;
  }

  static String today() {
    return formatter("yyyy-MM-dd", TimeZone.getDefault(), Locale.US).format(new Date());
  }

  static long nextBirthday(int month, int day, long today) {
    Calendar calendar = Calendar.getInstance(UTC, Locale.US);
    calendar.setTimeInMillis(today * DAY);
    int year = calendar.get(Calendar.YEAR);
    calendar.clear();
    calendar.set(year, month - 1, day);
    long next = calendar.getTimeInMillis() / DAY;
    if (next < today) {
      calendar.add(Calendar.YEAR, 1);
      next = calendar.getTimeInMillis() / DAY;
    }
    return next;
  }

  static long instant(String value) {
    Matcher match = INSTANT.matcher(value);
    if (!match.matches()) throw new IllegalArgumentException("Invalid timestamp");
    String fraction = ((match.group(2) == null ? "" : match.group(2)) + "000").substring(0, 3);
    String zone = match.group(3).equals("Z") ? "+0000" : match.group(3).replace(":", "");
    return parse(
            formatter("yyyy-MM-dd'T'HH:mm:ss.SSSZ", UTC, Locale.US),
            match.group(1) + "." + fraction + zone)
        .getTime();
  }

  static String timestamp(long millis) {
    return formatter("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", UTC, Locale.US).format(new Date(millis));
  }

  static String display(String value) {
    if (value.length() == 10)
      return formatter("MMM d, yyyy", UTC, Locale.getDefault()).format(new Date(day(value) * DAY));
    return formatter("MMM d · h:mm a", TimeZone.getDefault(), Locale.getDefault())
        .format(new Date(instant(value)));
  }
}
