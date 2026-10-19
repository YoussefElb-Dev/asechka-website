package app.asechka.android;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Build;
import android.provider.Settings;
import android.widget.TextView;
import java.util.*;

/** Small platform fallbacks; the APK needs no CPU-specific libraries or Google Play services. */
final class Compat {
  interface Consumer<T> {
    void accept(T value);
  }

  private static final Map<String, Typeface> FONTS = new HashMap<>();

  static boolean animatorsEnabled(Context context) {
    if (Build.VERSION.SDK_INT >= 26) return ValueAnimator.areAnimatorsEnabled();
    return Settings.Global.getFloat(
            context.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        != 0;
  }

  static int wrap(int value, int length) {
    return (value % length + length) % length;
  }

  static void font(TextView view, int resource, int weight) {
    Context context = view.getContext();
    if (Build.VERSION.SDK_INT >= 26) {
      view.setTypeface(context.getResources().getFont(resource));
      view.setFontVariationSettings("'wght' " + weight);
    } else {
      String family =
          resource == R.font.manrope ? "manrope" : resource == R.font.caveat ? "caveat" : "dm_sans";
      String name = family + "-" + weight;
      synchronized (FONTS) {
        Typeface typeface = FONTS.get(name);
        if (typeface == null) {
          typeface = Typeface.createFromAsset(context.getAssets(), "fonts/" + name + ".ttf");
          FONTS.put(name, typeface);
        }
        view.setTypeface(typeface);
      }
    }
  }
}
