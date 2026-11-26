package app.asechka.android;

import android.Manifest;
import android.app.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.hardware.Camera;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Native shared film camera. 8-shot weekly rolls with Sunday 8 PM ET auto-develop & Save to Pictures. */
@SuppressWarnings("deprecation")
public final class DisposableCameraActivity extends Activity {
  private ApiClient api;
  private Ui u;
  private Images images;
  private LinearLayout root;
  private JSONObject collection = new JSONObject(), pending;
  private final ExecutorService work = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private boolean busy, visible;
  private String notice = "Connecting our shared camera…", createId = UUID.randomUUID().toString(), rollName = "";
  private Dialog cameraDialog;
  private Camera camera;
  private SurfaceView preview;
  private int cameraId = 0, imageRotation = 90;
  private EditText caption;
  private Button shutter;
  private final Runnable poll = new Runnable() { public void run() { if (visible) { refresh(); main.postDelayed(this, 15000); } } };

  @Override public void onCreate(Bundle state) {
    super.onCreate(state); api = new ApiClient(this); u = new Ui(this); images = new Images(api);
    getWindow().setStatusBarColor(Ui.BG); getWindow().setNavigationBarColor(Ui.BG);
    if (!api.canOpen()) { finish(); return; }
    JSONObject cached = api.store.read("film-collection"); if (cached != null) collection = cached;
    pending = api.store.read("film-pending"); render();
  }
  private String actor() { return getSharedPreferences("preferences", 0).getString("person", "asnat"); }
  private JSONArray rolls() { JSONArray rolls = collection.optJSONArray("rolls"); return rolls == null ? new JSONArray() : rolls; }
  private JSONObject current() { for (int i=0; i<rolls().length(); i++) { JSONObject roll=rolls().optJSONObject(i); if (roll != null && roll.isNull("developedAt")) return roll; } return null; }
  private JSONArray shots(JSONObject roll) { JSONArray shots=roll.optJSONArray("shots"); return shots == null ? new JSONArray() : shots; }
  private int capacity(JSONObject roll) { if (roll == null) return collection.optInt("rollSize", 8); int c = roll.optInt("capacity", 0); if (c > 0) return c; return shots(roll).length() > 8 ? 24 : 8; }
  private String person(String actor) { return actor.equals("asnat") ? "Asnat" : "Youssef"; }
  private static String shortDate(String value) { return value != null && value.length() >= 10 ? value.substring(0, 10) : (value == null ? "" : value); }
  private static String reactionText(JSONObject reactions, String key) { if (reactions == null) return "—"; String v = reactions.optString(key, ""); return v.isEmpty() ? "—" : v; }
  private void render() {
    if (isFinishing() || root != null && cameraDialog != null && cameraDialog.isShowing()) return;
    root=u.column(); root.setPadding(u.dp(22),u.dp(24),u.dp(22),u.dp(30)); root.setBackgroundColor(Ui.BG);
    LinearLayout bar=u.row();bar.addView(u.title("Our disposable camera",17),new LinearLayout.LayoutParams(0,-2,1));bar.addView(u.textButton("Done",this::finish));u.add(root,bar,0);
    JSONObject roll=current(); int cap=capacity(roll); int count=roll == null ? 0 : shots(roll).length();
    u.add(root,u.title(cap+" moments.\nA little surprise.",33),18);
    u.add(root,u.text("One camera for both of us. No previews. No retakes. Develops at "+cap+" shots or Sunday 8 PM Eastern.",16,Ui.MUTED),12);
    LinearLayout shell=u.card(root,Ui.PALE); shell.setBackground(u.shape(Ui.PALE,24,0x1f6b5cb5));
    u.add(shell,u.label("ASECHKA / "+cap),0);
    TextView lens=u.text("◉    "+String.format(Locale.US,"%02d",Math.max(0,cap-count)),62,Ui.INK); lens.setGravity(Gravity.CENTER); u.add(shell,lens,14);
    u.add(shell,u.title(roll == null ? "Our next little adventure" : roll.optString("title"),22),12);
    u.add(shell,u.text(count+" of "+cap+" moments kept",13,Ui.MUTED),9);
    int rows = (cap + 7) / 8;
    for (int row=0; row<rows; row++) {
      LinearLayout strip=u.row(5);
      for(int col=0;col<8;col++) {
        int index=row*8+col;
        if (index >= cap) break;
        TextView slot=u.text(index<count ? "♡" : String.valueOf(index+1),12,index<count ? Color.WHITE : Ui.MUTED);
        slot.setGravity(Gravity.CENTER);
        slot.setBackground(u.shape(index<count ? Ui.PURPLE : Color.WHITE,6));
        strip.addView(slot,new LinearLayout.LayoutParams(0,u.dp(32),1));
      }
      u.add(shell,strip,6);
    }
    if(roll == null) {
      EditText title=u.input("Name our next roll",rollName,80,false);title.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){rollName=s.toString();}public void afterTextChanged(android.text.Editable s){}});u.add(shell,title,15);
      Button load=u.button("Load a fresh roll ↗",true,()->{String value=title.getText().toString().trim();if(value.isEmpty()){title.setError("Give our roll a name");return;}try{submit(new JSONObject().put("action","create").put("title",value).put("actor",actor()).put("operationId",createId),false);}catch(Exception e){failure(e);}});load.setEnabled(!busy && collection.optBoolean("writable") && pending==null);u.add(shell,load,12);
    } else {
      Button action=u.button(count>=cap ? "Develop our "+count+" moments ✦" : "Take a secret photo ●",true,()->{if(count>=cap){try{submit(new JSONObject().put("action","develop").put("rollId",roll.optString("id")).put("actor",actor()).put("operationId",UUID.randomUUID().toString()),false);}catch(Exception e){failure(e);}}else openCamera();});action.setEnabled(!busy && collection.optBoolean("writable") && pending==null);u.add(shell,action,16);
      if (count >= 1 && count < cap) {
        Button early = u.button("Develop early now ("+count+" shots) ✦", false, () -> {
          new AlertDialog.Builder(this).setTitle("Develop this roll early?").setMessage("Reveal all "+count+" kept moments right now and open a fresh 8-shot roll?").setNegativeButton("Keep shooting", null).setPositiveButton("Develop now ✦", (d, w) -> {
            try { submit(new JSONObject().put("action","develop").put("rollId",roll.optString("id")).put("actor",actor()).put("early",true).put("operationId",UUID.randomUUID().toString()), false); } catch (Exception e) { failure(e); }
          }).show();
        });
        early.setEnabled(!busy && collection.optBoolean("writable") && pending==null);
        u.add(shell, early, 8);
      }
      int her=0;for(int i=0;i<shots(roll).length();i++)if(shots(roll).optJSONObject(i).optString("actor").equals("asnat"))her++;
      u.add(shell,u.text("Asnat "+her+" · Youssef "+(count-her),12,Ui.MUTED),10);
    }
    u.add(shell,u.text("Shooting as "+person(actor())+". Pictures stay sealed until developed or Sunday 8 PM Eastern.",12,Ui.MUTED),14);
    u.add(root,u.text(notice,14,Ui.PURPLE),16);
    if(pending != null){Button retry=u.button("Retry saving our sealed shot",true,()->submit(pending,true));retry.setEnabled(!busy);u.add(root,retry,10);Button discard=u.button("Discard unsent shot",false,()->new AlertDialog.Builder(this).setTitle("Discard this unsent shot?").setMessage("A server copy, if already saved, stays on the roll.").setNegativeButton("Keep it",null).setPositiveButton("Discard local copy",(d,w)->{api.store.remove("film-pending");pending=null;render();refresh();}).show());discard.setEnabled(!busy);u.add(root,discard,8);}
    u.add(root,u.button("Refresh our camera ↻",false,this::refresh),12);
    u.add(root,u.label("OUR DEVELOPED ROLLS"),28);
    int albums=0;for(int i=rolls().length()-1;i>=0;i--){JSONObject item=rolls().optJSONObject(i);if(item!=null&&!item.isNull("developedAt")){albums++;LinearLayout card=u.card(root,Color.WHITE);u.add(card,u.title(item.optString("title"),20),0);u.add(card,u.text(shots(item).length()+" moments · "+shortDate(item.optString("developedAt")),12,Ui.MUTED),8);u.add(card,u.button("Open our roll ↗",false,()->album(item,0)),12);}}
    if(albums==0)u.add(root,u.text("Your first developed roll will live here.",14,Ui.MUTED),18);
    setContentView(u.scroll(root));
  }
  private void failure(Exception error){notice=error.getMessage()==null ? "Our camera needs a moment. Try again." : error.getMessage();render();}
  private void refresh(){if(busy||!visible)return;busy=true;work.execute(()->{try{if(!api.connected())throw new Exception("Offline · showing our saved rolls. Connect to take a new shot.");JSONObject result=api.get("/api/camera");api.store.write("film-collection",result);api.store.snapshot("/api/camera",result);main.post(()->{collection=result;busy=false;if(pending==null)notice="Connected. Our ordinary, extraordinary life. ♡";render();});}catch(Exception e){main.post(()->{busy=false;failure(e);});}});}
  private void submit(JSONObject body,boolean shot){if(busy||body==null)return;busy=true;notice="Keeping our moment…";render();work.execute(()->{try{JSONObject result=api.post("/api/camera",body);api.store.write("film-collection",result);api.store.snapshot("/api/camera",result);if(shot)api.store.remove("film-pending");main.post(()->{collection=result;busy=false;if(shot)pending=null;if(body.optString("action").equals("create"))createId=UUID.randomUUID().toString();notice=shot ? "A moment kept. You’ll see it when we develop the roll. ♡" : body.optString("action").equals("develop") ? "Developed. Open our roll together below. ♡" : "Saved for both of us. ♡";render();});}catch(Exception e){main.post(()->{busy=false;failure(e);});}});}
  private void album(JSONObject roll,int index){
    JSONArray all=shots(roll);int total=all.length();if(total==0)return;int currentIndex=Math.max(0,Math.min(index,total-1));
    JSONObject shot=all.optJSONObject(currentIndex);if(shot==null)return;
    Ui.Sheet sheet=u.sheet(roll.optString("title"),"FRAME "+(currentIndex+1)+" / "+total);
    ImageView photo=new ImageView(this);photo.setAdjustViewBounds(true);photo.setScaleType(ImageView.ScaleType.FIT_CENTER);photo.setMinimumHeight(u.dp(220));u.add(sheet.items,photo,0);images.load("/api/camera?photo="+shot.optString("id"),photo);
    u.add(sheet.items,u.text("From "+person(shot.optString("actor"))+" · "+shortDate(shot.optString("createdAt")),12,Ui.MUTED),10);
    if(!shot.optString("caption").isEmpty())u.add(sheet.items,u.text(shot.optString("caption"),18,Ui.INK),12);
    JSONObject reactions=shot.optJSONObject("reactions");TextView summary=u.text("Asnat "+reactionText(reactions,"asnat")+" · Youssef "+reactionText(reactions,"youssef"),13,Ui.PURPLE);
    LinearLayout react=u.row(6);for(String emoji:new String[]{"♡","😂","🥹","✨"}){boolean selected=reactions!=null&&emoji.equals(reactions.optString(actor()));Button b=u.button(emoji,selected,()->{if(busy)return;busy=true;react.setEnabled(false);work.execute(()->{try{JSONObject body=new JSONObject().put("action","react").put("rollId",roll.optString("id")).put("shotId",shot.optString("id")).put("actor",actor()).put("reaction",selected?"":emoji).put("operationId",UUID.randomUUID().toString());JSONObject result=api.post("/api/camera",body);api.store.write("film-collection",result);main.post(()->{busy=false;collection=result;sheet.dismiss();for(int i=0;i<rolls().length();i++)if(rolls().optJSONObject(i).optString("id").equals(roll.optString("id"))){album(rolls().optJSONObject(i),currentIndex);break;}render();});}catch(Exception e){main.post(()->{busy=false;summary.setText(e.getMessage());react.setEnabled(true);});}});});react.addView(b,new LinearLayout.LayoutParams(0,-2,1));}u.add(sheet.items,react,12);u.add(sheet.items,summary,10);
    Button saveToTimeline = u.button("Save to our Photos timeline ♡", false, null);
    saveToTimeline.setOnClickListener(v -> {
      saveToTimeline.setEnabled(false); saveToTimeline.setText("Saving to Photos…");
      work.execute(() -> {
        try {
          byte[] raw = api.image("/api/camera?photo=" + shot.optString("id"));
          String encoded = "data:image/jpeg;base64," + android.util.Base64.encodeToString(raw, android.util.Base64.NO_WRAP);
          String date = shortDate(shot.optString("createdAt"));
          if (date.length() < 10) date = HeartCounts.day(System.currentTimeMillis());
          String capText = shot.optString("caption").isEmpty() ? roll.optString("title") : shot.optString("caption");
          api.post("/api/memories", new JSONObject().put("action","addPhoto").put("date",date).put("author",shot.optString("actor",actor())).put("caption",capText).put("collection","memories").put("photo",encoded).put("operationId",UUID.randomUUID().toString()));
          main.post(() -> { saveToTimeline.setText("Saved to Photos ♡"); Toast.makeText(this, "Saved to our Photos timeline ♡", Toast.LENGTH_SHORT).show(); });
        } catch (Exception e) {
          main.post(() -> { saveToTimeline.setEnabled(true); saveToTimeline.setText("Save to our Photos timeline ♡"); Toast.makeText(this, e.getMessage() == null ? "Couldn’t save yet." : e.getMessage(), Toast.LENGTH_SHORT).show(); });
        }
      });
    });
    u.add(sheet.items, saveToTimeline, 12);
    LinearLayout navigation=u.row(8);Button back=u.button("← Previous",false,()->{sheet.dismiss();album(roll,currentIndex-1);}),next=u.button("Next moment →",false,()->{sheet.dismiss();album(roll,currentIndex+1);});back.setEnabled(currentIndex>0);next.setEnabled(currentIndex<total-1);navigation.addView(back,new LinearLayout.LayoutParams(0,-2,1));navigation.addView(next,new LinearLayout.LayoutParams(0,-2,1));u.add(sheet.items,navigation,14);sheet.show();
  }
  private void openCamera(){
    if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA},244);return;}
    if(Camera.getNumberOfCameras()==0){notice="This device doesn’t have an available camera.";render();return;}
    cameraDialog=new Dialog(this,android.R.style.Theme_Material_Light_NoActionBar);LinearLayout surface=u.column();surface.setPadding(u.dp(18),u.dp(18),u.dp(18),u.dp(24));surface.setBackgroundColor(Ui.BG);
    u.add(surface,u.button("← Close camera",false,()->cameraDialog.dismiss()),0);u.add(surface,u.title("Keep this moment.",26),12);
    preview=new SurfaceView(this);surface.addView(preview,new LinearLayout.LayoutParams(-1,0,1));
    caption=u.input("A note for later · optional","",240,false);u.add(surface,caption,12);
    shutter=u.button("Keep this moment ●",true,this::take);shutter.setEnabled(false);u.add(surface,shutter,10);
    Button flip=u.button("Flip camera ↻",false,()->{if(Camera.getNumberOfCameras()>1){releaseCamera();cameraId=(cameraId+1)%Camera.getNumberOfCameras();startCamera();}});u.add(surface,flip,8);u.add(surface,u.text("No previews. No retakes. Just a little surprise.",12,Ui.MUTED),8);
    preview.getHolder().addCallback(new SurfaceHolder.Callback(){public void surfaceCreated(SurfaceHolder holder){startCamera();}public void surfaceChanged(SurfaceHolder holder,int format,int width,int height){}public void surfaceDestroyed(SurfaceHolder holder){releaseCamera();}});
    cameraDialog.setContentView(surface);cameraDialog.setOnDismissListener(d->{releaseCamera();cameraDialog=null;render();});cameraDialog.show();cameraDialog.getWindow().setLayout(-1,-1);
  }
  private void startCamera(){try{
    camera=Camera.open(cameraId);Camera.CameraInfo info=new Camera.CameraInfo();Camera.getCameraInfo(cameraId,info);int degrees=getWindowManager().getDefaultDisplay().getRotation()*90;int rotation=info.facing==Camera.CameraInfo.CAMERA_FACING_FRONT ? (360-(info.orientation+degrees)%360)%360 : (info.orientation-degrees+360)%360;camera.setDisplayOrientation(rotation);imageRotation=info.facing==Camera.CameraInfo.CAMERA_FACING_FRONT ? (info.orientation-degrees+360)%360 : (info.orientation+degrees)%360;
    Camera.Parameters params=camera.getParameters();List<Camera.Size> sizes=params.getSupportedPictureSizes();Camera.Size best=null;for(Camera.Size size:sizes)if(size.width<=2000&&(best==null||size.width>best.width))best=size;if(best!=null)params.setPictureSize(best.width,best.height);if(params.getSupportedFocusModes().contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE))params.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);params.setJpegQuality(88);params.setRotation(0);camera.setParameters(params);camera.setPreviewDisplay(preview.getHolder());camera.startPreview();shutter.setEnabled(true);
  }catch(Exception e){releaseCamera();notice="Couldn’t open the camera. Check camera permission and try again.";if(cameraDialog!=null)cameraDialog.dismiss();render();}}
  private void releaseCamera(){if(camera!=null){try{camera.stopPreview();}catch(Exception ignored){}camera.release();camera=null;}}
  private void take(){if(camera==null||busy||pending!=null)return;JSONObject roll=current();if(roll==null)return;String note=caption.getText().toString(),rollId=roll.optString("id"),who=actor(),operation=UUID.randomUUID().toString();int rotate=imageRotation;shutter.setEnabled(false);busy=true;
    try{camera.takePicture(null,null,(bytes,source)->{if(cameraDialog!=null)cameraDialog.dismiss();notice="Sealing our moment…";render();work.execute(()->{try{String photo=prepare(bytes,rotate);JSONObject body=new JSONObject().put("action","capture").put("rollId",rollId).put("actor",who).put("operationId",operation).put("caption",note).put("photo",photo);api.store.write("film-pending",body);main.post(()->{pending=body;busy=false;submit(body,true);});}catch(Exception e){main.post(()->{busy=false;failure(e);});}});});}catch(Exception e){busy=false;shutter.setEnabled(true);failure(e);}
  }
  private String prepare(byte[] bytes,int rotation)throws Exception{
    BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);bounds.inSampleSize=1;while(Math.max(bounds.outWidth,bounds.outHeight)/bounds.inSampleSize>1800)bounds.inSampleSize*=2;bounds.inJustDecodeBounds=false;Bitmap decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);if(decoded==null)throw new Exception("This frame couldn’t be read.");Matrix matrix=new Matrix();matrix.postRotate(rotation);Bitmap bitmap=Bitmap.createBitmap(decoded,0,0,decoded.getWidth(),decoded.getHeight(),matrix,true);if(bitmap!=decoded)decoded.recycle();
    try{for(int shrink=0;shrink<5;shrink++){for(int quality=86;quality>=30;quality-=8){ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,quality,out);if(out.size()<=310000)return "data:image/jpeg;base64,"+android.util.Base64.encodeToString(out.toByteArray(),android.util.Base64.NO_WRAP);}Bitmap smaller=Bitmap.createScaledBitmap(bitmap,Math.max(1,(int)(bitmap.getWidth()*.7)),Math.max(1,(int)(bitmap.getHeight()*.7)),true);bitmap.recycle();bitmap=smaller;}throw new Exception("This frame needs a smaller copy. Try again.");}finally{bitmap.recycle();}
  }
  @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==244){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)openCamera();else{notice="Allow camera access in Android Settings to keep a moment.";render();}}}
  @Override protected void onResume(){super.onResume();visible=true;main.removeCallbacks(poll);poll.run();}
  @Override protected void onPause(){visible=false;main.removeCallbacks(poll);if(cameraDialog!=null)cameraDialog.dismiss();releaseCamera();super.onPause();}
  @Override protected void onStop(){super.onStop();if(new BiometricDoor(this,api.store).enabled()){getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);finish();}}
  @Override protected void onDestroy(){main.removeCallbacks(poll);images.close();work.shutdown();super.onDestroy();}
}
