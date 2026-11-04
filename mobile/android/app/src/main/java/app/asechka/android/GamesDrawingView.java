package app.asechka.android;

import android.content.*;
import android.graphics.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;

/** A shared canvas for our existing two profiles. Strokes are batched while drawing. */
final class GamesDrawingView extends LinearLayout {
  private final GamesClient client;private final Ui ui;private JSONObject room,state;private final TextView status,word,chat;private final LinearLayout controls;private final Pad pad;private final ArrayDeque<JSONObject> queue=new ArrayDeque<>();
  private String phaseKey="";private boolean inflight,dispatching;private String inflightId="";private final ArrayList<JSONObject> preview=new ArrayList<>();
  private String tool="pen",color="#263451";private float width=.012f;private final Runnable clock=new Runnable(){public void run(){header();if(isShown())postDelayed(this,250);}};
  private static final String[] COLORS={"#263451","#a292cf","#cd8ca7","#76b4ab","#c5a576","#8cb4d5","#ffffff"};
  GamesDrawingView(Context c,GamesClient client){super(c);this.client=client;ui=new Ui(c);setOrientation(VERTICAL);status=label("",14);word=label("",22);word.setGravity(Gravity.CENTER);addView(status);addView(word);pad=new Pad(c);addView(pad,new LayoutParams(-1,dp(285)));controls=new LinearLayout(c);controls.setOrientation(VERTICAL);addView(controls);chat=label("",14);chat.setPadding(dp(12),dp(12),dp(12),dp(12));chat.setBackground(ui.shape(Color.WHITE,16));chat.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);addView(chat);}
  String roomId(){return room==null?"":room.optString("id");}
  protected void onAttachedToWindow(){super.onAttachedToWindow();removeCallbacks(clock);post(clock);}
  protected void onDetachedFromWindow(){removeCallbacks(clock);super.onDetachedFromWindow();}
  private int dp(float n){return ui.dp(n);}private TextView label(String text,int size){TextView t=new TextView(getContext());t.setText(text);t.setTextSize(size);t.setTextColor(Ui.INK);t.setPadding(0,dp(8),0,dp(8));return t;}
  private Button button(String text,Runnable action){Button b=ui.button(text,false,action);b.setMinHeight(dp(44));return b;}
  private boolean artist(){return state!=null&&state.optInt("drawer")==GamesData.player(room,client.actor);}
  private boolean drawing(){return state!=null&&"draw".equals(state.optString("phase"))&&artist()&&client.connected;}
  private void header(){if(room==null)return;JSONArray points=GamesData.array(state,"points"),players=GamesData.array(room,"players");String a=players.length()>0?GamesData.name(players.optJSONObject(0).optString("actor")):"",b=players.length()>1?GamesData.name(players.optJSONObject(1).optString("actor")):"";long seconds=Math.max(0,(state.optLong("deadline")-System.currentTimeMillis()+999)/1000);status.setText("Round "+state.optInt("round")+" / "+state.optInt("rounds")+" · "+seconds+"s\n"+a+" "+points.optInt(0)+" · "+b+" "+points.optInt(1)+(client.connected?"":"\nReconnecting…"));word.setText("choose".equals(state.optString("phase"))?(artist()?"Choose a word":"Your partner is choosing…"):state.isNull("word")?state.optString("pattern").replace("_","_ "):state.optString("word"));}
  void update(JSONObject room){
    this.room=room;this.state=GamesData.state(room);header();
    if(!dispatching&&inflight&&(client.pending==null||!inflightId.equals(client.pending.optString("id")))){inflight=false;if(!preview.isEmpty())preview.remove(0);}
    String key=room.optString("id")+":"+state.optString("phase")+":"+state.optInt("drawer")+":"+client.connected;
    if(!key.equals(phaseKey)){phaseKey=key;queue.clear();preview.clear();inflight=false;pad.draft.clear();buildControls();}
    pad.render();StringBuilder text=new StringBuilder();JSONArray lines=GamesData.array(state,"chat"),players=GamesData.array(room,"players");for(int i=Math.max(0,lines.length()-6);i<lines.length();i++){JSONObject line=lines.optJSONObject(i);int p=line.optInt("player");text.append(p<players.length()?GamesData.name(players.optJSONObject(p).optString("actor")):"Us").append(": ").append(line.optString("text")).append("close".equals(line.optString("kind"))?" · so close!":"").append('\n');}if("reveal".equals(state.optString("phase"))){JSONObject result=state.optJSONObject("lastResult");text.append(result.optBoolean("correct")?"Guessed it! +"+result.optInt("guessPoints")+" / artist +"+result.optInt("drawPoints"):"Time is up. The word was "+state.optString("word")).append("\nNext turn shortly…");}if(!client.error.isEmpty())text.append(client.error);chat.setText(text.toString());flush();
  }
  private void buildControls(){controls.removeAllViews();String phase=state.optString("phase");if("choose".equals(phase)){if(artist()){JSONArray choices=GamesData.array(state,"choices");for(int i=0;i<choices.length();i++){final int index=i;controls.addView(button(choices.optString(i),()->send(GamesData.obj("type","choose","index",index))));}}return;}
    if("finished".equals(phase)){controls.addView(label(GamesData.result(room,client.actor),18));controls.addView(button("Play again",()->client.command("rematch",GamesData.obj("room",room.optString("id")))));return;}
    if(!"draw".equals(phase))return;
    if(artist()){
      LinearLayout colors=new LinearLayout(getContext());for(String value:COLORS){Button b=button("●",()->{color=value;tool="pen";});b.setTextColor(Color.parseColor(value));b.setContentDescription("Brush color "+value);colors.addView(b,new LayoutParams(0,dp(44),1));}controls.addView(colors);
      Spinner tools=new Spinner(getContext());tools.setAdapter(new ArrayAdapter<String>(getContext(),android.R.layout.simple_spinner_dropdown_item,new String[]{"Pen","Eraser","Bucket fill"}));tools.setContentDescription("Drawing tool");tools.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> a,View v,int i,long id){tool=new String[]{"pen","eraser","fill"}[i];}public void onNothingSelected(AdapterView<?> a){}});controls.addView(tools);
      SeekBar size=new SeekBar(getContext());size.setMax(38);size.setProgress(5);size.setContentDescription("Brush width");size.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar b,int n,boolean u){width=(n+2)/1000f;}public void onStartTrackingTouch(SeekBar b){}public void onStopTrackingTouch(SeekBar b){}});controls.addView(size);
      LinearLayout actions=new LinearLayout(getContext());actions.addView(button("Undo",()->enqueue(GamesData.obj("type","undo"))),new LayoutParams(0,dp(48),1));actions.addView(button("Clear",()->enqueue(GamesData.obj("type","clear"))),new LayoutParams(0,dp(48),1));controls.addView(actions);
    }else{
      LinearLayout row=new LinearLayout(getContext());EditText guess=ui.input("Type your guess","",80,false);guess.setSingleLine();guess.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_AUTO_CORRECT);row.addView(guess,new LayoutParams(0,dp(52),1));Runnable submit=()->{String text=guess.getText().toString().trim();if(!text.isEmpty()&&client.pending==null&&client.connected){send(GamesData.obj("type","guess","text",text));guess.setText("");}};row.addView(button("Guess",submit));guess.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEND);guess.setOnEditorActionListener((v,i,e)->{submit.run();return true;});controls.addView(row);
    }
  }
  private void send(JSONObject action){if(client.pending==null&&client.connected)client.move(room,action);}
  private void enqueue(JSONObject action){if(queue.size()>80)return;queue.add(action);preview.add(action);pad.invalidate();flush();}
  private void flush(){if(!dispatching&&!queue.isEmpty()&&client.pending==null&&drawing()){JSONObject next=queue.remove();inflight=true;dispatching=true;client.move(room,next);inflightId=client.pending==null?"":client.pending.optString("id");dispatching=false;}}
  private final class Pad extends View {
    final Paint paint=new Paint(3);final Bitmap bitmap=Bitmap.createBitmap(640,480,Bitmap.Config.ARGB_8888);final Canvas canvas=new Canvas(bitmap);final ArrayList<float[]> draft=new ArrayList<>();String rendered="";long lastBatch;String strokeTool,strokeColor;float strokeWidth;
    Pad(Context c){super(c);setContentDescription("Shared drawing canvas");setBackground(ui.shape(Color.WHITE,14));setClipToOutline(true);bitmap.eraseColor(Color.WHITE);}
    void render(){String value=GamesData.array(state,"strokes").toString();if(!value.equals(rendered)){rendered=value;bitmap.eraseColor(Color.WHITE);JSONArray strokes=GamesData.array(state,"strokes");for(int i=0;i<strokes.length();i++)paintStroke(canvas,strokes.optJSONObject(i));}invalidate();}
    protected void onDraw(Canvas c){c.save();c.scale(getWidth()/640f,getHeight()/480f);c.drawBitmap(bitmap,0,0,paint);for(JSONObject stroke:preview)paintStroke(c,stroke);if(!draft.isEmpty())paintStroke(c,action());c.restore();}
    JSONObject action(){JSONArray points=new JSONArray();for(float[] p:draft){try{points.put(new JSONArray().put(p[0]).put(p[1]));}catch(JSONException ignored){}}return GamesData.obj("type","stroke","tool",strokeTool,"color",strokeColor,"width",strokeWidth,"points",points);}
    public boolean onTouchEvent(MotionEvent e){if(!drawing())return true;int type=e.getActionMasked();if(type==MotionEvent.ACTION_DOWN){getParent().requestDisallowInterceptTouchEvent(true);draft.clear();strokeTool=tool;strokeColor=color;strokeWidth=width;lastBatch=System.currentTimeMillis();}
      if(type==MotionEvent.ACTION_DOWN||type==MotionEvent.ACTION_MOVE||type==MotionEvent.ACTION_UP){float x=Math.max(0,Math.min(1,e.getX()/getWidth())),y=Math.max(0,Math.min(1,e.getY()/getHeight()));draft.add(new float[]{x,y});if(type==MotionEvent.ACTION_UP||draft.size()>=100||(!"fill".equals(strokeTool)&&System.currentTimeMillis()-lastBatch>150&&draft.size()>2)){enqueue(action());draft.clear();if(type!=MotionEvent.ACTION_UP)draft.add(new float[]{x,y});lastBatch=System.currentTimeMillis();}invalidate();if(type==MotionEvent.ACTION_UP){getParent().requestDisallowInterceptTouchEvent(false);performClick();}return true;}if(type==MotionEvent.ACTION_CANCEL){draft.clear();getParent().requestDisallowInterceptTouchEvent(false);invalidate();}return true;}
    public boolean performClick(){super.performClick();return true;}
    void paintStroke(Canvas c,JSONObject stroke){if(stroke==null)return;String t=stroke.optString("type");if("clear".equals(t)){c.drawColor(Color.WHITE);return;}if("undo".equals(t))return;JSONArray points=GamesData.array(stroke,"points");if(points.length()==0)return;int color="eraser".equals(stroke.optString("tool"))?Color.WHITE:Color.parseColor(stroke.optString("color","#263451"));paint.setColor(color);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth((float)stroke.optDouble("width",.012)*640);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
      if("fill".equals(stroke.optString("tool"))){if(c==canvas){JSONArray point=points.optJSONArray(0);fill(Math.min(639,(int)(point.optDouble(0)*640)),Math.min(479,(int)(point.optDouble(1)*480)),color);}return;}
      Path path=new Path();JSONArray first=points.optJSONArray(0);float x=(float)first.optDouble(0)*640,y=(float)first.optDouble(1)*480;path.moveTo(x,y);if(points.length()==1){paint.setStyle(Paint.Style.FILL);c.drawCircle(x,y,paint.getStrokeWidth()/2,paint);}else{for(int i=1;i<points.length();i++){JSONArray point=points.optJSONArray(i);path.lineTo((float)point.optDouble(0)*640,(float)point.optDouble(1)*480);}c.drawPath(path,paint);}paint.setStyle(Paint.Style.FILL);}
    void fill(int x,int y,int replacement){int[] pixels=new int[640*480];bitmap.getPixels(pixels,0,640,0,0,640,480);int target=pixels[y*640+x];if(target==replacement)return;int[] stack=new int[pixels.length];int n=0;stack[n++]=y*640+x;pixels[y*640+x]=replacement;while(n>0){int pos=stack[--n],px=pos%640;for(int neighbor:new int[]{px>0?pos-1:-1,px<639?pos+1:-1,pos-640,pos+640})if(neighbor>=0&&neighbor<pixels.length&&pixels[neighbor]==target){pixels[neighbor]=replacement;stack[n++]=neighbor;}}bitmap.setPixels(pixels,0,640,0,0,640,480);}
  }
}
