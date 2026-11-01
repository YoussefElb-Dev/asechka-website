package app.asechka.android;

import android.content.*;
import android.graphics.*;
import android.os.Bundle;
import android.view.*;
import android.view.accessibility.*;
import java.util.*;
import org.json.*;

/** Real native boards. Touch input and drawing never wait for the network or disk. */
final class GamesBoard extends View {
  interface Host { void move(JSONObject action); void selection(); void aim(float radians); void charge(float power, boolean release); }
  private final Host host;
  private final String actor;
  private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final RectF field = new RectF(), ownField = new RectF();
  private JSONObject room = new JSONObject(), state = new JSONObject(), pending;
  private String game = "tictactoe";
  private boolean canMove;
  private int player, selected = -1, focused = -1, hovered = -1;
  final GamesFleet fleet = new GamesFleet();
  float angle = 0;
  private float downX, downY;
  private boolean draggingFleet, charging;
  private int dragCell = -1, dragOffset;
  private float gesturePower;
  private int animatedCell=-1,animatedFrom=-1;
  private long animationStarted;
  private final AccessibilityManager accessibility;
  private final BoardNodes nodes = new BoardNodes();

  GamesBoard(Context context, String actor, Host host) {
    super(context); this.actor = actor; this.host = host;
    setFocusable(true); setClickable(true); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
    accessibility = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
    setBackground(new Ui(context).shape(Color.WHITE,20));
    Motion.customTouch(this);
  }

  void update(JSONObject room, JSONObject pending, boolean online) {
    String oldId = this.room.optString("id");
    if (!oldId.equals(room.optString("id"))) { selected = -1; fleet.reset(); }
    if(oldId.equals(room.optString("id"))&&this.room.optLong("seq")!=room.optLong("seq")&&motion()){
      JSONArray before=GamesData.array(this.state,"board"),after=GamesData.array(GamesData.state(room),"board");
      animatedCell=animatedFrom=-1;
      if(before.length()==after.length())for(int i=0;i<after.length();i++){
        if(!before.isNull(i)&&after.isNull(i))animatedFrom=i;
        if(before.isNull(i)&&!after.isNull(i))animatedCell=i;
      }
      if("checkers".equals(room.optString("game"))){JSONArray moves=GamesData.array(GamesData.state(room),"moves");JSONObject last=moves.optJSONObject(moves.length()-1);if(last!=null){animatedFrom=last.optInt("from",-1);animatedCell=last.optInt("to",-1);}}
      animationStarted=android.os.SystemClock.uptimeMillis();
    }else if(!oldId.equals(room.optString("id")))animatedCell=-1;
    this.room = room; this.state = GamesData.state(room); this.game = room.optString("game");
    this.player = GamesData.player(room, actor);
    this.pending = pending != null && room.optString("id").equals(pending.optString("room")) ? pending.optJSONObject("action") : null;
    canMove = online && pending == null && "playing".equals(room.optString("status")) && !GamesData.finished(state) && player >= 0;
    if ("checkers".equals(game) && !state.isNull("forced") && state.has("forced")) selected = state.optInt("forced",-1);
    setContentDescription(GamesData.TAGS[GamesData.index(game)] + " board. " + (myTurn() ? "Your turn." : "Waiting for your partner."));
    requestLayout(); invalidate();
  }

  boolean moving() { return "pool".equals(game) && room.optLong("availableAt") > System.currentTimeMillis(); }
  boolean myTurn() { return canMove && state.optInt("turn",-1) == player && !moving(); }
  boolean placing() { return "battleship".equals(game) && "placement".equals(state.optString("phase")); }
  boolean ownFleetPlaced() {
    JSONArray fleets = GamesData.array(state,"fleets");
    return player >= 0 && !fleets.isNull(player) && fleets.opt(player) != null;
  }

  protected void onMeasure(int width, int height) {
    int w = MeasureSpec.getSize(width);
    float ratio = "pool".equals(game) ? .64f : "battleship".equals(game) && !placing() ? 1.78f : "hangman".equals(game) ? .64f : "connect4".equals(game) ? .92f : 1.04f;
    setMeasuredDimension(w, Math.round(w*ratio));
  }

