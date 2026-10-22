package app.asechka.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.json.*;

/**
 * Durable, encrypted app-private content. Atomic writes also protect pending changes after a crash.
 */
final class OfflineStore {
  static final Object LOCK = new Object();
  private static final android.util.LruCache<String, byte[]> HOT =
      new android.util.LruCache<String, byte[]>(8 * 1024 * 1024) {
        protected int sizeOf(String key, byte[] value) {
          return value.length;
        }
      };
  private static volatile SecretKey savedKey;
  private static final String KEY = "asechka-offline-v2";
  final Context context;
  final String namespace;
  final File directory;

  OfflineStore(Context context, String namespace) {
    this.context = context.getApplicationContext();
    this.namespace = namespace;
    directory = new File(this.context.getFilesDir(), "offline-" + hash(namespace).substring(0, 16));
    directory.mkdirs();
  }

  static String hash(String value) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder text = new StringBuilder();
      for (byte b : digest) text.append(String.format(Locale.ROOT, "%02x", b & 255));
      return text.toString();
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  private SecretKey key() throws Exception {
    if (savedKey != null) return savedKey;
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (store.containsAlias(KEY)) return savedKey = (SecretKey) store.getKey(KEY, null);
    KeyGenerator generator =
        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(
        new KeyGenParameterSpec.Builder(
                KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
    return savedKey = generator.generateKey();
  }

  byte[] bytes(String name) {
    String hotKey = namespace + "\n" + name;
    byte[] hit = HOT.get(hotKey);
    if (hit != null) return hit.clone();
    synchronized (LOCK) {
      AtomicFile file = new AtomicFile(new File(directory, hash(name)));
      try (DataInputStream input = new DataInputStream(file.openRead())) {
        byte[] iv = new byte[12];
        input.readFully(iv);
        ByteArrayOutputStream encrypted = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) encrypted.write(buffer, 0, count);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        byte[] plain = crypt(cipher, encrypted.toByteArray());
        if (!name.startsWith("image:")) HOT.put(hotKey, plain);
        return plain;
      } catch (GeneralSecurityException error) {
        android.util.Log.w(
            "AsechkaCache", "Encrypted cache read failed: " + error.getClass().getSimpleName());
        return null;
      } catch (Exception ignored) {
        return null;
      }
    }
  }

  void bytes(String name, byte[] data) throws IOException {
    synchronized (LOCK) {
      AtomicFile file = new AtomicFile(new File(directory, hash(name)));
      FileOutputStream output = null;
      try {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV().clone();
        byte[] encrypted = crypt(cipher, data);
        if (encrypted.length != data.length + 16)
          throw new IOException("Incomplete encrypted save");
        output = file.startWrite();
        output.write(iv);
        output.write(encrypted);
        file.finishWrite(output);
        if (!name.startsWith("image:")) HOT.put(namespace + "\n" + name, data.clone());
      } catch (Exception error) {
        if (output != null) file.failWrite(output);
        throw new IOException(
            "Your phone couldn’t save this. Check its available storage and try again.", error);
      }
    }
  }

  private static byte[] crypt(Cipher cipher, byte[] data) throws Exception {
    // Older Keystore implementations can lose output when doFinal receives a large buffer.
    // Collect every update result and release decrypted bytes only after authentication succeeds.
    ByteArrayOutputStream output = new ByteArrayOutputStream(data.length + 32);
    for (int offset = 0; offset < data.length; offset += 16384) {
      byte[] part = cipher.update(data, offset, Math.min(16384, data.length - offset));
      if (part != null) output.write(part);
    }
    byte[] last = cipher.doFinal();
    if (last != null) output.write(last);
    return output.toByteArray();
  }

  JSONObject read(String name) {
    try {
      byte[] data = bytes(name);
      return data == null ? null : new JSONObject(new String(data, StandardCharsets.UTF_8));
    } catch (Exception ignored) {
      return null;
    }
  }

  void write(String name, JSONObject data) throws IOException {
    bytes(name, data.toString().getBytes(StandardCharsets.UTF_8));
  }

  void remove(String name) {
    synchronized (LOCK) {
      new AtomicFile(new File(directory, hash(name))).delete();
      HOT.remove(namespace + "\n" + name);
    }
  }

  static JSONObject json(Object... pairs) {
    JSONObject value = new JSONObject();
    try {
      for (int i = 0; i < pairs.length; i += 2)
        value.put((String) pairs[i], pairs[i + 1] == null ? JSONObject.NULL : pairs[i + 1]);
    } catch (JSONException error) {
      throw new IllegalArgumentException(error);
    }
    return value;
  }

  static JSONObject copy(JSONObject value) {
    try {
      return new JSONObject(value.toString());
    } catch (JSONException error) {
      throw new IllegalArgumentException(error);
    }
  }

  static String canonical(Object value) {
    if (value instanceof JSONObject) {
      JSONObject object = (JSONObject) value;
      ArrayList<String> keys = new ArrayList<>();
      Iterator<String> iterator = object.keys();
      while (iterator.hasNext()) keys.add(iterator.next());
      Collections.sort(keys);
      StringBuilder text = new StringBuilder("{");
      for (String key : keys)
        text.append(JSONObject.quote(key))
            .append(':')
            .append(canonical(object.opt(key)))
            .append(',');
      return text.append('}').toString();
    }
    if (value instanceof JSONArray) {
      StringBuilder text = new StringBuilder("[");
      JSONArray a = (JSONArray) value;
      for (int i = 0; i < a.length(); i++) text.append(canonical(a.opt(i))).append(',');
      return text.append(']').toString();
    }
    return value instanceof String ? JSONObject.quote((String) value) : String.valueOf(value);
  }

  void snapshot(String path, JSONObject data) throws IOException {
    if (path.equals("/api/memories")) path = "/memories.json";
    synchronized (LOCK) {
      JSONObject clean = copy(data);
      clean.remove("_offline");
      clean.remove("_savedAt");
      clean.remove("_pending");
      clean.remove("_needsSignIn");
      write("data:" + path, json("data", clean, "savedAt", System.currentTimeMillis()));
      JSONArray tracks = data.optJSONArray("tracks");
      if (tracks != null)
        for (int i = 0; i < tracks.length(); i++) {
          JSONObject track = tracks.optJSONObject(i);
          if (track != null && track.optLong("trackId") > 0)
            write("track:" + track.optLong("trackId"), track);
        }
    }
  }

  JSONObject base(String path) {
    if (path.equals("/api/memories")) path = "/memories.json";
    JSONObject entry = read("data:" + path);
    return entry == null ? null : entry.optJSONObject("data");
  }

  long savedAt(String path) {
    if (path.equals("/api/memories")) path = "/memories.json";
    JSONObject entry = read("data:" + path);
    return entry == null ? 0 : entry.optLong("savedAt");
  }

  boolean hasContent() {
    return base("/memories.json") != null || base("/api/together") != null;
  }

  boolean unlocked() {
    JSONObject state = read("access");
    return state != null && state.optBoolean("unlocked") && hasContent();
  }

  void unlock() throws IOException {
    JSONObject state = read("access");
    if (state == null) state = new JSONObject();
    try {
      state.put("unlocked", true);
    } catch (JSONException ignored) {
    }
    write("access", state);
  }

  void lock() {
    JSONObject state = read("access");
    if (state == null) return;
    try {
      state.put("unlocked", false);
      write("access", state);
    } catch (Exception ignored) {
    }
  }

  void rememberCode(String password) throws Exception {
    byte[] salt = new byte[24];
    new SecureRandom().nextBytes(salt);
    JSONObject state = read("access");
    if (state == null) state = new JSONObject();
    state.put("salt", Base64.encodeToString(salt, Base64.NO_WRAP));
    String algorithm =
        android.os.Build.VERSION.SDK_INT >= 26 ? "PBKDF2WithHmacSHA256" : "PBKDF2WithHmacSHA1";
    state.put("kdf", algorithm);
    state.put("verifier", Base64.encodeToString(derive(password, salt, algorithm), Base64.NO_WRAP));
    state.put("unlocked", true);
    write("access", state);
  }

  boolean unlockWithCode(String password) throws Exception {
    JSONObject state = read("access");
    if (state == null || !state.has("verifier") || !hasContent()) return false;
    boolean valid =
        MessageDigest.isEqual(
            derive(
                password,
                Base64.decode(state.getString("salt"), Base64.NO_WRAP),
                state.optString("kdf", "PBKDF2WithHmacSHA256")),
            Base64.decode(state.getString("verifier"), Base64.NO_WRAP));
    if (valid) unlock();
    return valid;
  }

  private byte[] derive(String password, byte[] salt, String algorithm) throws Exception {
    if (!algorithm.equals("PBKDF2WithHmacSHA256") && !algorithm.equals("PBKDF2WithHmacSHA1"))
      throw new IllegalArgumentException("Invalid key derivation");
    PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, 120000, 256);
    try {
      return SecretKeyFactory.getInstance(algorithm).generateSecret(spec).getEncoded();
    } finally {
      spec.clearPassword();
    }
  }

