package app.asechka.android;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.text.*;
import java.util.*;
import java.util.concurrent.ExecutorService;
import org.json.*;

/** Native, encrypted, editable companion to Our little book and Since us. */
final class BookViews {
  interface PhotoMaker {
    String prepare(Uri uri) throws Exception;
  }

  final Activity activity;
  final ApiClient api;
  final Images images;
  final Ui u;
  final ExecutorService worker;
  final PhotoMaker photoMaker;
  final Handler main = new Handler(Looper.getMainLooper());
  Dialog window;
  LinearLayout content;
  JSONObject journal, keepsakes;
  boolean personal, loading;
  int chapter, reveal;
  Editor editor;
  final Runnable poll =
      new Runnable() {
        public void run() {
          if (window != null && window.isShowing()) {
            refresh();
            main.postDelayed(this, 60000);
          }
        }
      };

  BookViews(Activity a, ApiClient api, Images images, ExecutorService work, PhotoMaker maker) {
    activity = a;
    this.api = api;
    this.images = images;
    worker = work;
    photoMaker = maker;
    u = new Ui(a);
  }

  void show(boolean personal) {
    show(personal, 0);
  }

  void show(boolean personal, int initialChapter) {
    this.personal = personal;
    chapter = Math.max(0, Math.min(2, initialChapter));
    window = new Dialog(activity);
    LinearLayout outer = u.column();
    outer.setBackgroundColor(Ui.BG);
    LinearLayout header = u.row();
    header.setPadding(u.dp(20), u.dp(12), u.dp(20), u.dp(8));
    header.addView(
        u.title(personal ? "Since us" : "Our little book", 23),
        new LinearLayout.LayoutParams(0, -2, 1));
    header.addView(u.button("Done", false, () -> window.dismiss()));
    outer.addView(header);
    content = u.column();
    content.setPadding(u.dp(20), 0, u.dp(20), u.dp(28));
    outer.addView(u.scroll(content), new LinearLayout.LayoutParams(-1, 0, 1));
    window.setContentView(outer);
    window.setOnDismissListener(
        d -> {
          main.removeCallbacks(poll);
          if (editor != null && editor.dialog.isShowing()) editor.dialog.dismiss();
        });
    window.show();
    window.getWindow().setLayout(-1, -1);
    restore();
    render();
    refresh();
    main.postDelayed(poll, 60000);
  }

  void close() {
    main.removeCallbacks(poll);
    if (window != null) window.dismiss();
  }

  JSONObject bundled(String name) {
    try {
      java.io.InputStream stream = activity.getAssets().open("default/" + name + ".json");
      java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
      byte[] buffer = new byte[4096];
      int n;
      while ((n = stream.read(buffer)) != -1) bytes.write(buffer, 0, n);
      stream.close();
      return new JSONObject(bytes.toString("UTF-8"));
    } catch (Exception e) {
      return new JSONObject();
    }
  }

  void restore() {
    try {
      journal = api.cached("/api/journal", !api.connected());
      keepsakes = api.cached("/api/keepsakes", !api.connected());
    } catch (Exception ignored) {
    }
    if (journal == null) journal = bundled("journal");
    if (keepsakes == null) keepsakes = bundled("keepsakes");
  }

  void refresh() {
    if (loading || editor != null && editor.dialog.isShowing()) return;
    loading = true;
    worker.execute(
        () -> {
          try {
            api.syncPending();
            api.get("/api/journal");
            api.get("/api/keepsakes");
          } catch (Exception ignored) {
          }
          main.post(
              () -> {
                loading = false;
                if (window != null
                    && window.isShowing()
                    && (editor == null || !editor.dialog.isShowing())) {
                  restore();
                  render();
                }
              });
        });
  }

  JSONArray list(String key) {
    JSONArray values = (personal ? keepsakes : journal).optJSONArray(key);
    return values == null ? new JSONArray() : values;
  }

  boolean writable() {
    return (personal ? keepsakes : journal).optBoolean("writable");
  }

  String path() {
    return personal ? "/api/keepsakes" : "/api/journal";
  }

