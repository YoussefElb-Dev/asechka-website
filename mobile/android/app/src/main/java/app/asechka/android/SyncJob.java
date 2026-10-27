package app.asechka.android;

import android.app.job.*;
import android.content.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Android schedules background work; minute polling belongs to the visible activity. */
public final class SyncJob extends JobService {
  private static final int ID = 10817;
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
              for (String path :
                  new String[] {
                    "/memories.json",
                    "/api/music",
                    "/api/together",
                    "/api/daily-memory",
                    "/api/keepsakes",
                    "/api/journal"
                  }) {
                if (stopped.get()) return;
                api.get(path);
              }
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
