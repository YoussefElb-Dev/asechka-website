package app.asechka.android;

import android.app.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.*;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.*;
import android.text.InputType;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import app.asechka.android.Compat.Consumer;
import java.io.*;
import java.net.URLEncoder;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Entirely native Android UI. There are no HTML screens or JavaScript bridges. */
public class MainActivity extends Activity implements SocialFeed.Host {
  private Ui u;
  private ApiClient api;
  private Images images;
  private BookViews book;
  private HomeExtras homeExtras;
  private HomeExtras.HeartRain heartRain;

  HomeExtras.HeartRain hearts() {
    if (heartRain == null) heartRain = new HomeExtras.HeartRain(this);
    return heartRain;
  }

  void raiseHearts() {
    if (heartRain != null) heartRain.raise();
  }

  private final Runnable flushHearts = this::flushHeartQueue;

  private void flushHeartQueue() {
    socialWrites.execute(
        () -> {
          try {
            api.syncPending();
          } catch (Exception ignored) {
          }
          main.post(
              () -> {
                if (homeExtras != null) homeExtras.update();
                if (appUnlocked) updateConnection("");
              });
        });
  }

  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService work = Executors.newFixedThreadPool(4);
  private JSONObject memories, music, together, daily;
  private LinearLayout root, content, bottom;
  private ScrollView scroll;
  private FrameLayout stage;
  private SocialFeed feed;
  private Runnable activeConversationRefresh;
  private final ExecutorService socialWrites = Executors.newSingleThreadExecutor();
  private boolean savedPosts;
  private TextView notice;
  private Dialog activeDialog;
  private PlanEditor planEditor;
  private MemoryEditor memoryEditor;
  private int photoLimit = 8, quoteLimit = 12;
  private long quoteDue;
  private int screen, memoryTab, filter, epoch, pending, quoteIndex, localHearts, hintIndex;
  private boolean started, refreshing, mutating, quotePaused, choosingProfile;
  // UI access lasts for this foreground visit only; encrypted sync credentials stay intact.
  private boolean appUnlocked;
  private boolean refreshAgain;
  private long accessEpoch;
  private boolean biometricBusy;
  private boolean waitingForPhoneLock;
  private Dialog entryGate;
  private BiometricDoor biometrics;
  private int navigationInset;
  private volatile boolean prefetching;
  private String connectionMessage = "Opening our little universe…";
  private TextView quoteText, quoteCounter, timer;
  private ImageView quoteArtwork;
  private int quoteArtworkIndex = -1;
  private Button quotePauseButton;
  private final String[] labels = {"Home", "Photos", "Music", "Our days", "Words", "Quotes"};
  private final String[] languageIds = {"ar-EG", "ru", "he", "fr", "es"};
  private final String[] languageNames = {
    "Egyptian Arabic · مصري",
    "Russian · Русский",
    "Hebrew · עברית",
    "French · Français",
    "Spanish · Español"
  };
  private String wordDraft = "";
  private int sourceChoice, toneChoice, speakerChoice = 2, recipientChoice = 2;
  private boolean[] targetChoices = {true, true, true, true, true};
  private JSONObject translations;
  static final long REFRESH_INTERVAL = 60000;
  private ConnectivityManager.NetworkCallback networkCallback;
  private final Runnable saveWords = () -> persistWords();
  private final Runnable poll =
      new Runnable() {
        public void run() {
          if (started && appUnlocked && api.canOpen() && !mutating) refresh(false);
          main.postDelayed(this, REFRESH_INTERVAL);
        }
      };
  private boolean heartRefreshing;
  private final Runnable heartPoll =
      new Runnable() {
        public void run() {
          if (started && appUnlocked && api.canOpen() && api.connected() && !heartRefreshing) {
            heartRefreshing = true;
            work.execute(
                () -> {
                  try {
                    api.syncPending();
                    api.get("/api/together");
                  } catch (Exception ignored) {
                  }
                  main.post(
                      () -> {
                        heartRefreshing = false;
                        if (homeExtras != null) homeExtras.update();
                      });
                });
          }
          main.postDelayed(this, 15000);
        }
      };
  private final Runnable clock =
      new Runnable() {
        public void run() {
          if (started && appUnlocked) {
            updateTimer();
            if ((screen == 0 || screen == 5)
                && !quotePaused
                && motion()
                && activeDialog == null
                && quoteText != null
                && quoteText.getGlobalVisibleRect(new android.graphics.Rect())
                && android.os.SystemClock.uptimeMillis() >= quoteDue) nextQuote(1);
          }
          main.postDelayed(this, 1000);
        }
      };

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    u = new Ui(this);
    api = new ApiClient(this);
    biometrics = new BiometricDoor(this, api.store);
    images = new Images(api);
    book = new BookViews(this, api, images, work, this::compressPhoto);
    if (state != null) {
      screen = state.getInt("screen");
      memoryTab = state.getInt("memoryTab");
      wordDraft = state.getString("words", "");
    }
    getWindow()
        .getDecorView()
        .setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    if (hasProfile()) openStart();
    else showIdentity();
    main.post(clock);
    main.postDelayed(poll, REFRESH_INTERVAL);
    main.postDelayed(heartPoll, 15000);
    networkCallback =
        new ConnectivityManager.NetworkCallback() {
          @Override
          public void onLost(Network network) {
            main.post(
                () -> {
                  if (root != null) updateConnection("");
                });
          }

          @Override
          public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
            if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))
              main.post(
                  () -> {
                    if (started && appUnlocked && api.canOpen()) refresh(false);
                  });
          }
        };
    ConnectivityManager connectivity = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
    if (Build.VERSION.SDK_INT >= 24) connectivity.registerDefaultNetworkCallback(networkCallback);
    else
      connectivity.registerNetworkCallback(
          new android.net.NetworkRequest.Builder()
              .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
              .build(),
          networkCallback);
    if (api.canOpen()) SyncJob.schedule(this);
  }

  @Override
  protected void onResume() {
    super.onResume();
    started = true;
    if (root != null) {
      if (!biometrics.enabled()) appUnlocked = true;
      else if (!appUnlocked) {
        showEntryGate();
        unlockBiometricGate();
      }
    }
    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    if (entryGate != null) entryGate.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    quoteDue = android.os.SystemClock.uptimeMillis() + 8000;
    if (root != null) root.invalidate();
    if (appUnlocked && api != null && api.canOpen() && root != null) refresh(false);
  }

  @Override
  protected void onPause() {
    started = false;
    accessEpoch++;
    appUnlocked = biometrics == null || !biometrics.enabled();
    biometricBusy = false;
    if (biometrics != null) biometrics.cancel();
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    if (heartRain != null) heartRain.stop();
    if (root != null && !appUnlocked && !isFinishing()) showEntryGate();
    if (entryGate != null) entryGate.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    if (api != null && api.canOpen()) flushHearts.run();
    persistWords();
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    accessEpoch++;
    if (entryGate != null) {
      entryGate.dismiss();
      entryGate = null;
    }
    if (networkCallback != null)
      ((ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE))
          .unregisterNetworkCallback(networkCallback);
    root = null;
    epoch++;
    main.removeCallbacksAndMessages(null);
    work.shutdownNow();
    socialWrites.shutdown();
    if (book != null) book.close();
    if (homeExtras != null) homeExtras.close();
    if (heartRain != null) heartRain.stop();
    images.close();
    if (activeDialog != null) activeDialog.dismiss();
    super.onDestroy();
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    out.putInt("screen", screen);
    out.putInt("memoryTab", memoryTab);
    out.putString("words", wordDraft);
  }

  @Override
  public void onConfigurationChanged(Configuration config) {
    super.onConfigurationChanged(config);
    u = new Ui(this);
    if (entryGate != null) return;
    if (activeDialog == null) {
      if (choosingProfile) showIdentity();
      else if (root != null) {
        int y = scroll.getScrollY();
        showShell();
        scroll.post(() -> scroll.scrollTo(0, y));
      } else showLogin();
    }
  }

  @Override
  public void onBackPressed() {
    if (!appUnlocked && !choosingProfile) {
      moveTaskToBack(true);
      return;
    }
    if (choosingProfile && hasProfile()) {
      openStart();
      return;
    }
    if (screen != 0 && api.canOpen() && root != null) {
      select(0);
    } else super.onBackPressed();
  }

  private void mount(LinearLayout view) {
    view.setBackgroundColor(Ui.BG);
    view.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          android.graphics.Insets sys =
              insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
          android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
          navigationInset = sys.bottom;
          boolean keyboard = ime.bottom > sys.bottom;
          v.setPadding(
              sys.left,
              sys.top,
              sys.right,
              root == view ? (keyboard ? ime.bottom : 0) : Math.max(sys.bottom, ime.bottom));
          if (root == view && bottom != null) {
            bottom.setVisibility(keyboard ? View.GONE : View.VISIBLE);
            bottom.setPadding(u.dp(10), u.dp(6), u.dp(10), u.dp(6) + sys.bottom);
          }
          return insets;
        });
    // Android 6–10 use the original inset accessors.
    if (Build.VERSION.SDK_INT < 30)
      view.setOnApplyWindowInsetsListener(
          (v, insets) -> {
            int systemBottom = insets.getStableInsetBottom();
            int keyboardBottom = insets.getSystemWindowInsetBottom();
            boolean keyboard = keyboardBottom > systemBottom + u.dp(100);
            v.setPadding(
                insets.getSystemWindowInsetLeft(),
                insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(),
                root == view ? (keyboard ? keyboardBottom : 0) : keyboardBottom);
            navigationInset = systemBottom;
            if (root == view && bottom != null) {
              bottom.setVisibility(keyboard ? View.GONE : View.VISIBLE);
              bottom.setPadding(u.dp(10), u.dp(6), u.dp(10), u.dp(6) + navigationInset);
            }
            return insets;
          });
    getWindow()
        .setNavigationBarColor(
            Build.VERSION.SDK_INT < 26 ? Ui.INK : root == view ? Color.WHITE : Ui.BG);
    setContentView(view);
    view.requestApplyInsets();
  }

  private boolean hasProfile() {
    return prefs().contains("person");
  }

  private boolean isAsnat() {
    return prefs().getString("person", "asnat").equals("asnat");
  }

  private String person() {
    return isAsnat() ? "Asnat" : "Youssef";
  }

  private String partner() {
    return isAsnat() ? "Youssef" : "Asnat";
  }

  private String heartSender() {
    return isAsnat() ? "asechka" : "me";
  }

  private void applyProfile() {
    speakerChoice = isAsnat() ? 1 : 0;
    recipientChoice = isAsnat() ? 1 : 0;
  }

  private void openStart() {
    choosingProfile = false;
    applyProfile();
    if (api.canOpen()) {
      appUnlocked = !biometrics.enabled();
      restoreSaved();
      showShell();
      refresh(true);
    } else showLogin();
  }

  private void chooseProfile(String id) {
    epoch++;
    refreshing = false;
    mutating = false;
    translationBusy = false;
    prefs()
        .edit()
        .putString("person", id)
        .putString("asnat-birthday", "08-05")
        .putString("youssef-birthday", "01-25")
        .apply();
    wordDraft = "";
    translations = null;
    sourceChoice = 0;
    toneChoice = 0;
    targetChoices = new boolean[] {true, true, true, true, true};
    applyProfile();
    openStart();
  }

  private void showIdentity() {
    persistWords();
    hideKeyboard();
    choosingProfile = true;
    root = null;
    LinearLayout outer = u.column(), body = u.column();
    body.setGravity(Gravity.CENTER_VERTICAL);
    body.setPadding(u.dp(24), u.dp(32), u.dp(24), u.dp(32));
    u.add(body, u.label("OUR LITTLE UNIVERSE"), 0);
    u.add(body, u.title("Two people.\nOne little home.", 32), 14);
    u.add(
        body,
        u.text(
            "Who’s here today? Choose once, and we’ll remember the little details for you.",
            16,
            Ui.MUTED),
        14);
    ImageView art = u.image(body, "Our two cats under the stars", 180);
    art.setScaleType(ImageView.ScaleType.FIT_CENTER);
    art.setBackgroundColor(Color.TRANSPARENT);
    images.load("/assets/our-little-universe.png", art);
    profileCard(body, "asnat", "Asnat", "August 5", "A");
    profileCard(body, "youssef", "Youssef", "January 25", "Y");
    u.add(body, u.text("You can switch profiles in the app menu.", 12, Ui.MUTED), 20);
    outer.addView(u.scroll(body), new LinearLayout.LayoutParams(-1, 0, 1));
    mount(outer);
  }

  private void profileCard(
      LinearLayout parent, String id, String name, String birthday, String initial) {
    LinearLayout card = u.row(14);
    card.setPadding(u.dp(18), u.dp(18), u.dp(18), u.dp(18));
    android.graphics.drawable.GradientDrawable background = u.shape(Color.WHITE, 20);
    background.setStroke(u.dp(1), Ui.LINE);
    card.setBackground(
        new android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(0x226b5cb5), background, null));
    TextView avatar = u.title(initial, 22);
    avatar.setGravity(Gravity.CENTER);
    avatar.setBackground(u.shape(id.equals("asnat") ? Ui.PALE : Ui.BLUE, 50));
    card.addView(avatar, new LinearLayout.LayoutParams(u.dp(52), u.dp(52)));
    LinearLayout copy = u.column();
    u.add(copy, u.title(name, 20), 0);
    u.add(copy, u.text("Birthday · " + birthday, 13, Ui.MUTED), 5);
    card.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
    card.addView(u.text("→", 24, Ui.PURPLE));
    card.setMinimumHeight(u.dp(88));
    card.setFocusable(true);
    card.setContentDescription("Choose " + name + ", birthday " + birthday);
    card.setOnClickListener(v -> chooseProfile(id));
    u.add(parent, card, 14);
  }

  private void showLogin() {
    accessEpoch++;
    appUnlocked = false;
    if (entryGate != null) {
      entryGate.dismiss();
      entryGate = null;
    }
    if (activeDialog != null) {
      activeDialog.dismiss();
      activeDialog = null;
    }
    choosingProfile = false;
    root = null;
    LinearLayout outer = u.column();
    LinearLayout body = u.column();
    body.setPadding(u.dp(28), u.dp(40), u.dp(28), u.dp(32));
    body.setGravity(Gravity.CENTER_VERTICAL);
    Ui.Icon star = new Ui.Icon(this, 6, Ui.PURPLE);
    star.setBackground(u.shape(Ui.PALE, 24));
    star.setPadding(u.dp(16), u.dp(16), u.dp(16), u.dp(16));
    body.addView(star, new LinearLayout.LayoutParams(u.dp(62), u.dp(62)));
    u.add(body, u.label("OUR LITTLE UNIVERSE"), 28);
    u.add(body, u.title("Connect our\nlittle space.", 34), 12);
    u.add(
        body,
        u.text(
            "Connect once with our website code.\nWe’ll keep you signed in on this phone.",
            16,
            Ui.MUTED),
        12);
    LinearLayout card = u.card(body, android.graphics.Color.WHITE);
    u.add(card, u.label("OUR LITTLE CODE"), 0);
    EditText password = u.input("Enter our code", "", 160, false);
    password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    password.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_GO);
    if (Build.VERSION.SDK_INT >= 26) password.setAutofillHints(View.AUTOFILL_HINT_PASSWORD);
    u.add(card, password, 14);
    CheckBox show = new CheckBox(this);
    show.setText("Show code");
    show.setTextColor(Ui.MUTED);
    show.setOnCheckedChangeListener(
        (b, checked) -> {
          password.setTransformationMethod(
              checked ? null : android.text.method.PasswordTransformationMethod.getInstance());
          password.setSelection(password.length());
        });
    u.add(card, show, 4);
    TextView status = u.text("", 13, Ui.MUTED);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    Button unlock = u.button("Open our little door  →", true, null);
    u.add(card, unlock, 12);
    u.add(card, status, 10);
    Runnable login =
        () -> {
          if (password.length() == 0) {
            status.setText("Enter our little code first.");
            return;
          }
          hideKeyboard();
          unlock.setEnabled(false);
          status.setText("Opening our little door…");
          String code = password.getText().toString();
          request(
              () -> api.login(code),
              data -> {
                password.setText("");
                appUnlocked = true;
                screen = 0;
                restoreSaved();
                showShell();
                SyncJob.schedule(this);
                toast("Welcome home, " + person() + " ♡");
                refresh(true);
              },
              error -> {
                unlock.setEnabled(true);
                status.setText(message(error));
              });
        };
    unlock.setOnClickListener(v -> login.run());
    password.setOnEditorActionListener(
        (v, id, event) -> {
          if (id == android.view.inputmethod.EditorInfo.IME_ACTION_GO) {
            login.run();
            return true;
          }
          return false;
        });
    u.add(body, u.text("С возвращением, Асечка ♡", 15, Ui.PURPLE), 26);
    u.add(body, u.text("Made with a whole lot of love. Only for you.", 12, Ui.MUTED), 8);
    ScrollView loginScroll = u.scroll(body);
    outer.addView(loginScroll, new LinearLayout.LayoutParams(-1, 0, 1));
    mount(outer);
  }

  private void showEntryGate() {
    if (entryGate != null || isFinishing() || isDestroyed()) return;
    LinearLayout body = u.column();
    body.setGravity(Gravity.CENTER);
    body.setPadding(u.dp(30), u.dp(30), u.dp(30), u.dp(30));
    body.setBackgroundColor(Ui.BG);
    TextView heart = u.title("♡", 44);
    heart.setGravity(Gravity.CENTER);
    u.add(body, heart, 0);
    TextView title = u.title("A little moment, just for us.", 25);
    title.setGravity(Gravity.CENTER);
    u.add(body, title, 20);
    u.add(body, u.button("Unlock with biometrics", true, this::unlockBiometricGate), 25);
    u.add(body, u.button("Use phone screen lock", false, this::confirmPhoneLock), 10);
    Dialog gate = new Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
    gate.setCancelable(false);
    gate.setCanceledOnTouchOutside(false);
    gate.setContentView(body);
    entryGate = gate;
    gate.show();
    gate.getWindow().setLayout(-1, -1);
    gate.setOnKeyListener(
        (d, key, event) -> {
          if (key == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) moveTaskToBack(true);
            return true;
          }
          return false;
        });
  }

  private void openDoor() {
    appUnlocked = true;
    biometricBusy = false;
    if (entryGate != null) {
      entryGate.dismiss();
      entryGate = null;
    }
    refresh(false);
  }

  private void unlockBiometricGate() {
    if (biometricBusy || waitingForPhoneLock || !started || entryGate == null) return;
    biometricBusy = true;
    final long visit = accessEpoch;
    biometrics.authenticate(
        false,
        (success, message) -> {
          if (visit != accessEpoch || !started) return;
          biometricBusy = false;
          if (success) openDoor();
          else toast("Use your phone screen lock or try biometrics again.");
        });
  }

  private void confirmPhoneLock() {
    KeyguardManager manager = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
    Intent intent =
        manager.createConfirmDeviceCredentialIntent(
            "Our little universe", "Unlock Asechka with your phone’s screen lock.");
    if (intent == null) {
      toast("Set up a phone screen lock in Settings first.");
      return;
    }
    waitingForPhoneLock = true;
    startActivityForResult(intent, 481);
  }

  private void reconnect() {
    EditText code = u.input("Our website code", "", 160, false);
    code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Reconnect our space")
            .setMessage(
                "Enter our website code to renew this phone’s connection. Your saved content stays"
                    + " here.")
            .setView(code)
            .setPositiveButton("Reconnect", null)
            .setNegativeButton("Cancel", null)
            .create();
    track(dialog);
    dialog.show();
    dialog
        .getButton(AlertDialog.BUTTON_POSITIVE)
        .setOnClickListener(
            v -> {
              String value = code.getText().toString();
              if (value.isEmpty()) {
                code.setError("Enter our website code.");
                return;
              }
              dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
              request(
                  () -> api.login(value),
                  result -> {
                    code.setText("");
                    dialog.dismiss();
                    api.retryNow();
                    refresh(true);
                  },
                  error -> {
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                    code.setError(message(error));
                  });
            });
  }

  private void showShell() {
    boolean shortScreen = getResources().getConfiguration().screenHeightDp < 700;
    root = u.column();
    root.setFocusableInTouchMode(true);
    root.setDescendantFocusability(android.view.ViewGroup.FOCUS_BEFORE_DESCENDANTS);
    LinearLayout toolbar = u.row(8);
    toolbar.setPadding(u.dp(20), u.dp(shortScreen ? 4 : 6), u.dp(16), u.dp(shortScreen ? 4 : 6));
    Ui.Icon sparkle = new Ui.Icon(this, 6, Ui.PURPLE);
    toolbar.addView(sparkle, new LinearLayout.LayoutParams(u.dp(23), u.dp(23)));
    TextView brand = u.title("asechka.", 23);
    toolbar.addView(brand, new LinearLayout.LayoutParams(0, u.dp(shortScreen ? 44 : 54), 1));
    brand.setGravity(Gravity.CENTER_VERTICAL);
    SocialFeed.Icon create = new SocialFeed.Icon(this, "plus");
    create.setContentDescription("Create a post");
    create.setOnClickListener(v -> choosePost());
    toolbar.addView(create, new LinearLayout.LayoutParams(u.dp(44), u.dp(48)));
    Button refresh = u.button("↻", false, null);
    refresh.setOnClickListener(
        v -> {
          if (motion())
            refresh.animate().rotationBy(360).setDuration(650).setInterpolator(Motion.EASE).start();
          connectionMenu();
        });
    refresh.setTextSize(24);
    refresh.setPadding(0, 0, 0, 0);
    refresh.setContentDescription("Refresh shared memories");
    toolbar.addView(refresh, new LinearLayout.LayoutParams(u.dp(48), u.dp(48)));
    Button menu = u.button(person().substring(0, 1), false, null);
    menu.setTextSize(16);
    menu.setPadding(0, 0, 0, 0);
    menu.setContentDescription("Settings and sign out");
    menu.setOnClickListener(v -> settings(menu));
    LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(u.dp(48), u.dp(48));
    mp.leftMargin = u.dp(6);
    toolbar.addView(menu, mp);
    root.addView(toolbar);
    toolbar.setMinimumHeight(u.dp(shortScreen ? 56 : 64));
    notice = u.text(connectionMessage, 12, Ui.MUTED);
    notice.setMaxLines(2);
    notice.setEllipsize(android.text.TextUtils.TruncateAt.END);
    if (shortScreen) notice.setVisibility(View.GONE);
    notice.setPadding(u.dp(24), u.dp(2), u.dp(24), u.dp(9));
    notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    notice.setOnClickListener(v -> connectionMenu());
    root.addView(notice);
    content = u.column();
    content.setPadding(u.dp(22), u.dp(12), u.dp(22), u.dp(26));
    scroll = u.scroll(content);
    stage = new FrameLayout(this);
    stage.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
    root.addView(stage, new LinearLayout.LayoutParams(-1, 0, 1));
    feed = null;
    bottom = u.row(0);
    bottom.setPadding(u.dp(10), u.dp(6), u.dp(10), u.dp(6) + navigationInset);
    bottom.setElevation(u.dp(8));
    bottom.setBackgroundColor(Color.WHITE);
    root.addView(bottom);
    scroll.setOnScrollChangeListener((v, x, y, oldX, oldY) -> Motion.reveal(content, scroll));
    mount(root);
    renderNav();
    render(false);
    root.requestFocus();
  }

  private void settings(View anchor) {
    Ui.Sheet sheet = u.sheet("Our little settings", person() + " · a space made for the two of us");
    if (biometrics.available() || biometrics.enabled())
      sheet.item(
          biometrics.enabled() ? "Turn off biometric unlock" : "Enable biometric unlock",
          "Optional · fingerprint, face unlock or your phone screen lock",
          "♡",
          false,
          () -> {
            if (biometrics.enabled()) {
              biometrics.disable();
              toast("Biometric unlock turned off.");
            } else
              biometrics.authenticate(
                  true,
                  (success, message) -> toast(success ? "Biometric unlock is ready. ♡" : message));
          });
    sheet.item(
        "Refresh & reconnect",
        "Refresh now, retry saves, or enter our code again",
        "↻",
        false,
        this::connectionMenu);
    sheet.item(
        "Saved changes · " + api.store.pending(),
        "See what’s waiting to sync",
        "↻",
        false,
        this::showOutbox);
    if (!api.signedIn())
      sheet.item(
          "Reconnect with our code", "Bring both phones up to date", "↗", false, this::reconnect);
    sheet.item("Switch profile · " + person(), "Asnat or Youssef", "♡", false, this::showIdentity);
    sheet.item(
        "Our birthdays",
        "Asnat · August 5   /   Youssef · January 25",
        "✦",
        false,
        () ->
            new AlertDialog.Builder(this)
                .setTitle("Two favorite days")
                .setMessage(
                    "Asnat · August 5\n"
                        + "Youssef · January 25\n\n"
                        + "Remembered every year, even offline.")
                .setPositiveButton("Lovely ♡", null)
                .show());
    boolean paused = prefs().getBoolean("motion-paused", false),
        haptics = prefs().getBoolean("haptics", true);
    sheet.item(
        paused ? "Resume gentle animations" : "Pause gentle animations",
        "Choose how much things move",
        "∞",
        false,
        () -> {
          prefs().edit().putBoolean("motion-paused", !paused).apply();
          render(true);
        });
    sheet.item(
        haptics ? "Turn off haptic feedback" : "Turn on haptic feedback",
        "A little feeling with every tap",
        "✧",
        false,
        () -> prefs().edit().putBoolean("haptics", !haptics).apply());
    sheet.item(
        "Lock our little door",
        "Open it again with our code",
        "⌑",
        true,
        () ->
            new AlertDialog.Builder(this)
                .setTitle("Lock our little door?")
                .setMessage("Your saved content stays safely on this phone.")
                .setNegativeButton("Keep it open", null)
                .setPositiveButton("Lock", (d, w) -> signOut())
                .show());
    track(sheet);
    sheet.show();
  }

  private void connectionMenu() {
    Ui.Sheet sheet = u.sheet("Our connection", connectionMessage);
    sheet.item(
        "Refresh now",
        "Get the latest photos, quotes, hearts and shared days",
        "↻",
        false,
        () -> {
          api.retryNow();
          refresh(true);
        });
    sheet.item(
        "Reconnect & retry",
        "Enter our code again and retry saved hearts automatically",
        "♡",
        false,
        this::reconnect);
    sheet.item(
        "Saved changes", "See anything still waiting on this phone", "↓", false, this::showOutbox);
    track(sheet);
    sheet.show();
  }

  private android.content.SharedPreferences prefs() {
    return getSharedPreferences("preferences", MODE_PRIVATE);
  }

  private boolean motion() {
    return Motion.enabled(this);
  }

  private void signOut() {
    epoch++;
    api.clearSession();
    api.store.lock();
    SyncJob.cancel(this);
    images.clear();
    memories = music = together = daily = translations = null;
    wordDraft = "";
    translationBusy = false;
    translatorReady = false;
    mutating = false;
    refreshing = false;
    pending = 0;
    showLogin();
  }

  private void select(int target) {
    hideKeyboard();
    if (screen == target) {
      if (feed != null && feed.getVisibility() == View.VISIBLE) feed.smoothScrollToPosition(0);
      else scroll.smoothScrollTo(0, 0);
      return;
    }
    int previous = screen;
    screen = target;
    root.requestFocus();
    renderNav();
    render(false);
    Motion.enter(stage, Integer.compare(navPosition(target), navPosition(previous)));
    scroll.scrollTo(0, 0);
    scroll.clearFocus();
    root.requestFocus();
    if (target == 4) checkTranslator();
  }

  private int navPosition(int target) {
    int[] order = {0, 1, 5, 2, 3, 4};
    for (int i = 0; i < order.length; i++) if (order[i] == target) return i;
    return 0;
  }

  private boolean compact() {
    return getResources().getConfiguration().screenHeightDp < 420;
  }

  private void renderNav() {
    bottom.removeAllViews();
    int[] order = {0, 1, 5, 2, 3, 4};
    for (int position = 0; position < order.length; position++) {
      final int i = order[position];
      final int target = i;
      boolean selected = screen == i;
      LinearLayout tab = u.column();
      tab.setGravity(Gravity.CENTER);
      tab.setPadding(u.dp(2), u.dp(3), u.dp(2), u.dp(3));
      tab.setContentDescription(labels[i]);
      tab.setFocusable(true);
      tab.setSelected(selected);
      tab.setBackground(
          new android.graphics.drawable.RippleDrawable(
              android.content.res.ColorStateList.valueOf(0x226b5cb5),
              u.shape(selected ? Ui.PALE : Color.WHITE, 20),
              u.shape(Color.WHITE, 20)));
      FrameLayout iconFrame = new FrameLayout(this);
      iconFrame.setBackground(u.shape(selected ? Ui.PRIMARY : Color.TRANSPARENT, 17));
      FrameLayout.LayoutParams iconParams =
          new FrameLayout.LayoutParams(u.dp(23), u.dp(23), Gravity.CENTER);
      iconFrame.addView(new Ui.Icon(this, i, selected ? Color.WHITE : Ui.MUTED), iconParams);
      tab.addView(iconFrame, new LinearLayout.LayoutParams(u.dp(46), u.dp(34)));
      if (selected && motion()) {
        iconFrame.setScaleX(.8f);
        iconFrame.setScaleY(.8f);
        iconFrame
            .animate()
            .scaleX(1)
            .scaleY(1)
            .setDuration(380)
            .setInterpolator(new android.view.animation.OvershootInterpolator(1.4f))
            .start();
      }
      TextView label = u.text(labels[i], 10, selected ? Ui.PRIMARY : Ui.MUTED);
      if (Build.VERSION.SDK_INT >= 26)
        label.setAutoSizeTextTypeUniformWithConfiguration(
            8, 10, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
      else label.setTextSize(compact() ? 8 : 10);
      label.setMaxLines(1);
      label.setEllipsize(android.text.TextUtils.TruncateAt.END);
      label.setGravity(Gravity.CENTER);
      Compat.font(label, R.font.dm_sans, selected ? 700 : 500);
      u.add(tab, label, 3);
      tab.setMinimumHeight(u.dp(compact() ? 48 : 60));
      tab.setOnClickListener(v -> select(target));
      bottom.addView(tab, new LinearLayout.LayoutParams(0, -2, 1));
    }
    Motion.install(bottom);
  }

  private void render(boolean keepScroll) {
    if (content == null) return;
    if (screen == 0 || screen == 1 || screen == 5) {
      scroll.setVisibility(View.GONE);
      boolean freshFeed = feed == null || feed.mode != screen;
      if (freshFeed) {
        if (feed != null) stage.removeView(feed);
        quoteText = quoteCounter = timer = null;
        feed = new SocialFeed(this, this, screen, feedHeader());
        stage.addView(feed, new FrameLayout.LayoutParams(-1, -1));
      }
      feed.setVisibility(View.VISIBLE);
      feed.savedOnly(savedPosts);
      feed.submit(memories, keepScroll && !freshFeed);
      return;
    }
    if (feed != null) feed.setVisibility(View.GONE);
    scroll.setVisibility(View.VISIBLE);
    int y = keepScroll ? scroll.getScrollY() : 0;
    content.removeAllViews();
    quoteText = quoteCounter = timer = null;
    if (screen == 0) home();
    if (screen == 1 || screen == 5) memories();
    if (screen == 2) music();
    if (screen == 3) days();
    if (screen == 4) words();
    Motion.install(content);
    content
        .getViewTreeObserver()
        .addOnPreDrawListener(
            new android.view.ViewTreeObserver.OnPreDrawListener() {
              public boolean onPreDraw() {
                content.getViewTreeObserver().removeOnPreDrawListener(this);
                if (keepScroll) scroll.scrollTo(0, y);
                Motion.reveal(content, scroll);
                return true;
              }
            });
  }

  private View feedHeader() {
    boolean home = screen == 0 && !savedPosts;
    LinearLayout header = u.column();
    header.setPadding(0, u.dp(10), 0, u.dp(12));
    header.setClipChildren(false);
    header.setClipToPadding(false);
    HorizontalScrollView stories = new HorizontalScrollView(this);
    stories.setHorizontalScrollBarEnabled(false);
    stories.setClipChildren(false);
    stories.setClipToPadding(false);
    LinearLayout row = u.row(14);
    row.setPadding(u.dp(16), u.dp(7), u.dp(16), u.dp(home ? 8 : 14));
    row.setClipChildren(false);
    row.setClipToPadding(false);
    String[] titles = {"Create", "Our corner", "Our days", "Music", "Saved"};
    String[] symbols = {"＋", "♡", "✦", "♫", "☆"};
    for (int i = 0; i < titles.length; i++) {
      if (home && (i == 2 || i == 3)) continue;
      final int action = i;
      LinearLayout story = u.column();
      story.setGravity(Gravity.CENTER);
      TextView circle = u.text(symbols[i], 27, Ui.PURPLE);
      circle.setGravity(Gravity.CENTER);
      circle.setBackground(
          new android.graphics.drawable.GradientDrawable(
              android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
              new int[] {Ui.PALE, Ui.BLUE}));
      ((android.graphics.drawable.GradientDrawable) circle.getBackground())
          .setCornerRadius(u.dp(100));
      ((android.graphics.drawable.GradientDrawable) circle.getBackground())
          .setStroke(u.dp(2), 0xffd1c5ec);
      if (!home) story.addView(circle, new LinearLayout.LayoutParams(u.dp(62), u.dp(62)));
      TextView label = u.text(titles[i], 11, Ui.INK);
      label.setGravity(Gravity.CENTER);
      if (home) {
        label.setText(symbols[i] + "  " + titles[i]);
        label.setTextSize(13);
        label.setMinHeight(u.dp(44));
        label.setPadding(u.dp(6), 0, u.dp(6), 0);
        label.setBackground(u.shape(Ui.PALE, 18));
      }
      u.add(story, label, home ? 0 : 7);
      story.setContentDescription(titles[i]);
      story.setOnClickListener(
          v -> {
            if (action == 0) choosePost();
            if (action == 1) ourCorner();
            if (action == 2) select(3);
            if (action == 3) select(2);
            if (action == 4) {
              savedPosts = !savedPosts;
              if (feed != null) {
                stage.removeView(feed);
                feed = null;
              }
              render(false);
            }
          });
      row.addView(
          story,
          home
              ? new LinearLayout.LayoutParams(0, -2, 1)
              : new LinearLayout.LayoutParams(u.dp(72), -2));
    }
    if (home) header.addView(row);
    else {
      stories.addView(row);
      header.addView(stories);
    }
    LinearLayout intro = u.column();
    intro.setPadding(u.dp(22), u.dp(7), u.dp(22), u.dp(16));
    intro.addView(
        u.title(
            savedPosts
                ? "Kept close."
                : screen == 1
                    ? "Our camera roll."
                    : screen == 5 ? "Words to keep." : "Our little us.",
            27));
    u.add(
        intro,
        u.text(
            savedPosts
                ? "Your saved photos and words, in one place."
                : "A little life together, one moment at a time.",
            13,
            Ui.MUTED),
        4);
    LinearLayout compose = u.row(12);
    compose.setPadding(u.dp(14), u.dp(12), u.dp(14), u.dp(12));
    compose.setBackground(u.shape(Color.WHITE, 22));
    compose.addView(
        SocialFeed.avatar(this, actor(), 38), new LinearLayout.LayoutParams(u.dp(38), u.dp(38)));
    compose.addView(
        u.text("Something to share, " + person() + "?", 14, Ui.MUTED),
        new LinearLayout.LayoutParams(0, -2, 1));
    compose.addView(
        new SocialFeed.Icon(this, "plus"), new LinearLayout.LayoutParams(u.dp(34), u.dp(34)));
    compose.setOnClickListener(v -> choosePost());
    u.add(intro, compose, 17);
    if (!home) header.addView(intro);
    if (screen == 5 && !savedPosts) {
      LinearLayout carousel = u.column();
      carousel.setPadding(u.dp(18), 0, u.dp(18), u.dp(14));
      quoteCarousel(carousel);
      header.addView(carousel);
    }
    if (screen == 0 && !savedPosts) {
      if (homeExtras != null) homeExtras.close();
      homeExtras =
          new HomeExtras(
              this,
              api,
              destination -> {
                if (destination <= 2) book.show(true, destination);
                else book.show(false, destination == 3 ? 2 : destination == 4 ? 0 : 1);
              },
              flushHearts);
      header.addView(homeExtras.view(), 1);
    }
    Motion.install(header);
    return header;
  }

  private void choosePost() {
    Ui.Sheet sheet = u.sheet("Share a little something", "A moment, a thought, a little more us.");
    sheet.item(
        "Photo · a moment from our day",
        "Choose a picture and add your words",
        "＋",
        false,
        () -> createPost(true));
    sheet.item(
        "Quote · words from the heart",
        "Write something worth keeping",
        "❞",
        false,
        () -> createPost(false));
    track(sheet);
    sheet.show();
  }

  private void ourCorner() {
    LinearLayout previous = content;
    content = u.column();
    content.setPadding(u.dp(22), u.dp(16), u.dp(22), u.dp(24));
    home();
    LinearLayout body = content;
    content = previous;
    Dialog dialog = new Dialog(this);
    LinearLayout outer = u.column();
    outer.setBackgroundColor(Ui.BG);
    LinearLayout bar = u.row();
    bar.setPadding(u.dp(20), u.dp(12), u.dp(20), u.dp(8));
    bar.addView(u.title("Our corner", 22), new LinearLayout.LayoutParams(0, -2, 1));
    bar.addView(u.button("Done", false, dialog::dismiss));
    outer.addView(bar);
    outer.addView(u.scroll(body), new LinearLayout.LayoutParams(-1, 0, 1));
    dialog.setContentView(outer);
    track(dialog);
    dialog.show();
    dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
    body.setBackgroundColor(Ui.BG);
    dialog.getWindow().setLayout(-1, -1);
  }

  public String actor() {
    return person().equals("Asnat") ? "asnat" : "youssef";
  }

  public Images feedImages() {
    return images;
  }

  public void refreshFeed() {
    refresh(true);
  }

  public void createPost(boolean photo) {
    memoryEditor = new MemoryEditor(photo);
    memoryEditor.show();
  }

  public boolean saved(SocialFeed.Post post) {
    return prefs()
        .getStringSet("saved-posts:" + actor(), Collections.emptySet())
        .contains(post.key());
  }

  public void savePost(SocialFeed.Post post) {
    Set<String> keys =
        new HashSet<>(prefs().getStringSet("saved-posts:" + actor(), Collections.emptySet()));
    if (!keys.remove(post.key())) keys.add(post.key());
    prefs().edit().putStringSet("saved-posts:" + actor(), keys).apply();
    if (feed != null) {
      feed.savedOnly(savedPosts);
      feed.submit(memories, true);
    }
  }

  public void react(SocialFeed.Post post, boolean liked, View anchor) {
    queueSocial(
        object(
            "action",
            "setLike",
            "kind",
            post.kind,
            "id",
            post.id,
            "actor",
            actor(),
            "liked",
            liked,
            "operationId",
            UUID.randomUUID().toString()),
        null);
  }

  public void explore(SocialFeed.Post post) {
    if (post.kind.equals("photo")) photoViewer(array(memories, "photos"), post.index);
    else
      new AlertDialog.Builder(this)
          .setTitle(post.name() + " · " + post.value.optString("date"))
          .setMessage(
              post.value.optString("text")
                  + (post.value.optString("note").isEmpty()
                      ? ""
                      : "\n\n" + post.value.optString("note")))
          .setPositiveButton("Close", null)
          .setNeutralButton("Comments", (d, w) -> comments(post))
          .show();
  }

  private SocialFeed.Post currentPost(SocialFeed.Post post) {
    JSONArray values = array(memories, post.kind.equals("photo") ? "photos" : "quotes");
    for (int i = 0; i < values.length(); i++) {
      JSONObject item = values.optJSONObject(i);
      if (item != null && post.id.equals(item.optString("id", item.optString("editKey"))))
        return new SocialFeed.Post(item, post.kind, i);
    }
    return post;
  }

  private void queueSocial(JSONObject body, Runnable done) {
    final int token = epoch;
    socialWrites.execute(
        () -> {
          try {
            api.store.enqueue("/api/memories", body);
            JSONObject value = api.cached("/memories.json", true);
            main.post(
                () -> {
                  if (token != epoch || isDestroyed()) return;
                  memories = value;
                  if (feed != null) feed.submit(memories, true);
                  updateConnection("");
                  if (done != null) done.run();
                  refresh(false);
                });
          } catch (Exception error) {
            main.post(() -> toast(message(error)));
          }
        });
  }

  public void more(SocialFeed.Post original, View anchor) {
    SocialFeed.Post post = currentPost(original);
    Ui.Sheet sheet = u.sheet("A little moment", post.name() + "’s " + post.kind);
    sheet.item(
        "Edit post",
        "Update your words or photo details",
        "✎",
        false,
        () -> {
          memoryEditor = new MemoryEditor(post.kind.equals("photo"), post.value);
          memoryEditor.show();
        });
    sheet.item(
        saved(post) ? "Remove from saved" : "Save post",
        "Keep this one close on your phone",
        "☆",
        false,
        () -> savePost(post));
    sheet.item(
        "Delete post",
        "Remove it from our shared collection",
        "−",
        true,
        () ->
            new AlertDialog.Builder(this)
                .setTitle("Delete this post?")
                .setMessage("This removes it on both phones and the website.")
                .setNegativeButton("Keep it", null)
                .setPositiveButton(
                    "Delete",
                    (d, w) ->
                        queueSocial(
                            object(
                                "action",
                                post.kind.equals("photo") ? "removePhoto" : "removeQuote",
                                "id",
                                post.id,
                                "expectedVersion",
                                post.value.optString("editVersion"),
                                "operationId",
                                UUID.randomUUID().toString()),
                            null))
                .show());
    track(sheet);
    sheet.show();
  }

  public void comments(SocialFeed.Post original) {
    final String draftKey = "comment-draft:" + actor() + ":" + original.key();
    LinearLayout body = u.column();
    body.setPadding(u.dp(20), u.dp(12), u.dp(20), u.dp(16));
    body.setBackgroundColor(Ui.BG);
    TextView title = u.title("A little conversation", 23);
    u.add(body, title, 8);
    u.add(body, u.text("On " + original.name() + "’s " + original.kind, 12, Ui.MUTED), 6);
    LinearLayout list = u.column();
    ScrollView messages = u.scroll(list);
    body.addView(messages, new LinearLayout.LayoutParams(-1, 0, 1));
    LinearLayout entry = u.row(10);
    EditText input = u.input("Leave a little love…", "", 1000, true);
    JSONObject draft = api.store.read(draftKey);
    if (draft != null) input.setText(draft.optString("text"));
    entry.addView(input, new LinearLayout.LayoutParams(0, -2, 1));
    Button send = u.button("Send", true, null);
    entry.addView(send, new LinearLayout.LayoutParams(u.dp(76), u.dp(48)));
    body.addView(entry);
    Button close = u.button("Done", false, null);
    u.add(body, close, 8);
    Dialog dialog = new Dialog(this);
    dialog.setContentView(body);
    track(dialog);
    dialog.show();
    dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
    dialog
        .getWindow()
        .setLayout(-1, (int) (getResources().getDisplayMetrics().heightPixels * .82f));
    dialog.getWindow().setGravity(Gravity.BOTTOM);
    dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    Runnable[] update = {null};
    update[0] =
        () -> {
          list.removeAllViews();
          JSONArray rows = currentPost(original).comments();
          if (rows.length() == 0)
            u.add(list, u.text("Be the first to leave a little love. ♡", 15, Ui.MUTED), 26);
          for (int i = 0; i < rows.length(); i++) {
            JSONObject comment = rows.optJSONObject(i);
            if (comment == null) continue;
            LinearLayout bubble = u.card(list, Color.WHITE);
            u.add(bubble, u.text(SocialFeed.nameOf(comment.optString("author")), 13, Ui.PURPLE), 0);
            u.add(bubble, u.text(comment.optString("text"), 15, Ui.INK), 6);
            String stamp = comment.optString("createdAt");
            u.add(
                bubble,
                u.text(stamp.length() > 10 ? stamp.substring(0, 10) : "Just now", 11, Ui.MUTED),
                6);
            if (comment.optString("author").equals(actor()))
              bubble.setOnLongClickListener(
                  v -> {
                    new AlertDialog.Builder(this)
                        .setTitle("Remove your comment?")
                        .setNegativeButton("Keep", null)
                        .setPositiveButton(
                            "Remove",
                            (d, w) ->
                                queueSocial(
                                    object(
                                        "action",
                                        "removeComment",
                                        "kind",
                                        original.kind,
                                        "id",
                                        original.id,
                                        "actor",
                                        actor(),
                                        "commentId",
                                        comment.optString("id"),
                                        "operationId",
                                        UUID.randomUUID().toString()),
                                    update[0]))
                        .show();
                    return true;
                  });
          }
          Motion.install(list);
        };
    update[0].run();
    activeConversationRefresh = update[0];
    send.setOnClickListener(
        v -> {
          String text = input.getText().toString().trim();
          if (text.isEmpty()) return;
          send.setEnabled(false);
          JSONObject bodyValue =
              object(
                  "action",
                  "addComment",
                  "kind",
                  original.kind,
                  "id",
                  original.id,
                  "actor",
                  actor(),
                  "text",
                  text,
                  "operationId",
                  UUID.randomUUID().toString());
          request(
              () -> {
                api.store.enqueue("/api/memories", bodyValue);
                api.store.write(draftKey, object("text", ""));
                return api.cached("/memories.json", true);
              },
              value -> {
                memories = value;
                input.setText("");
                send.setEnabled(true);
                update[0].run();
                messages.post(() -> messages.fullScroll(View.FOCUS_DOWN));
                if (feed != null) feed.submit(memories, true);
                updateConnection("");
                refresh(false);
                Motion.haptic(send, true);
              },
              error -> {
                send.setEnabled(true);
                toast(message(error));
              });
        });
    close.setOnClickListener(v -> dialog.dismiss());
    dialog.setOnDismissListener(
        d -> {
          try {
            api.store.write(draftKey, object("text", input.getText().toString()));
          } catch (Exception ignored) {
          }
          if (activeDialog == dialog) activeDialog = null;
          activeConversationRefresh = null;
          if (root != null) render(true);
        });
    Motion.install(body);
  }

  private void heading(String eyebrow, String title, String description) {
    u.add(content, u.label(eyebrow), 6);
    u.add(content, u.title(title, 30), 10);
    if (!description.isEmpty()) u.add(content, u.text(description, 14, Ui.MUTED), 10);
  }

  private void restoreSaved() {
    try {
      memories = api.cached("/memories.json", true);
      music = api.cached("/api/music", true);
      together = api.cached("/api/together", true);
      daily = api.cached("/api/daily-memory", true);
      translations = api.store.read("last-translation:" + person());
      JSONObject state = api.store.read("word-draft:" + person());
      if (state != null) {
        wordDraft = state.optString("text");
        sourceChoice = state.optInt("source");
        toneChoice = state.optInt("tone");
        applyProfile();

        JSONArray choices = state.optJSONArray("targets");
        if (choices != null)
          for (int i = 0; i < 5; i++) targetChoices[i] = choices.optBoolean(i, true);
      }
      connectionMessage =
          api.connected()
              ? "Saved on this phone · checking for updates…"
              : "Offline · showing content saved on this phone";
    } catch (Exception ignored) {
    }
  }

  private void persistWords() {
    if (api == null || !api.canOpen()) return;
    try {
      JSONArray targets = new JSONArray();
      for (boolean choice : targetChoices) targets.put(choice);
      api.store.write(
          "word-draft:" + person(),
          object(
              "text",
              wordDraft,
              "source",
              sourceChoice,
              "tone",
              toneChoice,
              "speaker",
              speakerChoice,
              "recipient",
              recipientChoice,
              "targets",
              targets));
    } catch (Exception error) {
      toast(error.getMessage());
    }
  }

  private void draftChanged() {
    main.removeCallbacks(saveWords);
    main.postDelayed(saveWords, 400);
  }

  private void refresh(boolean manual) {
    if (!appUnlocked || !api.canOpen()) return;
    if (refreshing || mutating) {
      if (manual) refreshAgain = true;
      return;
    }
    refreshAgain = false;
    refreshing = true;
    String before = visibleData();
    if (manual && notice != null) notice.setText("Saving the latest content on your phone…");
    request(
        () -> {
          api.syncPending();
          JSONObject result = new JSONObject();
          String[] paths = {
            "/memories.json",
            "/api/music",
            "/api/together",
            "/api/daily-memory",
            "/api/keepsakes",
            "/api/journal"
          };
          for (String path : paths) {
            try {
              result.put(path, api.get(path));
            } catch (Exception error) {
              result.put("error", message(error));
            }
          }
          return result;
        },
        result -> {
          refreshing = false;
          if (result.has("/memories.json")) memories = result.optJSONObject("/memories.json");
          if (result.has("/api/music")) music = result.optJSONObject("/api/music");
          if (result.has("/api/together")) together = result.optJSONObject("/api/together");
          if (result.has("/api/daily-memory")) daily = result.optJSONObject("/api/daily-memory");
          if (activeConversationRefresh != null) activeConversationRefresh.run();
          if (homeExtras != null) homeExtras.update();
          updateConnection(result.optString("error", ""));
          String after = visibleData();
          if (root != null && activeDialog == null && screen != 4 && !before.equals(after))
            render(true);
          if (!prefetching) {
            prefetching = true;
            work.execute(
                () -> {
                  int missing = api.prefetchMedia();
                  prefetching = false;
                  main.post(
                      () -> {
                        if (root != null)
                          updateConnection(
                              missing > 0
                                  ? missing + " images still need a connection to finish saving"
                                  : "");
                      });
                });
          }
          if (refreshAgain && appUnlocked) refresh(true);
        },
        error -> {
          refreshing = false;
          updateConnection(message(error));
          if (refreshAgain && appUnlocked) refresh(true);
        });
  }

  private String visibleData() {
    StringBuilder value = new StringBuilder();
    for (JSONObject item : new JSONObject[] {memories, music, together, daily}) {
      if (item == null) continue;
      JSONObject copy = OfflineStore.copy(item);
      // Heart counters update their small Home card; they do not rebuild the photo feed.
      if (item == together)
        for (String key :
            new String[] {
              "heartDays",
              "hearts",
              "heartReceipts",
              "heartReceipt",
              "heartStreak",
              "streakStatus",
              "updatedAt"
            }) copy.remove(key);
      for (String key : new String[] {"_savedAt", "_offline", "_needsSignIn", "_pending"})
        copy.remove(key);
      value.append(OfflineStore.canonical(copy));
    }
    return value.toString();
  }

  private void updateConnection(String error) {
    boolean offline = !api.connected() || (memories != null && memories.optBoolean("_offline"));
    connectionMessage =
        offline ? "Offline · showing saved content" : "●  Up to date · saved on this phone";
    if (!api.signedIn())
      connectionMessage = "Saved content available · reconnect with our code to sync";
    int count = api.store.pending();
    if (count > 0)
      connectionMessage +=
          api.store.conflicts()
              ? " · changes need review"
              : " · " + count + " changes waiting to sync";
    if (!error.isEmpty()) connectionMessage += " · " + error;
    if (notice != null) notice.setText(connectionMessage);
  }

  private void showOutbox() {
    JSONArray items = api.store.queue();
    if (items.length() == 0) {
      new AlertDialog.Builder(this)
          .setTitle("Saved on your phone")
          .setMessage(
              "Content and downloaded photos stay available offline. The app checks for updates"
                  + " every minute while open and when the connection returns. New translations and"
                  + " catalog searches need internet.")
          .setPositiveButton("Done", null)
          .show();
      return;
    }
    String[] names = new String[items.length()];
    for (int i = 0; i < items.length(); i++) {
      JSONObject row = items.optJSONObject(i), body = row.optJSONObject("body");
      names[i] =
          (row.optString("path").equals("/api/music")
                  ? "Song #" + body.optInt("rank")
                  : body.optString(
                      "title",
                      body.optString("action").equals("sendHeart")
                          ? "A little heart"
                          : "A shared wish"))
              + " · "
              + (row.optString("status").equals("pending") ? "waiting to sync" : "needs review");
    }
    new AlertDialog.Builder(this)
        .setTitle("Changes saved on this phone")
        .setItems(
            names,
            (dialog, index) -> {
              JSONObject row = items.optJSONObject(index);
              String error =
                  row.optString(
                      "error",
                      "This change is saved. It will sync when internet and your session are"
                          + " available.");
              AlertDialog.Builder review =
                  new AlertDialog.Builder(this)
                      .setTitle(names[index])
                      .setMessage(
                          error
                              + "\n\nYour saved change:\n"
                              + describeChange(row)
                              + "\n\nWebsite version:\n"
                              + describeServer(row))
                      .setNegativeButton("Close", null);
              if (!row.optString("status").equals("pending")) {
                review.setNeutralButton("Keep website version", (d, w) -> outboxAction(row, false));
                review.setPositiveButton("Apply my change", (d, w) -> outboxAction(row, true));
              } else review.setPositiveButton("Sync now", (d, w) -> refresh(true));
              review.show();
            })
        .setNegativeButton("Close", null)
        .show();
  }

  private String describeChange(JSONObject row) {
    JSONObject b = row.optJSONObject("body");
    if (row.optString("path").equals("/api/journal")
        || row.optString("path").equals("/api/keepsakes"))
      return b.optString("title")
          + "\n"
          + b.optString("text")
          + "\n"
          + b.optString("meaning")
          + "\n"
          + b.optString("note")
          + "\n"
          + b.optString("startedTalkingAt");
    if (row.optString("path").equals("/api/memories"))
      return (b.optString("action").equals("addPhoto")
              ? "Photo · " + b.optString("caption")
              : b.optString("text"))
          + "\n"
          + b.optString("date")
          + "\n"
          + b.optString("note");
    return b.optString(
            "title",
            row.optString("path").equals("/api/music")
                ? "Song #" + b.optInt("rank")
                : "Shared wish")
        + "\n"
        + b.optString("note");
  }

  private String describeServer(JSONObject row) {
    String path = row.optString("path");
    JSONObject b = row.optJSONObject("body"), data = api.store.base(path);
    if (path.equals("/api/journal") || path.equals("/api/keepsakes")) {
      JSONObject item = BookProjection.find(data, b);
      return item == null
          ? "This entry is not shared yet."
          : item.optString("title")
              + "\n"
              + item.optString("text")
              + "\n"
              + item.optString("meaning")
              + "\n"
              + item.optString("note")
              + "\n"
              + item.optString("startedTalkingAt");
    }
    if (path.equals("/api/memories")) {
      JSONArray entries =
          array(data, b.optString("action").equals("addPhoto") ? "photos" : "quotes");
      for (int i = 0; i < entries.length(); i++) {
        JSONObject item = at(entries, i);
        if (item.optString("id").equals(b.optString("operationId")))
          return item.optString("text", item.optString("caption")) + "\n" + item.optString("date");
      }
      return "This addition has not been shared yet.";
    }
    JSONArray list = array(data, path.equals("/api/music") ? "tracks" : "bucketList");
    for (int i = 0; i < list.length(); i++) {
      JSONObject item = at(list, i);
      if (path.equals("/api/music")
          ? item.optInt("rank") == b.optInt("rank")
          : item.optString("id").equals(b.optString("id")))
        return item.optString("title")
            + "\n"
            + item.optString("place")
            + "\n"
            + item.optString("note")
            + (item.has("completed")
                ? (item.optBoolean("completed") ? "\nCompleted" : "\nStill dreaming")
                : "");
    }
    return "No item in this place on the website.";
  }

  private void outboxAction(JSONObject row, boolean apply) {
    request(
        () -> {
          if (apply) {
            if (!api.connected() || !api.signedIn())
              throw new ApiClient.ApiError(
                  "Reconnect with our code before resolving this change.", 0);
            JSONObject latest = api.get(row.getString("path"));
            if (latest.optBoolean("_offline"))
              throw new ApiClient.ApiError(
                  "Connect to load the latest version before resolving this change.", 0);
            api.store.resolve(row);
          } else api.store.discardEntity(row);
          return new JSONObject();
        },
        data -> {
          restoreSaved();
          render(true);
          refresh(true);
        },
        this::failure);
  }

  private void expired() {
    if (api.store.unlocked()) {
      refreshing = false;
      mutating = false;
      updateConnection("");
      toast("Your saved content is available. Reconnect with our code in settings to sync.");
      return;
    }
    epoch++;
    refreshing = false;
    mutating = false;
    api.clearSession();
    showLogin();
  }

  private boolean isUnauthorized(Exception e) {
    return e instanceof ApiClient.ApiError && ((ApiClient.ApiError) e).status == 401;
  }

  private void request(
      Callable<JSONObject> action, Consumer<JSONObject> success, Consumer<Exception> failure) {
    final int token = epoch;
    work.execute(
        () -> {
          try {
            JSONObject result = action.call();
            main.post(
                () -> {
                  if (token == epoch && !isFinishing() && !isDestroyed()) success.accept(result);
                });
          } catch (Exception e) {
            main.post(
                () -> {
                  if (token == epoch && !isFinishing() && !isDestroyed()) failure.accept(e);
                });
          }
        });
  }

  private void failure(Exception e) {
    if (isUnauthorized(e)) expired();
    else toast(message(e));
  }

  private String message(Exception e) {
    return e instanceof IOException
        ? e.getMessage()
        : "Our connection needs a moment. Your edits are still here; try again.";
  }

  private void toast(String text) {
    Toast.makeText(this, text, Toast.LENGTH_LONG).show();
  }

  private void hideKeyboard() {
    View focus = getCurrentFocus();
    if (focus != null)
      ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE))
          .hideSoftInputFromWindow(focus.getWindowToken(), 0);
  }

  private JSONObject object(Object... pairs) {
    JSONObject result = new JSONObject();
    try {
      for (int i = 0; i < pairs.length; i += 2)
        result.put((String) pairs[i], pairs[i + 1] == null ? JSONObject.NULL : pairs[i + 1]);
    } catch (JSONException e) {
      throw new IllegalArgumentException(e);
    }
    return result;
  }

  private JSONArray array(JSONObject parent, String key) {
    JSONArray a = parent == null ? null : parent.optJSONArray(key);
    return a == null ? new JSONArray() : a;
  }

  private JSONObject at(JSONArray a, int i) {
    JSONObject o = a.optJSONObject(i);
    return o == null ? new JSONObject() : o;
  }

  private boolean writable(JSONObject data) {
    return data != null && data.optBoolean("writable");
  }

  private void empty(LinearLayout parent, String title, String subtitle) {
    LinearLayout card = u.card(parent, Color.WHITE);
    u.add(card, u.text("✧", 34, Ui.PURPLE), 0);
    u.add(card, u.title(title, 21), 8);
    u.add(card, u.text(subtitle, 14, Ui.MUTED), 8);
  }

  private String date(String value) {
    try {
      return Dates.display(value);
    } catch (Exception e) {
      return value;
    }
  }

  private void openLink(String url) {
    try {
      Uri uri = Uri.parse(url);
      if (!"https".equals(uri.getScheme())) return;
      startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
    } catch (ActivityNotFoundException e) {
      toast("Install a browser or music app to open this link.");
    }
  }

  private void home() {
    u.add(content, u.text("Welcome home, " + person() + " ♡", 14, Ui.PURPLE), 4);
    heading(
        isAsnat() ? "FOR ASNAT. MY ASECHKA." : "FOR US. FROM YOUSSEF.",
        isAsnat() ? "My favorite\nlittle universe." : "Our favorite\nlittle universe.",
        "Of all the people, in all the places,\nsomehow my heart keeps finding you.");
    LinearLayout hero = u.card(content, Ui.BLUE);
    u.add(hero, u.title(isAsnat() ? "It’s you, Asechka. ♡" : "Our little universe. ♡", 24), 0);
    u.add(hero, u.text("Two people. One little corner of the universe.", 14, Ui.MUTED), 8);
    ImageView art = u.image(hero, "Two cats in our little universe", 210);
    images.load("/assets/our-little-universe.png", art);
    LinearLayout actions = u.actions();
    Button letter = u.button(isAsnat() ? "Your letter" : "Letter to Asnat", true, this::letter);
    actions.addView(letter, new LinearLayout.LayoutParams(0, -2, 1));
    Button love = u.button("Send a little love ♡", false, () -> localLove(loveAnchor()));
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
    lp.leftMargin = u.dp(8);
    actions.addView(love, lp);
    u.add(content, actions, 18);
    LinearLayout moment = u.card(content, Color.WHITE);
    u.add(moment, u.label("A LITTLE MOMENT, JUST FOR US"), 0);
    timer = u.title("", 22);
    u.add(moment, timer, 10);
    updateTimer();
    long target = Dates.instant("2026-10-16T19:00:00Z");
    if (System.currentTimeMillis() < target) {
      TextView hints = u.text("No spoilers. Just a few butterflies.", 14, Ui.MUTED);
      u.add(moment, hints, 8);
      Button hint = u.button("A tiny hint?", false, null);
      String[] values = {
        "It starts with you.",
        "It has a little something to do with us.",
        "Maybe there’s a question I’ve been saving…"
      };
      hint.setOnClickListener(
          v -> {
            if (hintIndex < 3) hints.setText(values[hintIndex++]);
            hint.setEnabled(hintIndex < 3);
          });
      u.add(moment, hint, 10);
    } else
      u.add(
          moment,
          u.text(
              "Some things are better said in person. The next little chapter starts with us.",
              14,
              Ui.MUTED),
          8);
    u.add(content, u.button("Since us · letters & little things", true, () -> book.show(true)), 18);
    u.add(content, u.button("Our little book", false, () -> book.show(false)), 10);
    birthdayCard(content);
    dailyCard(content);
    u.add(content, u.label("THE LITTLE THINGS, THE BIG FEELINGS"), 28);
    feeling(
        "My favorite thought",
        "The one I keep coming back to.",
        "Even in the middle of an ordinary day, a thought of you makes everything feel a little"
            + " brighter.",
        Ui.BLUE);
    feeling(
        "My soft spot",
        "You have a very special place here.",
        "I love you, Asechka. In the quiet moments, in the little things, and in all the ways I’m"
            + " still learning to say.",
        Ui.PALE);
    feeling(
        "More moments with you",
        "That’s my kind of wish.",
        "More conversations. More little laughs. More time beside you. If I could wish for one"
            + " thing, it would be more of us.",
        0xFFF5F3ED);
    quoteCarousel();
    LinearLayout links = u.card(content, Color.WHITE);
    u.add(links, u.title("All our little things", 21), 0);
    u.add(links, u.button("Our photos  →", false, () -> select(1)), 14);
    u.add(links, u.button("Words worth keeping  →", false, () -> select(5)), 8);
    u.add(links, u.button("Our shared soundtrack  →", false, () -> select(2)), 8);
    u.add(links, u.button("Make a little plan  →", false, () -> select(3)), 8);
    u.add(links, u.button("Find our words  →", false, () -> select(4)), 8);
    u.add(content, u.text("Made with a whole lot of love. Only for you. ♡", 12, Ui.MUTED), 28);
  }

  private View loveAnchor() {
    return content;
  }

  private void localLove(View anchor) {
    localHearts++;
    Motion.hearts(anchor);
    Motion.haptic(anchor, true);
    toast(
        localHearts == 1
            ? "One little heart, just for you ♡"
            : localHearts + " little hearts. Still not enough to say it all ♡");
    if (motion())
      anchor
          .animate()
          .scaleX(.985f)
          .scaleY(.985f)
          .setDuration(130)
          .withEndAction(() -> anchor.animate().scaleX(1).scaleY(1).setDuration(180).start())
          .start();
  }

  private void updateTimer() {
    if (timer == null) return;
    long seconds =
        Math.max(
            0, (Dates.instant("2026-10-16T19:00:00Z") - System.currentTimeMillis() + 999) / 1000);
    timer.setText(
        seconds == 0
            ? "Our little moment is here. ✦"
            : String.format(
                Locale.US,
                "%02d d  :  %02d h  :  %02d m  :  %02d s",
                seconds / 86400,
                seconds / 3600 % 24,
                seconds / 60 % 60,
                seconds % 60));
  }

  private void quoteCarousel() {
    quoteCarousel(content);
  }

  private void quoteCarousel(LinearLayout parent) {
    JSONArray quotes = array(memories, "quotes");
    if (quotes.length() == 0) return;
    LinearLayout q = u.card(parent, Color.WHITE);
    quoteArtworkIndex = -1;
    u.add(q, u.label("WORDS I WANT US TO KEEP"), 0);
    quoteText = u.quote("", 22);
    quoteText.setPadding(u.dp(22), u.dp(24), u.dp(22), u.dp(24));
    quoteText.setGravity(Gravity.CENTER);
    FrameLayout words = new FrameLayout(this);
    words.setBackground(u.shape(Ui.BLUE, 18));
    words.setClipToOutline(true);
    quoteArtwork = Images.backdrop(this);
    quoteArtwork.setScaleType(ImageView.ScaleType.CENTER_CROP);
    quoteArtwork.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    words.addView(quoteArtwork, new FrameLayout.LayoutParams(-1, -1));
    words.addView(quoteText, new FrameLayout.LayoutParams(-1, -2));
    u.add(q, words, 14);
    quoteCounter = u.text("", 12, Ui.MUTED);
    u.add(q, quoteCounter, 14);
    LinearLayout controls = u.row();
    Button prev = u.button("←", false, () -> nextQuote(-1));
    prev.setContentDescription("Previous quote");
    controls.addView(prev, new LinearLayout.LayoutParams(0, -2, 1));
    quotePauseButton =
        u.button(
            quotePaused ? "Resume" : "Pause",
            false,
            () -> {
              quotePaused = !quotePaused;
              quotePauseButton.setText(quotePaused ? "Resume" : "Pause");
              quoteDue = android.os.SystemClock.uptimeMillis() + 8000;
            });
    controls.addView(quotePauseButton, new LinearLayout.LayoutParams(0, -2, 1));
    Button next = u.button("→", false, () -> nextQuote(1));
    next.setContentDescription("Next quote");
    controls.addView(next, new LinearLayout.LayoutParams(0, -2, 1));
    u.add(q, controls, 14);
    quoteText.setOnTouchListener(
        new View.OnTouchListener() {
          float downX, downY;
          boolean swipe;

          public boolean onTouch(View v, android.view.MotionEvent e) {
            if (e.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) {
              downX = e.getX();
              downY = e.getY();
              swipe = false;
              return true;
            }
            if (e.getActionMasked() == android.view.MotionEvent.ACTION_MOVE
                && Math.abs(e.getX() - downX) > u.dp(20)
                && Math.abs(e.getX() - downX) > Math.abs(e.getY() - downY) * 1.4f) {
              swipe = true;
              v.getParent().requestDisallowInterceptTouchEvent(true);
            }
            if (e.getActionMasked() == android.view.MotionEvent.ACTION_UP) {
              if (swipe && Math.abs(e.getX() - downX) > u.dp(45)) {
                Motion.haptic(v, false);
                nextQuote(e.getX() < downX ? 1 : -1);
              }
              v.getParent().requestDisallowInterceptTouchEvent(false);
              return true;
            }
            return true;
          }
        });

    nextQuote(0);
  }

  private void nextQuote(int delta) {
    JSONArray quotes = array(memories, "quotes");
    if (quoteText == null || quotes.length() == 0) return;
    quoteDue = android.os.SystemClock.uptimeMillis() + 8000;
    quoteIndex = Compat.wrap(quoteIndex + delta, quotes.length());
    JSONObject q = at(quotes, quoteIndex);
    if (quoteArtwork != null) {
      quoteArtworkIndex =
          QuoteBackgrounds.next(
              q.optString("id", q.optString("text")), delta == 0 ? -1 : quoteArtworkIndex);
      images.load(QuoteBackgrounds.source(quoteArtworkIndex), quoteArtwork);
    }
    quoteText.setContentDescription(
        "Quote "
            + (quoteIndex + 1)
            + " of "
            + quotes.length()
            + ". "
            + q.optString("text")
            + ". Swipe left or right to change quote.");
    Motion.change(quoteText, "“" + q.optString("text") + "”", delta == 0 ? 1 : delta);
    quoteCounter.setText(
        (quoteIndex + 1)
            + " of "
            + quotes.length()
            + "  ·  "
            + date(q.optString("date"))
            + (quotePaused ? " · paused" : " · every 8 seconds"));
  }

  private void feeling(String title, String teaser, String reveal, int color) {
    LinearLayout card = u.card(content, color);
    TextView heading = u.title(title, 20);
    u.add(card, heading, 0);
    TextView text = u.text(teaser, 14, Ui.MUTED);
    u.add(card, text, 8);
    TextView tap = u.text("Tap for a little more  ↗", 12, Ui.PURPLE);
    u.add(card, tap, 12);
    card.setFocusable(true);
    card.setContentDescription(title + ". Tap to reveal a little feeling.");
    card.setOnClickListener(
        v -> {
          Motion.layout(card);
          boolean opened = Boolean.TRUE.equals(card.getTag());
          card.setTag(!opened);
          Motion.change(text, opened ? teaser : reveal, 1);
          tap.setText(opened ? "Tap for a little more  ↗" : "Keep this little feeling  ♡");
        });
  }

  private void letter() {
    LinearLayout paper = u.column();
    paper.setPadding(u.dp(24), u.dp(16), u.dp(24), u.dp(24));
    u.add(paper, u.label("A LETTER, JUST FOR YOU"), 0);
    u.add(paper, u.handwritten("Dear Asechka,", 34), 14);
    String[] paragraphs = {
      "Asnat to the world. Asechka to me.",
      "I wanted to make you something small, but filled with a feeling that isn’t small at all.",
      "I love you. And I love that, in a world this big, I get to know you. Just thinking about you"
          + " can turn the most ordinary moment into something I want to keep.",
      "This little website is a piece of that feeling. A few stars, two cats, and a whole lot of"
          + " things I wish I could say perfectly.",
      "There’s one more little thing I’ve been keeping close to my heart. I won’t give it away"
          + " here. Just save a moment for me on Friday.",
      "Until then, let this be your reminder: you mean so much to me.",
      "With all my love,\nme ♡"
    };
    for (String value : paragraphs) {
      TextView text = u.text(value, 16, Ui.INK);
      text.setTextIsSelectable(true);
      u.add(paper, text, 18);
    }
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setView(u.scroll(paper))
            .setPositiveButton("Keep it close ♡", null)
            .create();
    track(dialog);
    dialog.show();
  }

  private void dailyCard(LinearLayout parent) {
    LinearLayout c = u.card(parent, Ui.PALE);
    u.add(c, u.label("A LITTLE MEMORY, JUST FOR TODAY"), 0);
    if (daily != null) u.add(c, u.text(date(daily.optString("day")), 12, Ui.MUTED), 6);
    JSONObject memory = daily == null ? null : daily.optJSONObject("memory");
    if (memory == null) {
      u.add(c, u.title("So many days still ahead.", 21), 12);
      u.add(
          c,
          u.text(
              daily == null
                  ? "Finding today’s little memory…"
                  : "Our first memories will feel at home here.",
              14,
              Ui.MUTED),
          8);
      return;
    }
    String kind = memory.optString("kind");
    if (kind.equals("quote")) {
      TextView q = u.text("“" + memory.optString("text") + "”", 20, Ui.INK);
      q.setTextIsSelectable(true);
      u.add(c, q, 14);
    }
    if (kind.equals("photo")) {
      ImageView photo = u.image(c, memory.optString("caption", "Our little memory"), 210);
      images.load(memory.optString("image"), photo);
      photo.setOnClickListener(
          v ->
              photoViewer(
                  new JSONArray()
                      .put(
                          object(
                              "src",
                              memory.optString("image"),
                              "caption",
                              memory.optString("caption"))),
                  0));
      u.add(c, u.title(memory.optString("caption"), 18), 10);
    }
    if (kind.equals("song")) {
      ImageView art = u.image(c, memory.optString("album"), 170);
      images.load(memory.optString("artwork"), art);
      u.add(c, u.title(memory.optString("title"), 21), 12);
      u.add(c, u.text(memory.optString("artist"), 14, Ui.MUTED), 4);
      u.add(
          c,
          u.button("Listen in Apple Music  ↗", false, () -> openLink(memory.optString("url"))),
          12);
    }
    if (!memory.optString("note").isEmpty())
      u.add(c, u.text(memory.optString("note"), 14, Ui.MUTED), 10);
  }

  private String photoSource(JSONObject item) {
    return ApiClient.photoURL(item);
  }

  private void memories() {
    boolean photos = screen == 1;
    heading(
        photos ? "MOMENTS WORTH KEEPING" : "WORDS WORTH KEEPING",
        photos ? "Our favorite\npictures." : "A thousand little\nways to say it.",
        photos
            ? "The big days. The little days. Even the blurry ones."
            : "Words from both of us, finding their way home.");
    u.add(
        content,
        u.button(
            photos ? "＋  Add a photo" : "＋  Add a quote",
            true,
            () -> {
              memoryEditor = new MemoryEditor(photos);
              memoryEditor.show();
            }),
        18);
    if (!photos) quoteCarousel();
    if (memories == null) {
      empty(
          content,
          "Gathering our memories…",
          "Use refresh if our connection needs another moment.");
      return;
    }
    JSONArray list = array(memories, photos ? "photos" : "quotes");
    u.add(
        content,
        u.text(list.length() + (photos ? " favorite pictures" : " little quotes"), 12, Ui.MUTED),
        22);
    if (list.length() == 0) {
      empty(
          content,
          photos ? "Leaving room for our favorite days." : "A place for all those things we say.",
          "Add one here. It saves on your phone and is shared when you’re connected.");
      return;
    }
    int limit = photos ? photoLimit : quoteLimit;
    for (int i = list.length() - 1; i >= Math.max(0, list.length() - limit); i--) {
      final int index = i;
      JSONObject item = at(list, i);
      LinearLayout card = u.card(content, Color.WHITE);
      if (photos) {
        ImageView photo =
            u.image(card, item.optString("alt", item.optString("caption", "A picture of us")), 255);
        images.load(photoSource(item), photo);
        photo.setOnClickListener(v -> photoViewer(list, index));
        if (!item.optString("caption").isEmpty())
          u.add(card, u.title(item.optString("caption"), 18), 12);
        u.add(card, u.text("Tap to explore  ↗", 11, Ui.PURPLE), 8);
      } else {
        TextView savedQuote = u.quote("“" + item.optString("text") + "”", 20);
        savedQuote.setTextIsSelectable(true);
        u.add(card, savedQuote, 2);
        if (!item.optString("note").isEmpty())
          u.add(card, u.text(item.optString("note"), 13, Ui.MUTED), 12);
      }
      if (!item.optString("date").isEmpty())
        u.add(card, u.text(date(item.optString("date")), 11, Ui.MUTED), 12);
      if (item.optBoolean("pending"))
        u.add(card, u.text("Saved on this phone · waiting to sync", 11, Ui.PURPLE), 6);
    }
    if (list.length() > limit)
      u.add(
          content,
          u.button(
              "More little memories  ↓",
              false,
              () -> {
                if (photos) photoLimit += 8;
                else quoteLimit += 12;
                render(true);
              }),
          18);
  }

  private void photoViewer(JSONArray photos, int initial) {
    Dialog dialog = new Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
    LinearLayout layout = u.column();
    layout.setBackgroundColor(0xFF15131D);
    layout.setPadding(u.dp(14), u.dp(16), u.dp(14), u.dp(20));
    Button close = u.button("Close  ×", false, dialog::dismiss);
    u.add(layout, close, 0);
    Ui.ZoomImage image = new Ui.ZoomImage(this);
    layout.addView(image, new LinearLayout.LayoutParams(-1, 0, 1));
    TextView caption = u.text("", 16, Color.WHITE);
    u.add(layout, caption, 12);
    TextView count = u.text("Pinch to zoom · drag to explore", 12, 0xFFCAC2DB);
    u.add(layout, count, 8);
    final int[] index = {initial};
    Runnable update =
        () -> {
          JSONObject item = at(photos, index[0]);
          image.reset();
          image.setContentDescription(item.optString("caption", "A picture of us"));
          images.load(photoSource(item), image);
          Motion.enter(image, 1);
          caption.setText(item.optString("caption"));
          count.setText((index[0] + 1) + " / " + photos.length() + "  ·  Pinch to zoom");
        };
    LinearLayout controls = u.row();
    Button prev =
        u.button(
            "← Previous",
            false,
            () -> {
              index[0] = Compat.wrap(index[0] - 1, photos.length());
              update.run();
            });
    Button next =
        u.button(
            "Next →",
            false,
            () -> {
              index[0] = (index[0] + 1) % photos.length();
              update.run();
            });
    controls.addView(prev, new LinearLayout.LayoutParams(0, -2, 1));
    controls.addView(next, new LinearLayout.LayoutParams(0, -2, 1));
    u.add(layout, controls, 14);
    if (photos.length() < 2) controls.setVisibility(View.GONE);
    dialog.setContentView(layout);
    track(dialog);
    dialog.show();
    dialog.getWindow().setLayout(-1, -1);
    layout.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          v.setPadding(
              u.dp(14) + insets.getSystemWindowInsetLeft(),
              u.dp(12) + insets.getSystemWindowInsetTop(),
              u.dp(14) + insets.getSystemWindowInsetRight(),
              u.dp(14) + insets.getSystemWindowInsetBottom());
          return insets;
        });
    layout.requestApplyInsets();
    update.run();
  }

  private JSONObject trackAt(int rank) {
    for (int i = 0; i < array(music, "tracks").length(); i++) {
      JSONObject t = at(array(music, "tracks"), i);
      if (t.optInt("rank") == rank) return t;
    }
    return null;
  }

  private void music() {
    heading(
        "THE SOUNDTRACK OF US", "Our shared\ntop ten.", "A few songs that sound like you + me.");
    u.add(content, u.button("＋  Find a song", true, this::searchMusic), 20);
    if (music == null) {
      empty(content, "Gathering our soundtrack…", "Your saved songs will appear here.");
      return;
    }
    if (!writable(music))
      u.add(
          content,
          u.text(
              "Shared saving is being connected. You can still search and listen.", 13, Ui.MUTED),
          16);
    for (int rank = 1; rank <= 10; rank++) {
      final int spot = rank;
      JSONObject song = trackAt(rank);
      LinearLayout c = u.card(content, song == null ? Ui.PALE : Color.WHITE);
      u.add(c, u.label(String.format(Locale.US, "OUR SONG  %02d", rank)), 0);
      if (song != null && song.optBoolean("pending"))
        u.add(c, u.text("Saved on phone · waiting to sync", 12, Ui.PURPLE), 8);
      if (song == null) {
        u.add(c, u.title("A little space for a favorite.", 18), 10);
        Button choose = u.button("Choose a song  ＋", false, () -> searchMusic(spot));
        choose.setEnabled(writable(music));
        u.add(c, choose, 14);
        continue;
      }
      LinearLayout row = u.row();
      ImageView art = new ImageView(this);
      art.setContentDescription(song.optString("album") + " album artwork");
      art.setScaleType(ImageView.ScaleType.CENTER_CROP);
      art.setBackground(u.shape(Ui.PALE, 14));
      art.setClipToOutline(true);
      row.addView(art, new LinearLayout.LayoutParams(u.dp(78), u.dp(78)));
      images.load(song.optString("artworkUrl"), art);
      art.setOnClickListener(v -> openLink(song.optString("trackUrl")));
      LinearLayout copy = u.column();
      copy.setPadding(0, 0, 0, 0);
      u.add(copy, u.title(song.optString("title"), 18), 0);
      u.add(copy, u.text(song.optString("artist"), 14, Ui.MUTED), 4);
      long duration = song.optLong("durationMs") / 1000;
      u.add(
          copy,
          u.text(
              song.optString("album")
                  + " · "
                  + duration / 60
                  + ":"
                  + String.format(Locale.US, "%02d", duration % 60),
              11,
              Ui.MUTED),
          5);
      row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
      u.add(c, row, 14);
      if (!song.optString("note").isEmpty())
        u.add(c, u.text(song.optString("note"), 15, Ui.INK), 14);
      LinearLayout listen = u.actions();
      listen.addView(
          u.button("Apple Music ↗", false, () -> openLink(song.optString("trackUrl"))),
          new LinearLayout.LayoutParams(0, -2, 1));
      listen.addView(
          u.button(
              "Spotify ↗",
              false,
              () -> {
                try {
                  openLink(
                      "https://open.spotify.com/search/"
                          + URLEncoder.encode(
                              song.optString("title") + " " + song.optString("artist"), "UTF-8"));
                } catch (Exception ignored) {
                }
              }),
          new LinearLayout.LayoutParams(0, -2, 1));
      u.add(c, listen, 14);
      LinearLayout edits = u.actions();
      Button note = u.button("Edit note", false, () -> chooseSong(song, spot));
      note.setEnabled(writable(music));
      edits.addView(note, new LinearLayout.LayoutParams(0, -2, 1));
      Button replace = u.button("Replace", false, () -> searchMusic(spot));
      replace.setEnabled(writable(music));
      edits.addView(replace, new LinearLayout.LayoutParams(0, -2, 1));
      Button remove = u.button("Remove", false, () -> removeSong(song));
      remove.setEnabled(writable(music));
      edits.addView(remove, new LinearLayout.LayoutParams(0, -2, 1));
      u.add(c, edits, 8);
    }
    u.add(
        content,
        u.text(
            "Song information from the iTunes catalog. Full playback opens your music service.",
            12,
            Ui.MUTED),
        22);
  }

  private void searchMusic() {
    searchMusic(0);
  }

  private void searchMusic(int preferred) {
    LinearLayout body = u.column();
    body.setPadding(u.dp(20), u.dp(12), u.dp(20), u.dp(20));
    EditText query = u.input("Song, artist, or album", "", 120, false);
    query.setInputType(InputType.TYPE_CLASS_TEXT);
    query.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
    u.add(body, query, 0);
    TextView status =
        u.text("Find a recording, then choose its place in our top ten.", 13, Ui.MUTED);
    u.add(body, status, 12);
    LinearLayout results = u.column();
    Button search = u.button("Search the music catalog", true, null);
    u.add(body, search, 12);
    u.add(body, results, 8);
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Find our next favorite")
            .setView(u.scroll(body))
            .setNegativeButton("Close", null)
            .create();
    track(dialog);
    dialog.show();
    Runnable submit =
        () -> {
          if (query.length() < 2) {
            status.setText("Enter at least two characters.");
            return;
          }
          hideKeyboard();
          search.setEnabled(false);
          status.setText("Looking for our song…");
          String q = query.getText().toString();
          request(
              () -> api.get("/api/music-search?q=" + URLEncoder.encode(q, "UTF-8")),
              data -> {
                if (!dialog.isShowing()) return;
                search.setEnabled(true);
                results.removeAllViews();
                JSONArray tracks = array(data, "tracks");
                status.setText(
                    tracks.length() == 0
                        ? "No songs found. Try another spelling or artist."
                        : tracks.length() + " recordings found");
                for (int i = 0; i < tracks.length(); i++) {
                  JSONObject t = at(tracks, i);
                  LinearLayout c = u.card(results, Ui.BG);
                  u.add(c, u.title(t.optString("title"), 17), 0);
                  u.add(
                      c,
                      u.text(t.optString("artist") + "\n" + t.optString("album"), 13, Ui.MUTED),
                      6);
                  u.add(
                      c, u.button("Listen ↗", false, () -> openLink(t.optString("trackUrl"))), 10);
                  Button save =
                      u.button(
                          "Choose this song",
                          true,
                          () -> {
                            dialog.dismiss();
                            chooseSong(t, preferred);
                          });
                  save.setEnabled(writable(music));
                  u.add(c, save, 6);
                }
              },
              error -> {
                search.setEnabled(true);
                if (isUnauthorized(error)) expired();
                else status.setText(message(error));
              });
        };
    search.setOnClickListener(v -> submit.run());
    query.setOnEditorActionListener(
        (v, id, event) -> {
          if (id == android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH) {
            submit.run();
            return true;
          }
          return false;
        });
  }

  private void chooseSong(JSONObject song, int preferred) {
    LinearLayout body = u.column();
    body.setPadding(u.dp(20), u.dp(12), u.dp(20), u.dp(16));
    u.add(body, u.title(song.optString("title"), 21), 0);
    u.add(body, u.text(song.optString("artist"), 14, Ui.MUTED), 6);
    u.add(body, u.label("A PLACE IN OUR SOUNDTRACK"), 18);
    String[] spots = new String[10];
    for (int i = 1; i <= 10; i++) {
      JSONObject existing = trackAt(i);
      spots[i - 1] =
          "#" + i + " · " + (existing == null ? "An empty place" : existing.optString("title"));
    }
    Spinner rank = u.spinner(spots, preferred > 0 ? preferred - 1 : 0);
    u.add(body, rank, 8);
    u.add(body, u.label("A LITTLE NOTE · OPTIONAL"), 16);
    JSONObject existing = preferred > 0 ? trackAt(preferred) : null;
    EditText note =
        u.input(
            "Why this one feels like us",
            existing != null && existing.optLong("trackId") == song.optLong("trackId")
                ? existing.optString("note")
                : "",
            500,
            true);
    u.add(body, note, 10);
    TextView status =
        u.text("Choosing a filled place replaces the song shown above.", 12, Ui.MUTED);
    u.add(body, status, 12);
    JSONObject snapshot = music;
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Keep this little song")
            .setView(u.scroll(body))
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save song", null)
            .create();
    track(dialog);
    dialog.show();
    dialog
        .getButton(-1)
        .setOnClickListener(
            v -> {
              int chosen = rank.getSelectedItemPosition() + 1;
              JSONObject previous = null;
              JSONArray tracks = array(snapshot, "tracks");
              for (int i = 0; i < tracks.length(); i++)
                if (at(tracks, i).optInt("rank") == chosen) previous = at(tracks, i);
              JSONObject bodyJson =
                  object(
                      "action",
                      "save",
                      "rank",
                      chosen,
                      "expectedId",
                      previous == null ? null : previous.optString("id"),
                      "trackId",
                      song.optLong("trackId"),
                      "note",
                      note.getText().toString());
              saveMusic(dialog, status, bodyJson);
            });
  }

  private void removeSong(JSONObject song) {
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Make room for our next favorite?")
            .setMessage(
                "Remove “" + song.optString("title") + "” from #" + song.optInt("rank") + "?")
            .setNegativeButton("Keep it", null)
            .setPositiveButton("Remove", null)
            .create();
    track(dialog);
    dialog.show();
    dialog
        .getButton(-1)
        .setOnClickListener(
            v ->
                saveMusic(
                    dialog,
                    null,
                    object(
                        "action",
                        "remove",
                        "rank",
                        song.optInt("rank"),
                        "expectedId",
                        song.optString("id"))));
  }

  private void saveMusic(AlertDialog dialog, TextView status, JSONObject body) {
    if (mutating) return;
    mutating = true;
    dialog.setCancelable(false);
    dialog.getButton(-1).setEnabled(false);
    dialog.getButton(-2).setEnabled(false);
    if (status != null) status.setText("Keeping our little soundtrack…");
    request(
        () -> api.post("/api/music", body),
        data -> {
          music = data;
          mutating = false;
          dialog.dismiss();
          render(true);
          toast(
              data.optBoolean("_pending")
                  ? "Saved on this phone · waiting to sync"
                  : "Our soundtrack is saved ♡");
          updateConnection("");
          refresh(false);
        },
        error -> {
          mutating = false;
          dialog.setCancelable(true);
          dialog.getButton(-2).setEnabled(true);
          if (isUnauthorized(error)) {
            expired();
            return;
          }
          boolean conflict =
              error instanceof ApiClient.ApiError && ((ApiClient.ApiError) error).status == 409;
          dialog.getButton(-1).setEnabled(!conflict);
          if (status != null)
            status.setText(
                message(error)
                    + (conflict
                        ? " Close this window and review the updated list before trying again."
                        : ""));
          else toast(message(error));
          if (conflict) refresh(true);
        });
  }

  private void days() {
    heading(
        "FOR ALL THE DAYS STILL AHEAD",
        "You + me,\nsomeday.",
        "The places we’ll go. The little memories we’ll make.");
    u.add(
        content,
        u.button("Our little book · victories, recipes & jokes", true, () -> book.show(false)),
        18);
    u.add(
        content, u.button("Since us · letters & little things", false, () -> book.show(true)), 10);
    heartCard();
    birthdayCard(content);
    LinearLayout top = u.row();
    TextView title = u.title("Our shared bucket list", 21);
    top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
    Button add = u.button("＋ Add", true, () -> editPlan(null, false));
    add.setEnabled(writable(together));
    top.addView(add);
    u.add(content, top, 28);
    if (together == null) {
      empty(
          content,
          "Gathering our little plans…",
          "Refresh if our connection needs another moment.");
      return;
    }
    if (!writable(together))
      u.add(
          content,
          u.text("Shared saving is being connected. Our memories are safe.", 13, Ui.MUTED),
          14);
    LinearLayout filters = u.row();
    String[] choices = {"All", "Dreaming", "We did it"};
    for (int i = 0; i < 3; i++) {
      final int pick = i;
      filters.addView(
          u.button(
              choices[i],
              filter == i,
              () -> {
                filter = pick;
                render(true);
              }),
          new LinearLayout.LayoutParams(0, -2, 1));
    }
    u.add(content, filters, 18);
    JSONArray plans = array(together, "bucketList");
    int shown = 0;
    for (int i = 0; i < plans.length(); i++) {
      JSONObject item = at(plans, i);
      boolean done = item.optBoolean("completed");
      if (filter == 1 && done || filter == 2 && !done) continue;
      shown++;
      LinearLayout c = u.card(content, Color.WHITE);
      u.add(c, u.label(done ? "WE DID IT ♡" : "STILL DREAMING"), 0);
      if (item.optBoolean("pending"))
        u.add(c, u.text("Saved on phone · waiting to sync", 12, Ui.PURPLE), 8);
      if (done && !item.isNull("photoId") && !item.optString("photoId").isEmpty()) {
        String path = "/api/together-photo?kind=bucket&id=" + item.optString("photoId");
        ImageView photo = u.image(c, "Our memory: " + item.optString("title"), 200);
        images.load(path, photo);
        photo.setOnClickListener(
            v ->
                photoViewer(
                    new JSONArray().put(object("src", path, "caption", item.optString("title"))),
                    0));
      }
      u.add(c, u.title(item.optString("title"), 22), 12);
      if (!item.optString("place").isEmpty())
        u.add(c, u.text("⌁  " + item.optString("place"), 14, Ui.PURPLE), 8);
      if (!item.optString("note").isEmpty())
        u.add(c, u.text(item.optString("note"), 15, Ui.MUTED), 10);
      if (done && !item.isNull("completedAt"))
        u.add(
            c,
            u.text("Made into a memory · " + date(item.optString("completedAt")), 11, Ui.MUTED),
            12);
      Button complete =
          u.button(
              done ? "Still dreaming again" : "We did it  ♡",
              true,
              () -> {
                if (done)
                  mutatePlan(
                      object(
                          "action",
                          "toggleItem",
                          "id",
                          item.optString("id"),
                          "expectedRevision",
                          item.optString("revision"),
                          "completed",
                          false,
                          "operationId",
                          UUID.randomUUID().toString()),
                      null,
                      null);
                else editPlan(item, true);
              });
      complete.setEnabled(writable(together));
      u.add(c, complete, 16);
      LinearLayout edits = u.actions();
      Button edit =
          u.button(
              done && item.isNull("photoId") ? "Add a picture" : "Edit",
              false,
              () -> editPlan(item, false));
      edit.setEnabled(writable(together));
      edits.addView(edit, new LinearLayout.LayoutParams(0, -2, 1));
      Button remove = u.button("Remove", false, () -> removePlan(item));
      remove.setEnabled(writable(together));
      edits.addView(remove, new LinearLayout.LayoutParams(0, -2, 1));
      u.add(c, edits, 8);
    }
    if (shown == 0)
      empty(
          content,
          filter == 2
              ? "Our first “we did it” is still ahead."
              : "So many days to look forward to.",
          "A place, a silly idea, or simply something you want to do together.");
    dailyCard(content);
  }

  private void heartCard() {
    LinearLayout c = u.card(content, Ui.PALE);
    u.add(c, u.label("A SMALL WAY TO SAY SOMETHING BIG"), 0);
    u.add(c, u.title("You crossed my mind.", 24), 10);
    u.add(c, u.text("From " + person() + ", to " + partner() + ".", 14, Ui.MUTED), 10);
    String who = heartSender();
    JSONObject hearts = together == null ? null : together.optJSONObject("hearts");
    JSONObject
        incoming =
            hearts == null ? null : hearts.optJSONObject(who.equals("me") ? "asechka" : "me"),
        own = hearts == null ? null : hearts.optJSONObject(who);
    u.add(
        c,
        u.text(
            incoming == null
                ? "A little heart for " + partner() + ", whenever they cross your mind."
                : partner() + " was thinking of you ♡\n" + date(incoming.optString("sentAt")),
            15,
            Ui.INK),
        14);
    if (own != null)
      u.add(
          c,
          u.text(
              (own.optBoolean("pending") ? "Saved on phone · waiting to send" : "Your last heart")
                  + " · "
                  + date(own.optString("sentAt")),
              12,
              Ui.MUTED),
          10);
    Button send = u.button("♡  Send a heart to " + partner(), true, null);
    send.setOnClickListener(
        v -> {
          if (homeExtras == null)
            homeExtras = new HomeExtras(this, api, destination -> book.show(true), flushHearts);
          homeExtras.send(v);
        });
    send.setEnabled(api.canOpen());
    u.add(c, send, 18);
  }

  private long nextBirthday(int month, int day, long today) {
    return Dates.nextBirthday(month, day, today);
  }

  private void birthdayCard(LinearLayout parent) {
    LinearLayout card = u.card(parent, Ui.BLUE);
    u.add(card, u.label("TWO FAVORITE DAYS"), 0);
    u.add(card, u.title("A little reason to celebrate.", 21), 10);
    long today = Dates.day(Dates.today());
    String[] names = {partner(), person()};
    for (String name : names) {
      boolean asnat = name.equals("Asnat");
      long next = nextBirthday(asnat ? 8 : 1, asnat ? 5 : 25, today);
      long days = next - today;
      LinearLayout row = u.row();
      TextView birthday = u.text(name + " · " + (asnat ? "August 5" : "January 25"), 15, Ui.INK);
      row.addView(birthday, new LinearLayout.LayoutParams(0, -2, 1));
      TextView when =
          u.text(days == 0 ? "Today ♡" : days == 1 ? "Tomorrow" : days + " days", 13, Ui.PURPLE);
      row.addView(when);
      u.add(card, row, 14);
      if (days == 0)
        u.add(
            card,
            u.text(
                "Happy birthday, " + name + "! Here’s to another year of our little universe. ♡",
                15,
                Ui.PURPLE),
            10);
    }
  }

  private void editPlan(JSONObject item, boolean complete) {
    if (!mutating) {
      planEditor = new PlanEditor(item, complete);
      planEditor.show();
    }
  }

  private void removePlan(JSONObject item) {
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Make room for another wish?")
            .setMessage("Remove “" + item.optString("title") + "” from our list?")
            .setNegativeButton("Keep it", null)
            .setPositiveButton("Remove", null)
            .create();
    track(dialog);
    dialog.show();
    JSONObject change =
        object(
            "action",
            "removeItem",
            "id",
            item.optString("id"),
            "expectedRevision",
            item.optString("revision"),
            "operationId",
            UUID.randomUUID().toString());
    dialog.getButton(-1).setOnClickListener(v -> mutatePlan(change, dialog, null));
  }

  private void mutatePlan(JSONObject change, AlertDialog dialog, TextView status) {
    if (mutating) return;
    mutating = true;
    if (status != null) status.setText("Keeping this little memory for both of us…");
    if (dialog != null) {
      dialog.setCancelable(false);
      dialog.getButton(-1).setEnabled(false);
      dialog.getButton(-2).setEnabled(false);
    } else render(true);
    request(
        () -> api.post("/api/together", change),
        data -> {
          together = data;
          mutating = false;
          if (dialog != null) dialog.dismiss();
          render(true);
          updateConnection("");
          refresh(false);
          toast(
              data.optBoolean("_pending")
                  ? "Saved on this phone · waiting to sync"
                  : change.optString("action").equals("sendHeart")
                      ? "Your little heart is on its way ♡"
                      : "Our little plan is saved ♡");
        },
        error -> {
          mutating = false;
          if (isUnauthorized(error)) {
            expired();
            return;
          }
          boolean conflict =
              error instanceof ApiClient.ApiError && ((ApiClient.ApiError) error).status == 409;
          if (dialog != null) {
            dialog.setCancelable(true);
            dialog.getButton(-2).setEnabled(true);
            dialog.getButton(-1).setEnabled(!conflict);
          }
          if (status != null)
            status.setText(
                message(error)
                    + (conflict
                        ? " Open Saved changes in settings to review your saved edit and the latest"
                            + " website version."
                        : ""));
          else toast(message(error));
          if (conflict) refresh(true);
          else if (dialog == null) render(true);
        });
  }

  private class MemoryEditor {
    final boolean photo;
    final JSONObject original;
    final Dialog dialog;
    final EditText text, note, when;
    final ImageView preview;
    final TextView status, quotePreview;
    final Button share;
    final String draftKey;
    String selectedPhoto, operation = UUID.randomUUID().toString(), fingerprint = "";
    boolean photoBusy, committed;
    final Runnable saveDraft = () -> persistDraft();

    MemoryEditor(boolean photo) {
      this(photo, null);
    }

    MemoryEditor(boolean photo, JSONObject original) {
      this.photo = photo;
      this.original = original;
      draftKey =
          "post-draft:"
              + actor()
              + ":"
              + (original == null
                  ? (photo ? "photo" : "quote")
                  : original.optString("id", original.optString("editKey")));
      JSONObject draft = api.store.read(draftKey);
      if (draft == null) draft = original == null ? new JSONObject() : original;
      selectedPhoto = draft.has("photo") ? draft.optString("photo") : null;
      LinearLayout shell = u.column();
      shell.setBackgroundColor(Ui.BG);
      LinearLayout toolbar = u.row(10);
      toolbar.setPadding(u.dp(16), u.dp(10), u.dp(16), u.dp(10));
      Button close = u.button("×", false, null);
      close.setTextSize(24);
      close.setContentDescription("Close post composer");
      toolbar.addView(close, new LinearLayout.LayoutParams(u.dp(48), u.dp(48)));
      toolbar.addView(
          u.title(original == null ? "New post" : "Edit post", 20),
          new LinearLayout.LayoutParams(0, -2, 1));
      share = u.button(original == null ? "Share" : "Save", true, () -> save());
      toolbar.addView(share, new LinearLayout.LayoutParams(u.dp(84), u.dp(48)));
      shell.addView(toolbar);
      LinearLayout body = u.column();
      body.setPadding(u.dp(20), u.dp(8), u.dp(20), u.dp(28));
      LinearLayout byline = u.row(12);
      byline.addView(
          SocialFeed.avatar(MainActivity.this, actor(), 44),
          new LinearLayout.LayoutParams(u.dp(44), u.dp(44)));
      LinearLayout who = u.column();
      who.addView(u.title(person(), 16));
      who.addView(u.text("Our little universe · just us two", 12, Ui.MUTED));
      byline.addView(who);
      u.add(body, byline, 8);
      preview = u.image(body, "Post photo preview", 280);
      preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
      preview.setBackground(u.shape(Ui.BLUE, 24));
      preview.setVisibility(photo ? View.VISIBLE : View.GONE);
      quotePreview = u.quote("Your words, kept close. ♡", 25);
      quotePreview.setGravity(Gravity.CENTER);
      quotePreview.setMinHeight(u.dp(210));
      quotePreview.setPadding(u.dp(25), u.dp(28), u.dp(25), u.dp(28));
      quotePreview.setMaxLines(8);
      quotePreview.setBackground(
          new android.graphics.drawable.GradientDrawable(
              android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
              new int[] {Ui.PALE, Ui.BLUE}));
      quotePreview.setVisibility(photo ? View.GONE : View.VISIBLE);
      u.add(body, quotePreview, 18);
      if (photo)
        u.add(
            body,
            u.button(
                original == null ? "Choose a photo" : "Choose a different photo",
                false,
                () -> pick()),
            12);
      text =
          u.input(
              photo ? "Write a caption…" : "Write something from the heart…",
              draft.optString(photo ? "caption" : "text"),
              photo ? 1000 : 10000,
              true);
      text.setMinHeight(u.dp(photo ? 110 : 150));
      u.add(body, text, 16);
      note = u.input("A little note · optional", draft.optString("note"), 1000, true);
      if (!photo) u.add(body, note, 12);
      when = u.input("Date", draft.optString("date", Dates.today()), 10, false);
      when.setFocusable(false);
      when.setOnClickListener(
          v -> {
            Calendar c = Calendar.getInstance();
            try {
              String[] bits = when.getText().toString().split("-");
              c.set(
                  Integer.parseInt(bits[0]),
                  Integer.parseInt(bits[1]) - 1,
                  Integer.parseInt(bits[2]));
            } catch (Exception ignored) {
            }
            new DatePickerDialog(
                    MainActivity.this,
                    (view, y, m, d) -> {
                      when.setText(String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d));
                      persistDraft();
                    },
                    c.get(Calendar.YEAR),
                    c.get(Calendar.MONTH),
                    c.get(Calendar.DAY_OF_MONTH))
                .show();
          });
      u.add(body, when, 12);
      status =
          u.text("Saved on your phone first. Shared with both of us when connected.", 12, Ui.MUTED);
      u.add(body, status, 16);
      status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
      ScrollView scroller = u.scroll(body);
      shell.addView(scroller, new LinearLayout.LayoutParams(-1, 0, 1));
      dialog = new Dialog(MainActivity.this);
      dialog.setContentView(shell);
      close.setOnClickListener(v -> dialog.dismiss());
      android.text.TextWatcher watcher =
          new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int c, int f) {}

            public void onTextChanged(CharSequence s, int a, int b, int c) {
              quotePreview.setText("“" + text.getText().toString() + "”");
              main.removeCallbacks(saveDraft);
              main.postDelayed(saveDraft, 700);
            }

            public void afterTextChanged(android.text.Editable e) {}
          };
      text.addTextChangedListener(watcher);
      note.addTextChangedListener(watcher);
      quotePreview.setText(
          text.length() == 0 ? "Your words, kept close. ♡" : "“" + text.getText() + "”");
      if (selectedPhoto != null) prepared(selectedPhoto);
      else if (photo && original != null) images.load(photoSource(original), preview);
      else if (photo) images.load("assets/cats-cozy.jpg", preview);
    }

    void pick() {
      if (photoBusy || mutating) return;
      try {
        startActivityForResult(
            new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("image/*"),
            121);
      } catch (ActivityNotFoundException e) {
        status.setText("A photo picker isn’t available on this phone.");
      }
    }

    void show() {
      track(dialog);
      dialog.show();
      dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
      dialog.getWindow().setLayout(-1, -1);
      dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
      dialog
          .getWindow()
          .getDecorView()
          .setOnApplyWindowInsetsListener(
              (view, insets) -> {
                int top = insets.getSystemWindowInsetTop(),
                    bottom = insets.getSystemWindowInsetBottom();
                view.setPadding(
                    insets.getSystemWindowInsetLeft(),
                    top,
                    insets.getSystemWindowInsetRight(),
                    bottom);
                return insets;
              });
      dialog.setOnDismissListener(
          d -> {
            main.removeCallbacks(saveDraft);
            if (!committed) persistDraft();
            if (activeDialog == dialog) activeDialog = null;
            if (memoryEditor == this) memoryEditor = null;
            if (root != null) render(true);
          });
    }

    void persistDraft() {
      if (committed) return;
      try {
        JSONObject draft =
            object(
                photo ? "caption" : "text",
                text.getText().toString(),
                "note",
                note.getText().toString(),
                "date",
                when.getText().toString());
        if (selectedPhoto != null) draft.put("photo", selectedPhoto);
        api.store.write(draftKey, draft);
      } catch (Exception e) {
        status.setText("Couldn’t save this draft yet. " + message(e));
      }
    }

    void prepared(String encoded) {
      selectedPhoto = encoded;
      photoBusy = false;
      byte[] bytes = android.util.Base64.decode(encoded.substring(23), android.util.Base64.NO_WRAP);
      preview.setImageBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.length));
      preview.setVisibility(View.VISIBLE);
      Motion.enter(preview, 1);
      share.setEnabled(true);
      status.setText("Your picture is ready ♡");
      persistDraft();
    }

    void save() {
      if (mutating || photoBusy) return;
      String value = text.getText().toString().trim(), day = when.getText().toString();
      try {
        Dates.day(day);
      } catch (Exception e) {
        when.setError("Choose a valid date.");
        return;
      }
      if (!photo && value.isEmpty()) {
        text.setError("Write a little something first.");
        return;
      }
      if (photo && selectedPhoto == null && original == null) {
        status.setText("Choose a picture first.");
        return;
      }
      JSONObject body =
          object(
              "action",
              (original == null ? "add" : "update") + (photo ? "Photo" : "Quote"),
              "date",
              day,
              photo ? "caption" : "text",
              value,
              "note",
              note.getText().toString(),
              "author",
              actor());
      try {
        if (photo && selectedPhoto != null) body.put("photo", selectedPhoto);
        if (original != null) {
          body.put("id", original.optString("id", original.optString("editKey")));
          body.put("expectedVersion", original.optString("editVersion"));
        }
        String next = body.toString();
        if (!next.equals(fingerprint)) {
          operation = UUID.randomUUID().toString();
          fingerprint = next;
        }
        body.put("operationId", operation);
      } catch (JSONException e) {
        return;
      }
      mutating = true;
      hideKeyboard();
      share.setEnabled(false);
      dialog.setCancelable(false);
      status.setText("Keeping this little moment…");
      request(
          () -> {
            api.store.enqueue("/api/memories", body);
            api.store.write(draftKey, new JSONObject());
            return api.cached("/memories.json", true);
          },
          saved -> {
            memories = saved;
            mutating = false;
            committed = true;
            dialog.dismiss();
            render(original != null);
            updateConnection("");
            Motion.haptic(root, true);
            toast("Saved on your phone · sharing with both of us ♡");
            refresh(false);
          },
          error -> {
            mutating = false;
            dialog.setCancelable(true);
            share.setEnabled(true);
            status.setText(message(error));
          });
    }
  }

  private class PlanEditor {
    final JSONObject item;
    final AlertDialog dialog;
    final EditText title, place, note;
    final CheckBox done;
    final Button photo, undo;
    final ImageView preview;
    TextView status;
    String selectedPhoto;
    final String id;
    String operation = UUID.randomUUID().toString();
    String previousRequest = "";
    boolean photoBusy;

    PlanEditor(JSONObject item, boolean complete) {
      this.item = item;
      id = item == null ? UUID.randomUUID().toString() : item.optString("id");
      LinearLayout body = u.column();
      body.setPadding(u.dp(20), u.dp(12), u.dp(20), u.dp(20));
      u.add(body, u.label("OUR LITTLE WISH"), 0);
      title =
          u.input(
              "Watch the stars together…", item == null ? "" : item.optString("title"), 140, false);
      u.add(body, title, 10);
      u.add(body, u.label("A PLACE · OPTIONAL"), 16);
      place =
          u.input(
              "Anywhere feels good with you",
              item == null ? "" : item.optString("place"),
              140,
              false);
      u.add(body, place, 10);
      u.add(body, u.label("A LITTLE NOTE · OPTIONAL"), 16);
      note =
          u.input(
              "The details we don’t want to forget",
              item == null ? "" : item.optString("note"),
              1000,
              true);
      u.add(body, note, 10);
      done = new CheckBox(MainActivity.this);
      done.setText("We did it. Make this one a memory. ♡");
      done.setTextColor(Ui.INK);
      done.setChecked(complete || item != null && item.optBoolean("completed"));
      u.add(body, done, 14);
      photo =
          u.button(
              "＋  Choose a memory photo",
              false,
              () -> {
                if (photoBusy || mutating) return;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("image/*");
                picker.putExtra(
                    Intent.EXTRA_MIME_TYPES,
                    new String[] {"image/jpeg", "image/png", "image/webp"});
                try {
                  startActivityForResult(picker, 120);
                } catch (ActivityNotFoundException e) {
                  status.setText("A photo picker isn’t available on this phone.");
                }
              });
      u.add(body, photo, 10);
      preview = u.image(body, "Photo for this little memory", 170);
      undo =
          u.button(
              "Undo new photo",
              false,
              () -> {
                selectedPhoto = null;
                update();
              });
      u.add(body, undo, 6);
      status = u.text("", 13, Ui.MUTED);
      status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
      u.add(body, status, 12);
      dialog =
          new AlertDialog.Builder(MainActivity.this)
              .setTitle(item == null ? "Add a little wish" : "Our little plan")
              .setView(u.scroll(body))
              .setNegativeButton("Cancel", null)
              .setPositiveButton("Save our wish", null)
              .create();
      done.setOnCheckedChangeListener((b, checked) -> update());
    }

    void show() {
      track(dialog);
      dialog.setOnDismissListener(
          d -> {
            if (activeDialog == dialog) activeDialog = null;
            if (planEditor == this) planEditor = null;
            if (root != null && screen != 4 && !isFinishing() && !isDestroyed()) render(true);
          });
      dialog.show();
      dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
      dialog.getButton(-1).setOnClickListener(v -> save());
      update();
    }

    void update() {
      Motion.layout((ViewGroup) preview.getParent());
      boolean checked = done.isChecked();
      photo.setVisibility(checked ? View.VISIBLE : View.GONE);
      String old =
          item != null && !item.isNull("photoId")
              ? "/api/together-photo?kind=bucket&id=" + item.optString("photoId")
              : "";
      preview.setVisibility(
          checked && (selectedPhoto != null || !old.isEmpty()) ? View.VISIBLE : View.GONE);
      undo.setVisibility(checked && selectedPhoto != null ? View.VISIBLE : View.GONE);
      if (selectedPhoto != null) {
        byte[] bytes =
            android.util.Base64.decode(selectedPhoto.substring(23), android.util.Base64.NO_WRAP);
        preview.setImageBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.length));
      } else if (!old.isEmpty()) images.load(old, preview);
      if (dialog.isShowing())
        dialog.getButton(-1).setText(checked ? "Save our memory" : "Save our wish");
    }

    void save() {
      if (photoBusy || mutating) return;
      if (title.getText().toString().trim().isEmpty()) {
        title.setError("Give our little wish a title.");
        return;
      }
      JSONObject change =
          object(
              "action",
              "saveItem",
              "id",
              id,
              "expectedRevision",
              item == null ? null : item.optString("revision"),
              "operationId",
              operation,
              "title",
              title.getText().toString(),
              "place",
              place.getText().toString(),
              "note",
              note.getText().toString(),
              "completed",
              done.isChecked());
      if (selectedPhoto != null && done.isChecked())
        try {
          change.put("photo", selectedPhoto);
        } catch (JSONException ignored) {
        }
      try {
        change.remove("operationId");
        String fingerprint = change.toString();
        if (!fingerprint.equals(previousRequest)) {
          operation = UUID.randomUUID().toString();
          previousRequest = fingerprint;
        }
        change.put("operationId", operation);
      } catch (JSONException ignored) {
      }
      mutatePlan(change, dialog, status);
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (book != null && book.photoResult(request, result, data)) return;
    if (request == 481) {
      waitingForPhoneLock = false;
      if (result == RESULT_OK && entryGate != null) openDoor();
      return;
    }
    if (request == 121
        && result == RESULT_OK
        && data != null
        && data.getData() != null
        && memoryEditor != null
        && memoryEditor.dialog.isShowing()) {
      MemoryEditor editor = memoryEditor;
      editor.photoBusy = true;
      editor.status.setText("Making a little copy of your picture…");
      editor.share.setEnabled(false);
      Uri uri = data.getData();
      work.execute(
          () -> {
            try {
              String encoded = compressPhoto(uri);
              main.post(
                  () -> {
                    if (memoryEditor == editor && editor.dialog.isShowing())
                      editor.prepared(encoded);
                  });
            } catch (Exception error) {
              main.post(
                  () -> {
                    if (memoryEditor == editor && editor.dialog.isShowing()) {
                      editor.photoBusy = false;
                      editor.share.setEnabled(true);
                      editor.status.setText(
                          "This picture couldn’t be prepared. Try another photo.");
                    }
                  });
            }
          });
    }
    if (request == 120
        && result == RESULT_OK
        && data != null
        && data.getData() != null
        && planEditor != null) {
      PlanEditor editor = planEditor;
      editor.photoBusy = true;
      editor.status.setText("Getting your picture ready…");
      editor.dialog.getButton(-1).setEnabled(false);
      Uri uri = data.getData();
      work.execute(
          () -> {
            try {
              String encoded = compressPhoto(uri);
              main.post(
                  () -> {
                    if (planEditor == editor && editor.dialog.isShowing()) {
                      editor.selectedPhoto = encoded;
                      editor.photoBusy = false;
                      editor.dialog.getButton(-1).setEnabled(true);
                      editor.status.setText("Your picture is ready to keep with this memory ♡");
                      editor.update();
                    }
                  });
            } catch (Exception e) {
              main.post(
                  () -> {
                    if (planEditor == editor) {
                      editor.photoBusy = false;
                      editor.dialog.getButton(-1).setEnabled(true);
                      editor.status.setText(
                          "This picture couldn’t be prepared. Try a smaller JPG, PNG, or WebP"
                              + " photo.");
                    }
                  });
            }
          });
    }
  }

  private String compressPhoto(Uri uri) throws Exception {
    android.content.res.AssetFileDescriptor descriptor =
        getContentResolver().openAssetFileDescriptor(uri, "r");
    if (descriptor == null) throw new IOException();
    try {
      if (descriptor.getLength() > 25000000) throw new IOException();
    } finally {
      descriptor.close();
    }
    Bitmap bitmap = Photos.decode(this, uri);
    Bitmap flat =
        Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(flat);
    canvas.drawColor(Color.WHITE);
    canvas.drawBitmap(bitmap, 0, 0, null);
    bitmap.recycle();
    try {
      for (int shrink = 0; shrink < 4; shrink++) {
        for (int quality = 86; quality >= 38; quality -= 8) {
          ByteArrayOutputStream out = new ByteArrayOutputStream();
          flat.compress(Bitmap.CompressFormat.JPEG, quality, out);
          if (out.size() <= 310000)
            return "data:image/jpeg;base64,"
                + android.util.Base64.encodeToString(
                    out.toByteArray(), android.util.Base64.NO_WRAP);
        }
        Bitmap small =
            Bitmap.createScaledBitmap(
                flat,
                Math.max(1, (int) (flat.getWidth() * .7f)),
                Math.max(1, (int) (flat.getHeight() * .7f)),
                true);
        flat.recycle();
        flat = small;
      }
      throw new IOException();
    } finally {
      flat.recycle();
    }
  }

  private LinearLayout translationOutput;
  private TextView translatorStatus;
  private Button translateButton;
  private boolean translationBusy, translatorReady;

  private void words() {
    heading(
        "OUR LOVE TRANSLATION",
        "Same feeling.\nFive ways to say it.",
        "A little thought, in words that feel natural.");
    LinearLayout c = u.card(content, Color.WHITE);
    u.add(c, u.label("WRITTEN IN"), 0);
    String[] sources = {
      "Detect the language", "English", "Egyptian Arabic", "Russian", "Hebrew", "French", "Spanish"
    };
    Spinner source = u.spinner(sources, sourceChoice);
    u.add(c, source, 8);
    EditText input = u.input("A little message, a favorite phrase…", wordDraft, 1500, true);
    input.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG);
    u.add(c, input, 12);
    TextView counter = u.text(wordDraft.length() + " / 1,500", 11, Ui.MUTED);
    u.add(c, counter, 8);
    u.add(c, u.label("SAY IT IN · CHOOSE ONE OR A FEW"), 18);
    CheckBox[] targets = new CheckBox[5];
    for (int i = 0; i < 5; i++) {
      final int index = i;
      targets[i] = new CheckBox(this);
      targets[i].setText(languageNames[i]);
      targets[i].setTextSize(14);
      targets[i].setTextColor(Ui.INK);
      targets[i].setChecked(targetChoices[i]);
      targets[i].setOnCheckedChangeListener(
          (v, checked) -> {
            targetChoices[index] = checked;
            draftChanged();
          });
      u.add(c, targets[i], 0);
    }
    u.add(c, u.label("THE FEELING"), 16);
    Spinner tone =
        u.spinner(
            new String[] {"Natural & everyday", "A little sweeter", "Soft & poetic"}, toneChoice);
    u.add(c, tone, 4);
    applyProfile();
    u.add(
        c,
        u.text(
            "Written by "
                + person()
                + ", for "
                + partner()
                + ". The language roles are set for you.",
            13,
            Ui.MUTED),
        16);
    input.addTextChangedListener(
        new android.text.TextWatcher() {
          public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

          public void onTextChanged(CharSequence s, int start, int before, int count) {
            wordDraft = s.toString();
            draftChanged();
            counter.setText(s.length() + " / 1,500");
          }

          public void afterTextChanged(android.text.Editable e) {}
        });
    listen(source, value -> sourceChoice = value);
    listen(tone, value -> toneChoice = value);
    translateButton =
        u.button(
            translationBusy ? "Finding the right words…" : "Translate our words  →", true, null);
    translateButton.setEnabled(translatorReady && !translationBusy);
    u.add(c, translateButton, 18);
    translatorStatus = u.text("Opening our little phrasebook…", 13, Ui.MUTED);
    translatorStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    u.add(c, translatorStatus, 12);
    u.add(c, u.button("Check the connection", false, this::checkTranslator), 8);
    u.add(c, u.button("Saved translations", false, this::translationHistory), 8);
    u.add(
        content,
        u.text(
            "When you translate, your text goes to Google’s Gemini service. Its free service may"
                + " use it to improve products. Translations and drafts are saved privately on this"
                + " phone for offline use.",
            12,
            Ui.MUTED),
        16);
    LinearLayout output = u.column();
    translationOutput = output;
    u.add(content, output, 4);
    showTranslations(output);
    translateButton.setOnClickListener(
        v -> {
          JSONArray chosen = new JSONArray();
          for (int i = 0; i < 5; i++) if (targets[i].isChecked()) chosen.put(languageIds[i]);
          if (input.getText().toString().trim().isEmpty() || chosen.length() == 0) {
            translatorStatus.setText("Write a little message and choose at least one language.");
            return;
          }
          hideKeyboard();
          String[] sourceIds = {"auto", "en", "ar-EG", "ru", "he", "fr", "es"},
              tones = {"natural", "sweet", "poetic"},
              speakers = {"male", "female", "neutral"},
              recipients = {"female", "male", "neutral"};
          JSONObject body =
              object(
                  "text",
                  input.getText().toString(),
                  "source",
                  sourceIds[source.getSelectedItemPosition()],
                  "targets",
                  chosen,
                  "tone",
                  tones[tone.getSelectedItemPosition()],
                  "speaker",
                  speakers[speakerChoice],
                  "recipient",
                  recipients[recipientChoice]);
          translationBusy = true;
          translateButton.setEnabled(false);
          translateButton.setText("Finding the right words…");
          translatorStatus.setText("Giving your words a little care…");
          request(
              () -> api.post("/api/translation", body),
              data -> {
                translations = data;
                try {
                  api.store.write("last-translation:" + person(), data);
                } catch (IOException error) {
                  toast(error.getMessage());
                }
                translationBusy = false;
                if (screen == 4) {
                  showTranslations(translationOutput);
                  translateButton.setEnabled(translatorReady);
                  translateButton.setText("Translate our words  →");
                  translatorStatus.setText("Same thought, a few new ways to say it ♡");
                }
              },
              error -> {
                translationBusy = false;
                if (isUnauthorized(error)) {
                  expired();
                  return;
                }
                if (screen == 4) {
                  translateButton.setEnabled(translatorReady);
                  translateButton.setText("Translate our words  →");
                  translatorStatus.setText(message(error));
                }
              });
        });
  }

  private void listen(Spinner spinner, Consumer<Integer> action) {
    spinner.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View v, int position, long id) {
            action.accept(position);
            draftChanged();
          }
        });
  }

  private void checkTranslator() {
    if (screen != 4) return;
    if (!api.connected() || !api.signedIn()) {
      translatorReady = true;
      if (translatorStatus != null) {
        translatorStatus.setText(
            "Offline · open saved translations, or repeat a saved translation. New translations"
                + " need internet.");
        translateButton.setEnabled(!translationBusy);
      }
      return;
    }
    request(
        () -> api.get("/api/translation"),
        data -> {
          translatorReady = data.optBoolean("ready");
          if (screen == 4 && translatorStatus != null) {
            translatorStatus.setText(
                translatorReady
                    ? "Ready for a little message. Arabic here is always Egyptian ♡"
                    : data.optString("message", "Our translator needs a moment."));
            translateButton.setEnabled(translatorReady && !translationBusy);
          }
        },
        error -> {
          if (isUnauthorized(error)) {
            expired();
            return;
          }
          translatorReady = false;
          if (screen == 4 && translatorStatus != null) {
            translatorStatus.setText(message(error));
            translateButton.setEnabled(false);
          }
        });
  }

  private void translationHistory() {
    JSONObject saved = api.store.read("translation-history");
    JSONArray history = saved == null ? new JSONArray() : array(saved, "items");
    if (history.length() == 0) {
      toast("Your translations will be saved here after you translate.");
      return;
    }
    String[] names = new String[history.length()];
    for (int i = 0; i < names.length; i++)
      names[i] = history.optJSONObject(i).optJSONObject("input").optString("text");
    new AlertDialog.Builder(this)
        .setTitle("Saved translations")
        .setItems(
            names,
            (d, index) -> {
              JSONObject entry = history.optJSONObject(index);
              translations = api.store.read("translation:" + entry.optString("id"));
              if (translationOutput != null) showTranslations(translationOutput);
            })
        .setNegativeButton("Close", null)
        .show();
  }

  private void showTranslations(LinearLayout output) {
    output.removeAllViews();
    JSONArray results = array(translations, "translations");
    if (results.length() == 0) {
      empty(
          output,
          "A thought worth understanding.",
          "Write your words above. We’ll find a natural way to say them.");
      return;
    }
    for (int i = 0; i < results.length(); i++) {
      JSONObject item = at(results, i);
      LinearLayout c = u.card(output, Ui.PALE);
      String lang = item.optString("language"), name = lang;
      for (int j = 0; j < 5; j++) if (languageIds[j].equals(lang)) name = languageNames[j];
      u.add(c, u.label(name), 0);
      TextView text = u.text(item.optString("text"), 22, Ui.INK);
      text.setTextIsSelectable(true);
      text.setTextLocale(Locale.forLanguageTag(lang));
      text.setTextDirection(
          lang.equals("ar-EG") || lang.equals("he")
              ? View.TEXT_DIRECTION_RTL
              : View.TEXT_DIRECTION_LTR);
      u.add(c, text, 16);
      u.add(
          c,
          u.button(
              "Copy translation  ↗",
              false,
              () -> {
                ((android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE))
                    .setPrimaryClip(ClipData.newPlainText("Our words", item.optString("text")));
                toast("Copied. Ready for a little message ♡");
              }),
          14);
      LinearLayout details = u.column();
      for (String[] field :
          new String[][] {
            {"pronunciation", "How it sounds"},
            {"backTranslation", "The meaning in English"},
            {"note", "A little language note"}
          }) {
        String value = item.optString(field[0]);
        if (!value.isEmpty()) {
          u.add(details, u.label(field[1]), 16);
          TextView detail = u.text(value, 14, Ui.INK);
          detail.setTextIsSelectable(true);
          u.add(details, detail, 6);
        }
      }
      details.setVisibility(View.GONE);
      u.add(
          c,
          u.button(
              "Pronunciation & meaning  ⌄",
              false,
              () -> {
                Motion.layout((ViewGroup) details.getParent());
                details.setVisibility(
                    details.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
              }),
          10);
      u.add(c, details, 0);
    }
  }

  private void track(Dialog dialog) {
    String before = visibleData();
    activeDialog = dialog;
    dialog.setOnShowListener(
        d -> {
          if (!(dialog instanceof Ui.Sheet)) raiseHearts();
          if (dialog.getWindow() != null) {
            View decor = dialog.getWindow().getDecorView();
            Motion.install(decor);
            Motion.enter(decor, 1);
          }
        });
    dialog.setOnDismissListener(
        d -> {
          if (activeDialog == dialog) {
            activeDialog = null;
            if (root != null
                && screen != 4
                && !isFinishing()
                && !isDestroyed()
                && !before.equals(visibleData())) render(true);
          }
        });
  }
}