  JSONArray queue() {
    JSONObject value = read("outbox");
    JSONArray queue = value == null ? null : value.optJSONArray("items");
    return queue == null ? new JSONArray() : queue;
  }

  int pending() {
    return queue().length();
  }

  boolean conflicts() {
    JSONArray items = queue();
    for (int i = 0; i < items.length(); i++)
      if (!"pending".equals(items.optJSONObject(i).optString("status"))) return true;
    return false;
  }

  private void queue(JSONArray value) throws IOException {
    write("outbox", json("items", value));
  }

  JSONObject enqueue(String path, JSONObject body) throws Exception {
    synchronized (LOCK) {
      JSONArray items = queue();
      String canonical = canonical(body);
      for (int i = 0; i < items.length(); i++) {
        JSONObject entry = items.getJSONObject(i);
        if (entry.getString("path").equals(path)
            && canonical(entry.getJSONObject("body")).equals(canonical)) return entry;
      }
      JSONObject entry =
          json(
              "id",
              UUID.randomUUID().toString(),
              "path",
              path,
              "body",
              copy(body),
              "localId",
              UUID.randomUUID().toString(),
              "status",
              "pending",
              "createdAt",
              System.currentTimeMillis());
      if (path.equals("/api/music") && body.optString("action").equals("save")) {
        JSONObject track = read("track:" + body.optLong("trackId"));
        if (track == null)
          throw new IOException("Connect once to load this song before saving it offline.");
        entry.put("track", track);
      }
      if (body.has("photo")) {
        byte[] image = Base64.decode(body.getString("photo").substring(23), Base64.NO_WRAP);
        if (path.equals("/api/memories"))
          bytes("image:/" + MemoryProjection.photoPath(body), image);
        else if (path.equals("/api/journal"))
          bytes("image:/api/journal?photo=" + body.getString("operationId"), image);
        else
          bytes("image:/api/together-photo?kind=bucket&id=" + body.getString("operationId"), image);
      }
      items.put(entry);
      queue(items);
      return entry;
    }
  }

