package app.asechka.android;

import android.app.*;
import android.content.Context;
import android.hardware.biometrics.*;
import android.hardware.fingerprint.FingerprintManager;
import android.os.*;

/** Optional native OS authentication; no app password screen or saved biometric data. */
final class BiometricDoor {
  interface Result {
    void done(boolean success, String message);
  }

  private final Activity activity;
  private final OfflineStore store;
  private CancellationSignal cancellation;
  private Dialog legacy;

  BiometricDoor(Activity activity, OfflineStore store) {
    this.activity = activity;
    this.store = store;
  }

  boolean available() {
    try {
      if (!((KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE)).isDeviceSecure())
        return false;
      if (Build.VERSION.SDK_INT >= 30)
        return activity
                .getSystemService(BiometricManager.class)
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            == BiometricManager.BIOMETRIC_SUCCESS;
      if (Build.VERSION.SDK_INT >= 29)
        return activity.getSystemService(BiometricManager.class).canAuthenticate()
            == BiometricManager.BIOMETRIC_SUCCESS;
      FingerprintManager manager = activity.getSystemService(FingerprintManager.class);
      return manager != null && manager.isHardwareDetected() && manager.hasEnrolledFingerprints();
    } catch (Exception error) {
      return false;
    }
  }

  boolean enabled() {
    return store.read("biometric-enabled") != null;
  }

  void disable() {
    cancel();
    store.remove("biometric-enabled");
  }

  void cancel() {
    if (cancellation != null) {
      cancellation.cancel();
      cancellation = null;
    }
    if (legacy != null) {
      legacy.dismiss();
      legacy = null;
    }
  }

  void authenticate(boolean enrolling, Result result) {
    if (!available()) {
      result.done(
          false, "Set up biometrics in your phone settings, or use your phone screen lock.");
      return;
    }
    java.util.concurrent.atomic.AtomicBoolean finished =
        new java.util.concurrent.atomic.AtomicBoolean();
    Result complete =
        (success, message) -> {
          if (!finished.compareAndSet(false, true)) return;
          cancellation = null;
          if (legacy != null) {
            legacy.dismiss();
            legacy = null;
          }
          try {
            if (success && enrolling)
              store.write("biometric-enabled", OfflineStore.json("enabled", true));
            result.done(success, message);
          } catch (Exception error) {
            result.done(false, "Your phone couldn’t save this preference. Please try again.");
          }
        };
    cancellation = new CancellationSignal();
    if (Build.VERSION.SDK_INT >= 28) {
      BiometricPrompt.Builder builder =
          new BiometricPrompt.Builder(activity)
              .setTitle("Our little universe ♡")
              .setSubtitle(enrolling ? "Enable optional biometric unlock" : "Unlock Asechka");
      if (Build.VERSION.SDK_INT >= 30)
        builder.setAllowedAuthenticators(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
                | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
      else if (Build.VERSION.SDK_INT >= 29) builder.setDeviceCredentialAllowed(true);
      else
        builder.setNegativeButton(
            "Use phone screen lock",
            activity.getMainExecutor(),
            (d, w) -> complete.done(false, "Use your phone screen lock."));
      builder
          .build()
          .authenticate(
              cancellation,
              activity.getMainExecutor(),
              new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult auth) {
                  complete.done(true, "");
                }

                @Override
                public void onAuthenticationError(int code, CharSequence text) {
                  complete.done(false, "Use your phone screen lock, or try again.");
                }
              });
    } else {
      legacy =
          new AlertDialog.Builder(activity)
              .setTitle("Our little fingerprint door ♡")
              .setMessage("Touch your phone’s fingerprint sensor.")
              .setNegativeButton("Use phone screen lock", (d, w) -> cancel())
              .create();
      legacy.setOnCancelListener(d -> cancel());
      legacy.show();
      activity
          .getSystemService(FingerprintManager.class)
          .authenticate(
              null,
              cancellation,
              0,
              new FingerprintManager.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(
                    FingerprintManager.AuthenticationResult auth) {
                  complete.done(true, "");
                }

                @Override
                public void onAuthenticationError(int code, CharSequence text) {
                  complete.done(false, "Use your phone screen lock, or try again.");
                }
              },
              new Handler(Looper.getMainLooper()));
    }
  }
}