  protected void onDraw(Canvas c) {
    super.onDraw(c);
    float pad = getWidth() * .045f;
    field.set(pad,pad,getWidth()-pad,getHeight()-pad);
    if ("pool".equals(game)) drawPool(c);
    else if ("hangman".equals(game)) drawHangman(c);
    else if ("battleship".equals(game)) drawFleet(c);
    else drawGrid(c);
    if (focused >= 0) {
      RectF b = bounds(focused); p.setColor(Ui.PURPLE); p.setStrokeWidth(3); p.setStyle(Paint.Style.STROKE); c.drawRoundRect(b,5,5,p);
    }
  }

  private void drawGrid(Canvas c) {
    int cols = "tictactoe".equals(game) ? 3 : "connect4".equals(game) ? 7 : 8;
    int rows = cols == 7 ? 6 : cols;
    float size = Math.min(field.width()/cols, field.height()/rows);
    field.right = field.left+size*cols; field.bottom = field.top+size*rows;
    JSONArray board = GamesData.array(state,"board"), line = GamesData.array(state,"line"), legal = GamesData.array(state,"legal");
    float progress=motion()?Math.min(1,(android.os.SystemClock.uptimeMillis()-animationStarted)/420f):1;
    boolean animating=animatedCell>=0&&progress<1;
    for (int i=0;i<rows*cols;i++) {
      float x=field.left+(i%cols)*size, y=field.top+(i/cols)*size;
      int fill = cols==8 ? ((i/8+i%8)%2==0 ? 0xfff7f2fc : 0xffc7badb) : 0xffeeebf8;
      rect(c,x+2,y+2,x+size-2,y+size-2,cols==8?3:10,fill);
      if (contains(line,i)) rect(c,x+3,y+3,x+size-3,y+size-3,8,0x665fcdb3);
      if (i==selected) rect(c,x+2,y+2,x+size-2,y+size-2,5,0x99bda3f1);
      if (cols==8 && myTurn()) {
        boolean source=false, target=false;
        for(int j=0;j<legal.length();j++) { JSONObject move=legal.optJSONObject(j); if(move==null)continue; if(move.optInt("from")==i)source=true; if(move.optInt("from")==selected&&move.optInt("to")==i)target=true; }
        if(source) circle(c,x+size/2,y+size/2,size*.39f,0x44d6c1ff);
        if(target) circle(c,x+size/2,y+size/2,size*.16f,0xffe7d2ff);
      }
      Object value=board.opt(i);
      if(value==null||value==JSONObject.NULL)continue;
      if(animating&&i==animatedCell&&cols!=3)continue;
      if(cols==3) {float reveal=animating&&i==animatedCell?progress:1;mark(c,x+size/2,y+size/2,size*.25f*(.75f+.25f*reveal),((Number)value).intValue(),(int)(255*reveal));}
      else if(cols==7) disc(c,x+size/2,y+size/2,size*.37f,((Number)value).intValue(),false);
      else if(value instanceof JSONObject) { JSONObject piece=(JSONObject)value; disc(c,x+size/2,y+size/2,size*.36f,piece.optInt("player"),piece.optBoolean("king")); }
    }
    if(animating&&cols!=3){
      float t=progress*progress*(3-2*progress),x=field.left+(animatedCell%cols+.5f)*size,y=field.top+(animatedCell/cols+.5f)*size;
      Object value=board.opt(animatedCell);
      if(cols==7&&value instanceof Number){float bounce=new android.view.animation.OvershootInterpolator(.55f).getInterpolation(progress);disc(c,x,field.top-size+(y-field.top+size)*bounce,size*.37f,((Number)value).intValue(),false);}
      else if(cols==8&&value instanceof JSONObject){JSONObject piece=(JSONObject)value;float fromX=field.left+(animatedFrom%cols+.5f)*size,fromY=field.top+(animatedFrom/cols+.5f)*size;disc(c,fromX+(x-fromX)*t,fromY+(y-fromY)*t,size*.36f,piece.optInt("player"),piece.optBoolean("king"));}
    }
    if(animating&&isShown())postInvalidateOnAnimation();
    if (pending!=null) {
      int cell=pending.optInt("cell",pending.optInt("to",-1));
      if(cols==7) { int col=pending.optInt("column",-1); if(col>=0) for(int r=5;r>=0;r--) if(board.isNull(r*7+col)) {cell=r*7+col;break;} }
      if(cell>=0 && cell<rows*cols) {
        float x=field.left+(cell%cols+.5f)*size,y=field.top+(cell/cols+.5f)*size;
        if(cols==3)mark(c,x,y,size*.25f,player,110);
        else { p.setAlpha(110); circle(c,x,y,size*.35f,player==0?0x88c8adff:0x8889d8d1); p.setAlpha(255); }
      }
    }
  }

