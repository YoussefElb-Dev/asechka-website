package app.asechka.android;

import android.content.Context;
import android.graphics.*;
import android.util.SparseArray;
import android.view.View;
import java.io.*;

/** The same original cover is used on cards, invitations and both native platforms. */
final class GamesArt extends View {
  private static final SparseArray<Bitmap> covers = new SparseArray<>();
  private final Bitmap cover;
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
  private final RectF destination = new RectF();

  GamesArt(Context context, int game) {
    super(context);
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    Bitmap image = covers.get(game);
    if (image == null) {
      try (InputStream input = context.getAssets().open("default/games/covers/" + GamesData.IDS[game] + ".png")) {
        image = BitmapFactory.decodeStream(input);
        if (image == null) throw new IOException("Invalid bundled game cover");
        covers.put(game, image);
      } catch (IOException failure) {
        throw new IllegalStateException("Missing bundled Games artwork", failure);
      }
    }
    cover = image;
  }

  @Override protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    float scale = Math.min(getWidth() / (float) cover.getWidth(), getHeight() / (float) cover.getHeight());
    float width = cover.getWidth() * scale, height = cover.getHeight() * scale;
    destination.set((getWidth() - width) / 2, (getHeight() - height) / 2, (getWidth() + width) / 2, (getHeight() + height) / 2);
    canvas.drawBitmap(cover, null, destination, paint);
  }
}
