package app.asechka.android;

import android.app.*;
import android.content.*;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
import org.json.*;

/** Runs against the isolated Node fixture over adb reverse; never writes production data. */
public final class NativeTests extends Instrumentation {
  private MainActivity activity;
  private ApiClient api;
  private int assertions;
  private boolean featuresOnly;
  private boolean convert, motionOnly, compatOnly, socialOnly, bookOnly, homeOnly, gateOnly;
  private String upgrade;

  @Override
  public void onCreate(Bundle args) {
    super.onCreate(args);
    featuresOnly = "true".equals(args.getString("featuresOnly"));
    convert = "true".equals(args.getString("convert"));
    motionOnly = "true".equals(args.getString("motionOnly"));
    compatOnly = "true".equals(args.getString("compatOnly"));
    socialOnly = "true".equals(args.getString("socialOnly"));
    bookOnly = "true".equals(args.getString("bookOnly"));
    homeOnly = "true".equals(args.getString("homeOnly"));
    gateOnly = "true".equals(args.getString("gateOnly"));
    upgrade = args.getString("upgrade", "");
    start();
  }

  @Override
  public void onStart() {
    Bundle result = new Bundle();
    try {
      if (!upgrade.isEmpty()) {
        upgradeTest(upgrade.equals("seed"));
        result.putString(
            "stream", "PASS: " + assertions + " upgrade assertions (" + upgrade + ").\n");
      } else if (convert) {
        File dir = new File(getTargetContext().getExternalFilesDir(null), "qa");
        for (File file : dir.listFiles()) {
          if (!file.getName().endsWith(".png")) continue;
          Bitmap full = android.graphics.BitmapFactory.decodeFile(file.getPath());
          Bitmap small =
              Bitmap.createScaledBitmap(
                  full, 540, Math.round(full.getHeight() * 540f / full.getWidth()), true);
          try (FileOutputStream out =
              new FileOutputStream(new File(dir, file.getName().replace(".png", ".jpg")))) {
            small.compress(Bitmap.CompressFormat.JPEG, 82, out);
          }
          small.recycle();
          full.recycle();
        }
        result.putString("stream", "QA previews ready\n");
      } else {
        if (featuresOnly) {
          featureTests();
        } else if (gateOnly) {
          gateTests();
        } else if (homeOnly) {
          sharedStreakTests();
          homeTests();
        } else if (bookOnly) {
          bookTests();
        } else if (socialOnly) {
          socialTests();
        } else if (compatOnly) {
          compatibilityTests();
        } else if (motionOnly) {
          prepareMotionFixture();
          motionAndPublishingTests();
        } else tests();
        result.putString(
            "stream",
            "PASS: "
                + assertions
                + " assertions. Native login, navigation, shared CRUD, conflicts, JPEG upload,"
                + " music, hearts, translation, copy, zoom, and logout.\n");
      }
      if (compatOnly)
        result.putString(
            "stream",
            "PASS: "
                + assertions
                + " compatibility assertions on Android API "
                + Build.VERSION.SDK_INT
                + ".\n");
      finish(Activity.RESULT_OK, result);
    } catch (Throwable e) {
      try {
        if (activity != null) screenshot("failure");
      } catch (Exception ignored) {
      }
      StringWriter text = new StringWriter();
      e.printStackTrace(new PrintWriter(text));
      result.putString("stream", "FAIL: " + text);
      finish(Activity.RESULT_CANCELED, result);
    }
  }

  private void check(boolean condition, String message) {
    assertions++;
    if (!condition) throw new AssertionError(message);
  }

  private void upgradeTest(boolean seed) throws Exception {
    // A separate namespace cannot send these fixture changes to the personal website.
    OfflineStore store = new OfflineStore(getTargetContext(), "https://upgrade-fixture.invalid");
    if (seed) {
      store.remove("outbox");
      store.snapshot(
          "/memories.json",
          obj(
              "version",
              1,
              "writable",
              true,
              "quotes",
              new JSONArray(),
              "photos",
              new JSONArray()));
      store.rememberCode("upgrade-fixture-code");
      store.write("word-draft:Asnat", obj("text", "A draft kept across an APK update"));
      store.enqueue(
          "/api/memories",
          obj(
              "action",
              "addQuote",
              "operationId",
              "33333333-3333-4333-8333-333333333333",
              "date",
              "2026-10-17",
              "text",
              "A quote kept across an APK update",
              "note",
              ""));
      check(store.unlockWithCode("upgrade-fixture-code"), "Seed credentials unlock saved state");
    } else {
      check(
          store.unlockWithCode("upgrade-fixture-code"), "Original password verifier still unlocks");
      check(
          store
              .read("word-draft:Asnat")
              .getString("text")
              .equals("A draft kept across an APK update"),
          "Encrypted draft retained");
      check(store.queue().length() == 1, "Pending addition retained");
      check(
          store
              .projected("/api/memories")
              .getJSONArray("quotes")
              .getJSONObject(0)
              .getString("text")
              .equals("A quote kept across an APK update"),
          "Original collection cache and queued quote readable after update");
      check(
          getTargetContext()
                  .getPackageManager()
                  .getPackageInfo(getTargetContext().getPackageName(), 0)
                  .versionCode
              == 16,
          "Updated package version");
    }
  }

  private void compatibilityTests() throws Exception {
    check(Dates.day("2024-03-01") - Dates.day("2024-02-28") == 2, "Leap-year dates");
    boolean invalid = false;
    try {
      Dates.day("2026-02-30");
    } catch (IllegalArgumentException expected) {
      invalid = true;
    }
    check(invalid, "Invalid calendar dates rejected");
    check(
        Dates.timestamp(Dates.instant("2026-10-17T12:34:56.123456Z"))
            .equals("2026-10-17T12:34:56.123Z"),
        "Timestamp precision preserved");
    check(
        Dates.instant("2026-10-17T14:34:56+02:00") == Dates.instant("2026-10-17T12:34:56Z"),
        "Timestamp offsets respected");
    check(
        Dates.nextBirthday(1, 25, Dates.day("2026-01-26")) == Dates.day("2027-01-25"),
        "Birthday rolls forward on old Android");
    check(
        Dates.nextBirthday(8, 5, Dates.day("2026-08-05")) == Dates.day("2026-08-05"),
        "Birthday today remains today");
    check(Compat.wrap(-1, 3) == 2, "Photo and quote backward navigation wraps");
    java.net.HttpURLConnection live =
        (java.net.HttpURLConnection)
            new java.net.URL(ApiClient.SITE + "/api/memories").openConnection();
    live.setConnectTimeout(15000);
    live.setReadTimeout(15000);
    try {
      check(live.getResponseCode() == 401, "Production HTTPS validates on this Android version");
    } finally {
      live.disconnect();
    }
    prepareMotionFixture();
    check(api.canOpen() && api.signedIn(), "Secure login succeeds");
    for (int screen : new int[] {0, 1, 5, 2, 3, 4}) {
      call("select", new Class[] {int.class}, screen);
      check(((ViewGroup) get("bottom")).getChildCount() == 6, "Native screen renders: " + screen);
    }
    call("select", new Class[] {int.class}, 3);
    check(
        text("Asnat · August 5") != null && text("Youssef · January 25") != null,
        "Birthday cards render on this Android version");
    screenshot("compat-" + Build.VERSION.SDK_INT);
    File file = new File(getTargetContext().getCacheDir(), "compat-rotated.jpg");
    Bitmap original = Bitmap.createBitmap(1200, 900, Bitmap.Config.ARGB_8888);
    original.eraseColor(0xffbbcfee);
    try (FileOutputStream out = new FileOutputStream(file)) {
      original.compress(Bitmap.CompressFormat.JPEG, 90, out);
    }
    original.recycle();
    android.media.ExifInterface exif = new android.media.ExifInterface(file.getPath());
    exif.setAttribute(android.media.ExifInterface.TAG_ORIENTATION, "6");
    exif.saveAttributes();
    Bitmap oriented = Photos.decode(getTargetContext(), Uri.fromFile(file));
    check(
        oriented.getWidth() == 900 && oriented.getHeight() == 1200,
        "Phone photo EXIF orientation respected");
    oriented.recycle();
    Method compress = MainActivity.class.getDeclaredMethod("compressPhoto", Uri.class);
    compress.setAccessible(true);
    String encoded = (String) compress.invoke(activity, Uri.fromFile(file));
    check(
        encoded.startsWith("data:image/jpeg;base64,")
            && android.util.Base64.decode(encoded.substring(23), 0).length <= 310000,
        "Native upload creates bounded JPEG");
    String operation = UUID.randomUUID().toString();
    offline(api, true);
    check(
        api.post(
                "/api/memories",
                obj(
                    "action",
                    "addQuote",
                    "operationId",
                    operation,
                    "date",
                    "2026-10-17",
                    "text",
                    "Compatibility fixture",
                    "note",
                    ""))
            .optBoolean("_pending"),
        "Offline addition persists before sending");
    ApiClient cold = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    offline(cold, true);
    check(
        cold.signedIn() && cold.get("/memories.json").getJSONArray("quotes").length() == 3,
        "Encrypted session and offline collection survive a new client");
    cold.store.lock();
    check(!cold.store.unlockWithCode("wrong-code"), "Offline lock rejects incorrect code");
    check(
        cold.store.unlockWithCode("native-test-code"), "Offline login uses supported password KDF");
    offline(api, false);
    api.syncPending();
    check(api.store.queue().length() == 0, "Saved addition synchronizes after reconnect");
    check(
        api.get("/memories.json").getJSONArray("quotes").length() == 3,
        "Shared backend contains the saved addition exactly once");
    ui(() -> activity.finish());
  }

  private void ui(Runnable action) {
    runOnMainSync(action);
    waitForIdleSync();
  }

  private Object get(String name) throws Exception {
    Field field = MainActivity.class.getDeclaredField(name);
    field.setAccessible(true);
    return field.get(activity);
  }