  private void drawHangman(Canvas c) {
    float w=getWidth(),h=getHeight(),x=w*.5f,y=h*.45f,r=h*.29f;
    int remaining=state.optInt("remaining",6);
    ring(c,x,y,r,1,0xffd9e1f0);ring(c,x,y,r*.56f,1,0xffeeebf8);
    for(int i=0;i<6;i++){
      double angle=i*Math.PI/3-Math.PI/2,next=(i+1)*Math.PI/3-Math.PI/2;
      float px=x+(float)Math.cos(angle)*r,py=y+(float)Math.sin(angle)*r;
      line(c,px,py,x+(float)Math.cos(next)*r,y+(float)Math.sin(next)*r,2,i<remaining?0xffa69abb:0xffeeebf8);
      circle(c,px,py,h*.038f,i<remaining?0xff6b5cb5:0xffd9e1f0);
      if(i<remaining)circle(c,px-h*.008f,py-h*.009f,h*.012f,0xffe7ddfa);
    }
    caption(c,"♡",x-h*.075f,y+h*.064f,h*.24f,0xff9f4b6f);
    caption(c,"BETWEEN THE LETTERS",w*.25f,h*.93f,w*.035f,0xff64708b);
  }

  private void drawFleet(Canvas c) {
    float size=field.width()/10;
    field.top += getWidth()*.065f; field.bottom=field.top+size*10;
    caption(c,placing()?"YOUR OCEAN · PLACE SHIPS":"TARGET OCEAN",field.left,field.top-getWidth()*.027f,getWidth()*.032f,0xff64708b);
    ocean(c,field,placing(),false);
    if(!placing()) {
      float ownSize=size*.61f;
      ownField.set(field.left,field.bottom+getWidth()*.105f,field.left+ownSize*10,field.bottom+getWidth()*.105f+ownSize*10);
      caption(c,"YOUR FLEET · INCOMING FIRE",ownField.left,ownField.top-getWidth()*.027f,getWidth()*.032f,0xff64708b);
      ocean(c,ownField,true,true);
    } else ownField.setEmpty();
  }

  private void ocean(Canvas c,RectF rect,boolean own,boolean incoming) {
    float size=rect.width()/10;
    JSONArray fleets=GamesData.array(state,"fleets");
    JSONArray ships=player<0?null:fleets.optJSONArray(own?player:1-player);
    int attacker=incoming?1-player:player;
    JSONArray shots=GamesData.array(state,"shots").optJSONArray(attacker),hits=GamesData.array(state,"hits").optJSONArray(attacker);
    JSONArray sunk=GamesData.array(state,"sunkShips").optJSONArray(player);
    for(int cell=0;cell<100;cell++) {
      float x=rect.left+(cell%10)*size,y=rect.top+(cell/10)*size;
      rect(c,x+1,y+1,x+size-1,y+size-1,2,0xffeaf1fc);
      boolean occupied=false;
      if(ships!=null) for(int i=0;i<ships.length();i++)if(contains(GamesData.array(ships.optJSONObject(i),"cells"),cell))occupied=true;
      if(own&&placing()&&!ownFleetPlaced())for(int[] ship:fleet.ships)if(ship!=null)for(int v:ship)if(v==cell)occupied=true;
      if(!own&&sunk!=null)for(int i=0;i<sunk.length();i++)if(contains(GamesData.array(sunk.optJSONObject(i),"cells"),cell))occupied=true;
      if(occupied)rect(c,x+3,y+3,x+size-3,y+size-3,3,0xff6a9eaa);
      if(own&&draggingFleet){int[] preview=fleet.candidate(dragCell);if(preview!=null)for(int v:preview)if(v==cell)rect(c,x+3,y+3,x+size-3,y+size-3,3,0xff2e746a);}
      if(contains(shots,cell)) {
        if(contains(hits,cell)) { line(c,x+size*.3f,y+size*.3f,x+size*.7f,y+size*.7f,3,0xff9f4b6f);line(c,x+size*.7f,y+size*.3f,x+size*.3f,y+size*.7f,3,0xff9f4b6f); }
        else circle(c,x+size/2,y+size/2,size*.13f,0xff64708b);
      }
      if(!incoming&&pending!=null&&pending.optInt("cell",-1)==cell)ring(c,x+size/2,y+size/2,size*.35f,2,Ui.PURPLE);
    }
  }

