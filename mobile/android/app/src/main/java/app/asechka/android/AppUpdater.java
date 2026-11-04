package app.asechka.android;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Sideload release updates, authenticated to the same private website as the app. */
final class AppUpdater {
  static final String ORIGIN = "https://asechka-website.vercel.app";
  static final String FEED = ORIGIN + "/updates/android.json";
  static final long MAX_BYTES = 200L * 1024 * 1024;
  final Activity activity;
  final Handler main = new Handler(Looper.getMainLooper());
  final ExecutorService worker = Executors.newSingleThreadExecutor();
  volatile boolean closed, cancel;
  boolean busy, waitingPermission, foreground;
  JSONObject release;
  AlertDialog dialog;
  AppUpdater(Activity activity) {
    this.activity = activity;
    try {
      JSONObject saved = new JSONObject(activity.getSharedPreferences("app-updates",0).getString("download","{}"));
      if (saved.optLong("versionCode") <= code(activity.getPackageManager().getPackageInfo(activity.getPackageName(),0))) {
        apk().delete(); activity.getSharedPreferences("app-updates",0).edit().remove("download").apply();
      }
    } catch (Exception ignored) { }
  }
  String version() {
    try { return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName; }
    catch (Exception e) { return ""; }
  }
  static long code(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
  File apk() { return new File(activity.getCacheDir(), "app-update.apk"); }
  void resume() {
    foreground = true;
    if (waitingPermission) {
      waitingPermission = false;
      if (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls()) install();
      else message("Update saved", "Allow updates from Asechka to continue. You can try again in App updates.");
    }
  }
  void check(boolean manual) {
    if (closed || busy) return;
    android.content.SharedPreferences prefs = activity.getSharedPreferences("app-updates", 0);
    if (!manual && System.currentTimeMillis() - prefs.getLong("checked", 0) < 6*60*60*1000) return;
    busy = true;
    if (manual) Toast.makeText(activity, "Checking for app updates…", Toast.LENGTH_SHORT).show();
    worker.execute(() -> {
      try {
        JSONObject next;
        HttpURLConnection connection = connect(new URL(FEED));
        try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
          byte[] buffer = new byte[4096]; int count;
          while ((count = in.read(buffer)) != -1) { out.write(buffer, 0, count); if (out.size() > 65536) throw new IOException("Invalid update information."); }
          next = new JSONObject(out.toString("UTF-8"));
        } finally { connection.disconnect(); }
        validate(next);
        prefs.edit().putLong("checked", System.currentTimeMillis()).apply();
        boolean newer = next.getLong("versionCode") > code(activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0));
        main.post(() -> {
          busy = false;
          if (!visible()) return;
          if (newer) { release = next; offer(); }
          else if (manual) message("You’re up to date", "Asechka " + version() + " is the latest version.");
        });
      } catch (Exception e) {
        main.post(() -> { busy = false; if (manual && visible()) retry("Couldn’t check for updates. Check your connection and try again.", () -> check(true)); });
      }
    });
  }
  static void validate(JSONObject value) throws Exception {
    URL url = new URL(value.getString("url"));
    if (!ORIGIN.equals(url.getProtocol() + "://" + url.getAuthority()) || !url.getPath().startsWith("/updates/")
        || !url.getPath().endsWith(".apk") || url.getUserInfo() != null || url.getRef() != null
        || !"app.asechka.android".equals(value.getString("packageName"))
        || value.getLong("versionCode") <= 0 || value.getString("versionName").length() > 40
        || !value.getString("sha256").matches("[a-fA-F0-9]{64}")
        || value.getLong("bytes") <= 0 || value.getLong("bytes") > MAX_BYTES
        || value.getInt("minSdk") > Build.VERSION.SDK_INT) throw new IOException("Invalid or incompatible update.");
  }
  HttpURLConnection connect(URL url) throws Exception {
    if (!ORIGIN.equals(url.getProtocol() + "://" + url.getAuthority())) throw new IOException("Untrusted update source.");
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
    connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
    connection.setRequestProperty("Cache-Control", "no-cache");
    String cookie = new ApiClient(activity).webCookie();
    if (cookie.isEmpty()) throw new IOException("Reconnect with our code before updating.");
    connection.setRequestProperty("Cookie", cookie);
    if (connection.getResponseCode() != 200) { connection.disconnect(); throw new IOException("Download unavailable."); }
    return connection;
  }
  void offer() {
    JSONObject info = release;
    dialog = new AlertDialog.Builder(activity).setTitle("Asechka " + info.optString("versionName") + " is ready")
        .setMessage(info.optString("notes") + "\n\nDownload the update here, then confirm installation with Android. Your saved content stays on this phone.")
        .setNegativeButton("Later", null).setPositiveButton("Update now", (d,w) -> download(info)).show();
  }
  void download(JSONObject info) {
    if (busy || closed) return;
    busy = true; cancel = false;
    ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
    progress.setMax(100);
    LinearLayout panel = new LinearLayout(activity); panel.setPadding(40,30,40,30); panel.addView(progress, new LinearLayout.LayoutParams(-1,-2));
    dialog = new AlertDialog.Builder(activity).setTitle("Downloading update…").setView(panel)
        .setNegativeButton("Cancel", (d,w) -> cancel = true).setOnCancelListener(d -> cancel = true).show();
    AlertDialog downloading = dialog;
    worker.execute(() -> {
      File part = new File(activity.getCacheDir(), "app-update.part");
      try {
        validate(info);
        HttpURLConnection connection = connect(new URL(info.getString("url")));
        try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
          long total = 0, expected = info.getLong("bytes"); byte[] buffer = new byte[32768]; int count, shown = -1;
          while ((count = in.read(buffer)) != -1) {
            if (cancel || closed || Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
            total += count; if (total > expected) throw new IOException("Unexpected file size.");
            out.write(buffer, 0, count); int percent = (int)(total * 100 / expected);
            if (percent != shown) { shown = percent; main.post(() -> progress.setProgress(percent)); }
          }
          out.getFD().sync();
          if (total != expected) throw new IOException("Download incomplete.");
        } finally { connection.disconnect(); }
        verify(part, info);
        if (cancel || closed) throw new InterruptedIOException();
        if (apk().exists() && !apk().delete()) throw new IOException("Couldn’t replace the previous download.");
        if (!part.renameTo(apk())) throw new IOException("Couldn’t save update.");
        activity.getSharedPreferences("app-updates",0).edit().putString("download",info.toString()).apply();
        main.post(() -> { busy = false; downloading.dismiss(); if (visible()) install(); });
      } catch (Exception e) {
        part.delete();
        main.post(() -> { busy = false; downloading.dismiss(); if (!cancel && visible()) retry("The update couldn’t be downloaded or verified. Your installed app is unchanged.", () -> download(info)); });
      }
    });
  }
  void verify(File file, JSONObject info) throws Exception {
    validate(info);
    if (file.length() != info.getLong("bytes")) throw new IOException("Incomplete APK.");
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream in = new FileInputStream(file)) { byte[] buffer = new byte[32768]; int count; while ((count = in.read(buffer)) != -1) digest.update(buffer, 0, count); }
    StringBuilder hash = new StringBuilder(); for (byte b : digest.digest()) hash.append(String.format(Locale.ROOT,"%02x",b & 255));
    if (!hash.toString().equalsIgnoreCase(info.getString("sha256"))) throw new IOException("APK checksum mismatch.");
    PackageManager pm = activity.getPackageManager();
    PackageInfo current = pm.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNATURES);
    PackageInfo candidate = pm.getPackageArchiveInfo(file.getPath(), PackageManager.GET_SIGNATURES);
    if (candidate == null || !current.packageName.equals(candidate.packageName) || code(candidate) != info.getLong("versionCode")
        || !info.getString("versionName").equals(candidate.versionName) || code(candidate) <= code(current)
        || candidate.signatures == null || current.signatures == null
        || !new HashSet<>(Arrays.asList(current.signatures)).equals(new HashSet<>(Arrays.asList(candidate.signatures)))) throw new IOException("APK identity mismatch.");
  }
  void install() {
    if (busy || closed) return;
    if (!apk().isFile()) { check(true); return; }
    if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
      dialog = new AlertDialog.Builder(activity).setTitle("Allow app updates")
          .setMessage("On the next screen, allow Asechka to install updates. Then return here to continue.")
          .setNegativeButton("Later",null).setPositiveButton("Open settings", (d,w) -> {
            waitingPermission = true;
            try { activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:"+activity.getPackageName()))); }
            catch (Exception e) { waitingPermission = false; message("Open phone settings", "Find Asechka in Install unknown apps, allow updates, then try again here."); }
          }).show();
      return;
    }
    busy = true;
    worker.execute(() -> {
      try {
        JSONObject info = new JSONObject(activity.getSharedPreferences("app-updates",0).getString("download","{}"));
        verify(apk(), info);
        main.post(() -> {
          busy = false; if (!visible()) return;
          try {
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("content://"+activity.getPackageName()+".updates/apk"), "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
          } catch (Exception e) { message("Couldn’t open installer", "Try again from App updates in Settings."); }
        });
      } catch (Exception e) { main.post(() -> { busy = false; if (visible()) retry("This download is no longer a valid update. Check for a fresh version.", () -> check(true)); }); }
    });
  }
  void show() {
    Ui.Sheet sheet = new Ui(activity).sheet("App updates", "Installed version · " + version());
    sheet.note("New versions download here. Android asks you to confirm installation. Your saved content stays on this phone.");
    sheet.item("Check for updates", "Find the latest Asechka release", "↻", false, () -> check(true));
    if (apk().isFile()) sheet.item("Install downloaded update", "Continue an update you downloaded earlier", "↗", false, this::install);
    sheet.show();
  }
  void pause() { foreground = false; }
  boolean visible() { return foreground && !closed && !activity.isFinishing() && !activity.isDestroyed(); }
  void retry(String text, Runnable action) { dialog = new AlertDialog.Builder(activity).setTitle("App updates").setMessage(text).setNegativeButton("Later",null).setPositiveButton("Retry",(d,w)->action.run()).show(); }
  void message(String title, String text) { if (!closed) dialog = new AlertDialog.Builder(activity).setTitle(title).setMessage(text).setPositiveButton("OK",null).show(); }
  void close() { closed = true; cancel = true; worker.shutdownNow(); main.removeCallbacksAndMessages(null); if (dialog != null) dialog.dismiss(); }
}