  private void set(String name, Object value) throws Exception {
    Field field = MainActivity.class.getDeclaredField(name);
    field.setAccessible(true);
    field.set(activity, value);
  }

  private void call(String name, Class<?>[] types, Object... args) throws Exception {
    Method method = MainActivity.class.getDeclaredMethod(name, types);
    method.setAccessible(true);
    final Throwable[] error = {null};
    ui(
        () -> {
          try {
            method.invoke(activity, args);
          } catch (Throwable e) {
            error[0] = e;
          }
        });
    if (error[0] != null) throw new RuntimeException(error[0]);
  }

  private <T extends View> ArrayList<T> views(View root, Class<T> type) {
    ArrayList<T> result = new ArrayList<>();
    if (type.isInstance(root)) result.add(type.cast(root));
    if (root instanceof ViewGroup)
      for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++)
        result.addAll(views(((ViewGroup) root).getChildAt(i), type));
    return result;
  }

  private boolean hasText(View root, String value) {
    for (TextView view : views(root, TextView.class))
      if (view.getText().toString().equals(value)) return true;
    return false;
  }

  private boolean hasBitmap(View root) {
    for (ImageView image : views(root, ImageView.class))
      if (image.getVisibility() == View.VISIBLE
          && image.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) return true;
    return false;
  }

  private boolean hasPeriodicJob(android.app.job.JobScheduler scheduler) {
    for (android.app.job.JobInfo job : scheduler.getAllPendingJobs())
      if (job.isPeriodic() && job.getIntervalMillis() == 900000) return true;
    return false;
  }

  private View decor() {
    return activity.getWindow().getDecorView();
  }

  private TextView text(String text) {
    for (TextView v : views(decor(), TextView.class))
      if (v.getText().toString().equals(text)) return v;
    return null;
  }

  private void click(String text) {
    TextView target = text(text);
    check(target != null, "Missing native control: " + text);
    ui(target::performClick);
  }

  private void await(java.util.concurrent.Callable<Boolean> condition, String message)
      throws Exception {
    long until = System.currentTimeMillis() + 20000;
    while (System.currentTimeMillis() < until) {
      final boolean[] success = {false};
      ui(
          () -> {
            try {
              success[0] = condition.call();
            } catch (Exception ignored) {
            }
          });
      if (success[0]) return;
      Thread.sleep(120);
    }
    throw new AssertionError(message);
  }

  private void screenshot(String name) throws Exception {
    waitForIdleSync();
    Thread.sleep(700);
    ui(
        () -> {
          android.graphics.Rect rect = new android.graphics.Rect();
          decor().getWindowVisibleDisplayFrame(rect);
          Object nativeRoot = uncheckedGet("root");
          if (nativeRoot instanceof ViewGroup) {
            ViewGroup r = (ViewGroup) nativeRoot;
            View bar = r.getChildAt(0);
            int[] xy = new int[2];
            bar.getLocationOnScreen(xy);
            android.util.Log.i(
                "AsechkaQA",
                name
                    + " root="
                    + r.getHeight()
                    + " bar="
                    + bar.getHeight()
                    + " y="
                    + xy[1]
                    + " padding="
                    + r.getPaddingTop()
                    + " visible="
                    + rect
                    + " scrollY="
                    + decor().getScrollY());
          }
        });
    captureScreenshot(name);
  }

  private void captureScreenshot(String name) throws Exception {
    Bitmap bitmap = getUiAutomation().takeScreenshot();
    check(bitmap != null, "Screenshot " + name);
    File dir = new File(getTargetContext().getExternalFilesDir(null), "qa");
    dir.mkdirs();
    if (!dir.canWrite()) {
      dir = new File(getTargetContext().getFilesDir(), "qa");
      dir.mkdirs();
    }
    try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
    }
    bitmap.recycle();
  }

  private JSONObject obj(Object... pairs) throws Exception {
    JSONObject o = new JSONObject();
    for (int i = 0; i < pairs.length; i += 2)
      o.put((String) pairs[i], pairs[i + 1] == null ? JSONObject.NULL : pairs[i + 1]);
    return o;
  }

  private void tests() throws Exception {
    ((java.net.HttpURLConnection)
            new java.net.URL("http://127.0.0.1:4777/__reset").openConnection())
        .getInputStream()
        .close();
    ApiClient initial = new ApiClient(getTargetContext());
    initial.clearSession();
    initial.store.lock();
    getTargetContext().getSharedPreferences("preferences", 0).edit().remove("person").commit();
    Intent intent =
        new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    activity = (MainActivity) startActivitySync(intent);
    await(
        () -> text("Two people.\nOne little home.") != null,
        "Profile chooser missing on first start");
    screenshot("00-profiles");
    call("chooseProfile", new Class[] {String.class}, "asnat");
    check(
        getTargetContext()
            .getSharedPreferences("preferences", 0)
            .getString("person", "")
            .equals("asnat"),
        "Chosen profile remembered");
    await(() -> text("Open our little door  →") != null, "Native login didn’t appear");
    check(views(decor(), EditText.class).size() == 1, "Native password field");
    check(views(decor(), android.webkit.WebView.class).isEmpty(), "No WebView on login");
    screenshot("01-login");
    api = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    api.clearSession();
    api.store.lock();
    api.store.remove("outbox");
    set("api", api);
    set("images", new Images(api));
    ui(() -> views(decor(), EditText.class).get(0).setText("wrong-code"));
    click("Open our little door  →");
    await(
        () -> text("Not quite, love. Try our little code again.") != null,
        "Wrong code feedback missing");
    ui(() -> views(decor(), EditText.class).get(0).setText("native-test-code"));
    click("Open our little door  →");
    await(
        () -> get("memories") != null && get("together") != null,
        "Native sign-in or shared sync failed");
    check(api.signedIn(), "Session captured");
    check(
        new ApiClient(getTargetContext(), "http://127.0.0.1:4777").signedIn(),
        "Encrypted session survives restart");
    check(
        !getTargetContext()
            .getSharedPreferences("private-session", 0)
            .getString("session", "")
            .contains("asechka_session"),
        "Cookie encrypted at rest");
    screenshot("02-home");
    call("select", new Class[] {int.class}, 5);
    check(text("Words to keep.") != null, "Memories native screen");
    check(
        text("“Every ordinary day feels a little brighter with you.”") != null,
        "Live quotes shown");
    screenshot("03-memories");
    // Use production validators to confirm native JSON contracts, stale-edit handling, and
    // independent ranks.
    api.get("/api/music-search?q=our");
    JSONObject music =
        api.post(
            "/api/music",
            obj(
                "action",
                "save",
                "rank",
                1,
                "expectedId",
                null,
                "trackId",
                123456,
                "note",
                "This one feels like us."));
    check(music.getJSONArray("tracks").length() == 1, "Shared song saved");
    String songId = music.getJSONArray("tracks").getJSONObject(0).getString("id");
    try {
      api.post(
          "/api/music",
          obj("action", "remove", "rank", 1, "expectedId", UUID.randomUUID().toString()));
      throw new AssertionError("Stale music write accepted");
    } catch (ApiClient.ApiError e) {
      check(e.status == 409, "Music stale edit rejected");
      api.store.discardEntity(api.store.queue().getJSONObject(0));
    }
    set("music", music);
    call("select", new Class[] {int.class}, 2);
    check(text("Our favorite song") != null, "Music metadata shown");
    screenshot("04-music");
    click("＋  Find a song");
    await(() -> get("activeDialog") != null, "Music search dialog missing");
    AlertDialog search = (AlertDialog) get("activeDialog");
    ui(
        () ->
            views(search.getWindow().getDecorView(), EditText.class)
                .get(0)
                .setText("our favorite"));
    for (Button b : views(search.getWindow().getDecorView(), Button.class))
      if (b.getText().toString().equals("Search the music catalog")) ui(b::performClick);
    await(
        () -> hasText(search.getWindow().getDecorView(), "Our favorite song"),
        "Music search result missing");
    ui(search::dismiss);
    String planId = UUID.randomUUID().toString(), operation = UUID.randomUUID().toString();
    JSONObject shared =
        api.post(
            "/api/together",
            obj(
                "action",
                "saveItem",
                "id",
                planId,
                "expectedRevision",
                null,
                "operationId",
                operation,
                "title",
                "Watch the stars together",
                "place",
                "Anywhere with you",
                "note",
                "Bring a little blanket.",
                "completed",
                false));
    check(shared.getJSONArray("bucketList").length() == 1, "Wish shared");
    File photo = new File(getTargetContext().getCacheDir(), "upload-test.png");
    Bitmap source = Bitmap.createBitmap(2500, 1800, Bitmap.Config.ARGB_8888);
    source.eraseColor(0xffbbcfee);
    try (FileOutputStream out = new FileOutputStream(photo)) {
      source.compress(Bitmap.CompressFormat.PNG, 100, out);
    }
    source.recycle();
    Method compress = MainActivity.class.getDeclaredMethod("compressPhoto", Uri.class);
    compress.setAccessible(true);
    String encoded = (String) compress.invoke(activity, Uri.fromFile(photo));
    check(encoded.startsWith("data:image/jpeg;base64,"), "Native photo becomes JPEG");
    check(encoded.length() < 420000, "Upload obeys backend size bound");
    String revision = shared.getJSONArray("bucketList").getJSONObject(0).getString("revision");
    String completeOperation = UUID.randomUUID().toString();
    shared =
        api.post(
            "/api/together",
            obj(
                "action",
                "saveItem",
                "id",
                planId,
                "expectedRevision",
                revision,
                "operationId",
                completeOperation,
                "title",
                "Watch the stars together",
                "place",
                "Anywhere with you",
                "note",
                "Bring a little blanket.",
                "completed",
                true,
                "photo",
                encoded));
    JSONObject item = shared.getJSONArray("bucketList").getJSONObject(0);
    check(
        item.getBoolean("completed") && !item.isNull("photoId"),
        "Completed wish and photo saved atomically");
    check(
        api.image("/api/together-photo?kind=bucket&id=" + item.getString("photoId")).length > 20,
        "Private photo served with session");
    JSONObject repeated =
        api.post(
            "/api/together",
            obj(
                "action",
                "saveItem",
                "id",
                planId,
                "expectedRevision",
                revision,
                "operationId",
                completeOperation,
                "title",
                "Watch the stars together",
                "place",
                "Anywhere with you",
                "note",
                "Bring a little blanket.",
                "completed",
                true,
                "photo",
                encoded));
    check(repeated.getJSONArray("bucketList").length() == 1, "Retry does not duplicate memory");
    try {
      api.post(
          "/api/together",
          obj(
              "action",
              "toggleItem",
              "id",
              planId,
              "expectedRevision",
              revision,
              "operationId",
              UUID.randomUUID().toString(),
              "completed",
              false));
      throw new AssertionError("Stale wish write accepted");
    } catch (ApiClient.ApiError e) {
      check(e.status == 409, "Wish stale edit rejected");
      api.store.discardEntity(api.store.queue().getJSONObject(0));
    }
    shared =
        api.post(
            "/api/together",
            obj(
                "action",
                "sendHeart",
                "from",
                "asechka",
                "operationId",
                UUID.randomUUID().toString()));
    check(
        shared.getJSONObject("hearts").getJSONObject("asechka").has("sentAt"),
        "Shared heart saved");
    set("together", shared);
    call("select", new Class[] {int.class}, 3);
    check(text("Watch the stars together") != null, "Native wish shown");
    screenshot("05-our-days");
    call("editPlan", new Class[] {JSONObject.class, boolean.class}, item, false);
    await(() -> get("planEditor") != null, "Native wish editor missing");
    check(
        views(((Dialog) get("activeDialog")).getWindow().getDecorView(), EditText.class).size()
            == 3,
        "Native title, place, note inputs");
    ui(() -> ((Dialog) uncheckedGet("activeDialog")).dismiss());
    call("select", new Class[] {int.class}, 4);
    await(() -> (boolean) get("translatorReady"), "Translation readiness failed");
    ui(() -> views(decor(), EditText.class).get(0).setText("I love you."));
    click("Translate our words  →");
    await(() -> get("translations") != null, "Native translation failed");
    check(
        ((JSONObject) get("translations")).getJSONArray("translations").length() == 5,
        "Five target languages");
    check(text("أنا") == null, "Translation is rendered as text, not HTML");
    screenshot("06-words");
    TextView copy = text("Copy translation  ↗");
    check(copy != null, "Native copy control");
    ui(copy::performClick);
    check(
        ((android.content.ClipboardManager)
                getTargetContext().getSystemService(Context.CLIPBOARD_SERVICE))
            .hasPrimaryClip(),
        "Translation copied natively");
    ui(() -> views(decor(), EditText.class).get(0).setText("simulate failure"));
    click("Translate our words  →");
    await(() -> text("Our test translator needs a moment.") != null, "Failure feedback missing");
    check(
        views(decor(), EditText.class).get(0).getText().toString().equals("simulate failure"),
        "Draft retained after failure");
    call(
        "photoViewer",
        new Class[] {JSONArray.class, int.class},
        new JSONArray()
            .put(
                obj(
                    "src",
                    "/api/together-photo?kind=bucket&id=" + item.getString("photoId"),
                    "caption",
                    "Our little day")),
        0);
    Dialog viewer = (Dialog) get("activeDialog");
    check(
        views(viewer.getWindow().getDecorView(), Ui.ZoomImage.class).size() == 1,
        "Native zoomable image viewer");
    ui(viewer::dismiss);
    JSONObject removed =
        api.post(
            "/api/together",
            obj(
                "action",
                "removeItem",
                "id",
                planId,
                "expectedRevision",
                completeOperation,
                "operationId",
                UUID.randomUUID().toString()));
    check(removed.getJSONArray("bucketList").length() == 0, "Wish removed");
    check(
        api.post("/api/music", obj("action", "remove", "rank", 1, "expectedId", songId))
                .getJSONArray("tracks")
                .length()
            == 0,
        "Song removed");
    check(
        views(decor(), android.webkit.WebView.class).isEmpty(),
        "No WebView in application screens");
    offlineTests();
    layoutTests();
    profileTests();
    motionAndPublishingTests();
    call("signOut", new Class[] {});
    check(!api.signedIn(), "Sign out clears session");
    check(text("Open our little door  →") != null, "Sign out returns to native door");
  }

  private void offline(ApiClient client, boolean offline) throws Exception {
    Field field = ApiClient.class.getDeclaredField("onlineOverride");
    field.setAccessible(true);
    field.set(client, !offline);
  }

  private void offlineTests() throws Exception {
    check(MainActivity.REFRESH_INTERVAL == 60000, "Foreground refresh interval is one minute");
    check(
        api.image("/assets/our-little-universe.png").length > 1000000,
        "Original artwork bundled in APK");
    check(api.prefetchMedia() == 0, "All fixture media saved");
    ApiClient restarted = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    offline(restarted, true);
    check(
        restarted.get("/memories.json").getJSONArray("quotes").length() > 0,
        "Quotes survive cold API restart offline");
    check(
        restarted.image(
                    restarted
                        .get("/memories.json")
                        .getJSONArray("photos")
                        .getJSONObject(0)
                        .getString("src"))
                .length
            > 1000,
        "Unopened gallery photo was prefetched and is readable offline");
    check(
        restarted.image("/assets/cats-cozy.jpg").length > 1000,
        "Bundled photos available with no internet");
    check(restarted.store.read("last-translation") != null, "Translation result durable");
    check(
        restarted.store.read("translation-history").getJSONArray("items").length() > 0,
        "Translation history durable");
    JSONObject translation =
        obj(
            "text",
            "I love you.",
            "source",
            "auto",
            "targets",
            new JSONArray(Arrays.asList("ar-EG", "ru", "he", "fr", "es")),
            "tone",
            "natural",
            "speaker",
            "female",
            "recipient",
            "male");
    check(
        restarted.post("/api/translation", translation).getJSONArray("translations").length() == 5,
        "Identical translation reuses offline result");
    String wish = UUID.randomUUID().toString(), op = UUID.randomUUID().toString();
    JSONObject queued =
        restarted.post(
            "/api/together",
            obj(
                "action",
                "saveItem",
                "id",
                wish,
                "expectedRevision",
                null,
                "operationId",
                op,
                "title",
                "An offline wish",
                "place",
                "Under the stars",
                "note",
                "Saved without internet",
                "completed",
                false));
    check(queued.optBoolean("_pending"), "Offline edits marked pending");
    restarted.post(
        "/api/together",
        obj(
            "action",
            "toggleItem",
            "id",
            wish,
            "expectedRevision",
            op,
            "operationId",
            UUID.randomUUID().toString(),
            "completed",
            true));
    JSONObject song =
        restarted.post(
            "/api/music",
            obj(
                "action",
                "save",
                "rank",
                2,
                "expectedId",
                null,
                "trackId",
                123456,
                "note",
                "Offline first note"));
    String localId = song.getJSONArray("tracks").getJSONObject(0).getString("id");
    restarted.post(
        "/api/music",
        obj(
            "action",
            "save",
            "rank",
            2,
            "expectedId",
            localId,
            "trackId",
            123456,
            "note",
            "Offline revised note"));
    check(restarted.store.pending() == 4, "All four offline edits persisted in order");
    ApiClient again = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    offline(again, true);
    check(again.store.pending() == 4, "Outbox survives restart");
    check(
        again
            .get("/api/together")
            .getJSONArray("bucketList")
            .getJSONObject(0)
            .optBoolean("completed"),
        "Dependent offline wish edit visible");
    offline(again, false);
    again.syncPending();
    check(again.store.pending() == 0, "Reconnect flushes dependent wish and music edits");
    check(
        again
            .get("/api/music")
            .getJSONArray("tracks")
            .getJSONObject(0)
            .getString("note")
            .equals("Offline revised note"),
        "Local song IDs mapped to server IDs");
    check(
        again.get("/api/together").getJSONArray("bucketList").length() == 1,
        "Reconnect creates wish exactly once");
    again.syncPending();
    check(
        again.get("/api/together").getJSONArray("bucketList").length() == 1,
        "Repeat sync creates no duplicate");
    offline(again, true);
    again.clearSession();
    again.store.lock();
    check(!again.canOpen(), "Explicit lock closes offline access");
    try {
      again.login("wrong-code");
      throw new AssertionError("Wrong offline code accepted");
    } catch (ApiClient.ApiError expected) {
      check(!again.canOpen(), "Wrong code cannot unlock saved content");
    }
    again.login("native-test-code");
    check(again.canOpen(), "Correct code unlocks cached content offline");
    call("persistWords", new Class[] {});
    check(
        api.store.read("word-draft:Asnat").getString("text").equals("simulate failure"),
        "Draft survives on disk");
    offline(api, true);
    call("restoreSaved", new Class[] {});
    call("showShell", new Class[] {});
    call("select", new Class[] {int.class}, 5);
    check(
        text("“Every ordinary day feels a little brighter with you.”") != null,
        "Native memories render from disk offline");
    screenshot("07-offline");
    offline(api, false);
    api.login("native-test-code");
    ((java.net.HttpURLConnection)
            new java.net.URL("http://127.0.0.1:4777/__add-memory").openConnection())
        .getInputStream()
        .close();
    long until = System.currentTimeMillis() + 70000;
    boolean updated = false;
    while (System.currentTimeMillis() < until) {
      final boolean[] found = {false};
      ui(
          () -> {
            JSONObject current = (JSONObject) uncheckedGet("memories");
            found[0] = current != null && current.optJSONArray("quotes").length() == 2;
          });
      if (found[0]) {
        updated = true;
        break;
      }
      Thread.sleep(500);
    }
    check(updated, "Website addition appears automatically within a minute without manual refresh");
    screenshot("08-auto-update");
    android.app.job.JobScheduler scheduler =
        (android.app.job.JobScheduler)
            getTargetContext().getSystemService(Context.JOB_SCHEDULER_SERVICE);
    check(hasPeriodicJob(scheduler), "Persistent Android background sync scheduled");
    getUiAutomation().executeShellCommand("svc wifi disable").close();
    getUiAutomation().executeShellCommand("svc data disable").close();
    try {
      Thread.sleep(1500);
      ApiClient airplane = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
      check(!airplane.connected(), "Real emulator network disconnected");
      check(
          airplane.get("/memories.json").getJSONArray("quotes").length() == 2,
          "Latest content readable with real radios disabled");
      ui(activity::finish);
      activity =
          (MainActivity)
              startActivitySync(
                  new Intent(getTargetContext(), MainActivity.class)
                      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      set("api", airplane);
      set("images", new Images(airplane));
      call("restoreSaved", new Class[] {});
      call("showShell", new Class[] {});
      call("select", new Class[] {int.class}, 5);
      check(
          ((SocialFeed) get("feed")).items().size() == 2,
          "Native cold activity restores saved website content with radios off");
      screenshot("09-airplane-restart");
    } finally {
      getUiAutomation().executeShellCommand("svc wifi enable").close();
      getUiAutomation().executeShellCommand("svc data enable").close();
    }
  }

  private void chrome(String label) throws Exception {
    final boolean[] valid = {false};
    ui(
        () -> {
          ViewGroup root = (ViewGroup) uncheckedGet("root");
          View bar = root.getChildAt(0), nav = (View) uncheckedGet("bottom");
          int[] top = new int[2], bottom = new int[2];
          int[] origin = new int[2];
          root.getLocationInWindow(origin);
          bar.getLocationInWindow(top);
          nav.getLocationInWindow(bottom);
          valid[0] =
              top[1] >= origin[1] + root.getPaddingTop()
                  && bar.getHeight() > 0
                  && bottom[1] + nav.getHeight()
                      <= origin[1] + root.getHeight() - root.getPaddingBottom() + 1
                  && bottom[1] > top[1] + bar.getHeight();
        });
    check(valid[0], label + " header and navigation remain inside screen insets");
  }

  private void resizeDevice(String size) throws Exception {
    ActivityMonitor monitor = addMonitor(MainActivity.class.getName(), null, false);
    try {
      getUiAutomation().executeShellCommand("wm size " + size).close();
      Thread.sleep(1200);
      Activity replacement = monitor.getLastActivity();
      if (replacement != null) activity = (MainActivity) replacement;
      if (activity.isDestroyed())
        activity =
            (MainActivity)
                startActivitySync(
                    new Intent(getTargetContext(), MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      if (get("root") == null) {
        ApiClient restored = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
        set("api", restored);
        set("images", new Images(restored));
        call("restoreSaved", new Class[] {});
        call("showShell", new Class[] {});
      }
    } finally {
      removeMonitor(monitor);
    }
  }

  private void layoutTests() throws Exception {
    android.content.res.Configuration original =
        new android.content.res.Configuration(activity.getResources().getConfiguration());
    try {
      resizeDevice("840x1470");
      call("select", new Class[] {int.class}, 0);
      chrome("Small phone home");
      screenshot("10-small-home");
      ui(
          () -> {
            android.content.res.Configuration large =
                new android.content.res.Configuration(activity.getResources().getConfiguration());
            large.fontScale = 1.4f;
            activity
                .getResources()
                .updateConfiguration(large, activity.getResources().getDisplayMetrics());
          });
      call("showShell", new Class[] {});
      call("select", new Class[] {int.class}, 4);
      chrome("Small phone large text");
      screenshot("11-large-text");
      ui(
          () ->
              activity
                  .getResources()
                  .updateConfiguration(original, activity.getResources().getDisplayMetrics()));
      resizeDevice("1470x840");
      call("showShell", new Class[] {});
      call("select", new Class[] {int.class}, 3);
      chrome("Landscape");
      screenshot("12-landscape");
    } finally {
      ui(
          () ->
              activity
                  .getResources()
                  .updateConfiguration(original, activity.getResources().getDisplayMetrics()));
      resizeDevice("reset");
    }
  }

  private void profileTests() throws Exception {
    call("chooseProfile", new Class[] {String.class}, "youssef");
    call("select", new Class[] {int.class}, 3);
    check(
        text("Asnat · August 5") != null && text("Youssef · January 25") != null,
        "Both birthdays remembered and shown offline");
    check(text("♡  Send a heart to Asnat") != null, "Youssef heart recipient automatic");
    check(
        (int) get("speakerChoice") == 0 && (int) get("recipientChoice") == 0,
        "Youssef translation uses male speaker and female recipient");
    call("select", new Class[] {int.class}, 4);
    check(
        views(decor(), Spinner.class).size() == 2,
        "Identity removes manual speaker and recipient controls");
    ui(() -> views(decor(), EditText.class).get(0).setText("Youssef’s own draft"));
    call("persistWords", new Class[] {});
    call("chooseProfile", new Class[] {String.class}, "asnat");
    call("select", new Class[] {int.class}, 3);
    check(text("♡  Send a heart to Youssef") != null, "Asnat heart recipient automatic");
    check(
        (int) get("speakerChoice") == 1 && (int) get("recipientChoice") == 1,
        "Asnat translation uses female speaker and male recipient");
    check(get("wordDraft").equals("simulate failure"), "Profiles keep separate saved drafts");
    java.lang.reflect.Method birthday =
        MainActivity.class.getDeclaredMethod("nextBirthday", int.class, int.class, long.class);
    birthday.setAccessible(true);
    check(
        birthday.invoke(activity, 1, 25, Dates.day("2026-01-26")).equals(Dates.day("2027-01-25")),
        "Birthday rolls over to next year");
    check(
        birthday.invoke(activity, 8, 5, Dates.day("2026-08-05")).equals(Dates.day("2026-08-05")),
        "Birthday today remains today");
    screenshot("13-asnat-profile");
  }

  private void prepareMotionFixture() throws Exception {
    for (String path : new String[] {"/__reset", "/__add-memory"})
      ((java.net.HttpURLConnection)
              new java.net.URL("http://127.0.0.1:4777" + path).openConnection())
          .getInputStream()
          .close();
    api = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    api.store.remove("outbox");
    // Resetting the isolated server is an intentional ledger rollback between test journeys.
    api.store.remove("data:/api/together");
    api.login("native-test-code");
    for (String path :
        new String[] {"/memories.json", "/api/music", "/api/together", "/api/daily-memory"})
      api.get(path);
    getTargetContext()
        .getSharedPreferences("preferences", 0)
        .edit()
        .putString("person", "asnat")
        .putBoolean("motion-paused", false)
        .commit();
    activity =
        (MainActivity)
            startActivitySync(
                new Intent(getTargetContext(), MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
    set("api", api);
    set("appUnlocked", true);
    set("images", new Images(api));
    call("restoreSaved", new Class[] {});
    set("messages", null);
    call("showShell", new Class[] {});
  }

  private void featureTests() throws Exception {
    prepareMotionFixture();
    JSONObject first =
        api.post(
            "/api/together",
            obj(
                "action",
                "sendMessage",
                "actor",
                "asnat",
                "text",
                "A special little fixture message, long enough to leave just a short preview after"
                    + " closing.",
                "operationId",
                UUID.randomUUID().toString()));
    JSONArray list = first.getJSONArray("messages");
    check(list.length() == 1, "First message shared");
    String id = list.getJSONObject(0).getString("id");
    api.post(
        "/api/together",
        obj(
            "action",
            "sendMessage",
            "actor",
            "asnat",
            "text",
            "Two",
            "operationId",
            UUID.randomUUID().toString()));
    api.post(
        "/api/together",
        obj(
            "action",
            "sendMessage",
            "actor",
            "asnat",
            "text",
            "Three",
            "operationId",
            UUID.randomUUID().toString()));
    check(
        api.get("/api/together").getJSONArray("messages").length() == 3,
        "Three per-person messages accepted");
    try {
      api.post(
          "/api/together",
          obj(
              "action",
              "sendMessage",
              "actor",
              "asnat",
              "text",
              "Four",
              "operationId",
              UUID.randomUUID().toString()));
      throw new AssertionError("Fourth accepted");
    } catch (ApiClient.ApiError expected) {
      check(expected.status == 429, "Fourth blocked by shared daily limit");
    }
    check(
        api.get("/api/together").getJSONArray("messages").length() == 3,
        "Rejected message is not projected as delivered");
    api.store.remove("outbox");
    call("chooseProfile", new Class[] {String.class}, "youssef");
    Messages messages = (Messages) get("messages");
    ui(messages::check);
    await(
        () -> {
          Field f = Messages.class.getDeclaredField("incoming");
          f.setAccessible(true);
          return f.get(messages) != null;
        },
        "Incoming overlay appears");
    Field incoming = Messages.class.getDeclaredField("incoming");
    incoming.setAccessible(true);
    Dialog dialog = (Dialog) incoming.get(messages);
    check(
        views(dialog.getWindow().getDecorView(), android.webkit.WebView.class).isEmpty(),
        "Incoming message is native");
    screenshot("226-message");
    ui(() -> clickIn(dialog, "Keep it in my heart ♡"));
    await(
        () -> api.store.read("closed-messages") != null,
        "Close receipt durable before disappearance");
    Thread.sleep(500);
    api.syncPending();
    JSONObject closed = api.get("/api/together").getJSONArray("messages").getJSONObject(0);
    check(!closed.has("text") && !closed.isNull("closedAt"), "Shared close destroys full text");
    check(closed.getString("preview").length() <= 61, "History only a small note");
    ui(messages::suspend);
    offline(api, true);
    String queued = UUID.randomUUID().toString();
    api.post(
        "/api/together",
        obj(
            "action",
            "sendMessage",
            "actor",
            "youssef",
            "text",
            "Offline delivery",
            "operationId",
            queued));
    ApiClient reopened = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    offline(reopened, true);
    boolean foundQueued = false;
    JSONArray durable = reopened.store.queue();
    for (int i = 0; i < durable.length(); i++)
      if (queued.equals(durable.getJSONObject(i).getJSONObject("body").optString("operationId")))
        foundQueued = true;
    check(foundQueued, "Offline message survives reopening");
    offline(api, false);
    api.retryNow();
    api.syncPending();
    await(() -> api.store.queue().length() == 0, "Offline message sends exactly once");
    for (int i = 0; i < 3; i++) {
      JSONObject m = api.get("/api/together").getJSONArray("messages").getJSONObject(i);
      if (m.isNull("closedAt"))
        api.post(
            "/api/together",
            obj(
                "action",
                "closeMessage",
                "actor",
                "youssef",
                "id",
                m.optString("id"),
                "operationId",
                UUID.randomUUID().toString()));
    }
    ui(messages::suspend);
    android.appwidget.AppWidgetManager manager =
        android.appwidget.AppWidgetManager.getInstance(getTargetContext());
    int found = 0;
    for (android.appwidget.AppWidgetProviderInfo info : manager.getInstalledProviders())
      if (info.provider.getPackageName().equals("app.asechka.android")) found++;
    check(found == 6, "All six native widget families registered");
    ui(
        () -> {
          android.widget.RemoteViews views =
              new android.widget.RemoteViews(
                  getTargetContext().getPackageName(), R.layout.universe_widget);
          View rendered = views.apply(getTargetContext(), null);
          check(
              rendered.findViewById(R.id.widget_timer) instanceof Chronometer,
              "Widget has native live timer");
        });
    api.get("/api/keepsakes");
    java.util.List<RemoteViews> previews = UniverseWidgets.previews(getTargetContext(), api);
    check(previews.size() == 6, "Six real widget snapshots render");
    ui(
        () -> {
          for (RemoteViews preview : previews) {
            View rendered = preview.apply(getTargetContext(), null);
            check(
                ((TextView) rendered.findViewById(R.id.widget_main)).getText().length() > 0,
                "Widget includes real readable information");
          }
        });
    ui(messages::widgets);
    Thread.sleep(700);
    screenshot("226-widgets");
    ui(
        () ->
            getUiAutomation()
                .performGlobalAction(
                    android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK));
    ((java.net.HttpURLConnection)
            new java.net.URL("http://127.0.0.1:4777/__gallery").openConnection())
        .getInputStream()
        .close();
    JSONObject gallery = api.get("/memories.json");
    set("memories", gallery);
    call("select", new Class[] {int.class}, 1);
    SocialFeed feed = (SocialFeed) get("feed");
    for (int i = 0; i < 6; i++) {
      ui(() -> feed.fling(16000));
      Thread.sleep(120);
      ui(() -> feed.fling(-16000));
      Thread.sleep(120);
    }
    ui(() -> feed.fling(-18000));
    await(
        () -> feed.getFirstVisiblePosition() == 0,
        "Photo feed returns to top after rapid reversing flings");
    check(feed.getAdapter().getCount() > 35, "Large gallery remains intact");
    screenshot("226-photos-after-fling");
  }

  private void gateTests() throws Exception {
    prepareMotionFixture();
    offline(api, true);
    check(api.canOpen(), "A cached session is ready");
    set("biometrics", new BiometricDoor(activity, api.store));
    api.store.remove("biometric-enabled");
    call("openStart", new Class[] {});
    check(
        get("root") != null && (boolean) get("appUnlocked"),
        "A saved connection opens straight to Home");
    check(views(decor(), EditText.class).isEmpty(), "No custom password or number pad on Home");
    call("onPause", new Class[] {});
    call("onResume", new Class[] {});
    check(
        get("entryGate") == null && (boolean) get("appUnlocked"),
        "Normal return visits have no password screen");
    call("choosePost", new Class[] {});
    Dialog sheet = (Dialog) get("activeDialog");
    api.store.write("biometric-enabled", obj("enabled", true));
    call("onPause", new Class[] {});
    Dialog gate = (Dialog) get("entryGate");
    check(
        gate != null && gate.isShowing(),
        "Only an explicitly enabled biometric lock covers private sheets");
    check(
        views(gate.getWindow().getDecorView(), EditText.class).isEmpty(),
        "Optional biometric lock has no app-password field");
    check(
        hasText(gate.getWindow().getDecorView(), "Use phone screen lock"),
        "System phone credentials remain available");
    check(sheet.isShowing(), "Private sheets remain intact behind optional biometrics");
    api.store.remove("biometric-enabled");
    call("openDoor", new Class[] {});
    call("onResume", new Class[] {});
    check(
        get("activeDialog") == sheet && sheet.isShowing(),
        "Unlocking preserves the original sheet");
    ui(sheet::dismiss);
    set("activeDialog", null);
    call("connectionMenu", new Class[] {});
    Dialog connection = (Dialog) get("activeDialog");
    check(
        hasText(connection.getWindow().getDecorView(), "Refresh now"),
        "Force refresh is reachable");
    check(
        hasText(connection.getWindow().getDecorView(), "Reconnect & retry"),
        "Reconnection is reachable");
    ui(connection::dismiss);
    set("activeDialog", null);
    // Recover an old heart batch whose first ten taps already reached the server.
    api.store.remove("outbox");
    String day = HeartCounts.day(System.currentTimeMillis()), op = UUID.randomUUID().toString();
    JSONObject entry =
        api.store.enqueue(
            "/api/together",
            obj("action", "sendHeart", "from", "me", "count", 25, "day", day, "operationId", op));
    api.store.block(entry.getString("id"), "Old batch conflict", 409);
    api.store.retryHeartConflicts();
    check(!api.store.conflicts(), "Old heart conflicts automatically become retryable");
    JSONObject receipt =
        obj(
            "heartReceipt",
            obj("operationId", op, "from", "me", "count", 10, "day", day),
            "heartDays",
            obj(day, obj("me", 10)),
            "hearts",
            new JSONObject());
    check(api.store.reconcileHeart(entry, receipt), "Recovery uses an exact server receipt");
    JSONObject rest = api.store.queue().getJSONObject(0).getJSONObject("body");
    check(
        rest.getInt("count") == 15 && !rest.getString("operationId").equals(op),
        "Only unsaved hearts get a new immutable operation");
    check(
        HeartCounts.count(api.cached("/api/together", true), day, "me") == 25,
        "Recovered projection neither drops nor duplicates hearts");
    api.store.remove("outbox");
  }

  private void verifyHomeActionLayout() throws Exception {
    Thread.sleep(150);
    View createAction = text("＋  Create"),
        cornerAction = text("♡  Our corner"),
        savedAction = text("☆  Saved");
    check(
        createAction != null && cornerAction != null && savedAction != null,
        "All three Home actions are visible");
    check(
        Math.abs(createAction.getWidth() - cornerAction.getWidth()) <= 1
            && Math.abs(createAction.getWidth() - savedAction.getWidth()) <= 1,
        "Home actions share the available width equally");
    int[] savedPosition = new int[2];
    savedAction.getLocationOnScreen(savedPosition);
    check(
        Math.abs(
                savedPosition[0]
                    + savedAction.getWidth()
                    - (decor().getWidth()
                        - activity.getResources().getDisplayMetrics().density * 16))
            <= 2,
        "Saved reaches the right inset without empty trailing space");
  }

  private void verifyHeartWindow(HomeExtras home) throws Exception {
    long deadline = SystemClock.uptimeMillis() + 1500;
    while ((home.rain.frames == 0 || home.rain.getWidth() == 0)
        && SystemClock.uptimeMillis() < deadline) Thread.sleep(20);
    check(home.rain.running && home.rain.frames > 0, "Rapid hearts advance on display frames");
    check(
        home.rain.getHeight() >= decor().getHeight() && home.rain.getWidth() == decor().getWidth(),
        "Heart layer covers the full application window: overlay="
            + home.rain.getWidth()
            + "x"
            + home.rain.getHeight()
            + ", application="
            + decor().getWidth()
            + "x"
            + decor().getHeight());
    int[] overlayPosition = new int[2];
    home.rain.getLocationOnScreen(overlayPosition);
    check(overlayPosition[1] == 0, "Hearts can travel above the status bar inset");
    WindowManager.LayoutParams heartParams =
        (WindowManager.LayoutParams) home.rain.getLayoutParams();
    check(
        (heartParams.flags & WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE) != 0
            && (heartParams.flags & WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE) != 0,
        "Floating hearts leave all controls usable");
    Thread.sleep(180);
    captureScreenshot("home-floating-heart-layer");
  }

  private void sharedStreakTests() throws Exception {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try (InputStream in = getContext().getAssets().open("heart-streak-cases.json")) {
      byte[] buffer = new byte[4096];
      int n;
      while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
    }
    JSONArray cases = new JSONArray(out.toString("UTF-8"));
    for (int i = 0; i < cases.length(); i++) {
      JSONObject c = cases.getJSONObject(i), days = c.optJSONObject("heartDays");
      if (days == null) days = new JSONObject();
      String through = c.optString("through");
      for (String day = through;
          !day.isEmpty() && day.compareTo("2026-10-26") >= 0;
          day = HeartCounts.previous(day)) days.put(day, OfflineStore.json("me", 1));
      JSONObject data = OfflineStore.json("heartDays", days);
      SharedHeartStreak r = SharedHeartStreak.calculate(data, c.getString("today"));
      String name = c.getString("name");
      check(
          r.days == c.getInt("days")
              && r.lives == c.getInt("lives")
              && r.todayComplete == c.getBoolean("complete"),
          name + ": shared count and lives");
      check(
          new JSONArray(r.protectedDays)
              .toString()
              .equals(
                  c.optJSONArray("protected") == null
                      ? "[]"
                      : c.getJSONArray("protected").toString()),
          name + ": protected dates");
      check(
          Objects.equals(r.lastResetOn, c.has("reset") ? c.getString("reset") : null),
          name + ": reset date");
    }
    OfflineStore saved = new OfflineStore(getTargetContext(), "https://streak-race.invalid");
    saved.snapshot(
        "/api/together",
        OfflineStore.json(
            "updatedAt",
            "2026-10-25T12:01:00Z",
            "heartDays",
            OfflineStore.json("2026-10-25", OfflineStore.json("me", 9))));
    saved.snapshot(
        "/api/together",
        OfflineStore.json("updatedAt", "2026-10-25T12:00:00Z", "heartDays", new JSONObject()));
    check(
        HeartCounts.count(saved.base("/api/together"), "2026-10-25", "me") == 9,
        "An older refresh cannot erase a newer shared heart");
  }

  private void homeTests() throws Exception {
    prepareMotionFixture();
    api.get("/api/journal");
    api.get("/api/keepsakes");
    offline(api, true);
    set(
        "book",
        new BookViews(
            activity,
            api,
            new Images(api),
            java.util.concurrent.Executors.newSingleThreadExecutor(),
            uri -> {
              throw new IOException("Fixture");
            }));
    call("select", new Class[] {int.class}, 0);
    HomeExtras home = (HomeExtras) get("homeExtras");
    check(home != null, "Home has a native shortcuts hub");
    for (String title :
        new String[] {
          "Secret vocab",
          "Open when…",
          "Tiny victories",
          "Recipes for two",
          "Little things",
          "Our beginning"
        }) {
      String displayName = title.replaceFirst(" ", "\n");
      TextView shortcut = text(displayName);
      check(
          shortcut != null
              && shortcut
                      .getPaint()
                      .measureText(displayName.substring(displayName.indexOf('\n') + 1))
                  <= shortcut.getWidth() + 1,
          "Home shortcut is readable without breaking words: " + title);
    }
    View send = text("Send a heart");
    check(send != null, "Heart sender is on Home");
    verifyHomeActionLayout();
    runOnMainSync(
        () -> {
          android.os.StrictMode.ThreadPolicy previous = android.os.StrictMode.getThreadPolicy();
          android.os.StrictMode.setThreadPolicy(
              new android.os.StrictMode.ThreadPolicy.Builder()
                  .detectDiskReads()
                  .detectDiskWrites()
                  .penaltyDeath()
                  .build());
          try {
            for (int i = 0; i < 100; i++) home.send(send);
          } finally {
            android.os.StrictMode.setThreadPolicy(previous);
          }
        });
    verifyHeartWindow(home);
    home.awaitHeartWrites();
    check(
        HeartCounts.count(
                api.cached("/api/together", true),
                HeartCounts.day(System.currentTimeMillis()),
                "asechka")
            == 100,
        "Every spam tap is counted offline");
    check(api.store.queue().length() == 1, "One hundred taps are durably batched");
    String first =
        api.store.queue().getJSONObject(0).getJSONObject("body").getString("operationId");
    api.store.sealHeartBatches();
    ui(
        () -> {
          for (int i = 0; i < 5; i++) home.send(send);
        });
    home.awaitHeartWrites();
    check(api.store.queue().length() == 2, "New taps never mutate an attempted batch");
    check(
        api.store.queue().getJSONObject(0).getJSONObject("body").getLong("count") == 100,
        "Attempted batch retains original count");
    ApiClient reopened = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    offline(reopened, true);
    check(
        HeartCounts.count(
                reopened.cached("/api/together", true),
                HeartCounts.day(System.currentTimeMillis()),
                "asechka")
            == 105,
        "Cold storage retains every heart");
    check(
        home.rain == null || home.rain.particles.size() <= HeartOverlay.LIMIT,
        "Particle work is bounded while spamming");
    JSONObject streak =
        OfflineStore.json(
            "heartDays",
            OfflineStore.json(
                "2026-10-31",
                OfflineStore.json("me", 1),
                "2026-11-01",
                OfflineStore.json("me", 20)));
    check(
        HeartCounts.streak(streak, "me", "2026-11-02") == 2,
        "Yesterday’s streak remains active today");
    check(HeartCounts.streak(streak, "me", "2026-11-03") == 0, "A missed day resets the streak");
    check(
        HeartCounts.day(Dates.instant("2026-11-02T04:59:59Z")).equals("2026-11-01"),
        "Eastern midnight survives DST");
    JSONObject received =
        OfflineStore.json(
            "heartReceipts",
            new JSONArray().put(first),
            "heartDays",
            OfflineStore.json(
                HeartCounts.day(System.currentTimeMillis()), OfflineStore.json("asechka", 100)),
            "hearts",
            new JSONObject());
    HeartCounts.apply(
        received,
        api.store.queue().getJSONObject(0).getJSONObject("body"),
        System.currentTimeMillis());
    check(
        HeartCounts.count(received, HeartCounts.day(System.currentTimeMillis()), "asechka") == 100,
        "A lost acknowledgement cannot double-project hearts");
    int[][] routes = {{3, 0, 2}, {1, 1, 1}, {4, 0, 0}, {5, 0, 1}, {2, 1, 2}, {0, 1, 0}};
    for (int[] route : routes) {
      ui(() -> home.open.open(route[0]));
      BookViews book = (BookViews) get("book");
      check(
          book.chapter == route[2] && book.personal == (route[1] == 1),
          "Shortcut opens the correct native chapter");
      ui(() -> book.window.dismiss());
    }
    ui(home::update);
    ListView homeFeed = (ListView) get("feed");
    ui(() -> homeFeed.setSelection(0));
    Thread.sleep(350);
    View firstPost = homeFeed.getChildAt(1);
    android.graphics.Rect visiblePost = new android.graphics.Rect();
    check(
        firstPost != null
            && firstPost.getGlobalVisibleRect(visiblePost)
            && visiblePost.height() >= activity.getResources().getDisplayMetrics().density * 100,
        "The first post and some media are visible without scrolling Home");
    screenshot("home-hub-hearts");
    Ui.Sheet[] history = {null};
    ui(() -> history[0] = home.history());
    screenshot("home-hidden-heart-history");
    ui(() -> history[0].dismiss());
    Thread.sleep(300);
    call("settings", new Class[] {View.class}, send);
    Dialog settings = (Dialog) get("activeDialog");
    check(settings instanceof Ui.Sheet, "Settings use a rounded native sheet");
    screenshot("home-rounded-settings");
    ui(settings::dismiss);
    Thread.sleep(300);
    call("choosePost", new Class[] {});
    Dialog chooser = (Dialog) get("activeDialog");
    check(chooser instanceof Ui.Sheet, "Composer selection uses a rounded sheet");
    screenshot("home-rounded-create");
    ui(chooser::dismiss);
    offline(api, false);
    api.syncPending();
    JSONObject synced = api.get("/api/together");
    check(
        HeartCounts.count(synced, HeartCounts.day(System.currentTimeMillis()), "asechka") == 105,
        "Every queued heart reaches the shared server");
    check(api.store.queue().length() == 0, "Heart batches clear after acknowledgement");
  }

  private void bookTests() throws Exception {
    prepareMotionFixture();
    api.get("/api/journal");
    api.get("/api/keepsakes");
    offline(api, true);
    java.util.concurrent.ExecutorService worker =
        java.util.concurrent.Executors.newSingleThreadExecutor();
    BookViews[] book = {null};
    ui(
        () -> {
          book[0] =
              new BookViews(
                  activity,
                  api,
                  new Images(api),
                  worker,
                  uri -> {
                    throw new IOException("Fixture uses a prepared picture");
                  });
          book[0].show(false);
        });
    check(hasText(book[0].content, "Tiny victories"), "Native victory chapter");
    ui(
        () -> {
          book[0].edit("Victory", null);
          book[0].editor.fields.get("title").setText("A little win, kept together");
          book[0].editor.fields.get("note").setText("You kept trying.");
          book[0].editor.save();
        });
    await(() -> book[0].editor == null, "Victory editor saved durably");
    check(
        api.cached("/api/journal", true).getJSONArray("victories").length() == 1,
        "Victory visible offline");
    ui(
        () -> {
          book[0].chapter = 1;
          book[0].render();
          book[0].edit("Recipe", null);
          book[0].editor.fields.get("title").setText("Our fixture meal");
          book[0].editor.fields.get("ingredients").setText("Rice\nWater");
          book[0].editor.fields.get("steps").setText("Cook together");
          book[0].editor.tried.setChecked(true);
          book[0].editor.me.setSelection(4);
          book[0].editor.asechka.setSelection(5);
        });
    Bitmap image = Bitmap.createBitmap(400, 300, Bitmap.Config.ARGB_8888);
    image.eraseColor(android.graphics.Color.BLUE);
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    image.compress(Bitmap.CompressFormat.JPEG, 85, bytes);
    image.recycle();
    String photo =
        "data:image/jpeg;base64,"
            + android.util.Base64.encodeToString(bytes.toByteArray(), android.util.Base64.NO_WRAP);
    ui(
        () -> {
          book[0].editor.photo = photo;
          book[0].editor.save();
        });
    await(() -> book[0].editor == null, "Recipe editor saved");
    JSONObject recipe = api.cached("/api/journal", true).getJSONArray("recipes").getJSONObject(0);
    check(
        recipe.getJSONObject("ratings").getInt("me") == 4
            && recipe.getJSONObject("ratings").getInt("asechka") == 5,
        "Separate native ratings");
    check(
        api.image("/api/journal?photo=" + recipe.getString("photoId")).length > 0,
        "Recipe photo retained offline");
    ui(
        () -> {
          book[0].chapter = 2;
          book[0].render();
          book[0].edit("Joke", null);
          book[0].editor.fields.get("title").setText("Our little phrase");
          book[0].editor.fields.get("meaning").setText("It means something only to us");
          book[0].editor.save();
        });
    await(() -> book[0].editor == null, "Inside joke saved");
    ui(() -> views(book[0].content, EditText.class).get(0).setText("unmatched"));
    check(
        hasText(book[0].content, "No matching little memories yet."), "Native inside-joke search");
    ui(
        () -> {
          book[0].close();
          book[0].show(true);
        });
    check(hasText(book[0].content, "September 27, 2026"), "First conversation date shown natively");
    screenshot("25-native-since-us");
    JSONObject since = api.cached("/api/keepsakes", true).getJSONObject("since");
    check(
        since.getString("startedAt").equals("2026-10-16T19:41:00.000Z"),
        "Couple beginning preserved");
    ui(
        () -> {
          book[0].chapter = 1;
          book[0].render();
        });
    check(views(book[0].content, Button.class).size() >= 6, "Letters listed together");
    JSONObject letter = api.cached("/api/keepsakes", true).getJSONArray("letters").getJSONObject(0);
    ui(
        () -> {
          book[0].edit("Letter", letter);
          book[0].editor.fields.get("text").setText("My own words, kept from the phone.");
          book[0].editor.save();
        });
    await(() -> book[0].editor == null, "Letter edit saved offline");
    check(api.store.pending() == 4, "All four changes queued once");
    ApiClient restart = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    offline(restart, true);
    check(
        restart.cached("/api/journal", true).getJSONArray("jokes").length() == 1,
        "Book restored after restart");
    offline(api, false);
    api.syncPending();
    check(api.store.pending() == 0, "Book and keepsakes synchronized");
    check(
        api.get("/api/journal").getJSONArray("recipes").length() == 1,
        "Recipe synchronized exactly once");
    check(
        api.get("/api/keepsakes")
            .getJSONArray("letters")
            .getJSONObject(0)
            .getString("text")
            .equals("My own words, kept from the phone."),
        "Letter synchronized");
    ui(() -> book[0].close());
    worker.shutdownNow();
    check(
        BookViews.validDate("2026-09-27") && !BookViews.validDate("2026-02-30"), "Date validation");
  }

  private void socialTests() throws Exception {
    prepareMotionFixture();
    boolean backgroundsReady = true;
    for (int i = 0; i < 10; i++) {
      byte[] bytes = api.image(QuoteBackgrounds.source(i));
      Bitmap artwork = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
      backgroundsReady &= artwork != null && artwork.getWidth() == 768;
      if (artwork != null) artwork.recycle();
    }
    check(
        backgroundsReady, "All ten local quote backgrounds decode without network image requests");
    boolean noRepeats = true;
    Set<Integer> usedBackgrounds = new HashSet<>();
    int previousBackground = -1;
    for (int i = 0; i < 2000; i++) {
      int next =
          QuoteBackgrounds.next(
              i % 2 == 0 ? "Repeated quote ♡" : "Quote " + i + " 😀", previousBackground);
      noRepeats &= next != previousBackground && next >= 0 && next < 10;
      usedBackgrounds.add(next);
      previousBackground = next;
    }
    check(
        noRepeats && usedBackgrounds.size() == 10,
        "Quote artwork varies without adjacent repeats, including colliding and Unicode IDs");
    byte[] photoBytes = new byte[200000];
    new Random(23).nextBytes(photoBytes);
    api.store.bytes("image:qa-roundtrip", photoBytes);
    check(
        Arrays.equals(photoBytes, api.store.bytes("image:qa-roundtrip")),
        "Encrypted photo bytes survive a cold disk read");
    api.store.remove("image:qa-roundtrip");
    check(api.prefetchMedia() == 0, "Fixture photos saved before going offline");
    offline(api, true);
    getTargetContext()
        .getSharedPreferences("preferences", 0)
        .edit()
        .remove("saved-posts:asnat")
        .commit();
    chrome("Social home");
    for (int screen : new int[] {0, 1, 5, 2, 3, 4}) {
      call("select", new Class[] {int.class}, screen);
      check(
          ((ViewGroup) get("bottom")).getChildCount() == 6,
          "All six native tabs remain: " + screen);
    }
    call("select", new Class[] {int.class}, 0);
    SocialFeed feed = (SocialFeed) get("feed");
    check(feed.items().size() == 3, "Home combines photos and quotes");
    check(
        feed.getParent() instanceof FrameLayout,
        "Feed scrolls natively outside the old ScrollView");
    screenshot("20-social-home");
    SocialFeed.Post quote = null, photo = null;
    for (SocialFeed.Post post : feed.items()) {
      if (post.kind.equals("quote")) quote = post;
      else photo = post;
    }
    final SocialFeed.Post q = quote, p = photo;
    String cachedSource =
        ApiClient.photoURL(
            api.store.base("/memories.json").getJSONArray("photos").getJSONObject(0));
    check(
        p.source().equals(cachedSource),
        "Feed and cached photo references match: " + p.source() + " / " + cachedSource);
    check(
        api.store.bytes("image:/" + p.value.optString("src")) != null,
        "Original photo bytes saved by prefetch");
    check(
        p.id.equals(android.net.Uri.parse(p.source()).getQueryParameter("id")),
        "Photo URL identifier decoded on old Android");
    check(
        api.image(p.source()).length > 0,
        "Current photo is available from encrypted offline storage");
    ui(() -> activity.react(q, true, feed));
    await(() -> api.store.pending() == 1, "Offline like durable");
    check(
        api.cached("/memories.json", true).toString().contains("\"asnat\":true"),
        "Like projected locally");
    ui(() -> activity.react(q, false, feed));
    await(() -> api.store.pending() == 2, "Offline unlike durable and ordered");
    ui(() -> activity.savePost(p));
    check(activity.saved(p), "Bookmark saved per profile");
    call("select", new Class[] {int.class}, 1);
    ui(() -> ((SocialFeed) uncheckedGet("feed")).setSelection(1));
    await(() -> hasBitmap(decor()), "Gallery photo decoded");
    ImageView fittedPhoto = views(decor(), Motion.LivingImage.class).get(0);
    await(
        () -> fittedPhoto.getDrawable() instanceof android.graphics.drawable.BitmapDrawable,
        "Photo crossfade completes");
    android.graphics.drawable.Drawable fittedDrawable = fittedPhoto.getDrawable();
    check(
        Math.abs(
                fittedPhoto.getHeight()
                    - fittedPhoto.getWidth()
                        * (float) fittedDrawable.getIntrinsicHeight()
                        / fittedDrawable.getIntrinsicWidth())
            <= 2,
        "Photo card hugs the decoded image ratio without letterbox space");
    screenshot("21-social-photo");
    ui(() -> activity.comments(q));
    Dialog comments = (Dialog) get("activeDialog");
    ui(
        () ->
            views(comments.getWindow().getDecorView(), EditText.class)
                .get(0)
                .setText("A little offline love ♡ שלום"));
    clickIn(comments, "Send");
    await(() -> api.store.pending() == 3, "Comment queued without waiting for network");
    check(
        api.cached("/memories.json", true).toString().contains("A little offline love"),
        "Unicode comment visible in projected collection");
    screenshot("22-comments");
    ui(() -> comments.dismiss());
    ui(() -> activity.createPost(false));
    Dialog editor = (Dialog) get("activeDialog");
    ui(
        () ->
            views(editor.getWindow().getDecorView(), EditText.class)
                .get(0)
                .setText("A new native social quote ♡"));
    screenshot("23-composer");
    clickIn(editor, "Share");
    await(() -> get("activeDialog") == null, "Quote composer closes after durable local save");
    await(() -> api.store.pending() == 4, "New quote durable offline");
    JSONObject local = api.cached("/memories.json", true);
    check(local.getJSONArray("quotes").length() == 3, "Quote added to shared feed locally");
    JSONObject newest = local.getJSONArray("quotes").getJSONObject(2);
    check(newest.getString("author").equals("asnat"), "Post author follows selected identity");
    check(
        newest.optString("editVersion").startsWith("local:"),
        "New post can be edited before it syncs");
    ApiClient restart = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    offline(restart, true);
    check(restart.store.pending() == 4, "Social changes survive a cold API restart");
    offline(restart, false);
    restart.syncPending();
    check(restart.store.pending() == 0, "Reconnect syncs likes, unlike, comment, and post");
    JSONObject server = restart.get("/memories.json");
    JSONObject serverQuote = null;
    for (int i = 0; i < server.getJSONArray("quotes").length(); i++) {
      JSONObject item = server.getJSONArray("quotes").getJSONObject(i);
      if (item.getString("id").equals(q.id)) serverQuote = item;
    }
    check(
        serverQuote != null
            && !serverQuote.getJSONObject("social").getJSONObject("likes").getBoolean("asnat"),
        "Final unlike wins after ordered sync");
    check(
        serverQuote.getJSONObject("social").getJSONArray("comments").length() == 1,
        "Comment synchronized exactly once");
    String op = UUID.randomUUID().toString();
    JSONObject like =
        obj(
            "action",
            "setLike",
            "kind",
            "quote",
            "id",
            q.id,
            "actor",
            "youssef",
            "liked",
            true,
            "operationId",
            op);
    restart.post("/api/memories", like);
    restart.post("/api/memories", like);
    check(
        restart.get("/memories.json").toString().contains("\"youssef\":true"),
        "Other profile sees shared like");
    offline(api, false);
    api.get("/memories.json");
    call("restoreSaved", new Class[] {});
    call("render", new Class[] {boolean.class}, false);
    ui(() -> activity.createPost(true));
    Dialog photoEditor = (Dialog) get("activeDialog");
    File source = new File(getTargetContext().getCacheDir(), "social-photo.png");
    Bitmap sample = Bitmap.createBitmap(1000, 750, Bitmap.Config.ARGB_8888);
    sample.eraseColor(0xffb5ceee);
    try (FileOutputStream out = new FileOutputStream(source)) {
      sample.compress(Bitmap.CompressFormat.PNG, 100, out);
    }
    sample.recycle();
    call(
        "onActivityResult",
        new Class[] {int.class, int.class, Intent.class},
        121,
        Activity.RESULT_OK,
        new Intent().setData(Uri.fromFile(source)));
    await(
        () -> !((boolean) inner(get("memoryEditor"), "photoBusy")),
        "Native photo picker prepares JPEG");
    ui(
        () ->
            views(photoEditor.getWindow().getDecorView(), EditText.class)
                .get(0)
                .setText("Our social photo"));
    clickIn(photoEditor, "Share");
    await(() -> get("activeDialog") == null, "Photo saved by native composer");
    api.syncPending();
    JSONObject photos = api.get("/memories.json");
    check(photos.getJSONArray("photos").length() == 2, "Photo shared through the website API");
    JSONObject uploaded = photos.getJSONArray("photos").getJSONObject(1);
    check(
        api.image(ApiClient.photoURL(uploaded)).length > 20,
        "Versioned photo URL serves uploaded image");
    call("restoreSaved", new Class[] {});
    call("render", new Class[] {boolean.class}, false);
    call("select", new Class[] {int.class}, 5);
    check(get("quoteText") != null, "Quote carousel retained above quote posts");
    screenshot("24-social-quotes");
    SocialFeed quoteFeed = (SocialFeed) get("feed");
    ui(() -> quoteFeed.setSelection(1));
    await(() -> quoteFeed.getFirstVisiblePosition() == 1, "Quote post scrolled into view");
    TextView fittedQuote = (TextView) inner(quoteFeed.getChildAt(0).getTag(), "quote");
    check(
        fittedQuote.getMinimumHeight() == 0
            && Math.abs(((View) fittedQuote.getParent()).getHeight() - fittedQuote.getHeight())
                <= 2,
        "Quote media hugs text height; its artwork does not add empty space");
    screenshot("26-soft-orbit-quote-post");
    call("select", new Class[] {int.class}, 2);
    call("select", new Class[] {int.class}, 3);
    call("select", new Class[] {int.class}, 4);
    chrome("Personal tools");
  }

  private Object inner(Object object, String name) throws Exception {
    Field field = object.getClass().getDeclaredField(name);
    field.setAccessible(true);
    return field.get(object);
  }

  private void clickIn(Dialog dialog, String label) {
    for (TextView view : views(dialog.getWindow().getDecorView(), TextView.class))
      if (view.getText().toString().equals(label)) {
        if (Looper.myLooper() == Looper.getMainLooper()) view.performClick();
        else ui(view::performClick);
        return;
      }
    throw new AssertionError("Missing dialog control: " + label);
  }

  private void motionAndPublishingTests() throws Exception {
    offline(api, false);
    api.login("native-test-code");
    call("select", new Class[] {int.class}, 0);
    check(((ViewGroup) get("bottom")).getChildCount() == 6, "Six native navigation tabs");
    for (String label : new String[] {"Home", "Photos", "Quotes", "Music", "Our days", "Words"})
      check(text(label) != null, "Navigation label " + label);
    check(
        ((SocialFeed) get("feed")).items().size() > 0, "Native social home restores shared posts");
    call("select", new Class[] {int.class}, 1);
    await(() -> hasBitmap(decor()), "Private gallery photo renders a real bitmap");
    check(text("Something to share, Asnat?") != null, "Native post composer entry point");
    View touchTarget = (View) text("Something to share, Asnat?").getParent();
    ui(
        () ->
            touchTarget.dispatchTouchEvent(
                MotionEvent.obtain(
                    android.os.SystemClock.uptimeMillis(),
                    android.os.SystemClock.uptimeMillis(),
                    MotionEvent.ACTION_DOWN,
                    20,
                    20,
                    0)));
    Thread.sleep(160);
    check(touchTarget.getScaleX() < .99f, "Native touch press visibly animates");
    ui(
        () ->
            touchTarget.dispatchTouchEvent(
                MotionEvent.obtain(
                    android.os.SystemClock.uptimeMillis(),
                    android.os.SystemClock.uptimeMillis(),
                    MotionEvent.ACTION_CANCEL,
                    20,
                    20,
                    0)));
    Thread.sleep(380);
    check(Math.abs(touchTarget.getScaleX() - 1) < .01f, "Touch release returns smoothly to rest");
    screenshot("14-photos");
    call("select", new Class[] {int.class}, 5);
    getTargetContext()
        .getSharedPreferences("preferences", 0)
        .edit()
        .putBoolean("motion-paused", false)
        .commit();
    call("nextQuote", new Class[] {int.class}, 0);
    int initialIndex = (int) get("quoteIndex");
    Thread.sleep(8900);
    check(
        (int) get("quoteIndex") != initialIndex,
        "Quotes automatically slide after eight seconds: motion="
            + Motion.enabled(activity)
            + ", started="
            + get("started")
            + ", paused="
            + get("quotePaused")
            + ", dialog="
            + get("activeDialog")
            + ", visible="
            + ((View) get("quoteText")).getGlobalVisibleRect(new android.graphics.Rect())
            + ", count="
            + ((JSONObject) get("memories")).getJSONArray("quotes").length());
    click("Pause");
    int pausedIndex = (int) get("quoteIndex");
    Thread.sleep(8500);
    check((int) get("quoteIndex") == pausedIndex, "Pause stops quote autoplay");
    click("Resume");
    View quoteView = (View) get("quoteText");
    getTargetContext()
        .getSharedPreferences("preferences", 0)
        .edit()
        .putBoolean("motion-paused", true)
        .commit();
    call("nextQuote", new Class[] {int.class}, 1);
    check(
        quoteView.getAlpha() == 1 && quoteView.getTranslationX() == 0,
        "Reduced motion removes quote transitions");
    check(!Motion.enabled(activity), "System/app motion preferences are respected");
    getTargetContext()
        .getSharedPreferences("preferences", 0)
        .edit()
        .putBoolean("motion-paused", false)
        .commit();
    screenshot("15-quotes");
    ui(() -> activity.createPost(false));
    Dialog editor = (Dialog) get("activeDialog");
    ui(
        () -> {
          ArrayList<EditText> fields = views(editor.getWindow().getDecorView(), EditText.class);
          fields.get(0).setText("A quote added inside the native app ♡");
          fields.get(1).setText("Shared with our website");
          clickIn(editor, "Share");
        });
    await(
        () -> get("activeDialog") == null && ((SocialFeed) get("feed")).items().size() == 3,
        "Native quote form publishes shared content");
    check(
        api.get("/memories.json").getJSONArray("quotes").length() == 3,
        "App quote visible through the shared website API");
    call("select", new Class[] {int.class}, 1);
    ui(() -> activity.createPost(true));
    Dialog photoEditor = (Dialog) get("activeDialog");
    File source = new File(getTargetContext().getCacheDir(), "upload-test.png");
    Bitmap sample = Bitmap.createBitmap(1200, 900, Bitmap.Config.ARGB_8888);
    sample.eraseColor(0xffbbcfee);
    try (FileOutputStream out = new FileOutputStream(source)) {
      sample.compress(Bitmap.CompressFormat.PNG, 100, out);
    }
    sample.recycle();
    Intent selection = new Intent().setData(Uri.fromFile(source));
    call(
        "onActivityResult",
        new Class[] {int.class, int.class, Intent.class},
        121,
        Activity.RESULT_OK,
        selection);
    await(
        () -> !((boolean) inner(get("memoryEditor"), "photoBusy")),
        "Native picker creates an upload preview");
    ui(
        () -> {
          views(photoEditor.getWindow().getDecorView(), EditText.class)
              .get(0)
              .setText("Our photo from the app");
          clickIn(photoEditor, "Share");
        });
    await(
        () -> get("activeDialog") == null && text("Our photo from the app") != null,
        "Native photo form publishes caption and photo");
    JSONObject saved = api.get("/memories.json");
    check(
        saved.getJSONArray("photos").length() == 2, "App photo visible through shared collection");
    String photoId = saved.getJSONArray("photos").getJSONObject(1).getString("id");
    check(
        api.image("/api/together-photo?kind=memory&id=" + photoId).length > 20,
        "New shared photo immediately accessible");
    offline(api, true);
    String quoteId = UUID.randomUUID().toString();
    JSONObject quote =
        obj(
            "action",
            "addQuote",
            "operationId",
            quoteId,
            "date",
            "2026-10-17",
            "text",
            "Kept while offline",
            "note",
            "");
    check(
        api.post("/api/memories", quote).optBoolean("_pending"),
        "Offline quote is queued and immediately visible");
    Method compress = MainActivity.class.getDeclaredMethod("compressPhoto", Uri.class);
    compress.setAccessible(true);
    String encoded = (String) compress.invoke(activity, Uri.fromFile(source));
    String pendingPhoto = UUID.randomUUID().toString();
    JSONObject photo =
        obj(
            "action",
            "addPhoto",
            "operationId",
            pendingPhoto,
            "date",
            "2026-10-17",
            "caption",
            "Our offline photo",
            "photo",
            encoded);
    check(
        api.post("/api/memories", photo).getJSONArray("photos").length() == 3,
        "Offline photo appears immediately in the saved album");
    ApiClient restarted = new ApiClient(getTargetContext(), "http://127.0.0.1:4777");
    offline(restarted, true);
    check(restarted.store.pending() == 2, "Quote and photo queue survives a new client");
    check(
        restarted.image("/api/together-photo?kind=memory&id=" + pendingPhoto).length > 20,
        "Queued photo readable offline after restart");
    offline(restarted, false);
    restarted.syncPending();
    check(restarted.store.pending() == 0, "Both offline additions synchronize on reconnection");
    check(
        restarted.get("/memories.json").getJSONArray("quotes").length() == 4,
        "Offline quote shared once");
    restarted.post("/api/memories", quote);
    restarted.post("/api/memories", photo);
    check(
        restarted.get("/memories.json").getJSONArray("photos").length() == 3,
        "Retried photo does not duplicate");
    offline(api, false);
    set("memories", api.get("/memories.json"));
    call("render", new Class[] {boolean.class}, false);
    screenshot("16-published-photos");
  }

  private Object uncheckedGet(String key) {
    try {
      return get(key);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }
}