  private void drawPool(Canvas c) {
    float left=getWidth()*.055f,top=getHeight()*.09f,width=getWidth()-2*left,height=width/2;
    field.set(left,top,left+width,top+height);
    rect(c,left-10,top-10,left+width+10,top+height+10,17,0xff554135);
    rect(c,left-4,top-4,left+width+4,top+height+4,12,0xff193e39);
    rect(c,left,top,left+width,top+height,8,0xff226556);
    for(float[] pocket:new float[][]{{0,0},{.5f,0},{1,0},{1,1},{.5f,1},{0,1}})circle(c,left+pocket[0]*width,top+pocket[1]*height,width*.024f,0xff0b1520);
    JSONArray balls=GamesData.array(state,"balls"),next=null;
    double blend=0;
    JSONObject shot=state.optJSONObject("lastShot");
    if(moving() && shot!=null && motion()) {
      JSONArray frames=GamesData.array(shot,"frames");
      double duration=shot.optDouble("duration",0);
      long start=room.optLong("availableAt")-(long)(duration*1000);
      double time=Math.max(0,(System.currentTimeMillis()-start)/1000.0);
      for(int i=0;i<frames.length();i++) {
        JSONObject frame=frames.optJSONObject(i); if(frame==null)continue;
        if(frame.optDouble("t")<=time) {
          balls=GamesData.array(frame,"balls");
          JSONObject after=frames.optJSONObject(i+1);
          if(after!=null) {next=GamesData.array(after,"balls");double d=after.optDouble("t")-frame.optDouble("t");blend=d>0?Math.min(1,(time-frame.optDouble("t"))/d):0;}
        } else break;
      }
      if(isShown())postInvalidateOnAnimation();
    }
    for(int i=0;i<balls.length();i++) {
      JSONObject ball=balls.optJSONObject(i);if(ball==null||ball.optBoolean("pocketed"))continue;
      double x=ball.optDouble("x"),y=ball.optDouble("y");
      if(next!=null)for(int j=0;j<next.length();j++){JSONObject b=next.optJSONObject(j);if(b!=null&&b.optInt("id")==ball.optInt("id")){x+=(b.optDouble("x")-x)*blend;y+=(b.optDouble("y")-y)*blend;break;}}
      float px=left+(float)x/1000*width,py=top+(float)y/500*height,r=width*.011f;
      int id=ball.optInt("id"); int[] colors={0xffeee7d7,0xffe5c477,0xff94b2f0,0xffe79794,0xffb3a0e0,0xffe0a778,0xffa3cfaf,0xffb5828c,0xff111626};
      circle(c,px+1,py+2,r,0x66000000);circle(c,px,py,r,colors[id<9?id:id-8]);
      if(id>8)rect(c,px-r,py-r*.36f,px+r,py+r*.36f,r*.2f,0xffeee7d7);
      if(id>0&&getWidth()>500){circle(c,px,py,r*.48f,0xffeee7d7);caption(c,""+id,px-r*.28f,py+r*.28f,r*.75f,0xff18212c);}
      if(id==0&&myTurn()) {
        line(c,px,py,px+(float)Math.cos(angle)*width*.27f,py+(float)Math.sin(angle)*width*.27f,1.5f,0x99e9f5df);
        line(c,px-(float)Math.cos(angle)*width*.22f,py-(float)Math.sin(angle)*width*.22f,px-(float)Math.cos(angle)*width*.045f,py-(float)Math.sin(angle)*width*.045f,3,0xffdbc297);
      }
    }
    if(pending!=null&&"place".equals(pending.optString("type")))ring(c,left+(float)pending.optDouble("x")/1000*width,top+(float)pending.optDouble("y")/500*height,width*.017f,2,0xffe0d0ff);
    caption(c,moving()?"SHOT IN MOTION":"TABLE 01 · JUST THE TWO OF US",left,field.bottom+getHeight()*.09f,getWidth()*.029f,0xff64708b);
  }

