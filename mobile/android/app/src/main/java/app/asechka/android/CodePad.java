package app.asechka.android;

import android.content.Context;
import android.graphics.Color;
import android.text.InputType;
import android.text.method.PasswordTransformationMethod;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;

/** A native, accessible password door. The keypad never changes the existing password. */
final class CodePad extends FrameLayout {
  final EditText password;
  final Button unlock;
  final TextView status;
  private final Ui u;
  private final LinearLayout keys;
  private final Button keyboard;
  private Button biometricButton;
  private boolean typing;
  private boolean busy;
  private Runnable submit;
  private final LinearLayout body;

  CodePad(Context context, String name) {
    super(context);
    u = new Ui(context);
    setBackgroundColor(Ui.BG);
    body = u.column();
    body.setPadding(u.dp(26), u.dp(22), u.dp(26), u.dp(22));
    body.setGravity(Gravity.CENTER_HORIZONTAL);
    TextView charm = u.text("♡", 35, Ui.PURPLE);
    charm.setGravity(Gravity.CENTER);
    charm.setBackground(u.shape(Ui.PALE, 30));
    charm.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    body.addView(charm, new LinearLayout.LayoutParams(u.dp(60), u.dp(60)));
    TextView title = u.title("Welcome home, " + name + ".", 26);
    title.setGravity(Gravity.CENTER);
    u.add(body, title, 14);
    TextView help =
        u.text("Our little world, kept just for us.\nEnter our code to come inside.", 14, Ui.MUTED);
    help.setGravity(Gravity.CENTER);
    u.add(body, help, 8);
    password = u.input("Our little code", "", 160, false);
    password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    password.setTransformationMethod(PasswordTransformationMethod.getInstance());
    password.setGravity(Gravity.CENTER);
    Compat.font(password, R.font.dm_sans, 500);
    password.setTextSize(20);
    password.setLetterSpacing(.06f);
    password.setShowSoftInputOnFocus(false);
    password.setSaveEnabled(false);
    password.setLongClickable(false);
    password.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_GO);
    password.setContentDescription("Our little code");
    if (android.os.Build.VERSION.SDK_INT >= 26)
      password.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
    u.add(body, password, 20);
    status = u.text("A little door. A whole lot of love.", 12, Ui.MUTED);
    status.setGravity(Gravity.CENTER);
    status.setMinHeight(u.dp(34));
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    u.add(body, status, 4);
    keys = u.column();
    for (int row = 0; row < 4; row++) {
      LinearLayout line = u.row(12);
      for (int col = 0; col < 3; col++) {
        int value = row * 3 + col + 1;
        String label = value == 10 ? "♡" : value == 11 ? "0" : value == 12 ? "⌫" : "" + value;
        Button key = u.button(label, false, null);
        key.setTextSize(value == 12 ? 23 : 25);
        key.setBackground(u.shape(value == 10 ? Ui.PALE : value == 12 ? Ui.BLUE : Color.WHITE, 23));
        key.setContentDescription(
            value == 10 ? "Clear code" : value == 12 ? "Delete digit" : "Digit " + label);
        key.setOnClickListener(
            v -> {
              if (busy) return;
              if (value == 10) password.setText("");
              else if (value == 12) {
                int n = password.length();
                if (n > 0) password.getText().delete(n - 1, n);
              } else if (password.length() < 160) password.append(label);
              password.setSelection(password.length());
            });
        line.addView(key, new LinearLayout.LayoutParams(0, u.dp(58), 1));
      }
      u.add(keys, line, row == 0 ? 0 : 10);
    }
    u.add(body, keys, 4);
    unlock =
        u.button(
            "Open our little door  →",
            true,
            () -> {
              if (!busy && submit != null) submit.run();
            });
    u.add(body, unlock, 18);
    keyboard =
        u.button(
            "Use keyboard",
            false,
            () -> {
              typing = !typing;
              keys.setVisibility(typing ? View.GONE : View.VISIBLE);
              keyboardMode();
            });
    u.add(body, keyboard, 5);
    TextView footer = u.text("Only us, always. ♡", 12, Ui.MUTED);
    footer.setGravity(Gravity.CENTER);
    u.add(body, footer, 8);
    ScrollView scroller = u.scroll(body);
    scroller.setFillViewport(false);
    FrameLayout.LayoutParams size = new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER);
    size.width = Math.min(context.getResources().getDisplayMetrics().widthPixels, u.dp(420));
    addView(scroller, size);
    setFocusableInTouchMode(true);
    requestFocus();
    password.setOnEditorActionListener(
        (v, id, event) -> {
          if (id == android.view.inputmethod.EditorInfo.IME_ACTION_GO && !busy) {
            if (submit != null) submit.run();
            return true;
          }
          return false;
        });
  }

  private void keyboardMode() {
    keyboard.setText(typing ? "Use number pad" : "Use keyboard");
    password.setShowSoftInputOnFocus(typing);
    InputMethodManager ime =
        (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
    if (typing) {
      password.requestFocus();
      ime.showSoftInput(password, InputMethodManager.SHOW_IMPLICIT);
    } else {
      ime.hideSoftInputFromWindow(password.getWindowToken(), 0);
      requestFocus();
    }
  }

  void onSubmit(Runnable action) {
    submit = action;
  }

  void biometric(Runnable action) {
    Button open = u.button("Unlock with biometrics  ♡", false, action);
    biometricButton = open;
    open.setContentDescription("Unlock with biometrics");
    LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, -2);
    size.topMargin = u.dp(8);
    body.addView(open, body.indexOfChild(unlock) + 1, size);
  }

  void busy(boolean value) {
    busy = value;
    unlock.setEnabled(!value);
    password.setEnabled(!value);
    keyboard.setEnabled(!value);
    if (biometricButton != null) biometricButton.setEnabled(!value);
    if (value) status.setText("Opening our little door…");
  }

  void clear() {
    password.setText("");
    busy(false);
    typing = false;
    keys.setVisibility(View.VISIBLE);
    keyboardMode();
    status.setText("A little door. A whole lot of love.");
  }

  void error(String text) {
    busy(false);
    password.setText("");
    status.setText(text);
    if (Motion.enabled(getContext())) {
      android.animation.ObjectAnimator shake =
          android.animation.ObjectAnimator.ofFloat(
              password, "translationX", 0, -u.dp(7), u.dp(7), -u.dp(4), u.dp(4), 0);
      shake.setDuration(320);
      shake.start();
    }
  }
}
