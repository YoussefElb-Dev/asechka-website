package app.asechka.android;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import java.util.concurrent.*;
import org.json.*;

/** Explicitly enabled, visible foreground sharing; no route history is recorded. */
public final class LiveLocationService extends Service implements LocationListener {
  static final String STOP="app.asechka.STOP_LOCATION", CHANNEL="live-location";
  static final int NOTICE=2401;
  private ApiClient api;
  private LocationManager locations;
  private final ExecutorService writer=Executors.newSingleThreadExecutor();
  private final java.util.concurrent.atomic.AtomicBoolean sending=new java.util.concurrent.atomic.AtomicBoolean();
  private long lastSent;
  private boolean stopping;
  public void onCreate(){super.onCreate();api=new ApiClient(this);locations=(LocationManager)getSystemService(LOCATION_SERVICE);if(Build.VERSION.SDK_INT>=26){NotificationManager n=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);n.createNotificationChannel(new NotificationChannel(CHANNEL,"Live location sharing",NotificationManager.IMPORTANCE_LOW));}}
  public IBinder onBind(Intent intent){return null;}
  private Notification notification(String detail){
    PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,LiveLocationService.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
    return b.setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Asechka · location sharing is on").setContentText(detail).setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Stop sharing",stop).build()).build();
  }
  public int onStartCommand(Intent intent,int flags,int id){
    if(intent!=null&&STOP.equals(intent.getAction())){stopSharing();return START_NOT_STICKY;}
    JSONObject consent=api.store.read("live-location-consent");
    if(consent==null||!consent.optBoolean("enabled")||!permitted()){stopSelf();return START_NOT_STICKY;}
    try{
      if(Build.VERSION.SDK_INT>=29)startForeground(NOTICE,notification("Until you stop · updates in the background"),android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);else startForeground(NOTICE,notification("Until you stop · updates in the background"));
      if(checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED&&locations.isProviderEnabled(LocationManager.GPS_PROVIDER))locations.requestLocationUpdates(LocationManager.GPS_PROVIDER,10_000,0,this);
      if(locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER))locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,10_000,0,this);
    }catch(SecurityException|IllegalStateException error){stopSelf();return START_NOT_STICKY;}
    return START_STICKY;
  }
  private boolean permitted(){return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
  public void onLocationChanged(Location p){
    if(stopping||System.currentTimeMillis()-lastSent<8_000||System.currentTimeMillis()-p.getTime()>90_000||!sending.compareAndSet(false,true))return;lastSent=System.currentTimeMillis();
    writer.execute(()->{try{JSONObject c=api.store.read("live-location-consent");if(c==null||!c.optBoolean("enabled"))return;api.location(OfflineStore.json("action","update","actor",c.getString("actor"),"token",c.getString("token"),"position",OfflineStore.json("latitude",p.getLatitude(),"longitude",p.getLongitude(),"accuracy",(double)p.getAccuracy(),"capturedAt",p.getTime())));}catch(ApiClient.ApiError e){if(e.status==409){api.store.remove("live-location-consent");new Handler(Looper.getMainLooper()).post(()->{stopForeground(true);stopSelf();});}else if(e.status==401){new Handler(Looper.getMainLooper()).post(()->{((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTICE,notification("Sharing paused · open Asechka to sign in again"));});}}catch(Exception ignored){}finally{sending.set(false);}});
  }
  private void stopSharing(){stopping=true;try{JSONObject consent=api.store.read("live-location-consent");if(consent!=null){consent.put("enabled",false);api.store.write("live-location-consent",consent);}}catch(Exception ignored){}if(locations!=null)locations.removeUpdates(this);((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTICE,notification("Stopping · waiting for a connection if needed"));writer.execute(()->{try{JSONObject c=api.store.read("live-location-consent");if(c!=null){c.put("enabled",false);api.store.write("live-location-consent",c);api.location(OfflineStore.json("action","stop","actor",c.getString("actor"),"token",c.getString("token")));}api.store.remove("live-location-consent");}catch(Exception ignored){}finally{new Handler(Looper.getMainLooper()).post(()->{stopForeground(true);stopSelf();});}});}
  public void onStatusChanged(String provider,int status,Bundle extras){}
  public void onProviderEnabled(String provider){}
  public void onProviderDisabled(String provider){}
  public void onDestroy(){if(locations!=null)locations.removeUpdates(this);writer.shutdown();super.onDestroy();}
}