  boolean motion() { return Motion.enabled(getContext()) && !getContext().getSharedPreferences("games-settings",0).getBoolean("reduce-motion",false); }
  private static boolean contains(JSONArray values,int v){if(values==null)return false;for(int i=0;i<values.length();i++)if(values.optInt(i,-999)==v)return true;return false;}
  private void rect(Canvas c,float l,float t,float r,float b,float radius,int color){p.setStyle(Paint.Style.FILL);p.setColor(color);c.drawRoundRect(l,t,r,b,radius,radius,p);}
  private void circle(Canvas c,float x,float y,float r,int color){p.setStyle(Paint.Style.FILL);p.setColor(color);c.drawCircle(x,y,r,p);}
  private void ring(Canvas c,float x,float y,float r,float stroke,int color){p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(stroke);p.setColor(color);c.drawCircle(x,y,r,p);}
  private void line(Canvas c,float x,float y,float x2,float y2,float stroke,int color){p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(stroke);p.setStrokeCap(Paint.Cap.ROUND);p.setColor(color);c.drawLine(x,y,x2,y2,p);}
  private void caption(Canvas c,String text,float x,float y,float size,int color){p.setStyle(Paint.Style.FILL);p.setColor(color);p.setTypeface(Typeface.DEFAULT_BOLD);p.setTextAlign(Paint.Align.LEFT);p.setTextSize(size);c.drawText(text,x,y,p);}
  private void mark(Canvas c,float x,float y,float r,int who,int alpha){int color=(alpha<<24)|(who==0?0x006b5cb5:0x002e746a);if(who==0){line(c,x-r,y-r,x+r,y+r,Math.max(4,r*.23f),color);line(c,x-r,y+r,x+r,y-r,Math.max(4,r*.23f),color);}else ring(c,x,y,r,Math.max(4,r*.23f),color);}
  private void disc(Canvas c,float x,float y,float r,int who,boolean king){circle(c,x,y+2,r,0xff101728);circle(c,x,y,r,who==0?0xff7964ae:0xff3e8c82);ring(c,x,y,r*.73f,Math.max(1,r*.06f),who==0?0xffc6b4e4:0xffa1d2c9);if(king)caption(c,"♛",x-r*.57f,y+r*.42f,r*1.3f,0xffffffff);}

  private int hit(float x,float y) {
    if(!field.contains(x,y))return -1;
    int cols="tictactoe".equals(game)?3:"connect4".equals(game)?7:"checkers".equals(game)?8:"battleship".equals(game)?10:0;
    if(cols==0)return -1;
    return Math.min(cols-1,(int)((x-field.left)/field.width()*cols)) + cols*Math.min((cols==7?6:cols)-1,(int)((y-field.top)/field.height()*(cols==7?6:cols)));
  }

  void activate(int cell) {
    if("battleship".equals(game)&&placing()) {
      if(!canMove||ownFleetPlaced())return;
      if(fleet.place(cell)) { invalidate();host.selection(); }
      else { announceForAccessibility("That ship overlaps another ship or leaves the ocean.");host.selection(); }
      return;
    }
    if(!myTurn())return;
    if("tictactoe".equals(game)&&GamesData.array(state,"board").isNull(cell))host.move(GamesData.obj("type","place","cell",cell));
    else if("connect4".equals(game))host.move(GamesData.obj("type","drop","column",cell%7));
    else if("battleship".equals(game)&&!contains(GamesData.array(state,"shots").optJSONArray(player),cell))host.move(GamesData.obj("type","fire","cell",cell));
    else if("checkers".equals(game)) {
      JSONArray legal=GamesData.array(state,"legal");
      for(int i=0;i<legal.length();i++){JSONObject m=legal.optJSONObject(i);if(m!=null&&m.optInt("from")==selected&&m.optInt("to")==cell){host.move(GamesData.obj("type","move","from",selected,"to",cell));return;}}
      for(int i=0;i<legal.length();i++){JSONObject m=legal.optJSONObject(i);if(m!=null&&m.optInt("from")==cell){selected=cell;invalidate();host.selection();return;}}
    }
  }

