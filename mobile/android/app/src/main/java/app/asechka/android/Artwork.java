package app.asechka.android;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.BitmapDrawable;
import android.util.LruCache;
import android.widget.ImageView;

/** Locally bundled PNG art, decoded to bounded display sizes rather than full source resolution. */
final class Artwork {
  private static final LruCache<String, Bitmap> cache =
      new LruCache<String, Bitmap>(8 * 1024 * 1024) {
        protected int sizeOf(String key, Bitmap bitmap) {
          return bitmap.getAllocationByteCount();
        }
      };

  static Bitmap bitmap(Context c, int id) {
    return bitmap(c, id, false);
  }

  static Bitmap bitmap(Context c, int id, boolean large) {
    String key = id + ":" + large;
    Bitmap hit = cache.get(key);
    if (hit != null) return hit;
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inJustDecodeBounds = true;
    BitmapFactory.decodeResource(c.getResources(), id, options);
    int limit = large ? 512 : 256;
    options.inSampleSize = 1;
    while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > limit)
      options.inSampleSize *= 2;
    options.inJustDecodeBounds = false;
    Bitmap result = BitmapFactory.decodeResource(c.getResources(), id, options);
    if (result != null) cache.put(key, result);
    return result;
  }

  static ImageView view(Context c, int id) {
    ImageView view = new ImageView(c);
    view.setScaleType(ImageView.ScaleType.FIT_CENTER);
    view.setImageBitmap(bitmap(c, id));
    view.setImportantForAccessibility(android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    return view;
  }

  static BitmapDrawable drawable(Context c, int id, int dp) {
    BitmapDrawable drawable = new BitmapDrawable(c.getResources(), bitmap(c, id));
    int size = Math.round(dp * c.getResources().getDisplayMetrics().density);
    drawable.setBounds(0, 0, size, size);
    return drawable;
  }

  static int section(int index) {
    return new int[] {
          R.drawable.art_our_home,
          R.drawable.art_photo_moments,
          R.drawable.art_our_music,
          R.drawable.art_our_days,
          R.drawable.art_translate_words,
          R.drawable.art_quote_words
        }
        [index];
  }

  static int shortcut(int index) {
    return new int[] {
          R.drawable.art_secret_words,
          R.drawable.art_open_letter,
          R.drawable.art_little_victories,
          R.drawable.art_recipes_two,
          R.drawable.art_kept_close,
          R.drawable.art_our_beginning
        }
        [index];
  }

  static int story(int index) {
    return new int[] {
          R.drawable.art_photo_moments,
          R.drawable.art_send_love,
          R.drawable.art_shared_streak,
          R.drawable.art_our_music,
          R.drawable.art_kept_close
        }
        [index];
  }
}
