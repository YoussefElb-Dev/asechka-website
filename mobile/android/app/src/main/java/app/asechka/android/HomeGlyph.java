package app.asechka.android;

import android.content.Context;
import android.graphics.*;
import android.view.View;

/** Consistent native line artwork for the compact Home shortcuts. */
final class HomeGlyph extends View {
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path path = new Path();
  private final int kind, color;

  HomeGlyph(Context context, int kind, int color, int background) {
    super(context);
    this.kind = kind;
    this.color = color;
    setBackground(new Ui(context).shape(background, 10));
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    switch (kind) {
      case 0:
        path.moveTo(12, 6);
        path.cubicTo(8, 3, 5, 3, 2, 4);
        path.lineTo(2, 19);
        path.cubicTo(6, 18, 9, 18, 12, 21);
        path.cubicTo(15, 18, 18, 18, 22, 19);
        path.lineTo(22, 4);
        path.cubicTo(19, 3, 16, 3, 12, 6);
        path.lineTo(12, 21);
        path.moveTo(5, 8);
        path.lineTo(8, 9);
        path.moveTo(5, 12);
        path.lineTo(8, 13);
        path.moveTo(16, 9);
        path.lineTo(19, 8);
        path.moveTo(16, 13);
        path.lineTo(19, 12);
        break;
      case 1:
        path.addRoundRect(2, 5, 22, 20, 3, 3, Path.Direction.CW);
        path.moveTo(3, 7);
        path.lineTo(12, 13);
        path.lineTo(21, 7);
        break;
      case 2:
        path.moveTo(12, 2);
        path.cubicTo(13, 8, 16, 11, 22, 12);
        path.cubicTo(16, 13, 13, 16, 12, 22);
        path.cubicTo(11, 16, 8, 13, 2, 12);
        path.cubicTo(8, 11, 11, 8, 12, 2);
        path.close();
        break;
      case 3:
        path.moveTo(3, 3);
        path.lineTo(3, 8);
        path.cubicTo(3, 12, 10, 12, 10, 8);
        path.lineTo(10, 3);
        path.moveTo(6.5f, 3);
        path.lineTo(6.5f, 21);
        path.addOval(15, 3, 22, 12, Path.Direction.CW);
        path.moveTo(18.5f, 12);
        path.lineTo(18.5f, 21);
        break;
      case 4:
        path.moveTo(12, 21);
        path.cubicTo(8, 18, 2, 13, 2, 8);
        path.cubicTo(2, 2, 9, 2, 12, 7);
        path.cubicTo(15, 2, 22, 2, 22, 8);
        path.cubicTo(22, 13, 16, 18, 12, 21);
        path.close();
        break;
      case 5:
        path.moveTo(12, 12);
        path.cubicTo(7, 3, 2, 5, 2, 12);
        path.cubicTo(2, 19, 7, 21, 12, 12);
        path.cubicTo(17, 3, 22, 5, 22, 12);
        path.cubicTo(22, 19, 17, 21, 12, 12);
        break;
    }
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    float size = Math.min(getWidth(), getHeight()) * .62f;
    int save = canvas.save();
    canvas.translate((getWidth() - size) / 2, (getHeight() - size) / 2);
    canvas.scale(size / 24, size / 24);
    paint.setColor(color);
    paint.setStyle(kind == 2 ? Paint.Style.FILL : Paint.Style.STROKE);
    paint.setStrokeWidth(1.8f);
    paint.setStrokeCap(Paint.Cap.ROUND);
    paint.setStrokeJoin(Paint.Join.ROUND);
    canvas.drawPath(path, paint);
    canvas.restoreToCount(save);
  }
}