  public boolean onTouchEvent(MotionEvent event) {
    if(event.getActionMasked()==MotionEvent.ACTION_DOWN){
      downX=event.getX();downY=event.getY();charging=false;draggingFleet=false;
      if(placing()&&canMove&&!ownFleetPlaced()&&field.contains(downX,downY)){
        draggingFleet=true;dragCell=hit(downX,downY);dragOffset=0;
        for(int i=0;i<fleet.ships.length;i++)if(fleet.ships[i]!=null)for(int j=0;j<fleet.ships[i].length;j++)if(fleet.ships[i][j]==dragCell){fleet.selected=i;fleet.vertical=fleet.ships[i][1]-fleet.ships[i][0]==10;dragOffset=j;}
        dragCell-=dragOffset*(fleet.vertical?10:1);getParent().requestDisallowInterceptTouchEvent(true);
      }
      if("pool".equals(game)&&field.contains(downX,downY)){
        getParent().requestDisallowInterceptTouchEvent(true);
        if(myTurn()&&!state.optBoolean("ballInHand")){JSONArray balls=GamesData.array(state,"balls");for(int i=0;i<balls.length();i++){JSONObject b=balls.optJSONObject(i);if(b!=null&&b.optInt("id")==0){float x=field.left+(float)b.optDouble("x")/1000*field.width(),y=field.top+(float)b.optDouble("y")/500*field.height();charging=Math.hypot(x-downX,y-downY)<Math.max(24*getResources().getDisplayMetrics().density,field.width()*.035f);}}}
        gesturePower=0;
      }
      return true;
    }
    if(draggingFleet&&(event.getActionMasked()==MotionEvent.ACTION_MOVE||event.getActionMasked()==MotionEvent.ACTION_UP)){
      int cell=hit(event.getX(),event.getY());dragCell=cell<0?-1:cell-dragOffset*(fleet.vertical?10:1);invalidate();
      if(event.getActionMasked()==MotionEvent.ACTION_UP){draggingFleet=false;getParent().requestDisallowInterceptTouchEvent(false);if(dragCell>=0)activate(dragCell);performClick();}return true;
    }
    if(charging&&myTurn()&&(event.getActionMasked()==MotionEvent.ACTION_MOVE||event.getActionMasked()==MotionEvent.ACTION_UP)){
      float pull=(float)(-(event.getX()-downX)*Math.cos(angle)-(event.getY()-downY)*Math.sin(angle));
      gesturePower=Math.max(0,Math.min(1,pull/(field.width()*.28f)));host.charge(gesturePower,event.getActionMasked()==MotionEvent.ACTION_UP);invalidate();
      if(event.getActionMasked()==MotionEvent.ACTION_UP){charging=false;getParent().requestDisallowInterceptTouchEvent(false);performClick();}return true;
    }
    if("pool".equals(game)&&myTurn()&&!state.optBoolean("ballInHand")&&(event.getActionMasked()==MotionEvent.ACTION_MOVE||event.getActionMasked()==MotionEvent.ACTION_UP)) {
      JSONArray balls=GamesData.array(state,"balls");
      for(int i=0;i<balls.length();i++){JSONObject b=balls.optJSONObject(i);if(b!=null&&b.optInt("id")==0){float x=field.left+(float)b.optDouble("x")/1000*field.width(),y=field.top+(float)b.optDouble("y")/500*field.height();angle=(float)Math.atan2(event.getY()-y,event.getX()-x);invalidate();host.aim(angle);break;}}
    }
    if(event.getActionMasked()==MotionEvent.ACTION_UP){
      performClick();getParent().requestDisallowInterceptTouchEvent(false);
      if(Math.hypot(event.getX()-downX,event.getY()-downY)<20){
        if("pool".equals(game)&&myTurn()&&state.optBoolean("ballInHand")&&field.contains(event.getX(),event.getY()))host.move(GamesData.obj("type","place","x",(event.getX()-field.left)/field.width()*1000,"y",(event.getY()-field.top)/field.height()*500));
        else {int cell=hit(event.getX(),event.getY());if(cell>=0)activate(cell);}
      }
    }
    if(event.getActionMasked()==MotionEvent.ACTION_CANCEL){charging=false;draggingFleet=false;invalidate();getParent().requestDisallowInterceptTouchEvent(false);}
    return true;
  }
  public boolean performClick(){super.performClick();return true;}

