package app.asechka.android;

import android.app.*;
import android.os.*;
import android.text.*;
import android.view.*;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/**
 * Durable close receipts are written before a letter disappears. Full text has no history action.
 */
final class Messages {
  interface Actor {
    String get();
  }

  interface Visible {
    boolean getAsBoolean();
  }

  private final Activity activity;
  private final ApiClient api;
  private final Actor actor;
  private final Visible visible;
  private final Ui ui;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private Dialog incoming;
  private String showing = "";
  private boolean checking;

  Messages(Activity activity, ApiClient api, Actor actor, Visible visible) {
    this.activity = activity;
    this.api = api;
    this.actor = actor;
    this.visible = visible;
    ui = new Ui(activity);
  }

  static String preview(String text) {
    String clean = text.trim().replaceAll("\\s+", " ");
    int count = clean.codePointCount(0, clean.length());
    return count > 60 ? clean.substring(0, clean.offsetByCodePoints(0, 60)) + "…" : clean;
  }

  static void project(JSONObject data, JSONObject body, long at) throws Exception {
    JSONArray list = data.optJSONArray("messages");
    if (list == null) {
      list = new JSONArray();
      data.put("messages", list);
    }
    String action = body.optString("action"), id = body.optString("operationId");
    if (action.equals("sendMessage")) {
      for (int i = 0; i < list.length(); i++)
        if (id.equals(list.getJSONObject(i).optString("id"))) return;
      String who = body.optString("actor"), text = body.optString("text");
      list.put(
          OfflineStore.json(
              "id",
              id,
              "from",
              who,
              "to",
              who.equals("asnat") ? "youssef" : "asnat",
              "text",
              text,
              "preview",
              preview(text),
              "createdAt",
              Dates.timestamp(at),
              "day",
              HeartCounts.day(at),
              "closedAt",
              JSONObject.NULL,
              "pending",
              true));
    } else
      for (int i = 0; i < list.length(); i++) {
        JSONObject item = list.getJSONObject(i);
        if (item.optString("id").equals(body.optString("id"))) {
          item.remove("text");
          item.put("closedAt", Dates.timestamp(at));
        }
      }
  }

  private JSONArray list() throws Exception {
    JSONObject data = api.cached("/api/together", !api.connected());
    return data == null || data.optJSONArray("messages") == null
        ? new JSONArray()
        : data.optJSONArray("messages");
  }

  private JSONObject dismissed() {
    JSONObject data = api.store.read("closed-messages");
    return data == null ? new JSONObject() : data;
  }

  void suspend() {
    if (incoming != null) {
      incoming.dismiss();
      incoming = null;
      showing = "";
    }
  }

  void close() {
    suspend();
    worker.shutdown();
  }

  void check() {
    if (checking || incoming != null || !visible.getAsBoolean()) return;
    checking = true;
    String who = actor.get();
    worker.execute(
        () -> {
          JSONObject candidate = null;
          try {
            JSONArray items = list();
            JSONObject closed = dismissed();
            for (int i = 0; i < items.length(); i++) {
              JSONObject m = items.getJSONObject(i);
              if (who.equals(m.optString("to"))
                  && m.isNull("closedAt")
                  && !closed.has(m.optString("id"))
                  && m.has("text")) {
                candidate = OfflineStore.copy(m);
                break;
              }
            }
          } catch (Exception ignored) {
          }
          JSONObject result = candidate;
          main.post(
              () -> {
                checking = false;
                if (result != null
                    && incoming == null
                    && visible.getAsBoolean()
                    && who.equals(actor.get())) show(result);
              });
        });
  }

