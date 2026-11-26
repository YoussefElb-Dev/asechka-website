package app.asechka.android;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Android schedules background work; minute polling belongs to the visible activity. */
public final class SyncJob extends JobService {
  private static final int ID = 10817;
  private static final String CHANNEL = "asechka_love";
  private ExecutorService worker;
  private AtomicBoolean cancelled;

  static void schedule(Context context) {
    JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
    boolean scheduled = false;
    for (JobInfo job : scheduler.getAllPendingJobs()) if (job.getId() == ID) scheduled = true;
    if (!scheduled)
      scheduler.schedule(
          new JobInfo.Builder(ID, new ComponentName(context, SyncJob.class))
              .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
              .setPersisted(true)
              .setPeriodic(15 * 60 * 1000L)
              .build());
  }

  static void cancel(Context context) {
    ((JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(ID);
  }

  static void notifyPartnerUpdates(Context context, JSONObject together) {
    if (together == null) return;
    SharedPreferences prefs = context.getSharedPreferences("preferences", MODE_PRIVATE);
    if (!prefs.getBoolean("alerts-enabled", false)) return;
    if (Build.VERSION.SDK_INT >= 33
        && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return;
    String actor = prefs.getString("person", "");
    if (actor.isEmpty()) return;
    String otherKey = actor.equals("asnat") ? "me" : "asechka";
    String otherActor = actor.equals("asnat") ? "youssef" : "asnat";
    String partnerName = actor.equals("asnat") ? "Youssef" : "Asnat";
    SharedPreferences.Editor editor = prefs.edit();
    boolean changed = false;

    JSONObject hearts = together.optJSONObject("hearts");
    JSONObject otherHeart = hearts == null ? null : hearts.optJSONObject(otherKey);
    String sentAt = otherHeart == null ? "" : otherHeart.optString("sentAt", "");
    if (!sentAt.isEmpty()) {
      String prev = prefs.getString("notif-last-heart", "");
      if (!prev.isEmpty() && sentAt.compareTo(prev) > 0) {
        JSONObject vibes = together.optJSONObject("heartVibes");
        JSONObject vibe = vibes == null ? null : vibes.optJSONObject(otherKey);
        String body =
            vibe != null && !vibe.optString("label").isEmpty()
                ? partnerName + " sent a heart: " + vibe.optString("symbol", "♡") + " " + vibe.optString("label")
                : partnerName + " is thinking of you ♡";
        postNotification(context, 4011, "A little heart ♡", body);
      }
      editor.putString("notif-last-heart", sentAt);
      changed = true;
    }

    JSONArray messages = together.optJSONArray("messages");
    if (messages != null) {
      JSONObject latest = null;
      for (int i = messages.length() - 1; i >= 0; i--) {
        JSONObject m = messages.optJSONObject(i);
        if (m != null && otherActor.equals(m.optString("from"))) {
          latest = m;
          break;
        }
      }
      if (latest != null) {
        String id = latest.optString("id", "");
        String prev = prefs.getString("notif-last-note", "");
        if (!id.isEmpty() && !prev.isEmpty() && !id.equals(prev)) {
          postNotification(context, 4012, "New Love Jar note ♡", "From " + partnerName + ": " + latest.optString("preview"));
        }
        if (!id.isEmpty()) {
          editor.putString("notif-last-note", id);
          changed = true;
        }
      }
    }

    JSONObject prompt = together.optJSONObject("dailyPrompt");
    if (prompt != null) {
      JSONObject answers = prompt.optJSONObject("answers");
      JSONObject partnerAns = answers == null ? null : answers.optJSONObject(otherActor);
      if (partnerAns != null && partnerAns.optBoolean("answered")) {
        String stamp = prompt.optString("day") + ":" + partnerAns.optString("answeredAt", "1");
        String prev = prefs.getString("notif-last-prompt", "");
        if (!prev.isEmpty() && !stamp.equals(prev)) {
          postNotification(context, 4013, "Today’s question", partnerName + " answered today’s question. Open Asechka to see ♡");
        }
        editor.putString("notif-last-prompt", stamp);
        changed = true;
      }
    }
    if (changed) editor.apply();
  }

  private static void postNotification(Context context, int id, String title, String body) {
    try {
      NotificationManager nm = (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
      if (nm == null) return;
      if (Build.VERSION.SDK_INT >= 26) {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Asechka love notes & hearts", NotificationManager.IMPORTANCE_DEFAULT);
        nm.createNotificationChannel(channel);
      }
      Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      PendingIntent pi = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
      Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
      b.setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setAutoCancel(true).setContentIntent(pi);
      nm.notify(id, b.build());
    } catch (Exception ignored) {}
  }

  @Override
  public boolean onStartJob(JobParameters parameters) {
    final AtomicBoolean stopped = new AtomicBoolean(false);
    cancelled = stopped;
    final ExecutorService activeWorker = Executors.newSingleThreadExecutor();
    worker = activeWorker;
    activeWorker.execute(
        () -> {
          boolean retry = false;
          try {
            ApiClient api = new ApiClient(this);
            if (api.canOpen() && api.signedIn()) {
              api.syncPending();
              JSONObject together = null;
              for (String path :
                  new String[] {
                    "/memories.json",
                    "/api/music",
                    "/api/together",
                    "/api/daily-memory",
                    "/api/keepsakes",
                    "/api/journal",
                    "/api/camera"
                  }) {
                if (stopped.get()) return;
                JSONObject res = api.get(path);
                if (path.equals("/api/together")) together = res;
              }
              try { if (!stopped.get()) api.get("/api/vault"); } catch (Exception ignored) {}
              notifyPartnerUpdates(this, together);
              UniverseWidgets.updateAll(this);
              retry = api.prefetchMedia() > 0;
            }
          } catch (Exception error) {
            retry = true;
          } finally {
            if (!stopped.get()) jobFinished(parameters, retry);
            activeWorker.shutdown();
          }
        });
    return true;
  }

  @Override
  public boolean onStopJob(JobParameters parameters) {
    if (cancelled != null) cancelled.set(true);
    if (worker != null) worker.shutdownNow();
    return true;
  }
}
