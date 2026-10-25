package app.asechka.android;

import android.app.Activity;
import android.graphics.*;
import android.os.Build;
import android.view.*;
import java.util.*;

/** One non-interactive application window, rendered on display vsync with cached sprites. */
class HeartOverlay extends View implements Choreographer.FrameCallback {
  static final int LIMIT = 96;

  static final class Particle {
    double born;
    float x, y, phase, size, duration;
    int color;
  }

  final ArrayList<Particle> particles = new ArrayList<>();
  final Random random = new Random();
  final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
  final RectF target = new RectF();
  final Bitmap[] sprites = new Bitmap[3];
  final WindowManager manager;
  final Activity activity;
  boolean running;
  long frames;
  WindowManager.LayoutParams windowParams;

  HeartOverlay(Activity activity) {
    super(activity);
    this.activity = activity;
    manager = activity.getWindowManager();
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    setWillNotDraw(false);
    int pixels = Math.round(48 * getResources().getDisplayMetrics().density);
    Path path = new Path();
    path.moveTo(0, 18);
    path.cubicTo(-5, 12, -22, 2, -20, -9);
    path.cubicTo(-18, -24, -4, -24, 0, -13);
    path.cubicTo(4, -24, 18, -24, 20, -9);
    path.cubicTo(22, 2, 5, 12, 0, 18);
    path.close();
    int[] colors = {0xffa18bd3, 0xff889fce, 0xffd393bd};
    for (int i = 0; i < sprites.length; i++) {
      sprites[i] = Bitmap.createBitmap(pixels, pixels, Bitmap.Config.ARGB_8888);
      Canvas c = new Canvas(sprites[i]);
      c.translate(pixels / 2f, pixels / 2f);
      c.scale(pixels / 48f, pixels / 48f);
      paint.setColor(colors[i]);
      c.drawPath(path, paint);
    }
  }

  void emit(View anchor) {
    if (!running) {
      WindowManager.LayoutParams params =
          new WindowManager.LayoutParams(
              -1,
              -1,
              WindowManager.LayoutParams.TYPE_APPLICATION,
              WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                  | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                  | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                  | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                  | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
              PixelFormat.TRANSLUCENT);
      params.gravity = Gravity.TOP | Gravity.LEFT;
      params.preferredRefreshRate = 60;
      params.setTitle("Floating hearts");
      if (Build.VERSION.SDK_INT >= 28)
        params.layoutInDisplayCutoutMode =
            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      if (Build.VERSION.SDK_INT >= 30) params.setFitInsetsTypes(0);
      windowParams = params;
      manager.addView(this, params);
      running = true;
      Choreographer.getInstance().postFrameCallback(this);
    }
    int[] point = new int[2];
    anchor.getLocationOnScreen(point);
    Particle p = new Particle();
    p.born = System.nanoTime() / 1e9;
    p.x = point[0] + anchor.getWidth() * (.3f + random.nextFloat() * .4f);
    p.y = point[1] + anchor.getHeight() * .5f;
    p.phase = random.nextFloat() * 6.283f;
    p.size = (20 + random.nextFloat() * 15) * getResources().getDisplayMetrics().density;
    p.duration = 2.0f + random.nextFloat() * .45f;
    p.color = random.nextInt(sprites.length);
    if (particles.size() >= LIMIT) particles.remove(0);
    particles.add(p);
  }

  void raise() {
    if (!running) return;
    manager.removeViewImmediate(this);
    manager.addView(this, windowParams);
  }

  @Override
  public void doFrame(long time) {
    double now = time / 1e9;
    for (int i = particles.size() - 1; i >= 0; i--)
      if (now - particles.get(i).born >= particles.get(i).duration) particles.remove(i);
    if (particles.isEmpty()) {
      stop();
      return;
    }
    frames++;
    invalidate();
    Choreographer.getInstance().postFrameCallback(this);
  }

  @Override
  protected void onDraw(Canvas canvas) {
    double now = System.nanoTime() / 1e9;
    float density = getResources().getDisplayMetrics().density;
    for (Particle p : particles) {
      float t = (float) ((now - p.born) / p.duration);
      if (t < 0 || t >= 1) continue;
      float x = p.x + (float) Math.sin(t * 7 + p.phase) * 26 * density;
      float y = p.y - t * (p.y + 90 * density);
      float size = p.size * (.6f + .4f * Math.min(1, t * 12));
      paint.setAlpha(Math.round(255 * Math.min(1, t * 15) * Math.min(1, (1 - t) * 4)));
      target.set(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
      int save = canvas.save();
      canvas.rotate((float) Math.sin(t * 5 + p.phase) * 14, x, y);
      canvas.drawBitmap(sprites[p.color], null, target, paint);
      canvas.restoreToCount(save);
    }
  }

  void stop() {
    Choreographer.getInstance().removeFrameCallback(this);
    particles.clear();
    if (running) {
      running = false;
      manager.removeViewImmediate(this);
    }
  }
}