  JSONObject entry(String id) {
    JSONArray items = queue();
    for (int i = 0; i < items.length(); i++)
      if (items.optJSONObject(i).optString("id").equals(id)) return items.optJSONObject(i);
    return null;
  }

  JSONObject mappedBody(JSONObject entry) throws Exception {
    JSONObject body = copy(entry.getJSONObject("body"));
    JSONObject ids = read("ids");
    if (ids == null) return body;
    for (String field : new String[] {"expectedId", "expectedRevision", "expectedVersion"}) {
      if (body.isNull(field)) continue;
      String id = body.optString(field, "");
      for (int i = 0; i < 50 && ids.has(id); i++) id = ids.getString(id);
      if (!id.isEmpty()) body.put(field, id);
    }
    return body;
  }

  private JSONObject find(JSONObject data, String path, JSONObject body) {
    if (data == null) return null;
    if (path.equals("/api/journal") || path.equals("/api/keepsakes"))
      return BookProjection.find(data, body);
    if (path.equals("/api/memories")) {
      String id = body.optString("id", body.optString("operationId"));
      for (String collection : new String[] {"photos", "quotes"}) {
        JSONArray entries = data.optJSONArray(collection);
        if (entries != null)
          for (int i = 0; i < entries.length(); i++) {
            JSONObject item = entries.optJSONObject(i);
            if (item != null
                && (id.equals(item.optString("id")) || id.equals(item.optString("editKey"))))
              return item;
          }
      }
      return null;
    }
    JSONArray list = data.optJSONArray(path.equals("/api/music") ? "tracks" : "bucketList");
    if (list != null)
      for (int i = 0; i < list.length(); i++) {
        JSONObject row = list.optJSONObject(i);
        if (row != null
            && (path.equals("/api/music")
                ? row.optInt("rank") == body.optInt("rank")
                : row.optString("id").equals(body.optString("id")))) return row;
      }
    return null;
  }