  void render() {
    content.removeAllViews();
    String[] labels =
        personal
            ? new String[] {"Since us", "Open when…", "Little things"}
            : new String[] {"Tiny victories", "Recipes for two", "Inside jokes"};
    u.add(
        content,
        u.handwritten(personal ? "All the days that became ours. ♡" : "Still being written. ♡", 30),
        15);
    u.add(
        content,
        u.text("Saved for both of us. Add your own words, whenever you like.", 14, Ui.MUTED),
        8);
    HorizontalScrollView tabs = new HorizontalScrollView(activity);
    tabs.setHorizontalScrollBarEnabled(false);
    LinearLayout row = u.row(8);
    for (int i = 0; i < labels.length; i++) {
      final int index = i;
      row.addView(
          u.button(
              labels[i],
              chapter == i,
              () -> {
                chapter = index;
                render();
              }));
    }
    tabs.addView(row);
    u.add(content, tabs, 20);
    if (!writable())
      u.add(
          content,
          u.text(
              "Connect and refresh once to enable shared editing. Saved pages remain here offline.",
              12,
              Ui.MUTED),
          12);
    u.add(content, u.button("Refresh our pages", false, this::refresh), 10);
    if (personal && chapter == 0) {
      since();
      return;
    }
    String key =
        personal
            ? (chapter == 1 ? "letters" : "things")
            : (chapter == 0 ? "victories" : chapter == 1 ? "recipes" : "jokes");
    String kind =
        personal
            ? (chapter == 1 ? "Letter" : "Thing")
            : (chapter == 0 ? "Victory" : chapter == 1 ? "Recipe" : "Joke");
    Button add =
        u.button(
            "＋ Add "
                + (kind.equals("Thing")
                    ? "a little thing"
                    : kind.equals("Joke") ? "an inside joke" : "a " + kind.toLowerCase(Locale.US)),
            true,
            () -> edit(kind, null));
    add.setEnabled(writable());
    u.add(content, add, 18);
    JSONArray entries = list(key);
    if (entries.length() == 0) {
      u.add(content, u.text("A little space for something only we could write.", 16, Ui.MUTED), 28);
      return;
    }
    if (kind.equals("Thing")) {
      JSONObject item = entries.optJSONObject(reveal % entries.length());
      entry(kind, item);
      u.add(
          content,
          u.button(
              "Another little thing ♡",
              false,
              () -> {
                reveal = (reveal + 1) % entries.length();
                render();
              }),
          12);
      u.add(
          content,
          u.button(
              "Manage all little things",
              false,
              () -> {
                LinearLayout all = u.column();
                for (int i = 0; i < entries.length(); i++) {
                  JSONObject thing = entries.optJSONObject(i);
                  u.add(
                      all, u.button(thing.optString("text"), false, () -> edit("Thing", thing)), 8);
                }
                new AlertDialog.Builder(activity)
                    .setTitle("All the little things")
                    .setView(u.scroll(all))
                    .setNegativeButton("Close", null)
                    .show();
              }),
          10);
      return;
    }
    if (kind.equals("Letter")) {
      for (int i = 0; i < entries.length(); i += 2) {
        LinearLayout pair = u.row(10);
        for (int j = i; j < Math.min(i + 2, entries.length()); j++) {
          JSONObject item = entries.optJSONObject(j);
          Button b = u.button("✉  " + item.optString("title"), false, () -> openLetter(item));
          pair.addView(b, new LinearLayout.LayoutParams(0, -2, 1));
        }
        u.add(content, pair, 12);
      }
      return;
    }
    LinearLayout cards = u.column();
    if (kind.equals("Joke")) {
      EditText search = u.input("Find one of our inside jokes…", "", 160, false);
      u.add(content, search, 16);
      search.addTextChangedListener(
          new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int c, int f) {}

            public void onTextChanged(CharSequence s, int a, int b, int c) {
              fill(cards, kind, entries, s.toString());
            }

            public void afterTextChanged(android.text.Editable e) {}
          });
    }
    if (kind.equals("Recipe")) {
      Spinner filter =
          u.spinner(new String[] {"All recipes", "Still on our wish list", "Tried together"}, 0);
      u.add(content, filter, 12);
      filter.setOnItemSelectedListener(
          new AdapterView.OnItemSelectedListener() {
            public void onNothingSelected(AdapterView<?> p) {}

            public void onItemSelected(AdapterView<?> p, View v, int n, long id) {
              cards.removeAllViews();
              for (int i = entries.length() - 1; i >= 0; i--) {
                JSONObject item = entries.optJSONObject(i);
                if (n == 0 || item.optBoolean("tried") == (n == 2)) entryInto(cards, kind, item);
              }
              if (cards.getChildCount() == 0)
                u.add(cards, u.text("No recipes here just yet.", 14, Ui.MUTED), 20);
            }
          });
    }
    u.add(content, cards, 0);
    fill(cards, kind, entries, "");
  }

  void fill(LinearLayout parent, String kind, JSONArray values, String query) {
    parent.removeAllViews();
    for (int i = values.length() - 1; i >= 0; i--) {
      JSONObject item = values.optJSONObject(i);
      String hay =
          item.optString("title") + " " + item.optString("meaning") + " " + item.optString("story");
      if (hay.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT)))
        entryInto(parent, kind, item);
    }
    if (parent.getChildCount() == 0)
      u.add(parent, u.text("No matching little memories yet.", 14, Ui.MUTED), 20);
  }

  void entry(String kind, JSONObject item) {
    entryInto(content, kind, item);
  }

  void entryInto(LinearLayout parent, String kind, JSONObject item) {
    LinearLayout c = u.card(parent, kind.equals("Recipe") ? Ui.BLUE : android.graphics.Color.WHITE);
    u.add(c, u.title(item.optString(kind.equals("Thing") ? "text" : "title"), 22), 0);
    if (item.optBoolean("pending"))
      u.add(c, u.text("Saved on this phone · waiting to sync", 12, Ui.PURPLE), 8);
    for (String field : new String[] {"date", "note", "meaning", "story", "ingredients", "steps"}) {
      String value = item.optString(field);
      if (!value.isEmpty()) {
        if (field.equals("ingredients") || field.equals("steps")) u.add(c, u.label(field), 16);
        TextView text = u.text(value, 15, Ui.MUTED);
        text.setTextIsSelectable(true);
        u.add(c, text, 8);
      }
    }
    if (kind.equals("Victory"))
      u.add(
          c,
          u.text(
              "Proud of "
                  + (item.optString("who").equals("us")
                      ? "both of us"
                      : item.optString("who").equals("me") ? "Youssef" : "Asechka"),
              12,
              Ui.PURPLE),
          8);
    if (kind.equals("Recipe")) {
      String photo = item.optString("photoId", "");
      if (!photo.isEmpty() && !photo.equals("null")) {
        ImageView image = u.image(c, "Our recipe photo", 220);
        images.load("/api/journal?photo=" + photo, image);
      }
      JSONObject r = item.optJSONObject("ratings");
      u.add(
          c,
          u.text(
              item.optBoolean("tried")
                  ? "Tried together · Youssef "
                      + rating(r, "me")
                      + " · Asechka "
                      + rating(r, "asechka")
                  : "On our cooking wish list",
              13,
              Ui.PURPLE),
          12);
    }
    LinearLayout actions = u.actions();
    Button edit = u.button("Edit", false, () -> edit(kind, item));
    Button remove = u.button("Remove", false, () -> remove(kind, item));
    edit.setEnabled(writable());
    remove.setEnabled(writable());
    actions.addView(edit, new LinearLayout.LayoutParams(0, -2, 1));
    actions.addView(remove, new LinearLayout.LayoutParams(0, -2, 1));
    u.add(c, actions, 16);
  }

  String rating(JSONObject ratings, String key) {
    return ratings == null || ratings.isNull(key) ? "unrated" : ratings.optInt(key) + "/5";
  }

  void openLetter(JSONObject item) {
    LinearLayout body = u.column();
    body.setPadding(u.dp(22), u.dp(12), u.dp(22), u.dp(20));
    TextView hearts = u.handwritten("♡  ✦  ♡  ✧  ♡", 30);
    hearts.setTextColor(Ui.PURPLE);
    u.add(body, hearts, 0);
    TextView text = u.text(item.optString("text"), 18, Ui.INK);
    text.setTextIsSelectable(true);
    u.add(body, text, 16);
    u.add(body, u.button("Edit this letter", false, () -> edit("Letter", item)), 20);
    u.add(body, u.button("Remove this letter", false, () -> remove("Letter", item)), 8);
    AlertDialog d =
        new AlertDialog.Builder(activity)
            .setTitle(item.optString("title"))
            .setView(u.scroll(body))
            .setPositiveButton("Keep it close ♡", null)
            .create();
    d.show();
    Motion.enter(hearts, 1);
    hearts.post(() -> Motion.hearts(hearts));
    if (Motion.enabled(activity))
      hearts
          .animate()
          .translationY(-u.dp(8))
          .setDuration(1600)
          .withEndAction(() -> hearts.animate().translationY(0).setDuration(1200).start())
          .start();
  }

  void remove(String kind, JSONObject item) {
    if (!writable()) return;
    new AlertDialog.Builder(activity)
        .setTitle("Remove this " + kind.toLowerCase(Locale.US) + "?")
        .setMessage("It will be removed for both of us.")
        .setNegativeButton("Keep it", null)
        .setPositiveButton(
            "Remove",
            (d, w) ->
                queue(
                    path(),
                    OfflineStore.json(
                        "action",
                        "remove" + kind,
                        "id",
                        item.optString("id"),
                        "expectedRevision",
                        item.opt("revision"),
                        "operationId",
                        UUID.randomUUID().toString()),
                    null))
        .show();
  }

  void queue(String path, JSONObject body, Runnable success) {
    worker.execute(
        () -> {
          try {
            api.store.enqueue(path, body);
            main.post(
                () -> {
                  if (success != null) success.run();
                  restore();
                  render();
                  Toast.makeText(activity, "Saved on this phone ♡", Toast.LENGTH_SHORT).show();
                });
            api.syncPending();
            main.post(
                () -> {
                  if (window.isShowing() && (editor == null || !editor.dialog.isShowing())) {
                    restore();
                    render();
                  }
                });
          } catch (Exception e) {
            main.post(
                () -> {
                  if (editor != null) {
                    editor.saving = false;
                    editor.status.setText(e.getMessage());
                    editor.dialog.getButton(-1).setEnabled(true);
                  } else Toast.makeText(activity, e.getMessage(), Toast.LENGTH_LONG).show();
                });
          }
        });
  }

  void edit(String kind, JSONObject item) {
    if (!writable()) {
      Toast.makeText(activity, "Connect and refresh to edit our shared pages.", Toast.LENGTH_LONG)
          .show();
      return;
    }
    editor = new Editor(kind, item);
    editor.show();
  }

  void since() {
    JSONObject since = keepsakes.optJSONObject("since");
    if (since == null) return;
    long started = Dates.instant(since.optString("startedAt"));
    long days = Math.max(0, (System.currentTimeMillis() - started) / 86400000L);
    LinearLayout card = u.card(content, Ui.BLUE);
    u.add(card, u.label("SINCE WE BECAME US"), 0);
    u.add(card, u.handwritten(days + " days, and counting. ♡", 35), 12);
    u.add(card, u.text(displayDate(started, true) + " · Eastern time", 14, Ui.MUTED), 8);
    String talking = since.optString("startedTalkingAt", "");
    if (!talking.isEmpty() && !talking.equals("null")) {
      u.add(card, u.label("WE STARTED TALKING"), 20);
      u.add(card, u.title(displayDate(Dates.instant(talking + "T12:00:00Z"), false), 20), 8);
    }
    Calendar start = Calendar.getInstance(TimeZone.getTimeZone("America/New_York"));
    start.setTimeInMillis(started);
    Calendar now = (Calendar) start.clone();
    now.setTimeInMillis(System.currentTimeMillis());
    for (boolean yearly : new boolean[] {false, true}) {
      Calendar next = (Calendar) start.clone();
      int count =
          yearly
              ? now.get(Calendar.YEAR) - start.get(Calendar.YEAR)
              : (now.get(Calendar.YEAR) - start.get(Calendar.YEAR)) * 12
                  + now.get(Calendar.MONTH)
                  - start.get(Calendar.MONTH);
      next.add(yearly ? Calendar.YEAR : Calendar.MONTH, Math.max(1, count));
      if (next.getTimeInMillis() <= now.getTimeInMillis()) {
        next = (Calendar) start.clone();
        next.add(yearly ? Calendar.YEAR : Calendar.MONTH, Math.max(1, count) + 1);
      }
      u.add(
          card,
          u.text(
              (yearly ? "Our next anniversary · " : "Our next month together · ")
                  + displayDate(next.getTimeInMillis(), false),
              14,
              Ui.PURPLE),
          16);
      String message = since.optString(yearly ? "yearlyMessage" : "monthlyMessage");
      if (!message.isEmpty()) u.add(card, u.text(message, 15, Ui.MUTED), 8);
    }
    Button edit = u.button("Edit our beginning & messages", true, () -> editSince(since));
    edit.setEnabled(writable());
    u.add(content, edit, 18);
  }

  static String displayDate(long value, boolean time) {
    SimpleDateFormat f =
        new SimpleDateFormat(time ? "MMMM d, yyyy 'at' h:mm a" : "MMMM d, yyyy", Locale.US);
    f.setTimeZone(TimeZone.getTimeZone("America/New_York"));
    return f.format(new Date(value));
  }

  void editSince(JSONObject original) {
    LinearLayout body = u.column();
    body.setPadding(u.dp(20), u.dp(8), u.dp(20), u.dp(20));
    Calendar date = Calendar.getInstance(TimeZone.getTimeZone("America/New_York"));
    date.setTimeInMillis(Dates.instant(original.optString("startedAt")));
    Button dateButton = u.button(displayDate(date.getTimeInMillis(), true), false, null);
    dateButton.setOnClickListener(
        v ->
            new DatePickerDialog(
                    activity,
                    (p, y, m, d) -> {
                      date.set(y, m, d);
                      new TimePickerDialog(
                              activity,
                              (t, h, min) -> {
                                date.set(Calendar.HOUR_OF_DAY, h);
                                date.set(Calendar.MINUTE, min);
                                date.set(Calendar.SECOND, 0);
                                date.set(Calendar.MILLISECOND, 0);
                                dateButton.setText(displayDate(date.getTimeInMillis(), true));
                              },
                              date.get(Calendar.HOUR_OF_DAY),
                              date.get(Calendar.MINUTE),
                              false)
                          .show();
                    },
                    date.get(Calendar.YEAR),
                    date.get(Calendar.MONTH),
                    date.get(Calendar.DAY_OF_MONTH))
                .show());
    u.add(body, u.label("WHEN WE BECAME A COUPLE · EASTERN TIME"), 0);
    u.add(body, dateButton, 8);
    EditText talking =
        u.input(
            "We started talking · YYYY-MM-DD",
            original.optString("startedTalkingAt", "").replace("null", ""),
            10,
            false);
    u.add(body, u.label("WE STARTED TALKING · CLEAR TO HIDE"), 18);
    u.add(body, talking, 8);
    EditText monthly =
        u.input("Monthly anniversary message", original.optString("monthlyMessage"), 2000, true);
    u.add(body, monthly, 16);
    EditText yearly =
        u.input("Yearly anniversary message", original.optString("yearlyMessage"), 2000, true);
    u.add(body, yearly, 12);
    TextView error = u.text("", 13, Ui.PURPLE);
    u.add(body, error, 10);
    AlertDialog d =
        new AlertDialog.Builder(activity)
            .setTitle("Our beginning")
            .setView(u.scroll(body))
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save", null)
            .create();
    d.show();
    d.getButton(-1)
        .setOnClickListener(
            v -> {
              String value = talking.getText().toString().trim();
              if (!value.isEmpty() && !validDate(value)) {
                error.setText("Choose a real date in YYYY-MM-DD format.");
                return;
              }
              JSONObject b =
                  OfflineStore.json(
                      "action",
                      "saveSince",
                      "id",
                      original.optString("id"),
                      "expectedRevision",
                      original.opt("revision"),
                      "operationId",
                      UUID.randomUUID().toString(),
                      "startedAt",
                      Dates.timestamp(date.getTimeInMillis()),
                      "startedTalkingAt",
                      value.isEmpty() ? JSONObject.NULL : value,
                      "monthlyMessage",
                      monthly.getText().toString(),
                      "yearlyMessage",
                      yearly.getText().toString());
              d.getButton(-1).setEnabled(false);
              queue("/api/keepsakes", b, d::dismiss);
            });
  }

  static boolean validDate(String value) {
    if (!value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
    try {
      SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
      f.setLenient(false);
      return f.format(f.parse(value)).equals(value);
    } catch (Exception e) {
      return false;
    }
  }

  final class Editor {
    final String kind, id, draftKey, endpoint;
    final JSONObject original;
    final LinearLayout body;
    final AlertDialog dialog;
    final Map<String, EditText> fields = new LinkedHashMap<>();
    TextView status;
    final String operation = UUID.randomUUID().toString();
    CheckBox tried, removePhoto;
    Spinner who, me, asechka;
    String photo;
    boolean preparing, saving, committed;
    ImageView preview;

    Editor(String kind, JSONObject item) {
      this.kind = kind;
      original = item;
      id = item == null ? UUID.randomUUID().toString() : item.optString("id");
      endpoint = path();
      draftKey = "book-draft:" + kind + ":" + (item == null ? "new" : id);
      JSONObject draft = api.store.read(draftKey);
      JSONObject source = draft != null ? draft : item != null ? item : new JSONObject();
      photo = source.optString("photo", null);
      body = u.column();
      body.setPadding(u.dp(20), u.dp(8), u.dp(20), u.dp(20));
      if (!kind.equals("Thing"))
        field(
            "title",
            kind.equals("Letter") ? "Open when…" : kind.equals("Joke") ? "Our phrase" : "Title",
            source,
            kind.equals("Joke") || kind.equals("Letter") ? 160 : 140,
            false);
      if (kind.equals("Victory")) {
        field("date", "Date · YYYY-MM-DD", source, 10, false);
        if (fields.get("date").length() == 0) fields.get("date").setText(Dates.today());
        u.add(body, u.label("WHO ARE WE PROUD OF?"), 16);
        who =
            u.spinner(
                new String[] {"Youssef", "Asechka", "Both of us"},
                source.optString("who").equals("me")
                    ? 0
                    : source.optString("who").equals("asechka") ? 1 : 2);
        u.add(body, who, 8);
        field("note", "What made you proud?", source, 3000, true);
      }
      if (kind.equals("Joke")) {
        field("meaning", "What it means to us", source, 3000, true);
        field("story", "How it started · optional", source, 3000, true);
      }
      if (kind.equals("Letter") || kind.equals("Thing"))
        field("text", "Your words", source, kind.equals("Letter") ? 16000 : 2000, true);
      if (kind.equals("Recipe")) {
        field("ingredients", "Ingredients · one per line", source, 6000, true);
        field("steps", "Steps · one per line", source, 12000, true);
        field("note", "Our notes", source, 2000, true);
        tried = new CheckBox(activity);
        tried.setText("We tried this together");
        tried.setTextColor(Ui.INK);
        tried.setChecked(source.optBoolean("tried"));
        u.add(body, tried, 14);
        JSONObject ratings = source.optJSONObject("ratings");
        me = ratingPicker("Youssef’s rating", ratings, "me");
        asechka = ratingPicker("Asechka’s rating", ratings, "asechka");
        tried.setOnCheckedChangeListener(
            (v, b) -> {
              me.setEnabled(b);
              asechka.setEnabled(b);
            });
        me.setEnabled(tried.isChecked());
        asechka.setEnabled(tried.isChecked());
        preview = u.image(body, "Recipe photo preview", 180);
        preview.setVisibility(View.GONE);
        String old = item == null ? "" : item.optString("photoId", "");
        if (!old.isEmpty() && !old.equals("null")) {
          images.load("/api/journal?photo=" + old, preview);
          preview.setVisibility(View.VISIBLE);
        }
        if (photo != null) showPhoto();
        u.add(
            body,
            u.button(
                "Choose a recipe photo",
                false,
                () -> {
                  if (preparing || saving) return;
                  try {
                    activity.startActivityForResult(
                        new Intent(Intent.ACTION_OPEN_DOCUMENT)
                            .addCategory(Intent.CATEGORY_OPENABLE)
                            .setType("image/*"),
                        122);
                  } catch (Exception e) {
                    status.setText("A photo picker is not available.");
                  }
                }),
            12);
        removePhoto = new CheckBox(activity);
        removePhoto.setText("Remove the photo");
        removePhoto.setChecked(source.optBoolean("removePhoto"));
        removePhoto.setOnCheckedChangeListener(
            (v, b) -> {
              if (b) {
                photo = null;
                preview.setVisibility(View.GONE);
              }
            });
        u.add(body, removePhoto, 8);
      }
      status = u.text("Your draft stays on this phone until you save it.", 12, Ui.MUTED);
      u.add(body, status, 16);
      dialog =
          new AlertDialog.Builder(activity)
              .setTitle((item == null ? "Add " : "Edit ") + kind.toLowerCase(Locale.US))
              .setView(u.scroll(body))
              .setNegativeButton("Cancel", null)
              .setPositiveButton("Save", null)
              .create();
      dialog.setOnDismissListener(
          d -> {
            if (!committed)
              try {
                api.store.write(draftKey, values());
              } catch (Exception ignored) {
              }
            if (editor == this) editor = null;
          });
    }

    void field(String key, String label, JSONObject source, int limit, boolean multiple) {
      u.add(body, u.label(label), 16);
      EditText input = u.input(label, source.optString(key), limit, multiple);
      input.setContentDescription(label);
      fields.put(key, input);
      u.add(body, input, 7);
    }

    Spinner ratingPicker(String label, JSONObject ratings, String key) {
      u.add(body, u.label(label), 14);
      Spinner picker =
          u.spinner(
              new String[] {"Not rated", "1 / 5", "2 / 5", "3 / 5", "4 / 5", "5 / 5"},
              ratings == null ? 0 : ratings.optInt(key));
      u.add(body, picker, 5);
      return picker;
    }

    JSONObject values() throws Exception {
      JSONObject b = new JSONObject();
      for (String field : fields.keySet())
        b.put(field, fields.get(field).getText().toString().trim());
      if (who != null)
        b.put("who", new String[] {"me", "asechka", "us"}[who.getSelectedItemPosition()]);
      if (tried != null) {
        b.put("tried", tried.isChecked());
        b.put(
            "ratings",
            OfflineStore.json(
                "me",
                tried.isChecked() && me.getSelectedItemPosition() > 0
                    ? me.getSelectedItemPosition()
                    : JSONObject.NULL,
                "asechka",
                tried.isChecked() && asechka.getSelectedItemPosition() > 0
                    ? asechka.getSelectedItemPosition()
                    : JSONObject.NULL));
        if (photo != null) b.put("photo", photo);
        else if (removePhoto.isChecked()) b.put("removePhoto", true);
      }
      return b;
    }

    void show() {
      dialog.show();
      dialog.getButton(-1).setOnClickListener(v -> save());
    }

    void showPhoto() {
      if (photo != null) {
        byte[] bytes = android.util.Base64.decode(photo.substring(23), android.util.Base64.NO_WRAP);
        preview.setImageBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.length));
        preview.setVisibility(View.VISIBLE);
      }
    }

    void save() {
      if (preparing || saving) return;
      try {
        JSONObject b = values();
        if ((!kind.equals("Thing") && b.optString("title").isEmpty())
            || ((kind.equals("Letter") || kind.equals("Thing")) && b.optString("text").isEmpty())
            || (kind.equals("Joke") && b.optString("meaning").isEmpty())) {
          status.setText("Write the title and your words before saving.");
          return;
        }
        if (kind.equals("Victory") && !validDate(b.optString("date"))) {
          status.setText("Choose a real date in YYYY-MM-DD format.");
          return;
        }
        b.put("action", "save" + kind);
        b.put("id", id);
        b.put("operationId", operation);
        b.put("expectedRevision", original == null ? JSONObject.NULL : original.opt("revision"));
        saving = true;
        dialog.getButton(-1).setEnabled(false);
        api.store.write(draftKey, values());
        queue(
            endpoint,
            b,
            () -> {
              committed = true;
              api.store.remove(draftKey);
              dialog.dismiss();
            });
      } catch (Exception e) {
        status.setText(e.getMessage());
        saving = false;
      }
    }
  }

  boolean photoResult(int request, int result, Intent data) {
    if (request != 122) return false;
    Editor target = editor;
    if (target == null || result != Activity.RESULT_OK || data == null || data.getData() == null)
      return true;
    target.preparing = true;
    target.dialog.getButton(-1).setEnabled(false);
    target.status.setText("Preparing a little copy…");
    worker.execute(
        () -> {
          try {
            String encoded = photoMaker.prepare(data.getData());
            main.post(
                () -> {
                  if (editor == target && target.dialog.isShowing()) {
                    target.photo = encoded;
                    target.removePhoto.setChecked(false);
                    target.showPhoto();
                    target.preparing = false;
                    target.dialog.getButton(-1).setEnabled(true);
                    target.status.setText("Your picture is ready ♡");
                  }
                });
          } catch (Exception e) {
            main.post(
                () -> {
                  if (editor == target) {
                    target.preparing = false;
                    target.dialog.getButton(-1).setEnabled(true);
                    target.status.setText("Try a smaller JPG, PNG, or WebP photo.");
                  }
                });
          }
        });
    return true;
  }
}
