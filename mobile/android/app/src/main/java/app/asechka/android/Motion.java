package app.asechka.android;

import android.animation.*;
import android.content.*;
import android.graphics.*;
import android.view.*;
import android.view.animation.*;
import android.widget.*;
import java.util.*;

/** One motion language; native properties, system haptics, and no work for invisible pictures. */
final class Motion {
  private static final Set<View> bound = Collections.newSetFromMap(new WeakHashMap<>());
  private static final Set<View> revealed = Collections.newSetFromMap(new WeakHashMap<>());
  static final android.view.animation.Interpolator EASE = new PathInterpolator(.2f, 0f, 0f, 1f);

  static void customTouch(View view) {
    bound.add(view);
  }

  static boolean enabled(Context c) {
    return Compat.animatorsEnabled(c)
        && !c.getSharedPreferences("preferences", 0).getBoolean("motion-paused", false);
  }

  static void haptic(View v, boolean success) {
    if (v.getContext().getSharedPreferences("preferences", 0).getBoolean("haptics", true))
      v.performHapticFeedback(
          success && android.os.Build.VERSION.SDK_INT >= 30
              ? HapticFeedbackConstants.CONFIRM
              : HapticFeedbackConstants.CLOCK_TICK);
  }

  static void install(View view) {
    if ((view.isClickable() || view instanceof Spinner)
        && !(view instanceof EditText)
        && !(view instanceof Ui.ZoomImage)
        && bound.add(view)) {
      view.setOnTouchListener(
          (v, e) -> {
            if (!v.isEnabled()) return false;
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
              if (enabled(v.getContext()))
                v.animate()
                    .scaleX(.96f)
                    .scaleY(.96f)
                    .setStartDelay(0)
                    .setDuration(100)
                    .setInterpolator(EASE)
                    .start();
            } else if (e.getActionMasked() == MotionEvent.ACTION_UP
                || e.getActionMasked() == MotionEvent.ACTION_CANCEL) {
              if (e.getActionMasked() == MotionEvent.ACTION_UP
                  && e.getX() >= 0
                  && e.getX() < v.getWidth()
                  && e.getY() >= 0
                  && e.getY() < v.getHeight()) haptic(v, false);
              v.animate()
                  .scaleX(1)
                  .scaleY(1)
                  .setDuration(enabled(v.getContext()) ? 280 : 0)
                  .setInterpolator(new OvershootInterpolator(1.2f))
                  .start();
            }
            return false;
          });
      view.addOnAttachStateChangeListener(
          new View.OnAttachStateChangeListener() {
            public void onViewAttachedToWindow(View v) {}

            public void onViewDetachedFromWindow(View v) {
              v.animate().cancel();
              v.setScaleX(1);
              v.setScaleY(1);
              v.setAlpha(1);
            }
          });
    }
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) install(group.getChildAt(i));
    }
  }

  static void layout(ViewGroup group) {
    if (!enabled(group.getContext()) || !group.isLaidOut()) return;
    android.transition.AutoTransition transition = new android.transition.AutoTransition();
    transition.setDuration(280);
    transition.setInterpolator(EASE);
    android.transition.TransitionManager.beginDelayedTransition(group, transition);
  }

  static void hearts(View anchor) {
    if (!enabled(anchor.getContext())) return;
    View decor = anchor.getRootView();
    if (!(decor instanceof ViewGroup)) return;
    ViewGroup root = (ViewGroup) decor;
    View burst =
        new View(anchor.getContext()) {
          final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
          float progress;
          final ValueAnimator animator = ValueAnimator.ofFloat(0, 1);

          {
            animator.setDuration(1000);
            animator.setInterpolator(new DecelerateInterpolator());
            animator.addUpdateListener(
                a -> {
                  progress = (float) a.getAnimatedValue();
                  invalidate();
                });
            animator.addListener(
                new AnimatorListenerAdapter() {
                  public void onAnimationEnd(Animator a) {
                    root.getOverlay().remove(thisView());
                  }
                });
          }

          View thisView() {
            return this;
          }

          protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            animator.start();
          }

          protected void onDetachedFromWindow() {
            animator.cancel();
            super.onDetachedFromWindow();
          }

          protected void onDraw(Canvas c) {
            float d = getResources().getDisplayMetrics().density;
            for (int i = 0; i < 9; i++) {
              double angle = i * Math.PI * 2 / 9;
              float radius = (30 + progress * 110) * d;
              p.setColor(i % 2 == 0 ? Ui.PURPLE : 0xff98b9de);
              p.setAlpha((int) (255 * (1 - progress)));
              p.setTextAlign(Paint.Align.CENTER);
              p.setTextSize((18 + i % 3 * 5) * d);
              c.drawText(
                  "♡",
                  getWidth() / 2f + (float) Math.cos(angle) * radius,
                  getHeight() * .45f + (float) Math.sin(angle) * radius - progress * 60 * d,
                  p);
            }
          }
        };
    burst.layout(0, 0, root.getWidth(), root.getHeight());
    root.getOverlay().add(burst);
  }

  static void enter(View view, int direction) {
    view.animate().cancel();
    view.animate().setStartDelay(0);
    if (!enabled(view.getContext())) {
      view.setAlpha(1);
      view.setTranslationX(0);
      return;
    }
    view.setAlpha(.35f);
    view.setTranslationX(direction * 22 * view.getResources().getDisplayMetrics().density);
    view.animate().alpha(1).translationX(0).setDuration(340).setInterpolator(EASE).start();
  }

  static void reveal(LinearLayout content, ScrollView scroll) {
    if (!enabled(content.getContext()) || !content.isLaidOut() || scroll.getHeight() <= 0) return;
    int top = scroll.getScrollY(), end = top + scroll.getHeight();
    int stagger = 0;
    for (int i = 0; i < content.getChildCount(); i++) {
      View child = content.getChildAt(i);
      if (child.getBottom() < top || child.getTop() > end || !revealed.add(child)) continue;
      child.setAlpha(0);
      child.setTranslationY(14 * child.getResources().getDisplayMetrics().density);
      child
          .animate()
          .alpha(1)
          .translationY(0)
          .setStartDelay(Math.min(stagger++ * 35, 140))
          .setDuration(420)
          .setInterpolator(EASE)
          .start();
    }
  }

  static void change(TextView view, String text, int direction) {
    view.animate().cancel();
    view.animate().setStartDelay(0);
    if (!enabled(view.getContext()) || view.getText().length() == 0) {
      view.setText(text);
      view.setAlpha(1);
      view.setTranslationX(0);
      return;
    }
    float distance = 24 * view.getResources().getDisplayMetrics().density;
    view.animate()
        .alpha(0)
        .translationX(-direction * distance)
        .setDuration(150)
        .setInterpolator(EASE)
        .withEndAction(
            () -> {
              view.setText(text);
              view.setTranslationX(direction * distance);
              view.animate()
                  .alpha(1)
                  .translationX(0)
                  .setDuration(330)
                  .setInterpolator(EASE)
                  .start();
            })
        .start();
  }

  static final class LivingQuote extends TextView {
    final Rect visible = new Rect();

    LivingQuote(Context c) {
      super(c);
    }

    protected void onDraw(Canvas canvas) {
      boolean moving =
          hasWindowFocus() && isShown() && enabled(getContext()) && getGlobalVisibleRect(visible);
      int save = canvas.save();
      if (moving)
        canvas.translate(
            0,
            (float) Math.sin(android.os.SystemClock.uptimeMillis() / 2600d)
                * getResources().getDisplayMetrics().density
                * 1.4f);
      super.onDraw(canvas);
      canvas.restoreToCount(save);
      if (moving) postInvalidateDelayed(40);
    }

    public void onWindowFocusChanged(boolean focus) {
      super.onWindowFocusChanged(focus);
      invalidate();
    }
  }

  /** A slow pan inside the image's clipping bounds, not a layout animation. */
  static final class LivingImage extends ImageView {
    boolean scrolling;
    private float aspect = 4f / 3f;

    void aspect(float next) {
      if (next > 0 && Math.abs(next - aspect) > .001f) {
        aspect = next;
        requestLayout();
      }
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
      int width = MeasureSpec.getSize(widthSpec);
      if (width > 0) {
        setMeasuredDimension(width, resolveSize(Math.round(width / aspect), heightSpec));
      } else super.onMeasure(widthSpec, heightSpec);
    }

    private final Rect visible = new Rect();
    private final long phase = (long) (Math.random() * 12000);

    LivingImage(Context c) {
      super(c);
    }

    @Override
    protected void onDraw(Canvas canvas) {
      boolean moving =
          !scrolling
              && getDrawable() instanceof android.graphics.drawable.BitmapDrawable
              && hasWindowFocus()
              && isShown()
              && enabled(getContext())
              && getGlobalVisibleRect(visible)
              && visible.height() > getHeight() / 5;
      int save = canvas.save();
      if (moving) {
        double t = (android.os.SystemClock.uptimeMillis() + phase) / 6500d;
        canvas.clipRect(0, 0, getWidth(), getHeight());
        canvas.scale(1.045f, 1.045f, getWidth() / 2f, getHeight() / 2f);
        canvas.translate(
            (float) Math.sin(t) * getWidth() * .012f,
            (float) Math.cos(t * .8) * getHeight() * .012f);
      }
      super.onDraw(canvas);
      canvas.restoreToCount(save);
      if (moving) postInvalidateDelayed(33);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
      super.onWindowFocusChanged(focus);
      invalidate();
    }
  }
}
