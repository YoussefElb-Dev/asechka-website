package app.asechka.android;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

final class LiveLocationCard {
  static final int PERMISSION=2402;
  final MainActivity activity;final ApiClient api;final Ui u;
  final Handler main=new Handler(Looper.getMainLooper());final ExecutorService io=Executors.newSingleThreadExecutor();
  LinearLayout root;TextView statuses;Button toggle;WebView map;JSONObject snapshot;boolean closed,busy;
  LiveLocationCard(MainActivity activity,ApiClient api){this.activity=activity;this.api=api;u=new Ui(activity);}
  LinearLayout view(){root=u.column();root.setBackground(u.shape(android.graphics.Color.WHITE,18));root.setClipToOutline(true);
    LinearLayout heading=u.row(8);heading.setPadding(u.dp(12),0,u.dp(6),0);heading.addView(u.text("⌖  Find each other",13,Ui.INK),new LinearLayout.LayoutParams(0,-2,1));toggle=u.button(enabled()?"Stop":"Share",false,()->{if(enabled())stop();else explain();});toggle.setTextSize(12);heading.addView(toggle,new LinearLayout.LayoutParams(-2,u.dp(44)));root.addView(heading);
    map=map();root.addView(map,new LinearLayout.LayoutParams(-1,u.dp(96)));statuses=u.text("Asnat · not sharing    Youssef · not sharing",10,Ui.MUTED);statuses.setPadding(u.dp(12),u.dp(6),u.dp(12),u.dp(7));root.addView(statuses);
    root.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){public void onViewAttachedToWindow(View v){poll.run();}public void onViewDetachedFromWindow(View v){main.removeCallbacks(poll);}});return root;
  }
  WebView map(){WebView web=new WebView(activity);web.setBackgroundColor(Ui.BLUE);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setUserAgentString("Asechka-Android/2.5.0 (https://asechka-website.vercel.app)");web.setWebViewClient(new WebViewClient(){public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){return true;}public void onPageFinished(WebView w,String url){renderMap(w);}});try{String html=new String(readAsset("map/index.html"),StandardCharsets.UTF_8).replace("/* LEAFLET */",new String(readAsset("map/leaflet.js"),StandardCharsets.UTF_8)).replace("/* LEAFLET_CSS */",new String(readAsset("map/leaflet.css"),StandardCharsets.UTF_8));web.loadDataWithBaseURL(ApiClient.SITE+"/",html,"text/html","UTF-8",null);}catch(Exception ignored){}return web;}
  byte[] readAsset(String name)throws Exception{try(java.io.InputStream in=activity.getAssets().open(name);java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);return out.toByteArray();}}
  boolean enabled(){JSONObject c=api.store.read("live-location-consent");return c!=null&&c.optBoolean("enabled");}
  final Runnable poll=new Runnable(){public void run(){if(closed)return;refresh();main.postDelayed(this,10_000);}};
  void refresh(){if(busy)return;busy=true;io.execute(()->{try{JSONObject c=api.store.read("live-location-consent");if(c!=null&&!c.optBoolean("enabled")){try{api.location(OfflineStore.json("action","stop","actor",c.getString("actor"),"token",c.getString("token")));api.store.remove("live-location-consent");}catch(ApiClient.ApiError e){if(e.status==409)api.store.remove("live-location-consent");}}JSONObject value=api.location(null);main.post(()->{if(!closed){snapshot=value;render();}});}catch(Exception ignored){}finally{main.post(()->busy=false);}});}
  void render(){toggle.setText(enabled()?"Stop":"Share");JSONArray people=snapshot.optJSONArray("people");StringBuilder text=new StringBuilder();for(int i=0;people!=null&&i<people.length();i++){JSONObject p=people.optJSONObject(i),point=p.optJSONObject("position");if(i>0)text.append("     ");text.append(p.optString("actor").equals("asnat")?"A · ":"Y · ");if(point==null)text.append(p.optBoolean("sharing")?"waiting for GPS":"not sharing");else{long age=Math.max(0,(System.currentTimeMillis()-point.optLong("capturedAt"))/1000);text.append(age<60?"Live · ±"+point.optInt("accuracy")+"m":age/60+"m ago · paused");}}statuses.setText(text.toString());renderMap(map);}
  void renderMap(WebView web){if(snapshot!=null)web.evaluateJavascript("window.showPeople && window.showPeople("+snapshot.optJSONArray("people")+")",null);}
  void explain(){new AlertDialog.Builder(activity).setTitle("Share your live location?").setMessage("Your partner can see your location on Home. Sharing stays on until you stop it, including when Asechka is in the background. Android shows an ongoing notification with Stop. You can stop here anytime.").setNegativeButton("Cancel",null).setPositiveButton("Share until I stop",(d,w)->request()).show();}
  void request(){if(activity.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&activity.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){if(Build.VERSION.SDK_INT>=33)activity.requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION,android.Manifest.permission.ACCESS_COARSE_LOCATION,android.Manifest.permission.POST_NOTIFICATIONS},PERMISSION);else activity.requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION,android.Manifest.permission.ACCESS_COARSE_LOCATION},PERMISSION);return;}if(Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)activity.requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},2403);start();}
  void permission(int[] grants){boolean granted=false;for(int g:grants)if(g==PackageManager.PERMISSION_GRANTED)granted=true;if(granted)start();else Toast.makeText(activity,"Location permission was declined.",Toast.LENGTH_LONG).show();}
  void start(){if(busy)return;busy=true;String actor=activity.getSharedPreferences("preferences",0).getString("person","asnat");io.execute(()->{try{JSONObject value=api.location(OfflineStore.json("action","start","actor",actor));api.store.write("live-location-consent",OfflineStore.json("actor",actor,"token",value.getString("token"),"enabled",true));main.post(()->{resumeService(activity,api);snapshot=value;render();});}catch(Exception e){main.post(()->Toast.makeText(activity,e.getMessage(),Toast.LENGTH_LONG).show());}finally{main.post(()->busy=false);}});}
  void stop(){try{JSONObject c=api.store.read("live-location-consent");if(c!=null){c.put("enabled",false);api.store.write("live-location-consent",c);}activity.startService(new Intent(activity,LiveLocationService.class).setAction(LiveLocationService.STOP));toggle.setText("Share");statuses.setText("Sharing stopped here · removing the shared pin…");}catch(Exception e){Toast.makeText(activity,e.getMessage(),Toast.LENGTH_LONG).show();}refresh();}
  static void resumeService(Activity activity,ApiClient api){JSONObject c=api.store.read("live-location-consent");if(c==null||!c.optBoolean("enabled"))return;try{Intent intent=new Intent(activity,LiveLocationService.class);if(Build.VERSION.SDK_INT>=26)activity.startForegroundService(intent);else activity.startService(intent);}catch(RuntimeException ignored){}}
  void close(){closed=true;main.removeCallbacksAndMessages(null);if(map!=null){map.stopLoading();map.destroy();}io.shutdown();}
}
