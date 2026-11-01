package app.asechka.android;

import android.os.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Main-thread room model with a dedicated TLS reader and serialized writes. */
final class GamesClient {
  interface Listener { void changed(); void reaction(String text); }
  interface SocketFactory { GamesSocket create(); }
  private final ApiClient api;
  final String actor;
  private final Listener listener;
  private final SocketFactory sockets;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService writes = Executors.newSingleThreadExecutor();
  final LinkedHashMap<String, JSONObject> rooms = new LinkedHashMap<>();
  private final HashMap<String, String> commands = new HashMap<>();
  private GamesSocket socket;
  private int generation, attempts;
  private boolean active, disposed, connecting;
  boolean connected;
  String status = "Connect to your shared game room", error = "";
  Object presence = new JSONObject();
  JSONObject pending;
  private String staleRoom = "";
  private long lastReceived, pendingSent;
  String selectedRoom = "";

  GamesClient(ApiClient api, String actor, Listener listener) {
    this(api, actor, listener, GamesSocket::new);
  }

  GamesClient(ApiClient api, String actor, Listener listener, SocketFactory sockets) {
    this.api = api; this.actor = actor; this.listener = listener;
    this.sockets = sockets;
    pending = api.store.read("games-pending:" + actor);
    JSONObject saved = api.store.read("games-navigation:" + actor);
    if (saved != null) selectedRoom = saved.optString("room");
  }

  void start() {
    if (disposed) return;
    active = true;
    if (!connecting && !connected) connect();
  }

  void pause() {
    active = false; generation++; connecting = connected = false;
    commands.clear();
    main.removeCallbacksAndMessages(null);
    if (socket != null) socket.close();
    status = "Paused · your room is saved";
  }

  void close() { pause(); disposed = true; writes.shutdownNow(); }

  void reconnect() {
    if (disposed) return;
    pause(); attempts = 0; error = ""; start(); listener.changed();
  }

  void select(String room) {
    selectedRoom = room;
    writes.execute(() -> {
      try { api.store.write("games-navigation:" + actor, GamesData.obj("room", room)); }
      catch (Exception failure) { main.post(() -> { error = "Could not save the room shortcut."; listener.changed(); }); }
    });
    if (connected && !room.isEmpty()) command("sync", GamesData.obj("room", room));
  }

  private void connect() {
    if (!active || disposed) return;
    connecting = true; connected = false; commands.clear();
    status = attempts == 0 ? "Connecting securely…" : "Reconnecting · attempt " + (attempts + 1);
    listener.changed();
    final int token = ++generation;
    final GamesSocket next = sockets.create(); socket = next;
    new Thread(() -> {
      try {
        JSONObject session = api.gamesSession(actor);
        next.connect(session.getString("url"));
        next.send(GamesData.obj("type", "auth", "ticket", session.getString("ticket")).toString());
        main.post(() -> {
          if (token != generation) return;
          status = "Authenticating your profile…"; lastReceived = SystemClock.elapsedRealtime();
          main.postDelayed(heartbeat, 10000); listener.changed();
        });
        next.read(text -> {
          JSONObject event = new JSONObject(text);
          main.post(() -> { if (token == generation && active) receive(event); });
        });
      } catch (Exception failure) {
        main.post(() -> { if (token == generation && active) disconnected(failure); });
      } finally { next.close(); }
    }, "Asechka-Games-TLS").start();
  }

  private void disconnected(Exception failure) {
    connected = connecting = false; commands.clear();
    if (socket != null) socket.close();
    main.removeCallbacks(heartbeat);
    error = failure.getMessage() == null ? "The game connection was interrupted." : failure.getMessage();
    boolean needsSetup = failure instanceof ApiClient.ApiError
        && (((ApiClient.ApiError) failure).status == 401 || ((ApiClient.ApiError) failure).status == 503);
    status = needsSetup ? "Games unavailable · tap Retry after reconnecting" : "Connection lost · retrying automatically";
    listener.changed();
    if (active && !needsSetup) {
      int token = ++generation;
      long delay = Math.min(30000, 1000L << Math.min(attempts++, 5));
      main.postDelayed(() -> { if (active && token == generation) connect(); }, delay);
    }
  }

  private final Runnable heartbeat = new Runnable() {
    public void run() {
      if (!active || socket == null) return;
      if (SystemClock.elapsedRealtime() - lastReceived > 40000) {
        disconnected(new java.io.IOException("The game service stopped responding.")); return;
      }
      if (connected) {
        command("ping", new JSONObject());
        if (pending != null && SystemClock.elapsedRealtime() - pendingSent > 8000) {
          command("sync", GamesData.obj("room", pending.optString("room")));
          if (staleRoom.isEmpty()) send(pending);
          pendingSent = SystemClock.elapsedRealtime();
        }
      }
      main.postDelayed(this, 10000);
    }
  };

