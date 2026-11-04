package app.asechka.android;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Read-only, temporary URI grants expose exactly one verified APK to Android's installer. */
public final class UpdateProvider extends ContentProvider {
  public boolean onCreate() { return true; }
  private File file(Uri uri) throws FileNotFoundException {
    if (!"/apk".equals(uri.getPath()) || uri.getQuery() != null) throw new FileNotFoundException();
    return new File(getContext().getCacheDir(), "app-update.apk");
  }
  public String getType(Uri uri) { return "application/vnd.android.package-archive"; }
  public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    if (!"r".equals(mode)) throw new FileNotFoundException("Read only");
    return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
  }
  public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order) {
    try {
      File apk = file(uri);
      String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE} : projection;
      MatrixCursor cursor = new MatrixCursor(columns); Object[] row = new Object[columns.length];
      for(int i=0;i<columns.length;i++) row[i] = OpenableColumns.DISPLAY_NAME.equals(columns[i]) ? "Asechka-update.apk" : OpenableColumns.SIZE.equals(columns[i]) ? apk.length() : null;
      cursor.addRow(row); return cursor;
    } catch (FileNotFoundException e) { return null; }
  }
  public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
  public int delete(Uri uri,String where,String[] args) { throw new UnsupportedOperationException(); }
  public int update(Uri uri,ContentValues values,String where,String[] args) { throw new UnsupportedOperationException(); }
}
