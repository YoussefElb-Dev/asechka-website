package app.asechka.android;

import android.content.*;
import android.content.res.AssetFileDescriptor;
import android.media.*;
import java.util.*;

/** Tiny bundled original WAV cues; silent by default and always user-controlled. */
final class GamesAudio {
  private final Context context;
  private final SoundPool pool;
  private final Map<String,Integer> samples = new HashMap<>();
  private final Set<Integer> loaded = new HashSet<>();
  GamesAudio(Context context) {
    this.context = context;
    pool = new SoundPool.Builder().setMaxStreams(3).setAudioAttributes(new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build();
    pool.setOnLoadCompleteListener((soundPool,id,status) -> { if (status == 0) synchronized(loaded) { loaded.add(id); } });
    for (String name : new String[] {"tap","move","drop","hit","splash","win","lose","pocket","invite"}) {
      try (AssetFileDescriptor file = context.getAssets().openFd("default/games/audio/" + name + ".wav")) {
        samples.put(name, pool.load(file, 1));
      } catch (Exception ignored) { }
    }
  }
  void play(String name) {
    if (!context.getSharedPreferences("games-settings",0).getBoolean("sound",false)) return;
    Integer id = samples.get(name);
    synchronized(loaded) { if (id != null && loaded.contains(id)) pool.play(id,.35f,.35f,1,0,1); }
  }
  void close() { pool.release(); }
}