  private void receive(JSONObject event) {
    lastReceived = SystemClock.elapsedRealtime();
    String type = event.optString("type");
    switch (type) {
      case "welcome":
        if (!actor.equals(event.optString("actor"))) { pause(); error = "The game profile did not match. Reconnect."; break; }
        connected = true; connecting = false; attempts = 0; error = ""; status = "Connected · live together";
        updateRooms(event); command("list", new JSONObject());
        if (!selectedRoom.isEmpty()) command("sync", GamesData.obj("room", selectedRoom));
        if (pending != null) command("sync", GamesData.obj("room", pending.optString("room")));
        break;
      case "rooms": updateRooms(event); break; // Can arrive before welcome.
      case "room":
        JSONObject room = event.optJSONObject("room");
        if (room != null) {
          putRoom(room);
          if (commands.containsValue("create") || commands.containsValue("join")) select(room.optString("id"));
          if (room.optString("id").equals(staleRoom)) {
            clearPending(); staleRoom = ""; error = "The board changed. Your move was not applied; choose again.";
          } else if (connected && pending != null && room.optString("id").equals(pending.optString("room"))) {
            if (SystemClock.elapsedRealtime() - pendingSent > 1500) { send(pending); pendingSent = SystemClock.elapsedRealtime(); }
          }
        }
        break;
      case "ack":
        commands.remove(event.optString("id"));
        if (pending != null && pending.optString("id").equals(event.optString("id"))) {
          String id = pending.optString("room"); clearPending();
          command("sync", GamesData.obj("room", id));
        }
        break;
      case "error":
        commands.remove(event.optString("id"));
        error = event.optString("error", "That action could not be completed.");
        if (pending != null && pending.optString("id").equals(event.optString("id"))) {
          String id = pending.optString("room");
          if ("STALE_STATE".equals(event.optString("code"))) {
            staleRoom = id; command("sync", GamesData.obj("room", id));
          } else { clearPending(); command("sync", GamesData.obj("room", id)); }
        }
        break;
      case "reaction":
        if (selectedRoom.equals(event.optString("room")))
          listener.reaction(GamesData.name(event.optString("actor")) + "  " + event.optString("emoji"));
        break;
      case "pong": commands.remove(event.optString("id")); break;
    }
    listener.changed();
  }

  private void updateRooms(JSONObject event) {
    if (event.has("presence")) presence = event.opt("presence");
    JSONArray list = event.optJSONArray("rooms");
    if (list == null) return;
    for (int i = 0; i < list.length(); i++) if (list.optJSONObject(i) != null) putRoom(list.optJSONObject(i));
  }

  private void putRoom(JSONObject room) {
    JSONObject old = rooms.get(room.optString("id"));
    if (old == null || room.optLong("seq") >= old.optLong("seq")) rooms.put(room.optString("id"), room);
  }

  boolean busy() { return pending != null; }
  boolean commandBusy() { return commands.containsValue("create") || commands.containsValue("join") || commands.containsValue("ready") || commands.containsValue("start") || commands.containsValue("rematch"); }

  String command(String type, JSONObject fields) {
    if (!connected) { error = "Reconnect before sending an action."; listener.changed(); return ""; }
    String id = UUID.randomUUID().toString();
    try { fields.put("type", type); fields.put("id", id); }
    catch (JSONException impossible) { throw new IllegalArgumentException(impossible); }
    if (!"sync".equals(type) && !"list".equals(type)) commands.put(id, type);
    send(fields);
    if (!"ping".equals(type) && !"sync".equals(type) && !"list".equals(type)) {
      main.postDelayed(() -> {
        if (commands.remove(id) != null) {
          error = "No confirmation received. Refresh the room before trying again.";
          if (connected) command("list", new JSONObject()); listener.changed();
        }
      }, 15000);
    }
    return id;
  }

  void move(JSONObject room, JSONObject action) {
    if (pending != null || !connected) { error = "Wait for your previous move to be confirmed, or reconnect."; listener.changed(); return; }
    pending = GamesData.obj("type", "move", "id", UUID.randomUUID().toString(), "room", room.optString("id"), "seq", room.optLong("seq"), "action", action);
    final JSONObject reserved = pending;
    final GamesSocket target = socket; final int token = generation;
    pendingSent = SystemClock.elapsedRealtime(); listener.changed();
    writes.execute(() -> {
      try { api.store.write("games-pending:" + actor, reserved); }
      catch (Exception failure) {
        main.post(() -> { if (pending == reserved) { pending = null; error = "Could not safely save your move. Please try again."; listener.changed(); } });
        return;
      }
      try { if (target != null) target.send(reserved.toString()); }
      catch (Exception failure) { main.post(() -> { if (token == generation && active) disconnected(failure); }); }
    });
  }

  private void clearPending() { pending = null; writes.execute(() -> api.store.remove("games-pending:" + actor)); }

  private void send(JSONObject message) {
    final GamesSocket target = socket; final int token = generation;
    if (target == null || disposed) return;
    writes.execute(() -> {
      try { target.send(message.toString()); }
      catch (Exception failure) { main.post(() -> { if (token == generation && active) disconnected(failure); }); }
    });
  }
}