  void acknowledge(JSONObject entry, JSONObject response) throws Exception {
    synchronized (LOCK) {
      String path = entry.getString("path");
      JSONObject body = entry.getJSONObject("body");
      snapshot(path.equals("/api/memories") ? "/memories.json" : path, response);
      JSONObject saved = find(response, path, body);
      if (saved != null) {
        JSONObject ids = read("ids");
        if (ids == null) ids = new JSONObject();
        ids.put(entry.getString("localId"), saved.optString("id"));
        if (path.equals("/api/memories") && saved.has("editVersion"))
          ids.put("local:" + body.optString("operationId"), saved.getString("editVersion"));
        if (body.has("operationId")
            && saved.has("revision")
            && !body.optString("operationId").equals(saved.optString("revision")))
          ids.put(body.getString("operationId"), saved.getString("revision"));
        write("ids", ids);
      }
      JSONArray remaining = new JSONArray();
      JSONArray items = queue();
      for (int i = 0; i < items.length(); i++)
        if (!items.getJSONObject(i).getString("id").equals(entry.getString("id")))
          remaining.put(items.getJSONObject(i));
      queue(remaining);
    }
  }

  void block(String id, String message, int code) throws Exception {
    synchronized (LOCK) {
      JSONArray items = queue();
      for (int i = 0; i < items.length(); i++) {
        JSONObject row = items.getJSONObject(i);
        if (row.getString("id").equals(id)) {
          row.put("status", code == 409 ? "conflict" : "needs-review");
          row.put("error", message);
          row.put("code", code);
        }
      }
      queue(items);
    }
  }

  void discardEntity(JSONObject entry) throws Exception {
    synchronized (LOCK) {
      JSONArray remaining = new JSONArray();
      JSONArray items = queue();
      JSONObject body = entry.getJSONObject("body");
      String path = entry.getString("path");
      for (int i = 0; i < items.length(); i++) {
        JSONObject row = items.getJSONObject(i), b = row.getJSONObject("body");
        boolean same =
            path.equals(row.getString("path"))
                && (path.equals("/api/music")
                    ? body.optInt("rank") == b.optInt("rank")
                    : path.equals("/api/memories")
                        ? body.optString("operationId").equals(b.optString("operationId"))
                        : body.optString("action").equals("sendHeart")
                            ? body.optString("from").equals(b.optString("from"))
                            : body.optString("id").equals(b.optString("id")));
        if (!same) remaining.put(row);
      }
      queue(remaining);
    }
  }

  void resolve(JSONObject entry) throws Exception {
    synchronized (LOCK) {
      JSONArray items = queue();
      for (int i = 0; i < items.length(); i++) {
        JSONObject row = items.getJSONObject(i);
        if (!row.getString("id").equals(entry.getString("id"))) continue;
        String path = row.getString("path");
        JSONObject body = row.getJSONObject("body"), current = find(base(path), path, body);
        if (path.equals("/api/music"))
          body.put("expectedId", current == null ? JSONObject.NULL : current.opt("id"));
        else if (path.equals("/api/memories") && current != null && body.has("expectedVersion"))
          body.put("expectedVersion", current.optString("editVersion"));
        else if (!path.equals("/api/memories") && !body.optString("action").equals("sendHeart"))
          body.put("expectedRevision", current == null ? JSONObject.NULL : current.opt("revision"));
        row.put("status", "pending");
        row.remove("error");
        row.remove("code");
      }
      queue(items);
    }
  }

