package app.asechka.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native HTTPS API with encrypted persistent snapshots and an ordered durable outbox. */
public final class ApiClient {
  public static final String SITE = "https://asechka-website.vercel.app";
  private static final String KEY = "asechka-session-v1";
  private final SharedPreferences prefs;
  private final String base;
  final OfflineStore store;
  private final Context context;
  private Boolean onlineOverride;
  private static final Set<String> syncing = new HashSet<>();
  private String cookie = "";
  private long expires;

  public static final class ApiError extends IOException {
    public final int status;

    ApiError(String message, int status) {
      super(message);
      this.status = status;
    }
  }

  public ApiClient(Context context) {
    this(context, SITE);
  }

  ApiClient(Context context, String base) {
    this.base = base;
    this.context = context.getApplicationContext();
    store = new OfflineStore(context, base);
    prefs =
        context.getSharedPreferences(
            base.equals(SITE) ? "private-session" : "session-" + OfflineStore.hash(base),
            Context.MODE_PRIVATE);
    try {
      String stored = prefs.getString("session", "");
      if (!stored.isEmpty()) {
        String[] parts = stored.split(":");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            key(),
            new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        cookie =
            new String(
                cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        expires = prefs.getLong("expires", 0);
      }
    } catch (Exception ignored) {
      clearSession();
    }
  }

  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (store.containsAlias(KEY)) return (SecretKey) store.getKey(KEY, null);
    KeyGenerator generator =
        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(
        new KeyGenParameterSpec.Builder(
                KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
    return generator.generateKey();
  }

  public synchronized boolean signedIn() {
    return !cookie.isEmpty()
        && expires > System.currentTimeMillis()
        && prefs.getLong("expires", 0) > System.currentTimeMillis();
  }

  public synchronized void clearSession() {
    cookie = "";
    expires = 0;
    prefs.edit().clear().apply();
  }

  private synchronized void captureCookies(HttpURLConnection connection) throws IOException {
    for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
      if (!"Set-Cookie".equalsIgnoreCase(entry.getKey())) continue;
      for (String value : entry.getValue())
        for (HttpCookie found : HttpCookie.parse(value)) {
          if (!"asechka_session".equals(found.getName())) continue;
          if (found.getValue().isEmpty() || found.getMaxAge() == 0) {
            clearSession();
            continue;
          }
          cookie = found.getName() + "=" + found.getValue();
          expires =
              System.currentTimeMillis() + Math.min(604800, Math.max(0, found.getMaxAge())) * 1000L;
          try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String stored =
                Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                    + ":"
                    + Base64.encodeToString(
                        cipher.doFinal(cookie.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            prefs.edit().putString("session", stored).putLong("expires", expires).commit();
          } catch (Exception error) {
            clearSession();
            throw new IOException(
                "Your phone couldn’t securely save the sign-in. Please try again.");
          }
        }
    }
  }

  public JSONObject login(String password) throws Exception {
    if (!connected()) {
      if (store.unlockWithCode(password)) return OfflineStore.json("offline", true);
      throw new ApiError(
          "Connect to unlock for the first time, or use the code last used on this phone.", 0);
    }
    JSONObject result;
    try {
      result =
          json(
              "/api/session",
              "POST",
              "password=" + URLEncoder.encode(password, "UTF-8"),
              "application/x-www-form-urlencoded");
    } catch (IOException error) {
      if (!(error instanceof ApiError)
          || ((ApiError) error).status == 0
          || ((ApiError) error).status >= 500) {
        if (store.unlockWithCode(password)) return OfflineStore.json("offline", true);
      }
      throw error;
    }
    store.rememberCode(password);
    return result;
  }

  public void logout() throws Exception {
    try {
      exchange("/api/logout", "POST", "", "application/x-www-form-urlencoded", 10000);
    } finally {
      clearSession();
      store.lock();
    }
  }

  public JSONObject get(String path) throws Exception {
    Exception failure = null;
    if (connected() && signedIn()) {
      try {
        JSONObject result =
            json(path.equals("/memories.json") ? "/api/memories" : path, "GET", null, null);
        if (!signedIn()) throw new ApiError("Open our little door again to sync.", 401);
        store.snapshot(path, result);
        // Login explicitly unlocks offline storage. A late GET must never undo a user lock.
        return cached(path, false);
      } catch (Exception error) {
        failure = error;
      }
    }
    JSONObject saved = store.unlocked() ? cached(path, true) : null;
    if (saved != null) return saved;
    if (failure != null) throw failure;
    throw new ApiError("Connect once to save this content on your phone.", 0);
  }

  public JSONObject post(String path, JSONObject body) throws Exception {
    if (!canOpen()) throw new ApiError("Open our little door again.", 401);
    if (path.equals("/api/music")
        || path.equals("/api/together")
        || path.equals("/api/memories")
        || path.equals("/api/journal")
        || path.equals("/api/keepsakes")) {
      JSONObject entry = store.enqueue(path, body);
      syncPending();
      JSONObject remaining = store.entry(entry.getString("id"));
      if (remaining != null && !remaining.optString("status").equals("pending"))
        throw new ApiError(remaining.optString("error"), remaining.optInt("code", 409));
      return cached(path.equals("/api/memories") ? "/memories.json" : path, !connected());
    }
    if (path.equals("/api/translation")) {
      if (!connected() || !signedIn()) {
        JSONObject saved =
            store.read("translation:" + OfflineStore.hash(OfflineStore.canonical(body)));
        if (saved != null) return saved;
        throw new ApiError(
            "New translations need internet. Your saved translations are available in history.", 0);
      }
      JSONObject result = json(path, "POST", body.toString(), "application/json");
      store.saveTranslation(body, result);
      return result;
    }
    return json(path, "POST", body.toString(), "application/json");
  }

  boolean connected() {
    if (onlineOverride != null) return onlineOverride;
    ConnectivityManager manager =
        (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
    NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
    return capabilities != null
        && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
  }

  boolean canOpen() {
    return signedIn() || store.unlocked();
  }

  JSONObject cached(String path, boolean offline) throws Exception {
    JSONObject data = store.projected(path);
    if (data != null) {
      data.put("_offline", offline);
      data.put("_needsSignIn", !signedIn());
    }
    return data;
  }

  void syncPending() throws Exception {
    if (!connected() || !signedIn() || !store.unlocked()) return;
    synchronized (syncing) {
      if (!syncing.add(base)) return;
    }
    try {
      while (true) {
        store.sealHeartBatches();
        JSONArray items = store.queue();
        if (items.length() == 0) break;
        if (!store.unlocked() || !signedIn() || Thread.currentThread().isInterrupted()) break;
        JSONObject entry = items.getJSONObject(0);
        if (!entry.optString("status").equals("pending")) break;
        String path = entry.getString("path");
        try {
          JSONObject response =
              json(path, "POST", store.mappedBody(entry).toString(), "application/json");
          store.acknowledge(entry, response);
        } catch (ApiError error) {
          if (error.status == 401
              || error.status == 0
              || error.status >= 500
              || error.status == 429) break;
          store.block(entry.getString("id"), error.getMessage(), error.status);
          try {
            store.snapshot(path, json(path, "GET", null, null));
          } catch (Exception ignored) {
          }
          break;
        } catch (IOException error) {
          break;
        }
      }
    } finally {
      synchronized (syncing) {
        syncing.remove(base);
      }
    }
  }

  /** Download every referenced image, including content on screens never opened. */
  int prefetchMedia() {
    Set<String> urls = new LinkedHashSet<>();
    JSONObject album = store.base("/memories.json");
    collectImages(album, urls);
    if (album != null && album.optJSONArray("photos") != null)
      for (int i = 0; i < album.optJSONArray("photos").length(); i++) {
        JSONObject photo = album.optJSONArray("photos").optJSONObject(i);
        if (photo != null && !photo.optString("id").isEmpty()) urls.add(photoURL(photo));
      }
    collectImages(store.base("/api/music"), urls);
    collectImages(store.base("/api/daily-memory"), urls);
    JSONObject together = store.base("/api/together");
    if (together != null) {
      JSONArray items = together.optJSONArray("bucketList");
      if (items != null)
        for (int i = 0; i < items.length(); i++) {
          String id = items.optJSONObject(i).optString("photoId", "");
          if (!id.isEmpty() && !id.equals("null"))
            urls.add("/api/together-photo?kind=bucket&id=" + id);
        }
    }
    JSONObject journal = store.base("/api/journal");
    JSONArray recipes = journal == null ? null : journal.optJSONArray("recipes");
    if (recipes != null)
      for (int i = 0; i < recipes.length(); i++) {
        JSONObject recipe = recipes.optJSONObject(i);
        String id = recipe == null ? "" : recipe.optString("photoId", "");
        if (!id.isEmpty() && !id.equals("null")) urls.add("/api/journal?photo=" + id);
      }
    int missing = 0;
    for (String url : urls) {
      if (Thread.currentThread().isInterrupted()) break;
      try {
        image(url);
      } catch (Exception error) {
        missing++;
      }
    }
    return missing;
  }

  private void collectImages(Object data, Set<String> urls) {
    if (data instanceof JSONObject) {
      JSONObject object = (JSONObject) data;
      Iterator<String> keys = object.keys();
      while (keys.hasNext()) {
        String key = keys.next();
        Object value = object.opt(key);
        if (value instanceof String
            && (key.equals("src")
                || key.equals("artworkUrl")
                || key.equals("artwork")
                || key.equals("image"))
            && !((String) value).isEmpty()) urls.add((String) value);
        else collectImages(value, urls);
      }
    } else if (data instanceof JSONArray) {
      JSONArray list = (JSONArray) data;
      for (int i = 0; i < list.length(); i++) collectImages(list.opt(i), urls);
    }
  }

  private JSONObject json(String path, String method, String body, String type) throws Exception {
    byte[] bytes = exchange(path, method, body, type, 4 * 1024 * 1024);
    try {
      return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    } catch (Exception error) {
      throw new ApiError("The server returned an unexpected response. Please try again.", 502);
    }
  }

  public byte[] image(String url) throws Exception {
    String name = url.startsWith(base + "/") ? url.substring(base.length()) : url;
    if (name.startsWith("assets/")) name = "/" + name;
    String bundled = name;
    String cacheName = name;
    boolean original = true;
    if (name.startsWith("/api/together-photo?kind=memory&id=")) {
      String id = android.net.Uri.parse(name).getQueryParameter("id");
      JSONObject savedMemories = store.projected("/memories.json");
      JSONArray photos = savedMemories == null ? null : savedMemories.optJSONArray("photos");
      if (photos != null)
        for (int i = 0; i < photos.length(); i++) {
          JSONObject photo = photos.optJSONObject(i);
          if (photo != null && photo.optString("id").equals(id)) {
            bundled = "/" + photo.optString("src");
            cacheName = bundled;
            original = !photo.has("revision");
            break;
          }
        }
    }
    if (bundled.startsWith("/assets/") && !bundled.contains("..")) {
      try {
        return read(context.getAssets().open("default/" + bundled.substring(8)), 12 * 1024 * 1024);
      } catch (FileNotFoundException ignored) {
      }
    }
    byte[] saved = store.bytes("image:" + cacheName);
    if (saved == null && original && !cacheName.equals(name)) {
      String id = android.net.Uri.parse(name).getQueryParameter("id");
      saved = store.bytes("image:/api/together-photo?kind=memory&id=" + id);
    }
    if (saved != null) return saved;
    if (!connected())
      throw new IOException("This image hasn't finished saving for offline use yet.");
    byte[] result = fetchImage(name);
    store.bytes("image:" + cacheName, result);
    return result;
  }

  static String photoURL(JSONObject photo) {
    String id = photo.optString("id");
    return photo.optString("src").startsWith("assets/photos/") && !id.isEmpty()
        ? "/api/together-photo?kind=memory&id="
            + id
            + "&v="
            + photo.optString("revision", photo.optString("contentHash", id))
        : photo.optString("src");
  }

  private byte[] fetchImage(String url) throws Exception {
    URI uri = new URI(url);
    if (!uri.isAbsolute())
      return exchange(url.startsWith("/") ? url : "/" + url, "GET", null, null, 12 * 1024 * 1024);
    if (url.startsWith(base + "/"))
      return exchange(url.substring(base.length()), "GET", null, null, 12 * 1024 * 1024);
    // Catalog artwork is the only third-party resource fetched. Never send our cookie to it.
    if (!"https".equals(uri.getScheme())
        || uri.getHost() == null
        || !uri.getHost().endsWith(".mzstatic.com")
        || uri.getRawUserInfo() != null) throw new IOException("Image unavailable.");
    HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
    connection.setConnectTimeout(12000);
    connection.setReadTimeout(15000);
    connection.setInstanceFollowRedirects(false);
    try {
      if (connection.getResponseCode() != 200) throw new IOException("Image unavailable.");
      return read(connection.getInputStream(), 8 * 1024 * 1024);
    } finally {
      connection.disconnect();
    }
  }

  private byte[] exchange(String path, String method, String body, String type, int limit)
      throws Exception {
    if (!path.startsWith("/") || path.startsWith("//") || path.contains("\\"))
      throw new IOException("Invalid request.");
    URL target = new URL(base + path);
    HttpURLConnection connection = (HttpURLConnection) target.openConnection();
    connection.setRequestMethod(method);
    connection.setConnectTimeout(15000);
    connection.setReadTimeout("POST".equals(method) ? 60000 : 20000);
    connection.setInstanceFollowRedirects(false);
    connection.setUseCaches(false);
    connection.setRequestProperty("Accept", "application/json");
    connection.setRequestProperty("Cache-Control", "no-store");
    connection.setRequestProperty("User-Agent", "Asechka-Android/2.2.1");
    connection.setRequestProperty("Origin", base);
    final String sentCookie;
    final String sentSession = prefs.getString("session", "");
    synchronized (this) {
      sentCookie = signedIn() ? cookie : "";
      if (!sentCookie.isEmpty()) connection.setRequestProperty("Cookie", sentCookie);
    }
    if (path.equals("/api/journal")) connection.setRequestProperty("X-Asechka-Journal", "1");
    if (path.equals("/api/keepsakes")) connection.setRequestProperty("X-Asechka-Keepsakes", "1");
    if (path.equals("/api/music")) connection.setRequestProperty("X-Asechka-Music", "1");
    if (path.equals("/api/memories")) connection.setRequestProperty("X-Asechka-Memories", "1");
    if (path.equals("/api/together")) connection.setRequestProperty("X-Asechka-Together", "1");
    if (path.equals("/api/translation"))
      connection.setRequestProperty("X-Asechka-Translation", "1");
    try {
      if (body != null) {
        byte[] encoded = body.getBytes(StandardCharsets.UTF_8);
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(encoded.length);
        connection.setRequestProperty("Content-Type", type);
        try (OutputStream out = connection.getOutputStream()) {
          out.write(encoded);
        }
      }
      int code = connection.getResponseCode();
      captureCookies(connection);
      if (path.equals("/api/logout") && code == 303) return new byte[0];
      if (code == 401 || code == 303 && "/login".equals(connection.getHeaderField("Location"))) {
        synchronized (this) {
          if (!path.equals("/api/session")
              && sentCookie.equals(cookie)
              && sentSession.equals(prefs.getString("session", ""))) clearSession();
        }
        String message = "Unlock our little door again to see our memories.";
        try {
          message =
              new JSONObject(
                      new String(read(connection.getErrorStream(), 16384), StandardCharsets.UTF_8))
                  .optString("error", message);
        } catch (Exception ignored) {
        }
        throw new ApiError(message, 401);
      }
      if (code < 200 || code >= 300) {
        String message =
            code == 429
                ? "Give it a little moment, then try again."
                : "Our connection needs a moment. Please try again.";
        try {
          message =
              new JSONObject(
                      new String(read(connection.getErrorStream(), 16384), StandardCharsets.UTF_8))
                  .optString("error", message);
        } catch (Exception ignored) {
        }
        throw new ApiError(message, code);
      }
      return read(connection.getInputStream(), limit);
    } catch (SocketTimeoutException error) {
      throw new ApiError(
          "The connection is taking longer. Your edits are still here; try again.", 0);
    } finally {
      connection.disconnect();
    }
  }

  private static byte[] read(InputStream in, int limit) throws IOException {
    if (in == null) return new byte[0];
    try (InputStream input = in;
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int count;
      while ((count = input.read(buffer)) != -1) {
        if (output.size() + count > limit) throw new IOException("The response was too large.");
        output.write(buffer, 0, count);
      }
      return output.toByteArray();
    }
  }
}