  private int count(){return "tictactoe".equals(game)?9:"connect4".equals(game)?42:"checkers".equals(game)?64:"battleship".equals(game)?100:0;}
  private RectF bounds(int id){int cols="tictactoe".equals(game)?3:"connect4".equals(game)?7:"checkers".equals(game)?8:10;int rows=cols==7?6:cols;float w=field.width()/cols,h=field.height()/rows;return new RectF(field.left+id%cols*w,field.top+id/cols*h,field.left+(id%cols+1)*w,field.top+(id/cols+1)*h);}
  private String describe(int cell){
    int cols="tictactoe".equals(game)?3:"connect4".equals(game)?7:"checkers".equals(game)?8:10;
    String label="Row "+(cell/cols+1)+", column "+(cell%cols+1);
    Object v=GamesData.array(state,"board").opt(cell);
    if("battleship".equals(game)){JSONArray shots=GamesData.array(state,"shots").optJSONArray(player),hits=GamesData.array(state,"hits").optJSONArray(player);return label+(placing()?". Place selected ship.":contains(shots,cell)?contains(hits,cell)?". Hit.":". Miss.":". Fire here.");}
    if(v==null||v==JSONObject.NULL)return label+". Empty.";
    int owner=v instanceof JSONObject?((JSONObject)v).optInt("player"):((Number)v).intValue();
    return label+". "+(owner==player?"Your":"Partner's")+(v instanceof JSONObject&&((JSONObject)v).optBoolean("king")?" king.":" piece.")+(selected==cell?" Selected.":"");
  }
  public AccessibilityNodeProvider getAccessibilityNodeProvider(){return nodes;}
  public boolean dispatchHoverEvent(MotionEvent event){
    if(accessibility.isTouchExplorationEnabled()){
      int cell=event.getActionMasked()==MotionEvent.ACTION_HOVER_EXIT?-1:hit(event.getX(),event.getY());
      if(cell!=hovered){if(hovered>=0)nodes.event(hovered,AccessibilityEvent.TYPE_VIEW_HOVER_EXIT);hovered=cell;if(cell>=0)nodes.event(cell,AccessibilityEvent.TYPE_VIEW_HOVER_ENTER);}return true;
    }return super.dispatchHoverEvent(event);
  }
  private final class BoardNodes extends AccessibilityNodeProvider {
    public AccessibilityNodeInfo createAccessibilityNodeInfo(int id){
      if(id==View.NO_ID){AccessibilityNodeInfo info=AccessibilityNodeInfo.obtain(GamesBoard.this);onInitializeAccessibilityNodeInfo(info);for(int i=0;i<count();i++)info.addChild(GamesBoard.this,i);return info;}
      if(id<0||id>=count())return null;
      AccessibilityNodeInfo info=AccessibilityNodeInfo.obtain(); info.setSource(GamesBoard.this,id);info.setParent(GamesBoard.this);info.setPackageName(getContext().getPackageName());info.setClassName("android.widget.Button");info.setContentDescription(describe(id));info.setFocusable(true);info.setClickable(true);info.setEnabled(canMove);info.setVisibleToUser(isShown());info.setAccessibilityFocused(focused==id);
      RectF f=bounds(id);Rect b=new Rect((int)f.left,(int)f.top,(int)f.right,(int)f.bottom);info.setBoundsInParent(b);int[] location=new int[2];getLocationOnScreen(location);b.offset(location[0],location[1]);info.setBoundsInScreen(b);info.addAction(AccessibilityNodeInfo.ACTION_CLICK);info.addAction(focused==id?AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS:AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS);return info;
    }
    public boolean performAction(int id,int action,Bundle arguments){
      if(id==View.NO_ID)return GamesBoard.this.performAccessibilityAction(action,arguments);
      if(id<0||id>=count())return false;
      if(action==AccessibilityNodeInfo.ACTION_CLICK){activate(id);event(id,AccessibilityEvent.TYPE_VIEW_CLICKED);return true;}
      if(action==AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS){focused=id;invalidate();event(id,AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED);return true;}
      if(action==AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS){focused=-1;invalidate();event(id,AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUS_CLEARED);return true;}
      return false;
    }
    void event(int id,int type){if(!accessibility.isEnabled())return;AccessibilityEvent e=AccessibilityEvent.obtain(type);e.setSource(GamesBoard.this,id);e.setPackageName(getContext().getPackageName());e.setClassName("android.widget.Button");e.getText().add(describe(id));if(getParent()!=null)getParent().requestSendAccessibilityEvent(GamesBoard.this,e);}
  }
}
