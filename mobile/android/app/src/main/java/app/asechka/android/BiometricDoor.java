package app.asechka.android;

import android.app.*;
import android.content.Context;
import android.hardware.biometrics.*;
import android.hardware.fingerprint.FingerprintManager;
import android.os.*;
import android.security.keystore.*;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.IvParameterSpec;
import org.json.JSONObject;

/** Per-use biometric Keystore proof. No copy of the shared password is retained. */
final class BiometricDoor {
  interface Result {
    void done(boolean success, String message);
  }

  private static final String KEY = "asechka-biometric-door-v1";
  private static final byte[] PROOF =
      "Only us, always. Asechka biometric door.".getBytes(StandardCharsets.UTF_8);
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
    return store.read("biometric-door") != null;
  }

  void disable() {
    cancel();
    store.remove("biometric-door");
    try {
      KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
      keys.load(null);
      keys.deleteEntry(KEY);
    } catch (Exception ignored) {
    }
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
      result.done(false, "Set up fingerprint or biometrics in your phone settings first.");
      return;
    }
    try {
      KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
      keys.load(null);
      if (enrolling) {
        keys.deleteEntry(KEY);
        KeyGenerator generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder spec =
            new KeyGenParameterSpec.Builder(
                    KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_CBC)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_PKCS7)
                .setUserAuthenticationRequired(true);
        if (Build.VERSION.SDK_INT >= 24) spec.setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30)
          spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        else spec.setUserAuthenticationValidityDurationSeconds(-1);
        generator.init(spec.build());
        generator.generateKey();
      }
      Cipher cipher = Cipher.getInstance("AES/CBC/PKCS7Padding");
      JSONObject proof = store.read("biometric-door");
      if (enrolling) cipher.init(Cipher.ENCRYPT_MODE, keys.getKey(KEY, null));
      else
        cipher.init(
            Cipher.DECRYPT_MODE,
            keys.getKey(KEY, null),
            new IvParameterSpec(Base64.decode(proof.getString("iv"), Base64.NO_WRAP)));
      java.util.concurrent.atomic.AtomicBoolean finished =
          new java.util.concurrent.atomic.AtomicBoolean();
      Result completed =
          (success, message) -> {
            if (!finished.compareAndSet(false, true)) return;
            if (legacy != null) {
              legacy.dismiss();
              legacy = null;
            }
            cancellation = null;
            if (!success) {
              result.done(false, message);
              return;
            }
            try {
              if (enrolling)
                store.write(
                    "biometric-door",
                    OfflineStore.json(
                        "iv",
                        Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP),
                        "proof",
                        Base64.encodeToString(cipher.doFinal(PROOF), Base64.NO_WRAP)));
              else if (!MessageDigest.isEqual(
                  PROOF, cipher.doFinal(Base64.decode(proof.getString("proof"), Base64.NO_WRAP))))
                throw new GeneralSecurityException();
              result.done(true, "");
            } catch (Exception error) {
              disable();
              result.done(false, "Please use our code and enable biometrics again.");
            }
          };
      cancellation = new CancellationSignal();
      if (Build.VERSION.SDK_INT >= 28) {
        BiometricPrompt.Builder builder =
            new BiometricPrompt.Builder(activity)
                .setTitle(enrolling ? "Keep our little door close" : "Welcome home ♡")
                .setSubtitle(
                    enrolling
                        ? "Enable biometric unlock for Asechka"
                        : "Unlock our private little universe")
                .setNegativeButton(
                    "Use our code",
                    activity.getMainExecutor(),
                    (dialog, which) -> completed.done(false, "Use our little code below."));
        if (Build.VERSION.SDK_INT >= 30)
          builder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        builder
            .build()
            .authenticate(
                new BiometricPrompt.CryptoObject(cipher),
                cancellation,
                activity.getMainExecutor(),
                new BiometricPrompt.AuthenticationCallback() {
                  @Override
                  public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult auth) {
                    completed.done(auth.getCryptoObject() != null, "");
                  }

                  @Override
                  public void onAuthenticationError(int code, CharSequence text) {
                    completed.done(false, "Use our code, or try biometrics again.");
                  }
                });
      } else {
        legacy =
            new AlertDialog.Builder(activity)
                .setTitle("Our little fingerprint door ♡")
                .setMessage("Touch your phone’s fingerprint sensor.")
                .setNegativeButton("Use our code", (dialog, which) -> cancel())
                .create();
        legacy.setOnCancelListener(dialog -> cancel());
        legacy.show();
        activity
            .getSystemService(FingerprintManager.class)
            .authenticate(
                new FingerprintManager.CryptoObject(cipher),
                cancellation,
                0,
                new FingerprintManager.AuthenticationCallback() {
                  @Override
                  public void onAuthenticationSucceeded(
                      FingerprintManager.AuthenticationResult auth) {
                    completed.done(auth.getCryptoObject() != null, "");
                  }

                  @Override
                  public void onAuthenticationError(int code, CharSequence text) {
                    completed.done(false, "Use our code, or try your fingerprint again.");
                  }
                },
                new Handler(Looper.getMainLooper()));
      }
    } catch (Exception error) {
      disable();
      result.done(false, "Please use our code and enable biometrics again.");
    }
  }
}