  private void show(JSONObject message) {
    incoming = new Dialog(activity);
    incoming.setCancelable(false);
    showing = message.optString("id");
    LinearLayout box = ui.column();
    box.setPadding(ui.dp(24), ui.dp(26), ui.dp(24), ui.dp(24));
    box.setBackground(ui.shape(Ui.BG, 28));
    TextView icon = ui.text("♡", 42, Ui.PURPLE);
    icon.setGravity(Gravity.CENTER);
    box.addView(icon);
    ui.add(box, ui.title("A little message for you", 23), 12);
    ui.add(
        box,
        ui.text(
            "From " + SocialFeed.nameOf(message.optString("from")) + " · just this once",
            13,
            Ui.MUTED),
        8);
    TextView text = ui.text(message.optString("text"), 20, Ui.INK);
    text.setTextIsSelectable(false);
    text.setLineSpacing(ui.dp(5), 1);
    LinearLayout textBox = ui.column();
    textBox.addView(text);
    ScrollView scroll = ui.scroll(textBox);
    LinearLayout.LayoutParams body = new LinearLayout.LayoutParams(-1, 0, 1);
    body.topMargin = ui.dp(22);
    box.addView(scroll, body);
    ui.add(
        box,
        ui.text(
            "Closing keeps only a short note in history. The full message won’t open again.",
            12,
            Ui.MUTED),
        20);
    Button close = ui.button("Keep it in my heart ♡", true, null);
    close.setOnClickListener(
        v -> {
          close.setEnabled(false);
          String id = showing;
          worker.execute(
              () -> {
                try {
                  api.store.enqueue(
                      "/api/together",
                      OfflineStore.json(
                          "action",
                          "closeMessage",
                          "id",
                          id,
                          "actor",
                          actor.get(),
                          "operationId",
                          UUID.randomUUID().toString()));
                  JSONObject closed = dismissed();
                  closed.put(id, true);
                  api.store.write("closed-messages", closed);
                  main.post(
                      () -> {
                        if (incoming != null) incoming.dismiss();
                        incoming = null;
                        showing = "";
                        Motion.haptic(close, true);
                        check();
                      });
                  api.syncPending();
                } catch (Exception e) {
                  main.post(
                      () -> {
                        close.setEnabled(true);
                        Toast.makeText(
                                activity,
                                "Couldn’t save closing yet. Try again.",
                                Toast.LENGTH_LONG)
                            .show();
                      });
                }
              });
        });
    ui.add(box, close, 18);
    incoming.setContentView(box);
    incoming.show();
    incoming.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
    incoming
        .getWindow()
        .setLayout(
            Math.min(
                ui.dp(440), activity.getResources().getDisplayMetrics().widthPixels - ui.dp(32)),
            Math.min(
                ui.dp(680), activity.getResources().getDisplayMetrics().heightPixels - ui.dp(80)));
    Motion.enter(box, 1);
  }

  void open() {
    Ui.Sheet sheet =
        ui.sheet("Little messages", "Three messages each, every day · midnight Eastern.");
    sheet.item(
        "Compose a message",
        "A surprise for " + SocialFeed.nameOf(actor.get().equals("asnat") ? "youssef" : "asnat"),
        "♡",
        false,
        this::compose);
    sheet.item(
        "Message history",
        "Small notes only · full messages never reopen",
        "≡",
        false,
        this::history);
    sheet.item("Our home-screen widgets", "Six little windows into us", "✦", false, this::widgets);
    sheet.show();
  }

  void compose() {
    Dialog dialog = new Dialog(activity);
    LinearLayout box = ui.column();
    box.setPadding(ui.dp(22), ui.dp(22), ui.dp(22), ui.dp(22));
    box.setBackground(ui.shape(Ui.BG, 26));
    box.addView(
        ui.title(
            "Just for " + SocialFeed.nameOf(actor.get().equals("asnat") ? "youssef" : "asnat"),
            24));
    TextView note = ui.text("3 per day · full text disappears after closing", 12, Ui.MUTED);
    ui.add(box, note, 10);
    EditText text = new EditText(activity);
    text.setHint("Something only you could say…");
    text.setMinLines(4);
    text.setMaxLines(8);
    text.setGravity(Gravity.TOP);
    text.setTextColor(Ui.INK);
    text.setTextSize(17);
    text.setFilters(new InputFilter[] {new InputFilter.LengthFilter(1000)});
    JSONObject draft = api.store.read("message-draft:" + actor.get());
    if (draft != null) text.setText(draft.optString("text"));
    ui.add(box, text, 18);
    TextView feedback = ui.text("", 12, Ui.PURPLE);
    ui.add(box, feedback, 8);
    Button send = ui.button("Send a little love", true, null);
    send.setOnClickListener(
        v -> {
          String content = text.getText().toString().trim();
          if (content.isEmpty()) {
            feedback.setText("Write your little message first.");
            return;
          }
          send.setEnabled(false);
          worker.execute(
              () -> {
                try {
                  JSONArray items = list();
                  String today = HeartCounts.day(System.currentTimeMillis());
                  int used = 0;
                  for (int i = 0; i < items.length(); i++) {
                    JSONObject m = items.getJSONObject(i);
                    if (m.optString("from").equals(actor.get()) && today.equals(m.optString("day")))
                      used++;
                  }
                  if (used >= 3)
                    throw new Exception(
                        "All three are sent for today. More at midnight Eastern. ♡");
                  api.post(
                      "/api/together",
                      OfflineStore.json(
                          "action",
                          "sendMessage",
                          "actor",
                          actor.get(),
                          "text",
                          content,
                          "operationId",
                          UUID.randomUUID().toString()));
                  api.store.remove("message-draft:" + actor.get());
                  main.post(
                      () -> {
                        text.setText("");
                        dialog.dismiss();
                        Motion.haptic(send, true);
                        Toast.makeText(
                                activity,
                                api.connected()
                                    ? "Message sent ♡"
                                    : "Saved · sends when you reconnect",
                                Toast.LENGTH_LONG)
                            .show();
                      });
                } catch (Exception e) {
                  main.post(
                      () -> {
                        send.setEnabled(true);
                        feedback.setText(e.getMessage());
                      });
                }
              });
        });
    ui.add(box, send, 12);
    ui.add(box, ui.button("Back", false, dialog::dismiss), 8);
    dialog.setOnDismissListener(
        d -> {
          String saved = text.getText().toString();
          worker.execute(
              () -> {
                try {
                  api.store.write("message-draft:" + actor.get(), OfflineStore.json("text", saved));
                } catch (Exception ignored) {
                }
              });
        });
    dialog.setContentView(box);
    dialog.show();
    dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
    dialog.getWindow().setLayout(-1, -2);
  }

