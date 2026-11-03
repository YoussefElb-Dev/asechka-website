package app.asechka.android;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;

/** The shared vault UI uses the authenticated site; media is never cached for offline viewing. */
public final class TimeVaultActivity extends Activity {
  private ApiClient api;private boolean permissionPrompt;private WebView web;private ValueCallback<Uri[]> chooser;private PermissionRequest camera;private GeolocationPermissions.Callback geo;private String geoOrigin;
  private static final int PICK=2410,CAMERA=2411,LOCATION=2412;
  public void onCreate(Bundle state){super.onCreate(state);api=new ApiClient(this);if(!api.signedIn()){Toast.makeText(this,"Connect and open our little door to use the vault.",Toast.LENGTH_LONG).show();finish();return;}
    Ui u=new Ui(this);LinearLayout root=u.column();root.setBackgroundColor(Ui.BG);Button back=u.button("← Our time vault · Close",false,this::finish);root.addView(back,new LinearLayout.LayoutParams(-1,u.dp(48)));web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
    WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setGeolocationEnabled(true);settings.setMediaPlaybackRequiresUserGesture(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
    web.setWebViewClient(new WebViewClient(){public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){Uri uri=r.getUrl();return !"https".equals(uri.getScheme())||!"asechka-website.vercel.app".equals(uri.getHost());}public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){String actor=getSharedPreferences("preferences",0).getString("person","asnat");web.evaluateJavascript("window.AsechkaActor="+org.json.JSONObject.quote(actor)+";",null);}});
    web.setWebChromeClient(new WebChromeClient(){public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){if(chooser!=null)chooser.onReceiveValue(null);chooser=callback;Intent pick=new Intent(Intent.ACTION_GET_CONTENT);pick.setType("*/*");pick.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","video/*"});pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);pick.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(Intent.createChooser(pick,"Seal pictures or videos"),PICK);return true;}
      public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{if(!ApiClient.SITE.equals(request.getOrigin().toString().replaceAll("/$",""))){request.deny();return;}boolean video=false;for(String resource:request.getResources())if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource))video=true;if(!video){request.deny();return;}camera=request;if(checkSelfPermission(android.Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)grantCamera();else{permissionPrompt=true;requestPermissions(new String[]{android.Manifest.permission.CAMERA},CAMERA);}});}
      public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){if(!origin.replaceAll("/$","").equals(ApiClient.SITE)){callback.invoke(origin,false,false);return;}geo=callback;geoOrigin=origin;if(locationAllowed())geo.invoke(origin,true,false);else{permissionPrompt=true;requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION,android.Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION);}}
    });
    CookieManager.getInstance().setCookie(ApiClient.SITE,api.webCookie()+"; Path=/; Secure; HttpOnly; SameSite=Strict",value->web.loadUrl(ApiClient.SITE+"/vault.html"));
  }
  private boolean locationAllowed(){return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
  private void grantCamera(){if(camera!=null){camera.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});camera=null;}}
  public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);permissionPrompt=false;if(request==CAMERA&&camera!=null){if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)grantCamera();else{camera.deny();camera=null;}}if(request==LOCATION&&geo!=null){geo.invoke(geoOrigin,locationAllowed(),false);geo=null;}}
  protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==PICK&&chooser!=null){Uri[] values=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){values=new Uri[data.getClipData().getItemCount()];for(int i=0;i<values.length;i++)values[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)values=new Uri[]{data.getData()};}chooser.onReceiveValue(values);chooser=null;}}
  protected void onPause(){super.onPause();if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))",null);getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);}
  protected void onResume(){super.onResume();getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);}
  protected void onStop(){super.onStop();if(chooser==null&&!permissionPrompt&&api!=null&&new BiometricDoor(this,api.store).enabled())finish();}
  protected void onDestroy(){if(chooser!=null)chooser.onReceiveValue(null);if(camera!=null)camera.deny();if(web!=null){web.loadUrl("about:blank");web.clearCache(true);web.destroy();}super.onDestroy();}
}
