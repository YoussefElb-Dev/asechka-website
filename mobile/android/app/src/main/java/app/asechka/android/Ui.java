package app.asechka.android;

import android.app.*;
import android.content.*;
import android.content.res.ColorStateList;
import android.graphics.*;
import android.graphics.drawable.*;
import android.text.InputFilter;
import android.view.*;
import android.widget.*;

final class Ui {
  static final int INK = Color.rgb(38, 52, 81),
      MUTED = Color.rgb(100, 112, 139),
      PURPLE = Color.rgb(107, 92, 181),
      PRIMARY = Color.rgb(101, 87, 159);
  static final int BG = Color.rgb(247, 249, 255),
      PALE = Color.rgb(238, 235, 248),
      BLUE = Color.rgb(234, 241, 252),
      LINE = Color.rgb(217, 225, 240);
  final Context c;

  Ui(Context c) {
    this.c = c;
  }

  int dp(float value) {
    return Math.round(value * c.getResources().getDisplayMetrics().density);
  }

  LinearLayout column() {
    LinearLayout v =
        new LinearLayout(c) {
          @Override
          protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            Motion.install(this);
          }
        };
    v.setOrientation(LinearLayout.VERTICAL);
    return v;
  }

  LinearLayout row() {
    return row(10);
  }

  LinearLayout row(int spacing) {
    LinearLayout v =
        new LinearLayout(c) {
          @Override
          public void addView(View child, int index, android.view.ViewGroup.LayoutParams params) {
            if (getChildCount() > 0
                && params instanceof android.view.ViewGroup.MarginLayoutParams) {
              android.view.ViewGroup.MarginLayoutParams margins =
                  (android.view.ViewGroup.MarginLayoutParams) params;
              margins.setMarginStart(Math.max(margins.getMarginStart(), dp(spacing)));
            }
            super.addView(child, index, params);
          }
        };
    v.setGravity(Gravity.CENTER_VERTICAL);
    return v;
  }

  LinearLayout actions() {
    if (c.getResources().getConfiguration().screenWidthDp >= 370
        && c.getResources().getConfiguration().fontScale <= 1.2f) return row();
    LinearLayout layout =
        new LinearLayout(c) {
          @Override
          public void addView(View child, int index, android.view.ViewGroup.LayoutParams params) {
            LinearLayout.LayoutParams stacked = new LinearLayout.LayoutParams(-1, -2);
            if (getChildCount() > 0) stacked.topMargin = dp(10);
            super.addView(child, index, stacked);
          }
        };
    layout.setOrientation(LinearLayout.VERTICAL);
    return layout;
  }

  GradientDrawable shape(int color, float radius) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(color);
    d.setCornerRadius(dp(radius));
    return d;
  }

  TextView text(String value, int size, int color) {
    TextView v = new TextView(c);
    v.setText(value);
    v.setTextSize(size);
    v.setTextColor(color);
    Compat.font(v, R.font.dm_sans, 400);
    v.setLineSpacing(dp(3), 1);
    v.setFontFeatureSettings("kern");
    return v;
  }

  TextView title(String value, int size) {
    TextView v = text(value, size, INK);
    Compat.font(v, R.font.manrope, 750);
    return v;
  }

  TextView handwritten(String value, int size) {
    TextView view = text(value, size, INK);
    Compat.font(view, R.font.caveat, 500);
    return view;
  }

  TextView quote(String text, int size) {
    TextView v = new Motion.LivingQuote(c);
    v.setText(text);
    v.setTextSize(size);
    v.setTextColor(INK);
    Compat.font(v, R.font.manrope, 400);
    v.setLineSpacing(dp(5), 1);
    v.setPadding(dp(3), dp(5), dp(3), dp(5));
    return v;
  }

  TextView label(String value) {
    TextView v = text(value.toUpperCase(java.util.Locale.ROOT), 10, PURPLE);
    v.setLetterSpacing(.13f);
    Compat.font(v, R.font.manrope, 700);
    return v;
  }

  void add(LinearLayout parent, View view, int top) {
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.topMargin = dp(top);
    parent.addView(view, p);
  }

  void gap(LinearLayout parent, int height) {
    View v = new View(c);
    parent.addView(v, new LinearLayout.LayoutParams(1, dp(height)));
  }

  LinearLayout card(LinearLayout parent, int color) {
    LinearLayout v = column();
    v.setPadding(dp(20), dp(20), dp(20), dp(20));
    v.setBackground(shape(color, 24));
    add(parent, v, 16);
    return v;
  }

  Button button(String title, boolean primary, Runnable action) {
    Button v =
        new Button(c) {
          @Override
          public void setEnabled(boolean enabled) {
            super.setEnabled(enabled);
            setAlpha(enabled ? 1f : .45f);
          }
        };
    v.setText(title);
    v.setAllCaps(false);
    v.setTextSize(14);
    Compat.font(v, R.font.dm_sans, 650);
    v.setTextColor(primary ? Color.WHITE : PURPLE);
    v.setMinHeight(dp(48));
    v.setMinimumHeight(dp(48));
    v.setPadding(dp(14), dp(12), dp(14), dp(12));
    v.setBackground(
        new RippleDrawable(
            ColorStateList.valueOf(0x226b5cb5), shape(primary ? PRIMARY : PALE, 16), null));
    v.setStateListAnimator(null);
    if (action != null) v.setOnClickListener(w -> action.run());
    return v;
  }

  EditText input(String hint, String value, int max, boolean multiline) {
    EditText v = new EditText(c);
    v.setTextSize(16);
    Compat.font(v, R.font.dm_sans, 400);
    v.setTextColor(INK);
    v.setHintTextColor(MUTED);
    v.setHint(hint);
    v.setText(value);
    v.setPadding(dp(14), dp(13), dp(14), dp(13));
    v.setBackground(shape(BG, 12));
    v.setMinHeight(dp(52));
    v.setFilters(new InputFilter[] {new InputFilter.LengthFilter(max)});
    v.setSingleLine(!multiline);
    v.setInputType(
        android.text.InputType.TYPE_CLASS_TEXT
            | (multiline
                ? android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
                    | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                : android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES));
    if (multiline) {
      v.setMinLines(3);
      v.setGravity(Gravity.TOP | Gravity.START);
    }
    return v;
  }

  Spinner spinner(String[] choices, int selected) {
    Spinner v = new Spinner(c);
    ArrayAdapter<String> adapter =
        new ArrayAdapter<String>(c, android.R.layout.simple_spinner_dropdown_item, choices) {
          private View font(View view) {
            if (view instanceof TextView) {
              Compat.font((TextView) view, R.font.dm_sans, 400);
              ((TextView) view).setTextColor(INK);
              ((TextView) view).setTextSize(15);
            }
            return view;
          }

          public View getView(int position, View convert, ViewGroup parent) {
            return font(super.getView(position, convert, parent));
          }

          public View getDropDownView(int position, View convert, ViewGroup parent) {
            return font(super.getDropDownView(position, convert, parent));
          }
        };
    v.setAdapter(adapter);
    v.setSelection(selected);
    v.setMinimumHeight(dp(48));
    v.setBackgroundTintList(ColorStateList.valueOf(PURPLE));
    return v;
  }

  ImageView image(LinearLayout parent, String description, int height) {
    ImageView view = new Motion.LivingImage(c);
    view.setContentDescription(description);
    view.setScaleType(ImageView.ScaleType.CENTER_CROP);
    view.setBackground(shape(PALE, 16));
    view.setClipToOutline(true);
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(height));
    p.topMargin = dp(12);
    parent.addView(view, p);
    return view;
  }

  ScrollView scroll(LinearLayout content) {
    ScrollView s = new ScrollView(c);
    s.setFillViewport(true);
    s.setClipToPadding(false);
    s.addView(content);
    return s;
  }

  static final class Icon extends View {
    private final Paint p = new Paint(3);
    private final int kind, color;

    Icon(Context context, int kind, int color) {
      super(context);
      this.kind = kind;
      this.color = color;
      setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    protected void onDraw(Canvas canvas) {
      super.onDraw(canvas);
      canvas.save();
      canvas.scale(getWidth() / 24f, getHeight() / 24f);
      p.setColor(color);
      p.setStyle(Paint.Style.STROKE);
      p.setStrokeWidth(1.7f);
      p.setStrokeCap(Paint.Cap.ROUND);
      p.setStrokeJoin(Paint.Join.ROUND);
      Path q = new Path();
      if (kind == 0) {
        q.moveTo(3, 10);
        q.lineTo(12, 3);
        q.lineTo(21, 10);
        q.moveTo(5, 9);
        q.lineTo(5, 21);
        q.lineTo(10, 21);
        q.lineTo(10, 14);
        q.lineTo(14, 14);
        q.lineTo(14, 21);
        q.lineTo(19, 21);
        q.lineTo(19, 9);
        canvas.drawPath(q, p);
      }
      if (kind == 1) {
        canvas.drawRoundRect(3, 4, 21, 21, 3, 3, p);
        canvas.drawCircle(8, 9, 1.5f, p);
        q.moveTo(3, 17);
        q.lineTo(10, 12);
        q.lineTo(15, 17);
        q.lineTo(18, 14);
        q.lineTo(21, 17);
        canvas.drawPath(q, p);
      }
      if (kind == 2) {
        q.moveTo(10, 18);
        q.lineTo(10, 5);
        q.lineTo(20, 3);
        q.lineTo(20, 16);
        canvas.drawPath(q, p);
        canvas.drawOval(4, 16, 10, 21, p);
        canvas.drawOval(14, 14, 20, 19, p);
        q.moveTo(10, 9);
        q.lineTo(20, 7);
        canvas.drawPath(q, p);
      }
      if (kind == 3) {
        q.moveTo(12, 21);
        q.cubicTo(-7, 8, 6, -1, 12, 7);
        q.cubicTo(18, -1, 31, 8, 12, 21);
        canvas.drawPath(q, p);
      }
      if (kind == 5) {
        canvas.drawCircle(8, 9, 3, p);
        canvas.drawCircle(17, 9, 3, p);
        q.moveTo(11, 10);
        q.quadTo(11, 17, 5, 18);
        q.moveTo(20, 10);
        q.quadTo(20, 17, 14, 18);
        canvas.drawPath(q, p);
      }
      if (kind == 4) {
        canvas.drawRoundRect(2, 3, 22, 19, 4, 4, p);
        q.moveTo(7, 19);
        q.lineTo(7, 23);
        q.lineTo(12, 19);
        canvas.drawPath(q, p);
        p.setTextSize(11);
        p.setStyle(Paint.Style.FILL);
        p.setTypeface(Typeface.DEFAULT_BOLD);
        canvas.drawText("Aя", 5, 15, p);
      }
      if (kind == 6) {
        q.moveTo(12, 1);
        q.cubicTo(13, 8, 16, 11, 23, 12);
        q.cubicTo(16, 13, 13, 16, 12, 23);
        q.cubicTo(11, 16, 8, 13, 1, 12);
        q.cubicTo(8, 11, 11, 8, 12, 1);
        p.setStyle(Paint.Style.FILL);
        canvas.drawPath(q, p);
      }
      canvas.restore();
    }
  }

  static final class ZoomImage extends ImageView {
    private float zoom = 1, dx, dy, lastX, lastY;
    private final ScaleGestureDetector scale;

    ZoomImage(Context context) {
      super(context);
      setScaleType(ScaleType.FIT_CENTER);
      scale =
          new ScaleGestureDetector(
              context,
              new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                public boolean onScale(ScaleGestureDetector detector) {
                  zoom = Math.max(1, Math.min(5, zoom * detector.getScaleFactor()));
                  invalidate();
                  return true;
                }
              });
    }

    void reset() {
      zoom = 1;
      dx = dy = 0;
      invalidate();
    }

    protected void onDraw(Canvas c) {
      c.save();
      c.translate(dx, dy);
      c.scale(zoom, zoom, getWidth() / 2f, getHeight() / 2f);
      super.onDraw(c);
      c.restore();
    }

    public boolean onTouchEvent(android.view.MotionEvent e) {
      scale.onTouchEvent(e);
      if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
        lastX = e.getX();
        lastY = e.getY();
      } else if (e.getActionMasked() == MotionEvent.ACTION_MOVE
          && !scale.isInProgress()
          && zoom > 1) {
        dx += e.getX() - lastX;
        dy += e.getY() - lastY;
        float maxX = getWidth() * (zoom - 1) / 2, maxY = getHeight() * (zoom - 1) / 2;
        dx = Math.max(-maxX, Math.min(maxX, dx));
        dy = Math.max(-maxY, Math.min(maxY, dy));
        invalidate();
      }
      if (e.getActionMasked() == MotionEvent.ACTION_UP && zoom == 1 && hasOnClickListeners())
        performClick();
      lastX = e.getX();
      lastY = e.getY();
      if (zoom == 1) {
        dx = dy = 0;
      }
      return true;
    }
  }
}
