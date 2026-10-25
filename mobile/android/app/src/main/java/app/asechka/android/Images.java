package app.asechka.android;

import android.graphics.*;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.TransitionDrawable;
import android.os.*;
import android.util.LruCache;
import android.widget.ImageView;
import java.lang.ref.WeakReference;
import java.util.*;
import java.util.concurrent.*;

/** Shared requests, bounded decode sizes, encrypted originals, and a visible retry state. */
final class Images {
  private final ApiClient api;
  private final ExecutorService executor = Executors.newFixedThreadPool(3);
  private final Handler main = new Handler(Looper.getMainLooper());
  private final Map<String, List<WeakReference<ImageView>>> waiting = new HashMap<>();
  private final LruCache<String, Bitmap> cache =
      new LruCache<String, Bitmap>(32 * 1024 * 1024) {
        protected int sizeOf(String key, Bitmap value) {
          return value.getAllocationByteCount();
        }
      };
  private volatile int epoch;

  Images(ApiClient api) {
    this.api = api;
  }

  void clear() {
    epoch++;
    cache.evictAll();
    waiting.clear();
  }

  void close() {
    clear();
    executor.shutdownNow();
  }

  void load(String url, ImageView target) {
    if (url == null || url.isEmpty()) {
      target.setImageDrawable(new Placeholder("No picture yet"));
      return;
    }
    String key = url + (target instanceof Ui.ZoomImage ? "#full" : "#preview");
    target.setTag(key);
    Bitmap stored = cache.get(key);
    if (stored != null) {
      show(target, stored, key);
      return;
    }
    if (!(target.getDrawable() instanceof BitmapDrawable)
        && !(target.getDrawable() instanceof TransitionDrawable))
      target.setImageDrawable(
          url.startsWith("assets/quote-backgrounds/")
              ? new android.graphics.drawable.ColorDrawable(Ui.BLUE)
              : new Placeholder("Opening this little moment…"));
    List<WeakReference<ImageView>> listeners = waiting.get(key);
    if (listeners != null) {
      listeners.add(new WeakReference<>(target));
      return;
    }
    listeners = new ArrayList<>();
    listeners.add(new WeakReference<>(target));
    waiting.put(key, listeners);
    int generation = epoch;
    executor.execute(
        () -> {
          Bitmap decoded = null;
          try {
            byte[] bytes = api.image(url);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0
                || bounds.outHeight <= 0
                || (long) bounds.outWidth * bounds.outHeight > 60000000)
              throw new java.io.IOException();
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            int limit = target instanceof Ui.ZoomImage ? 2200 : 1200;
            while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > limit)
              options.inSampleSize *= 2;
            decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
          } catch (Exception error) {
            android.util.Log.w(
                "AsechkaImages",
                "Picture could not be loaded: " + error.getClass().getSimpleName());
          }
          Bitmap result = decoded;
          main.post(
              () -> {
                if (generation != epoch) return;
                List<WeakReference<ImageView>> targets = waiting.remove(key);
                if (targets == null) return;
                if (result != null) cache.put(key, result);
                for (WeakReference<ImageView> ref : targets) {
                  ImageView image = ref.get();
                  if (image == null || !key.equals(image.getTag())) continue;
                  if (result != null) {
                    show(image, result, key);
                  } else {
                    image.setImageDrawable(new Placeholder("Picture unavailable · tap to retry"));
                    if (!image.hasOnClickListeners())
                      image.setOnClickListener(v -> load(url, image));
                    Motion.install(image);
                  }
                }
              });
        });
  }

  private void show(ImageView target, Bitmap bitmap, String key) {
    Drawable old = target.getDrawable();
    if (old instanceof BitmapDrawable && ((BitmapDrawable) old).getBitmap() == bitmap) return;
    if (old != null && target.isAttachedToWindow() && Motion.enabled(target.getContext())) {
      TransitionDrawable crossfade =
          new TransitionDrawable(
              new Drawable[] {old, new BitmapDrawable(target.getResources(), bitmap)});
      crossfade.setCrossFadeEnabled(true);
      target.setImageDrawable(crossfade);
      crossfade.startTransition(420);
      main.postDelayed(
          () -> {
            if (key.equals(target.getTag()) && target.getDrawable() == crossfade) {
              target.setImageBitmap(bitmap);
              target.invalidate();
            }
          },
          440);
    } else {
      target.setImageBitmap(bitmap);
      target.invalidate();
    }
  }

  private static final class Placeholder extends Drawable {
    final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    final String message;

    Placeholder(String message) {
      this.message = message;
    }

    public void draw(Canvas canvas) {
      Rect b = getBounds();
      paint.setColor(Ui.PALE);
      canvas.drawRect(b, paint);
      paint.setColor(Ui.PURPLE);
      paint.setTextAlign(Paint.Align.CENTER);
      paint.setTextSize(Math.max(12, b.width() / 28f));
      canvas.drawText("♡", b.exactCenterX(), b.exactCenterY() - 16, paint);
      canvas.drawText(message, b.exactCenterX(), b.exactCenterY() + 16, paint);
    }

    public void setAlpha(int alpha) {
      paint.setAlpha(alpha);
    }

    public void setColorFilter(ColorFilter filter) {
      paint.setColorFilter(filter);
    }

    public int getOpacity() {
      return PixelFormat.OPAQUE;
    }
  }
}
