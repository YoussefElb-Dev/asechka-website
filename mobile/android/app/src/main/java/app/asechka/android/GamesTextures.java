package app.asechka.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;
import java.io.IOException;
import java.io.InputStream;

/** Bounded, density-independent native gameplay textures. No downloads. */
final class GamesTextures {
  private static final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(24*1024*1024) {
    protected int sizeOf(String key, Bitmap bitmap) { return bitmap.getAllocationByteCount(); }
  };
  static synchronized Bitmap image(Context context, String name) {
    Bitmap bitmap=cache.get(name);
    if(bitmap!=null)return bitmap;
    BitmapFactory.Options options=new BitmapFactory.Options();options.inScaled=false;
    try(InputStream stream=context.getAssets().open("default/games/gameplay/"+name+".png")) {
      bitmap=BitmapFactory.decodeStream(stream,null,options);
      if(bitmap==null)throw new IOException("Invalid image");
      cache.put(name,bitmap);return bitmap;
    } catch(IOException failure) {throw new IllegalStateException("Missing gameplay artwork: "+name,failure);}
  }
  static void warm(Context context,String game) {
    image(context,game+"/"+("hangman".equals(game)?"book":"board"));
    if("pool".equals(game)){for(int i=0;i<16;i++)image(context,"pool/ball-"+i+"-small");image(context,"pool/cue");image(context,"pool/pocket");}
    if("tictactoe".equals(game)){image(context,game+"/x");image(context,game+"/o");}
    if("connect4".equals(game)||"checkers".equals(game)){for(String color:new String[]{"rose","mint"}){image(context,game+"/"+color);if("checkers".equals(game))image(context,game+"/"+color+"-king");}}
    if("battleship".equals(game)){for(String ship:new String[]{"carrier","battleship","cruiser","submarine","destroyer"})image(context,game+"/"+ship);image(context,"common/hit");image(context,"common/miss");}
    if("hangman".equals(game))image(context,"common/heart");
  }
}