  void widgets() {
    worker.execute(
        () -> {
          try {
            java.util.List<RemoteViews> previews = UniverseWidgets.previews(activity, api);
            main.post(
                () -> {
                  Dialog dialog = new Dialog(activity);
                  LinearLayout box = ui.column();
                  box.setPadding(ui.dp(22), ui.dp(22), ui.dp(22), ui.dp(22));
                  box.setBackgroundColor(Ui.BG);
                  box.addView(ui.title("Our home-screen widgets", 24));
                  ui.add(
                      box,
                      ui.text(
                          "Long-press your Home Screen, choose Widgets, then find Asechka. Add any"
                              + " of these six little windows. Tap a widget to open the app and"
                              + " sync.",
                          14,
                          Ui.MUTED),
                      14);
                  for (RemoteViews preview : previews) {
                    View card = preview.apply(activity, box);
                    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, ui.dp(164));
                    p.topMargin = ui.dp(16);
                    box.addView(card, p);
                  }
                  ui.add(box, ui.button("Done", false, dialog::dismiss), 20);
                  dialog.setContentView(ui.scroll(box));
                  dialog.show();
                  dialog.getWindow().setLayout(-1, -1);
                });
          } catch (Exception ignored) {
          }
        });
  }

  void history() {
    worker.execute(
        () -> {
          try {
            JSONArray items = list();
            String who = actor.get();
            main.post(
                () -> {
                  Dialog dialog = new Dialog(activity);
                  LinearLayout box = ui.column();
                  box.setPadding(ui.dp(22), ui.dp(22), ui.dp(22), ui.dp(22));
                  box.setBackgroundColor(Ui.BG);
                  box.addView(ui.title("Little message history", 24));
                  ui.add(
                      box,
                      ui.text(
                          "Only a short note stays here. Closed messages can’t be opened.",
                          13,
                          Ui.MUTED),
                      12);
                  for (int i = items.length() - 1; i >= 0; i--) {
                    JSONObject m = items.optJSONObject(i);
                    if (m == null
                        || !who.equals(m.optString("from")) && !who.equals(m.optString("to")))
                      continue;
                    LinearLayout card = ui.column();
                    card.setPadding(ui.dp(16), ui.dp(14), ui.dp(16), ui.dp(14));
                    card.setBackground(ui.shape(0xffffffff, 20));
                    card.addView(
                        ui.text(
                            (who.equals(m.optString("from"))
                                    ? "To " + SocialFeed.nameOf(m.optString("to"))
                                    : "From " + SocialFeed.nameOf(m.optString("from")))
                                + " · "
                                + m.optString("day"),
                            12,
                            Ui.PURPLE));
                    ui.add(card, ui.text(m.optString("preview"), 16, Ui.INK), 8);
                    ui.add(
                        card,
                        ui.text(
                            m.isNull("closedAt") ? "Waiting to be received" : "Kept in our hearts",
                            11,
                            Ui.MUTED),
                        6);
                    ui.add(box, card, 12);
                  }
                  if (items.length() == 0)
                    ui.add(
                        box,
                        ui.text(
                            "Our first little message is waiting to be written. ♡", 16, Ui.MUTED),
                        24);
                  ui.add(box, ui.button("Done", false, dialog::dismiss), 18);
                  dialog.setContentView(ui.scroll(box));
                  dialog.show();
                  dialog.getWindow().setLayout(-1, -1);
                });
          } catch (Exception ignored) {
          }
        });
  }
}
