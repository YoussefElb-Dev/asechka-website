package app.asechka.android;

import android.app.*;
import android.os.*;
import android.text.*;
import android.view.*;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Our Love Jar & read-once secret notes, with durable offline receipts and pinning. */
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
      String mode = body.optString("mode", "once");
      boolean pinned = mode.equals("jar") && body.optBoolean("pinned", false);
      if (pinned) {
        for (int i = 0; i < list.length(); i++) list.getJSONObject(i).put("pinned", false);
      }
      JSONObject note = OfflineStore.json(
          "id", id,
          "from", who,
          "to", who.equals("asnat") ? "youssef" : "asnat",
          "text", text,
          "preview", preview(text),
          "mode", mode,
          "pinned", pinned,
          "createdAt", Dates.timestamp(at),
          "day", HeartCounts.day(at),
          "closedAt", JSONObject.NULL,
          "pending", true);
      list.put(note);
      if (pinned) data.put("pinnedNote", note);
    } else if (action.equals("pinMessage")) {
      String targetId = body.optString("id");
      boolean pinned = body.optBoolean("pinned", true);
      JSONObject latestPinned = null;
      for (int i = 0; i < list.length(); i++) {
        JSONObject item = list.getJSONObject(i);
        if (item.optString("id").equals(targetId)) {
          item.put("pinned", pinned);
        } else if (pinned) {
          item.put("pinned", false);
        }
        if (item.optBoolean("pinned") && "jar".equals(item.optString("mode"))) latestPinned = item;
      }
      data.put("pinnedNote", latestPinned == null ? JSONObject.NULL : latestPinned);
    } else {
      for (int i = 0; i < list.length(); i++) {
        JSONObject item = list.getJSONObject(i);
        if (item.optString("id").equals(body.optString("id"))) {
          if (!"jar".equals(item.optString("mode"))) item.remove("text");
          item.put("closedAt", Dates.timestamp(at));
        }
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
    boolean isJar = "jar".equals(message.optString("mode"));
    LinearLayout box = ui.column();
    box.setPadding(ui.dp(24), ui.dp(26), ui.dp(24), ui.dp(24));
    box.setBackground(ui.shape(Ui.BG, 28));
    TextView icon = ui.text("♡", 42, Ui.PURPLE);
    icon.setGravity(Gravity.CENTER);
    box.addView(icon);
    ui.add(box, ui.title(isJar ? "A new Love Jar note" : "A little message for you", 23), 12);
    ui.add(
        box,
        ui.text(
            "From " + SocialFeed.nameOf(message.optString("from")) + (isJar ? " · saved in our Love Jar" : " · just this once"),
            13,
            Ui.MUTED),
        8);
    TextView text = ui.text(message.optString("text"), 20, Ui.INK);
    text.setTextIsSelectable(isJar);
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
            isJar
                ? "This note stays safe in our Love Jar and on Home."
                : "Closing keeps only a short note in history. The full message won’t open again.",
            12,
            Ui.MUTED),
        20);
    Button close = ui.button(isJar ? "Keep in our Love Jar ♡" : "Keep it in my heart ♡", true, null);
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
                          "action", "closeMessage",
                          "id", id,
                          "actor", actor.get(),
                          "operationId", UUID.randomUUID().toString()));
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
                        Toast.makeText(activity, "Couldn’t save closing yet. Try again.", Toast.LENGTH_LONG).show();
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
            Math.min(ui.dp(440), activity.getResources().getDisplayMetrics().widthPixels - ui.dp(32)),
            Math.min(ui.dp(680), activity.getResources().getDisplayMetrics().heightPixels - ui.dp(80)));
    Motion.enter(box, 1);
  }

  void open() {
    Ui.Sheet sheet =
        ui.sheet("Our Love Jar", "Three warm notes each, every day · pin your favorite to Home.");
    sheet.item(
        "Drop a note in our Love Jar",
        "Keep & pin on Home, or send a read-once secret for " + SocialFeed.nameOf(actor.get().equals("asnat") ? "youssef" : "asnat"),
        "♡",
        false,
        this::compose);
    sheet.item(
        "Love Jar & note history",
        "Read saved Love Jar notes & pin to Home",
        "≡",
        false,
        this::history);
    sheet.item("Our home-screen widgets", "Six little windows into us", "✦", false, this::widgets);
    sheet.show();
  }

  void compose() {
    Dialog dialog = new Dialog(activity);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
    LinearLayout box = ui.column();
    box.setPadding(ui.dp(22), ui.dp(20), ui.dp(22), ui.dp(22));
    box.setBackground(ui.shape(Ui.BG, 28, 0x266b5cb5));
    LinearLayout header = ui.row(8);
    LinearLayout titleCol = ui.column();
    titleCol.addView(ui.label("LITTLE MESSAGE"));
    ui.add(
        titleCol,
        ui.title(
            "Just for " + SocialFeed.nameOf(actor.get().equals("asnat") ? "youssef" : "asnat"),
            22),
        2);
    header.addView(titleCol, new LinearLayout.LayoutParams(0, -2, 1));
    header.addView(ui.pillButton("Back", false, dialog::dismiss));
    box.addView(header);
    TextView note = ui.text("3 per day · keep in our Love Jar or send read-once", 12, Ui.MUTED);
    ui.add(box, note, 8);
    final boolean[] keepInJar = {true};
    LinearLayout seg = ui.row(6);
    seg.setPadding(ui.dp(4), ui.dp(4), ui.dp(4), ui.dp(4));
    seg.setBackground(ui.shape(Ui.PALE, 18, 0x166b5cb5));
    Button jarMode = ui.button("Love Jar (keep)", true, null);
    Button onceMode = ui.button("Read once", false, null);
    Button send = ui.button("Drop in our Love Jar ♡", true, null);
    Runnable updateMode =
        () -> {
          for (int i = 0; i < 2; i++) {
            Button b = i == 0 ? jarMode : onceMode;
            boolean active = (i == 0) == keepInJar[0];
            b.setTextSize(13);
            b.setMinHeight(ui.dp(36));
            b.setMinimumHeight(ui.dp(36));
            b.setPadding(ui.dp(10), ui.dp(6), ui.dp(10), ui.dp(6));
            b.setBackground(
                ui.shape(
                    active ? Ui.PRIMARY : android.graphics.Color.TRANSPARENT,
                    14,
                    active ? Ui.PRIMARY : android.graphics.Color.TRANSPARENT));
            b.setTextColor(active ? android.graphics.Color.WHITE : Ui.PURPLE);
          }
          send.setText(keepInJar[0] ? "Drop in our Love Jar ♡" : "Send read-once secret");
        };
    jarMode.setOnClickListener(
        v -> {
          keepInJar[0] = true;
          updateMode.run();
        });
    onceMode.setOnClickListener(
        v -> {
          keepInJar[0] = false;
          updateMode.run();
        });
    seg.addView(jarMode, new LinearLayout.LayoutParams(0, -2, 1));
    seg.addView(onceMode, new LinearLayout.LayoutParams(0, -2, 1));
    updateMode.run();
    ui.add(box, seg, 12);
    EditText text = ui.input("Something only you could say…", "", 1000, true);
    text.setMinLines(4);
    text.setMaxLines(8);
    text.setBackground(ui.shape(android.graphics.Color.WHITE, 18, 0x1e6b5cb5));
    text.setPadding(ui.dp(16), ui.dp(14), ui.dp(16), ui.dp(14));
    JSONObject draft = api.store.read("message-draft:" + actor.get());
    if (draft != null) text.setText(draft.optString("text"));
    ui.add(box, text, 14);
    LinearLayout metaRow = ui.row(8);
    TextView feedback = ui.text("", 12, Ui.PURPLE);
    metaRow.addView(feedback, new LinearLayout.LayoutParams(0, -2, 1));
    TextView counter = ui.text(text.getText().length() + " / 1,000", 11, Ui.MUTED);
    metaRow.addView(counter);
    text.addTextChangedListener(
        new TextWatcher() {
          public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
          public void onTextChanged(CharSequence s, int start, int before, int count) {
            counter.setText(s.length() + " / 1,000");
          }
          public void afterTextChanged(Editable s) {}
        });
    ui.add(box, metaRow, 8);
    send.setOnClickListener(
        v -> {
          String content = text.getText().toString().trim();
          if (content.isEmpty()) {
            feedback.setText("Write your little note first.");
            return;
          }
          boolean jar = keepInJar[0];
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
                    throw new Exception("All three are sent for today. More at midnight Eastern. ♡");
                  api.post(
                      "/api/together",
                      OfflineStore.json(
                          "action", "sendMessage",
                          "actor", actor.get(),
                          "text", content,
                          "mode", jar ? "jar" : "once",
                          "pinned", jar,
                          "operationId", UUID.randomUUID().toString()));
                  api.store.remove("message-draft:" + actor.get());
                  main.post(
                      () -> {
                        text.setText("");
                        dialog.dismiss();
                        Motion.haptic(send, true);
                        Toast.makeText(
                                activity,
                                api.connected()
                                    ? (jar ? "Saved & pinned in our Love Jar ♡" : "Secret message sent ♡")
                                    : "Saved · sends when you reconnect",
                                Toast.LENGTH_LONG)
                            .show();
                        if (activity instanceof MainActivity) ((MainActivity) activity).refreshHomeExtras();
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
    ui.add(box, send, 14);
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
    if (dialog.getWindow() != null) {
      dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
      dialog
          .getWindow()
          .setLayout(
              Math.min(activity.getResources().getDisplayMetrics().widthPixels - ui.dp(28), ui.dp(500)),
              -2);
    }
  }

  void widgets() {
    worker.execute(
        () -> {
          try {
            java.util.List<RemoteViews> previews = UniverseWidgets.previews(activity, api);
            main.post(
                () -> {
                  Dialog dialog = ui.fullScreenDialog();
                  LinearLayout outer = ui.column();
                  outer.setBackgroundColor(Ui.BG);
                  ui.applyWindowInsets(outer, 0, 8, 0, 0);
                  LinearLayout header = ui.row(8);
                  header.setPadding(ui.dp(20), ui.dp(10), ui.dp(20), ui.dp(10));
                  LinearLayout titleCol = ui.column();
                  titleCol.addView(ui.label("HOME SCREEN WINDOWS"));
                  ui.add(titleCol, ui.title("Our home-screen widgets", 20), 2);
                  header.addView(titleCol, new LinearLayout.LayoutParams(0, -2, 1));
                  header.addView(ui.pillButton("Done", false, dialog::dismiss));
                  outer.addView(header);
                  LinearLayout box = ui.column();
                  box.setPadding(ui.dp(20), ui.dp(6), ui.dp(20), ui.dp(28));
                  LinearLayout infoCard = ui.card(box, android.graphics.Color.WHITE);
                  infoCard.addView(ui.label("HOW TO ADD"));
                  ui.add(
                      infoCard,
                      ui.text(
                          "Long-press your Home Screen, choose Widgets, then find Asechka. Add any of these six little windows. Tap a widget to open the app and sync.",
                          14,
                          Ui.MUTED),
                      6);
                  for (RemoteViews preview : previews) {
                    View card = preview.apply(activity, box);
                    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, ui.dp(164));
                    p.topMargin = ui.dp(14);
                    box.addView(card, p);
                  }
                  outer.addView(ui.scroll(box), new LinearLayout.LayoutParams(-1, 0, 1));
                  dialog.setContentView(outer);
                  dialog.show();
                  outer.requestApplyInsets();
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
                  Dialog dialog = ui.fullScreenDialog();
                  LinearLayout outer = ui.column();
                  outer.setBackgroundColor(Ui.BG);
                  ui.applyWindowInsets(outer, 0, 8, 0, 0);
                  LinearLayout header = ui.row(8);
                  header.setPadding(ui.dp(20), ui.dp(10), ui.dp(20), ui.dp(10));
                  LinearLayout titleCol = ui.column();
                  titleCol.addView(ui.label("SAVED NOTES & SECRETS"));
                  ui.add(titleCol, ui.title("Our Love Jar & history", 20), 2);
                  header.addView(titleCol, new LinearLayout.LayoutParams(0, -2, 1));
                  header.addView(
                      ui.pillButton(
                          "＋ Note",
                          true,
                          () -> {
                            dialog.dismiss();
                            compose();
                          }));
                  header.addView(ui.pillButton("Done", false, dialog::dismiss));
                  outer.addView(header);
                  LinearLayout box = ui.column();
                  box.setPadding(ui.dp(20), ui.dp(4), ui.dp(20), ui.dp(28));
                  ui.add(
                      box,
                      ui.text(
                          "Love Jar notes stay readable forever and can be pinned on Home. Read-once secrets keep only a short preview.",
                          13,
                          Ui.MUTED),
                      4);
                  for (int i = items.length() - 1; i >= 0; i--) {
                    JSONObject m = items.optJSONObject(i);
                    if (m == null
                        || !who.equals(m.optString("from")) && !who.equals(m.optString("to")))
                      continue;
                    boolean isJar = "jar".equals(m.optString("mode"));
                    boolean isPinned = m.optBoolean("pinned", false);
                    LinearLayout card = ui.column();
                    card.setPadding(ui.dp(18), ui.dp(16), ui.dp(18), ui.dp(16));
                    card.setBackground(
                        ui.shape(
                            isPinned ? Ui.PALE : 0xffffffff,
                            22,
                            isPinned ? 0x336b5cb5 : 0x1a6b5cb5));
                    LinearLayout meta = ui.row(8);
                    meta.addView(
                        ui.text(
                            (who.equals(m.optString("from"))
                                    ? "To " + SocialFeed.nameOf(m.optString("to"))
                                    : "From " + SocialFeed.nameOf(m.optString("from")))
                                + " · "
                                + m.optString("day")
                                + (isPinned ? " · Pinned ♡" : ""),
                            12,
                            Ui.PURPLE),
                        new LinearLayout.LayoutParams(0, -2, 1));
                    if (isJar) {
                      String noteId = m.optString("id");
                      Button pinBtn =
                          ui.pillButton(
                              isPinned ? "Unpin from Home" : "Pin to Home ♡",
                              isPinned,
                              () -> {
                                worker.execute(
                                    () -> {
                                      try {
                                        api.post(
                                            "/api/together",
                                            OfflineStore.json(
                                                "action",
                                                "pinMessage",
                                                "actor",
                                                who,
                                                "id",
                                                noteId,
                                                "pinned",
                                                !isPinned,
                                                "operationId",
                                                UUID.randomUUID().toString()));
                                        main.post(
                                            () -> {
                                              dialog.dismiss();
                                              if (activity instanceof MainActivity)
                                                ((MainActivity) activity).refreshHomeExtras();
                                              history();
                                            });
                                      } catch (Exception ignored) {
                                      }
                                    });
                              });
                      pinBtn.setTextSize(12);
                      pinBtn.setMinHeight(ui.dp(30));
                      pinBtn.setMinimumHeight(ui.dp(30));
                      pinBtn.setPadding(ui.dp(12), ui.dp(4), ui.dp(12), ui.dp(4));
                      meta.addView(pinBtn);
                    }
                    card.addView(meta);
                    String display =
                        isJar && !m.optString("text").isEmpty()
                            ? m.optString("text")
                            : m.optString("preview");
                    TextView bodyText = ui.text(display, 16, Ui.INK);
                    bodyText.setLineSpacing(ui.dp(3), 1f);
                    ui.add(card, bodyText, 10);
                    ui.add(
                        card,
                        ui.text(
                            isJar
                                ? "Kept in our Love Jar ♡"
                                : (m.isNull("closedAt")
                                    ? "Waiting to be received"
                                    : "Read once · kept in our hearts"),
                            11,
                            Ui.MUTED),
                        8);
                    ui.add(box, card, 12);
                  }
                  if (items.length() == 0)
                    ui.add(
                        box,
                        ui.text(
                            "Our first Love Jar note is waiting to be written. ♡", 16, Ui.MUTED),
                        24);
                  outer.addView(ui.scroll(box), new LinearLayout.LayoutParams(-1, 0, 1));
                  dialog.setContentView(outer);
                  dialog.show();
                  outer.requestApplyInsets();
                  dialog.getWindow().setLayout(-1, -1);
                });
          } catch (Exception ignored) {
          }
        });
  }
}