  JSONObject projected(String path) throws Exception {
    if (path.equals("/api/memories")) path = "/memories.json";
    synchronized (LOCK) {
      JSONObject data = base(path);
      if (data == null) return null;
      data = copy(data);
      JSONArray items = queue();
      for (int i = 0; i < items.length(); i++) {
        JSONObject entry = items.getJSONObject(i);
        if (!entry.getString("path").equals(path)
            && !(path.equals("/memories.json") && entry.getString("path").equals("/api/memories")))
          continue;
        JSONObject b = entry.getJSONObject("body");
        String action = b.optString("action");
        if (path.equals("/api/journal") || path.equals("/api/keepsakes")) {
          BookProjection.apply(data, b, entry.getLong("createdAt"));
        } else if (path.equals("/memories.json")) {
          MemoryProjection.apply(data, b, entry.getLong("createdAt"));
        } else if (path.equals("/api/music")) {
          JSONArray list = data.optJSONArray("tracks"), next = new JSONArray();
          if (list != null)
            for (int j = 0; j < list.length(); j++)
              if (list.getJSONObject(j).optInt("rank") != b.optInt("rank"))
                next.put(list.getJSONObject(j));
          if (action.equals("save")) {
            JSONObject song = copy(entry.getJSONObject("track"));
            song.put("rank", b.getInt("rank"));
            song.put("note", b.optString("note"));
            song.put("id", entry.getString("localId"));
            song.put("pending", true);
            next.put(song);
          }
          data.put("tracks", next);
        } else if (path.equals("/api/together")) {
          if (action.equals("sendHeart")) {
            JSONObject hearts = data.optJSONObject("hearts");
            if (hearts == null) hearts = new JSONObject();
            hearts.put(
                b.getString("from"),
                json(
                    "id",
                    b.getString("operationId"),
                    "sentAt",
                    Dates.timestamp(entry.getLong("createdAt")),
                    "pending",
                    true));
            data.put("hearts", hearts);
          } else {
            JSONArray list = data.optJSONArray("bucketList"), next = new JSONArray();
            JSONObject item = null;
            int position = -1;
            if (list != null)
              for (int j = 0; j < list.length(); j++) {
                JSONObject row = list.getJSONObject(j);
                if (row.optString("id").equals(b.optString("id"))) {
                  item = copy(row);
                  position = j;
                } else next.put(row);
              }
            if (!action.equals("removeItem")) {
              if (item == null)
                item =
                    json(
                        "id",
                        b.getString("id"),
                        "photoId",
                        null,
                        "createdAt",
                        Dates.timestamp(entry.getLong("createdAt")));
              if (action.equals("saveItem"))
                for (String field : new String[] {"title", "place", "note"})
                  item.put(field, b.optString(field));
              item.put("completed", b.optBoolean("completed"));
              item.put("revision", b.getString("operationId"));
              item.put(
                  "completedAt",
                  b.optBoolean("completed")
                      ? Dates.timestamp(entry.getLong("createdAt"))
                      : JSONObject.NULL);
              if (b.has("photo")) item.put("photoId", b.getString("operationId"));
              item.put("pending", true);
              if (position < 0) next.put(item);
              else {
                JSONArray ordered = new JSONArray();
                for (int j = 0; j <= next.length(); j++) {
                  if (j == position) ordered.put(item);
                  if (j < next.length()) ordered.put(next.getJSONObject(j));
                }
                next = ordered;
              }
            }
            data.put("bucketList", next);
          }
        }
      }
      data.put("_pending", items.length() > 0);
      data.put("_savedAt", savedAt(path));
      return data;
    }
  }

  void saveTranslation(JSONObject input, JSONObject result) throws Exception {
    synchronized (LOCK) {
      String id = hash(canonical(input));
      write("translation:" + id, result);
      write("last-translation", result);
      JSONArray history =
          read("translation-history") == null
              ? new JSONArray()
              : read("translation-history").optJSONArray("items");
      if (history == null) history = new JSONArray();
      JSONArray next = new JSONArray();
      next.put(json("id", id, "input", input, "savedAt", System.currentTimeMillis()));
      for (int i = 0; i < history.length(); i++)
        if (!history.getJSONObject(i).optString("id").equals(id))
          next.put(history.getJSONObject(i));
      write("translation-history", json("items", next));
    }
  }
}
