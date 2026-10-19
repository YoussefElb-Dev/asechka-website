package app.asechka.android;

import android.content.Context;
import android.graphics.*;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import java.io.*;

/** Keep modern format support, with bounded, EXIF-aware JPEG/PNG/WebP decoding on Android 6–8. */
final class Photos {
  static Bitmap decode(Context context, Uri uri) throws Exception {
    if (Build.VERSION.SDK_INT >= 28) return Modern.decode(context, uri);
    File file = File.createTempFile("upload-", ".image", context.getCacheDir());
    try {
      try (InputStream in = context.getContentResolver().openInputStream(uri);
          OutputStream out = new FileOutputStream(file)) {
        if (in == null) throw new IOException("Picture unavailable");
        byte[] buffer = new byte[8192];
        int count, total = 0;
        while ((count = in.read(buffer)) != -1) {
          total += count;
          if (total > 25000000) throw new IOException("Picture too large");
          out.write(buffer, 0, count);
        }
      }
      BitmapFactory.Options options = new BitmapFactory.Options();
      options.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(file.getPath(), options);
      if (options.outWidth <= 0
          || options.outHeight <= 0
          || (long) options.outWidth * options.outHeight > 100000000L)
        throw new IOException("Invalid picture");
      options.inSampleSize = 1;
      while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 1600)
        options.inSampleSize *= 2;
      options.inJustDecodeBounds = false;
      options.inPreferredConfig = Bitmap.Config.ARGB_8888;
      Bitmap decoded = BitmapFactory.decodeFile(file.getPath(), options);
      if (decoded == null) throw new IOException("Invalid picture");
      Matrix orientation = new Matrix();
      int exif = ExifInterface.ORIENTATION_NORMAL;
      try {
        exif =
            new ExifInterface(file.getPath())
                .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
      } catch (IOException ignored) {
      }
      switch (exif) {
        case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
          orientation.setScale(-1, 1);
          break;
        case ExifInterface.ORIENTATION_ROTATE_180:
          orientation.setRotate(180);
          break;
        case ExifInterface.ORIENTATION_FLIP_VERTICAL:
          orientation.setScale(1, -1);
          break;
        case ExifInterface.ORIENTATION_TRANSPOSE:
          orientation.setRotate(90);
          orientation.postScale(-1, 1);
          break;
        case ExifInterface.ORIENTATION_ROTATE_90:
          orientation.setRotate(90);
          break;
        case ExifInterface.ORIENTATION_TRANSVERSE:
          orientation.setRotate(-90);
          orientation.postScale(-1, 1);
          break;
        case ExifInterface.ORIENTATION_ROTATE_270:
          orientation.setRotate(-90);
          break;
      }
      Bitmap rotated =
          Bitmap.createBitmap(
              decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), orientation, true);
      if (rotated != decoded) decoded.recycle();
      return rotated;
    } finally {
      file.delete();
    }
  }

  /** Isolates Android 9 classes so old runtimes never load their method signatures. */
  private static final class Modern {
    static Bitmap decode(Context context, Uri uri) throws Exception {
      android.graphics.ImageDecoder.Source source =
          android.graphics.ImageDecoder.createSource(context.getContentResolver(), uri);
      return android.graphics.ImageDecoder.decodeBitmap(
          source,
          (decoder, info, src) -> {
            int width = info.getSize().getWidth(), height = info.getSize().getHeight();
            if ((long) width * height > 100000000L) throw new IllegalArgumentException();
            float scale = Math.min(1, 1600f / Math.max(width, height));
            decoder.setTargetSize(
                Math.max(1, (int) (width * scale)), Math.max(1, (int) (height * scale)));
            decoder.setAllocator(android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE);
          });
    }
  }
}
