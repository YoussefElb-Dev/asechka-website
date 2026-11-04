package app.asechka.android;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import org.json.*;

public final class UpdaterChecks extends Instrumentation {
  String mode;
  int checks;
  public void onCreate(Bundle args){super.onCreate(args);mode=args.getString("mode","verify");start();}
  void check(boolean ok,String message){if(!ok)throw new AssertionError(message);checks++;}
  public void onStart(){Bundle result=new Bundle();try{
    Context context=getTargetContext();
    File loginFile=new File(context.getFilesDir(),"updater-test-code");
    if(loginFile.exists()){String code=read(loginFile);loginFile.delete();new ApiClient(context).login(code.trim());}
    OfflineStore store=new OfflineStore(context,"updater-qa");
    if("after".equals(mode)){
      check("keep-me".equals(store.read("sentinel").getString("value")),"Encrypted content survived the update");
      check(AppUpdater.code(context.getPackageManager().getPackageInfo(context.getPackageName(),0))==28,"Updated version installed");
    }else{
      MainActivity activity=(MainActivity)startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      AppUpdater updater=new AppUpdater(activity);
      JSONObject info=new JSONObject(read(new File(context.getExternalFilesDir(null),"candidate.json")));
      File apk=new File(context.getExternalFilesDir(null),"candidate.apk");
      updater.verify(apk,info);check(true,"Signed candidate accepted");
      JSONObject wrong=new JSONObject(info.toString());wrong.put("sha256","0".repeat(64));
      try{updater.verify(apk,wrong);throw new AssertionError("Corrupt checksum accepted");}catch(IOException expected){checks++;}
      wrong=new JSONObject(info.toString());wrong.put("versionCode",9999);
      try{updater.verify(apk,wrong);throw new AssertionError("Wrong version accepted");}catch(IOException expected){checks++;}
      wrong=new JSONObject(info.toString());wrong.put("url","https://example.com/updates/update.apk");
      try{AppUpdater.validate(wrong);throw new AssertionError("External APK host accepted");}catch(IOException expected){checks++;}
      runOnMainSync(()->{
        Ui ui=new Ui(activity);EditText prose=ui.input("Write a caption","",1000,true);
        check((prose.getInputType()&android.text.InputType.TYPE_TEXT_FLAG_AUTO_CORRECT)!=0,"Writing field has spell suggestions");
        EditText password=ui.input("Code","",100,false);password.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        check((password.getInputType()&android.text.InputType.TYPE_TEXT_FLAG_AUTO_CORRECT)==0,"Code has no autocorrection");
        for(int width:new int[]{240,320,600}){
          WordTiles tiles=new WordTiles(activity,"pneumonoultramicroscopicsilicovolcanoconiosis a very long phrase");
          int px=(int)(width*context.getResources().getDisplayMetrics().density);
          tiles.measure(View.MeasureSpec.makeMeasureSpec(px,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));
          check(tiles.getMeasuredWidth()==px&&tiles.getMeasuredHeight()>46*context.getResources().getDisplayMetrics().density,"Long word wraps without scrolling at "+width);
        }
        LinearLayout preview=ui.column();preview.setPadding(24,24,24,24);preview.addView(ui.title("Between the Letters",22));
        GamesBoard board=new GamesBoard(activity,"asnat",new GamesBoard.Host(){public void move(JSONObject a){}public void selection(){}public void aim(float a){}public void charge(float p,boolean r){}});
        try{board.update(new JSONObject("{\"game\":\"hangman\",\"players\":[{\"actor\":\"asnat\"},{\"actor\":\"youssef\"}],\"state\":{\"remaining\":1,\"pattern\":\"anniversary\",\"setter\":0}}"),null,true);}catch(Exception e){throw new RuntimeException(e);}
        preview.addView(board,new LinearLayout.LayoutParams(-1,220));preview.addView(new WordTiles(activity,"anniversary"));preview.addView(new WordTiles(activity,"pneumonoultramicroscopicsilicovolcanoconiosis"));preview.addView(prose);activity.setContentView(preview);
      });
      store.write("sentinel",new JSONObject().put("value","keep-me"));
      Thread.sleep(1500);
      try(FileOutputStream image=new FileOutputStream(new File(context.getExternalFilesDir(null),"layout-preview.png"))){getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,image);}
      if("download".equals(mode)){
        runOnMainSync(()->{updater.resume();updater.download(info);});
        long end=System.currentTimeMillis()+60000;
        while(System.currentTimeMillis()<end){Thread.sleep(500);if(updater.apk().exists()&&!updater.busy)break;}
        check(updater.apk().exists(),"APK downloaded inside app");
        updater.verify(updater.apk(),info);check(true,"Downloaded APK independently verified");
        Thread.sleep(2000);
        android.view.accessibility.AccessibilityNodeInfo screen=getUiAutomation().getRootInActiveWindow();
        check(screen!=null&&!screen.findAccessibilityNodeInfosByText("Install").isEmpty(),"Android installation confirmation is visible");
        try(FileOutputStream image=new FileOutputStream(new File(context.getExternalFilesDir(null),"installer-preview.png"))){getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,image);}
        for(android.view.accessibility.AccessibilityNodeInfo button:screen.findAccessibilityNodeInfosByText("Install"))if(button.isClickable()&&"Install".contentEquals(button.getText()))button.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);
        Thread.sleep(5000);
      }else runOnMainSync(updater::close);
    }
    result.putString("stream","PASS: "+checks+" update, spelling and wrapping checks ("+mode+").\n");finish(Activity.RESULT_OK,result);
  }catch(Throwable e){result.putString("stream","FAIL: "+e+"\n"+android.util.Log.getStackTraceString(e));finish(Activity.RESULT_CANCELED,result);}}
  String read(File file)throws Exception{try(FileInputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}}
}
