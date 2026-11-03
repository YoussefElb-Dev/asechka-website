package app.asechka.android;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.*;
import android.os.*;
import android.text.*;
import android.view.*;
import android.widget.*;
import java.util.*;
import org.json.*;

/** A native little games lounge. The server is the only source of opponents and results. */
final class GamesView extends ScrollView implements GamesClient.Listener, GamesBoard.Host {
  private static final int BG=Ui.BG,PANEL=0xffffffff,INK=Ui.INK,MUTED=Ui.MUTED,ACCENT=Ui.PURPLE;
  private final MainActivity activity;
  private final LinearLayout body;
  final GamesClient client;
  private final GamesAudio audio;
  private GamesBoard board;
  private Dialog dialog;
  private String signature="",invite="",lastResult="";
  private boolean foreground;
  private TextView aimLabel;
  private SeekBar aimBar;
  private SeekBar powerBar;
  private float power=.55f;
  private int pocket;
  private JSONObject current;
  private LinearLayout controlsHost;
  private boolean focusedPlay;

  GamesView(MainActivity activity,ApiClient api) {
    this(activity, api, GamesSocket::new);
  }
  GamesView(MainActivity activity,ApiClient api,GamesClient.SocketFactory sockets) {
    super(activity);this.activity=activity;setFillViewport(true);setBackgroundColor(BG);
    setClipToPadding(false);setHorizontalScrollBarEnabled(false);
    body=column();body.setPadding(dp(18),dp(20),dp(18),dp(32));addView(body,new ScrollView.LayoutParams(-1,-2));
    audio=new GamesAudio(activity);client=new GamesClient(api,activity.actor(),this,sockets);refresh();
  }
  String actor(){return client.actor;}
  void activate(){foreground=true;client.start();refresh();}
  void suspend(){foreground=false;client.pause();activity.gamesFocus(false,false);if(dialog!=null)dialog.dismiss();}
  void close(){suspend();client.close();audio.close();}
  boolean back(){if(!client.selectedRoom.isEmpty()){client.select("");signature="";refresh();return true;}return false;}
  void invitation(String code){invite=code.toUpperCase(Locale.US);if(client.connected)joinInvite();}
  private void joinInvite(){if(invite.isEmpty())return;String code=invite;invite="";client.command("join",GamesData.obj("code",code));refresh();}
  public void changed(){if(!foreground)return;if(client.connected&&!invite.isEmpty())joinInvite();refresh();}
  public void reaction(String message){Toast.makeText(activity,message,Toast.LENGTH_SHORT).show();body.announceForAccessibility(message);}

  private void refresh(){
    current=client.rooms.get(client.selectedRoom);
    focusedPlay=current!=null&&!"lobby".equals(current.optString("status"));
    activity.gamesFocus(focusedPlay,focusedPlay&&"pool".equals(current.optString("game")));
    body.setPadding(dp(focusedPlay?12:18),dp(focusedPlay?4:20),dp(focusedPlay?12:18),dp(focusedPlay?8:32));
    StringBuilder key=new StringBuilder(client.selectedRoom).append(client.connected).append(client.status).append(client.error).append(client.commandBusy()).append(client.pending==null?"":client.pending.optString("id"));
    if(current!=null)key.append(current.optLong("seq")).append(current.optString("status")).append(GamesData.array(current,"players")).append(GamesData.array(current,"rematchReady")).append(current.optLong("availableAt")>System.currentTimeMillis());
    else {key.append(client.presence);for(JSONObject r:client.rooms.values())key.append(r.optString("id")).append(r.optLong("seq")).append(GamesData.array(r,"players"));}
    if(board!=null&&current!=null)board.update(current,client.pending,client.connected);
    if(key.toString().equals(signature))return;signature=key.toString();
    int y=getScrollY();if(board!=null&&board.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)board.getParent()).removeView(board);
    body.removeAllViews();
    if(current==null)hub();else{
      if(!focusedPlay){LinearLayout top=row();TextView eyebrow=text("PLAY, STAY A WHILE",12,ACCENT,true);top.addView(eyebrow,new LinearLayout.LayoutParams(0,-2,1));top.addView(button("Settings",false,this::settings));add(top,0);connectionBanner();}room();
    }
    if(!focusedPlay&&y>0)post(()->scrollTo(0,y));else if(focusedPlay)scrollTo(0,0);
  }
  protected void onSizeChanged(int w,int h,int oldw,int oldh){super.onSizeChanged(w,h,oldw,oldh);if(w!=oldw||h!=oldh)post(()->{signature="";refresh();});}

  private void connectionBanner(){
    LinearLayout connection=row();TextView live=text((client.connected?"●  ":"○  ")+client.status,12,client.connected?0xff2e746a:MUTED,false);live.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);connection.addView(live,new LinearLayout.LayoutParams(0,-2,1));Button retry=button("Retry",false,client::reconnect);retry.setBackgroundColor(Color.TRANSPARENT);connection.addView(retry);add(connection,14);
    if(!client.error.isEmpty()){TextView error=text(client.error,14,0xff9f4b6f,false);error.setPadding(dp(12),dp(12),dp(12),dp(12));error.setBackground(shape(0xfff6eaf0,12));error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);add(error,8);}
  }

  private void hub(){
    LinearLayout heading=row(),copy=column();TextView kicker=text("PLAY, STAY A WHILE",12,ACCENT,true);kicker.setLetterSpacing(.14f);copy.addView(kicker);add(copy,text("Our game room.",28,INK,true),6);heading.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
    View options=Glyph.view(activity,"settings",ACCENT);options.setPadding(dp(11),dp(11),dp(11),dp(11));options.setBackground(shape(Ui.PALE,100));options.setContentDescription("Games sound, haptics and motion settings");options.setOnClickListener(v->settings());heading.addView(options,new LinearLayout.LayoutParams(dp(44),dp(44)));add(heading,0);
    String partner="asnat".equals(client.actor)?"youssef":"asnat";
    add(text("●  "+GamesData.name(partner)+(online(partner)?" is here":" is away"),13,online(partner)?0xff2e746a:MUTED,false),18);

    connectionBanner();
    if(!client.selectedRoom.isEmpty())add(button("Back to all games",false,()->{client.select("");refresh();}),8);
    ArrayList<JSONObject> rooms=new ArrayList<>(client.rooms.values());
    Collections.sort(rooms,(a,b)->Long.compare(b.optLong("updatedAt"),a.optLong("updatedAt")));
    if(!rooms.isEmpty()){
      add(text("Pick up where we left off",18,INK,true),26);
      int displayed=0;
      for(JSONObject r:rooms){
        if(displayed++>=8)break;
        String id=r.optString("id");int i=GamesData.index(r.optString("game"));boolean member=GamesData.player(r,client.actor)>=0;
        String label=GamesData.TAGS[i]+" · "+r.optString("code")+"\n"+("finished".equals(r.optString("status"))?GamesData.result(r,client.actor):member?"Resume · "+r.optString("status"):"Open invitation · join");
        Button resume=button(label,false,()->{if(member){client.select(id);signature="";refresh();scrollTo(0,0);}else{client.command("join",GamesData.obj("code",r.optString("code")));refresh();}});resume.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);add(resume,8);
      }
    }
    LinearLayout featured=column();featured.setPadding(dp(18),dp(18),dp(18),dp(18));featured.setBackground(shape(PANEL,24));featured.setClipToOutline(true);
    featured.addView(new GamesArt(activity,0),new LinearLayout.LayoutParams(-1,dp(210)));
    TextView tonight=text("TONIGHT’S LITTLE ESCAPE",10,ACCENT,true);tonight.setLetterSpacing(.14f);add(featured,tonight,12);
    add(featured,text("Velvet Eight",28,INK,true),12);add(featured,text("8-ball pool · Live multiplayer for two",15,MUTED,false),5);add(featured,text("A private table, a called pocket, and nowhere else to be.",15,MUTED,false),12);
    featured.setContentDescription("Featured Velvet Eight. 8-ball pool. Live multiplayer. Create a room");featured.setOnClickListener(v->createDialog(0));add(featured,20);
    Button join=button("Join with a room code",false,()->joinDialog(""));join.setBackground(shape(PANEL,24));join.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);join.setPadding(dp(20),dp(20),dp(20),dp(20));add(join,20);
    add(text("A little competition. A lot of us.",22,INK,true),20);
    boolean two=getResources().getConfiguration().screenWidthDp>=350&&getResources().getConfiguration().fontScale<=1.25f;
    for(int start=0;start<6;start+=two?2:1){
      LinearLayout row=row();
      for(int j=start;j<Math.min(6,start+(two?2:1));j++){
        final int index=j;
        LinearLayout card=column();card.setPadding(dp(10),dp(8),dp(10),dp(14));card.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(0x33c5afff),shape(PANEL,20),null));card.setClipToOutline(true);card.setFocusable(true);card.setClickable(true);card.setContentDescription(GamesData.TAGS[j]+". "+GamesData.NOTES[j]+". Create a room.");
        card.addView(new GamesArt(activity,j),new LinearLayout.LayoutParams(-1,dp(two?134:210)));
        card.addView(text(GamesData.TAGS[j],10,GamesData.COLORS[j],true));TextView title=text(GamesData.TITLES[j],19,INK,true);add(card,title,7);add(card,text(GamesData.NOTES[j],12,MUTED,false),5);add(card,text("PLAY TOGETHER  ↗",10,GamesData.COLORS[j],true),15);
        card.setOnClickListener(v->{feedback("tap");createDialog(index);});
        LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(two?0:-1,-1,two?1:0);if(j>start)cp.leftMargin=dp(10);row.addView(card,cp);
      }
      add(row,12);
    }
    add(text("Made for two · moves and results stay in your shared room. Games needs a live connection.",12,MUTED,false),22);
  }

  private boolean online(String actor){
    if(client.presence instanceof JSONArray){JSONArray list=(JSONArray)client.presence;for(int i=0;i<list.length();i++){Object item=list.opt(i);if(actor.equals(item))return true;if(item instanceof JSONObject&&actor.equals(((JSONObject)item).optString("actor")))return ((JSONObject)item).optBoolean("online",true);}}
    if(client.presence instanceof JSONObject){Object item=((JSONObject)client.presence).opt(actor);if(item instanceof Boolean)return (Boolean)item;if(item instanceof Number)return ((Number)item).intValue()>0;if(item instanceof JSONObject)return ((JSONObject)item).optBoolean("online");}
    return false;
  }

  private void room(){
    if(focusedPlay){playRoom();return;}
    final JSONObject r=current;final String id=r.optString("id"),game=r.optString("game");int index=GamesData.index(game);
    add(button("‹  All games",false,()->{client.select("");signature="";refresh();scrollTo(0,0);}),8);
    add(text(GamesData.TITLES[index],29,INK,true),14);
    add(text(GamesData.TAGS[index]+"  ·  ROOM "+r.optString("code"),11,GamesData.COLORS[index],true),6);
    LinearLayout tools=row();tools.addView(button("Invite / share",false,()->share(r)),new LinearLayout.LayoutParams(0,-2,1));tools.addView(button("Rules & help",false,()->help(index)),new LinearLayout.LayoutParams(0,-2,1));add(tools,12);
    JSONArray players=GamesData.array(r,"players");
    for(int i=0;i<players.length();i++){JSONObject p=players.optJSONObject(i);if(p==null)continue;add(text((p.optBoolean("online")?"●  ":"○  ")+GamesData.name(p.optString("actor"))+(p.optString("actor").equals(client.actor)?" · you":"")+" · "+(p.optBoolean("online")?"online":"away")+("lobby".equals(r.optString("status"))?p.optBoolean("ready")?" · ready":" · getting ready":""),13,p.optBoolean("online")?0xff2e746a:MUTED,false),7);}
    if(players.length()<2)add(text("Waiting for your person. Share the code or invitation link.",14,MUTED,false),10);
    int me=GamesData.player(r,client.actor);
    if(me<0){add(button("Join this room",true,()->{client.command("join",GamesData.obj("code",r.optString("code")));refresh();}),18);return;}
    if("lobby".equals(r.optString("status"))){
      JSONObject settings=r.optJSONObject("settings");add(text("Best of "+(settings==null?1:settings.optInt("bestOf",1))+" · "+(settings==null?"violet":settings.optString("theme","violet")),13,MUTED,false),16);
      boolean ready=players.optJSONObject(me).optBoolean("ready");
      add(action(ready?"Not ready yet":"I’m ready",true,client.connected&&!client.commandBusy(),()->{client.command("ready",GamesData.obj("room",id,"ready",!ready));refresh();}),16);
      if(me==0){boolean both=players.length()==2;for(int i=0;i<players.length();i++)both&=players.optJSONObject(i).optBoolean("ready");add(action("Start our game",true,both&&client.connected&&!client.commandBusy(),()->{client.command("start",GamesData.obj("room",id));refresh();}),9);}
      add(new GamesArt(activity,index),18,dp(240));return;
    }
    JSONObject s=GamesData.state(r);
    boolean finished="finished".equals(r.optString("status"));
    JSONArray scores=GamesData.array(r,"scores");add(text("ROUND "+r.optInt("round",1)+"   ·   SCORE "+scores.optInt(0)+" : "+scores.optInt(1),12,MUTED,true),18);
    String turn=finished?GamesData.result(r,client.actor):"battleship".equals(game)&&"placement".equals(s.optString("phase"))?"Arrange your fleet":"hangman".equals(game)&&"choose".equals(s.optString("phase"))?(s.optInt("setter")==me?"Choose their secret word":"Your partner is choosing a word"):s.optInt("turn")==me?"Your move. Take your time.":"Your partner’s turn";
    TextView turnLabel=text(turn,20,GamesData.COLORS[index],true);turnLabel.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);add(turnLabel,14);
    if(client.pending!=null)add(text("Sending your move… · saved safely for reconnect",12,ACCENT,false),8);
    if(board==null)board=new GamesBoard(activity,client.actor,this);board.update(r,client.pending,client.connected);add(board,16);
    if("pool".equals(game))poolControls(s,finished);
    if("hangman".equals(game))hangmanControls(s,finished,me);
    if("battleship".equals(game))fleetControls(s,finished,me);
    if("checkers".equals(game)&&!finished){add(text(s.isNull("forced")?"Tap a highlighted piece, then a highlighted destination.":"Continue the capture with the selected piece.",13,MUTED,false),12);accessibleCheckers(s);}
    if("checkers".equals(game)&&GamesData.array(s,"moves").length()>0)add(button("Move history & replay",false,()->checkersReplay(r)),12);
    if(finished){
      JSONArray votes=GamesData.array(r,"rematchReady");boolean voted=false;ArrayList<String> names=new ArrayList<>();for(int i=0;i<votes.length();i++){String who=votes.optString(i);names.add(GamesData.name(who));if(client.actor.equals(who))voted=true;}
      if(!names.isEmpty())add(text(TextUtils.join(" & ",names)+" wants another round",13,ACCENT,false),14);
      add(action(voted?"Waiting for your partner’s rematch vote":"Play another round",true,client.connected&&!voted&&!client.commandBusy(),()->{client.command("rematch",GamesData.obj("room",id));refresh();}),16);
      String resultKey=id+":"+r.optLong("seq");if(!lastResult.equals(resultKey)){lastResult=resultKey;audio.play(s.opt("winner") instanceof Number&&s.optInt("winner")==me?"win":"lose");}
    }
    LinearLayout reactions=row();for(String emoji:new String[]{"♡","👏","🎉","✨"}){Button b=action(emoji,false,client.connected,()->{client.command("react",GamesData.obj("room",id,"emoji",emoji));});b.setContentDescription("Send reaction "+emoji);reactions.addView(b,new LinearLayout.LayoutParams(0,-2,1));}add(reactions,22);
  }

  private void playRoom(){
    JSONObject r=current,s=GamesData.state(r);String game=r.optString("game");boolean finished="finished".equals(r.optString("status"));int me=GamesData.player(r,client.actor),index=GamesData.index(game);
    LinearLayout heading=row();Button back=button("‹",false,()->{client.select("");signature="";refresh();});back.setContentDescription("All games");heading.addView(back,new LinearLayout.LayoutParams(dp(48),dp(48)));TextView title=text(GamesData.TITLES[index],18,INK,true);heading.addView(title,new LinearLayout.LayoutParams(0,-2,1));Button more=button("•••",false,this::playMenu);more.setContentDescription("Game details and controls");heading.addView(more,new LinearLayout.LayoutParams(dp(48),dp(48)));add(heading,0);
    String status=finished?GamesData.result(r,client.actor):"battleship".equals(game)&&"placement".equals(s.optString("phase"))?"Arrange your secret fleet":s.optInt("turn")==me?"Your move":"Your partner’s move";
    JSONArray scores=GamesData.array(r,"scores");TextView turn=text(status+"  ·  "+scores.optInt(0)+" : "+scores.optInt(1),14,GamesData.COLORS[index],true);turn.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);add(turn,6);
    if(!client.connected||!client.error.isEmpty()){Button retry=button(client.error.isEmpty()?"Connection interrupted · tap to retry":client.error,false,client::reconnect);add(retry,4);}
    else if(client.pending!=null)add(text("Sending your move…",12,ACCENT,false),4);
    if(board==null)board=new GamesBoard(activity,client.actor,this);board.update(r,client.pending,client.connected);
    int available=getHeight()>0?getHeight():getResources().getDisplayMetrics().heightPixels;
    if("pool".equals(game)){
      LinearLayout table=row();board.maxBoardHeight=Math.max(dp(150),available-dp(92));table.addView(board,new LinearLayout.LayoutParams(0,board.maxBoardHeight,1));LinearLayout controls=column();controls.setPadding(dp(8),0,0,0);table.addView(controls,new LinearLayout.LayoutParams(dp(190),-2));add(table,4);controlsHost=controls;compactPoolControls(s,finished);controlsHost=null;
    }else{
      int reserve="hangman".equals(game)?dp(s.optInt("setter")==me?210:560):"battleship".equals(game)?dp("placement".equals(s.optString("phase"))?310:175):dp(finished?170:130);
      board.maxBoardHeight=Math.max(dp("hangman".equals(game)?80:180),available-reserve);add(board,6);
      if("battleship".equals(game))fleetControls(s,finished,me);
      if("hangman".equals(game))hangmanControls(s,finished,me);
      if("connect4".equals(game))add(text("Tap a column to drop your disc.",12,MUTED,false),5);
      if("checkers".equals(game))add(text(s.isNull("forced")?"Select a piece, then a lit square.":"Keep jumping with the highlighted piece.",12,MUTED,false),5);
    }
    if(finished){JSONArray votes=GamesData.array(r,"rematchReady");boolean voted=false;for(int i=0;i<votes.length();i++)voted|=client.actor.equals(votes.optString(i));add(action(voted?"Waiting for your partner":"Play another round",true,!voted&&client.connected&&!client.commandBusy(),()->client.command("rematch",GamesData.obj("room",r.optString("id")))),6);}
  }
  private void playMenu(){
    String[] options={"Invite / share","Rules & help","Sound and motion","Players and score","React","Extra controls / move history"};
    dialog=new AlertDialog.Builder(activity).setTitle("Our game").setItems(options,(d,which)->{if(which==0)share(current);if(which==1)help(GamesData.index(current.optString("game")));if(which==2)settings();if(which==3){JSONArray players=GamesData.array(current,"players");StringBuilder message=new StringBuilder("Room "+current.optString("code")+" · Round "+current.optInt("round",1));for(int i=0;i<players.length();i++){JSONObject p=players.optJSONObject(i);message.append("\n").append(GamesData.name(p.optString("actor"))).append(p.optBoolean("online")?" · here":" · away");}new AlertDialog.Builder(activity).setTitle("Just us two").setMessage(message).setPositiveButton("Done",null).show();}if(which==4)new AlertDialog.Builder(activity).setItems(new String[]{"♡","👏","🎉","✨"},(a,i)->client.command("react",GamesData.obj("room",current.optString("id"),"emoji",new String[]{"♡","👏","🎉","✨"}[i]))).show();if(which==5)extraControls();}).setPositiveButton("Done",null).create();dialog.show();
  }
  private void extraControls(){
    if("checkers".equals(current.optString("game"))&&GamesData.array(GamesData.state(current),"moves").length()>0){checkersReplay(current);return;}
    LinearLayout options=column();options.setPadding(dp(16),dp(8),dp(16),dp(12));controlsHost=options;JSONObject state=GamesData.state(current);
    if("pool".equals(current.optString("game")))poolControls(state,"finished".equals(current.optString("status")));else if("battleship".equals(current.optString("game")))coordinateControls(board.placing());else if("checkers".equals(current.optString("game")))accessibleCheckers(state);else add(text("Tap the board to play. All squares also support your screen reader.",14,MUTED,false),6);controlsHost=null;
    ScrollView scroll=new ScrollView(activity);scroll.addView(options);dialog=new AlertDialog.Builder(activity).setTitle("Extra controls").setView(scroll).setPositiveButton("Done",null).create();dialog.setOnDismissListener(d->{aimBar=null;powerBar=null;signature="";refresh();});dialog.show();
  }
  private void compactPoolControls(JSONObject state,boolean finished){
    if(finished)return;
    if(state.optBoolean("ballInHand")){add(text("Ball in hand. Tap a clear spot on the table to place it.",14,INK,true),6);add(button("Set coordinates",false,this::extraControls),8);return;}
    if(board.moving()){add(text("Balls settling…",14,ACCENT,true),6);postDelayed(()->{signature="";refresh();},Math.max(50,current.optLong("availableAt")-System.currentTimeMillis()+50));return;}
    JSONArray groups=GamesData.array(state,"groups");int me=GamesData.player(current,client.actor);String group=groups.isNull(me)?"Open table":groups.optString(me);
    aimLabel=text(group+" · "+Math.round(power*100)+"%",13,INK,true);add(aimLabel,5);powerBar=slider("Shot power",100,Math.round(power*100));powerBar.setEnabled(board.myTurn());powerBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar v,int n,boolean user){power=Math.max(.01f,n/100f);aimLabel.setText(group+" · "+n+"%");}public void onStartTrackingTouch(SeekBar v){}public void onStopTrackingTouch(SeekBar v){}});add(powerBar,0);
    Spinner pockets=spinner(new String[]{"Top left","Top middle","Top right","Bottom right","Bottom middle","Bottom left"});pockets.setContentDescription("Called pocket for the eight ball");pockets.setSelection(pocket);pockets.setEnabled(board.myTurn());pockets.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> a,View v,int pos,long id){pocket=pos;}public void onNothingSelected(AdapterView<?> a){}});add(pockets,3);
    add(action("Shoot",true,board.myTurn(),()->move(GamesData.obj("type","shot","angle",board.angle,"power",power,"callPocket",pocket))),5);
  }

  private void checkersReplay(JSONObject room){
    JSONArray moves=GamesData.array(GamesData.state(room),"moves");
    LinearLayout content=column();content.setPadding(dp(16),dp(8),dp(16),dp(12));
    GamesBoard replay=new GamesBoard(activity,client.actor,this);
    TextView caption=text("Starting position",14,INK,true);
    content.addView(caption);content.addView(replay);
    SeekBar timeline=slider("Replay move",moves.length(),0);content.addView(timeline);
    LinearLayout navigation=row();
    navigation.addView(button("Previous",false,()->timeline.setProgress(Math.max(0,timeline.getProgress()-1))),new LinearLayout.LayoutParams(0,-2,1));
    navigation.addView(button("Next",false,()->timeline.setProgress(Math.min(moves.length(),timeline.getProgress()+1))),new LinearLayout.LayoutParams(0,-2,1));content.addView(navigation);
    Runnable show=()->{
      int step=timeline.getProgress();JSONObject snapshot,state;
      try{snapshot=new JSONObject(room.toString());state=GamesData.state(snapshot);state.put("board",GamesReplay.board(moves,step));state.put("legal",new JSONArray());state.put("forced",JSONObject.NULL);}catch(JSONException ignored){return;}
      replay.update(snapshot,null,false);
      caption.setText(step==0?"Starting position":"Move "+step+" of "+moves.length()+" · "+GamesReplay.notation(moves.optJSONObject(step-1)));
      timeline.setContentDescription("Replay move "+step+" of "+moves.length());
    };
    timeline.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar bar,int value,boolean user){show.run();}public void onStartTrackingTouch(SeekBar bar){}public void onStopTrackingTouch(SeekBar bar){}});
    show.run();
    StringBuilder history=new StringBuilder();for(int i=0;i<moves.length();i++){JSONObject move=moves.optJSONObject(i);history.append(i+1).append(". Player ").append(move.optInt("player")+1).append(" · ").append(GamesReplay.notation(move)).append('\n');}
    TextView list=text(history.toString(),12,MUTED,false);list.setTextIsSelectable(true);ScrollView historyScroll=new ScrollView(activity);historyScroll.addView(list);content.addView(historyScroll,new LinearLayout.LayoutParams(-1,dp(100)));
    dialog=new AlertDialog.Builder(activity,android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("Crown & Capture · replay").setView(content).setPositiveButton("Current board",null).create();dialog.show();
  }

  private void poolControls(JSONObject s,boolean finished){
    JSONArray groups=GamesData.array(s,"groups");int me=GamesData.player(current,client.actor);String group=groups.isNull(me)?"Open table":groups.optString(me);
    add(text(group+" · "+(s.isNull("foul")?"Call the eight’s pocket":s.optString("foul")),13,MUTED,false),12);
    if(finished)return;
    if(board.moving()){add(text("The balls are moving · controls return when the shot settles.",13,ACCENT,false),12);long wait=Math.max(50,current.optLong("availableAt")-System.currentTimeMillis()+50);postDelayed(()->{if(isShown()){signature="";refresh();}},wait);return;}
    if(s.optBoolean("ballInHand")){
      add(text("Ball in hand · tap a clear place for the cue ball, or set coordinates below.",14,INK,false),14);
      SeekBar x=slider("Cue ball horizontal position",1000,250),y=slider("Cue ball vertical position",500,250);add(x,6);add(y,6);add(action("Place cue ball",true,board.myTurn(),()->move(GamesData.obj("type","place","x",Math.max(11,Math.min(989,x.getProgress())),"y",Math.max(11,Math.min(489,y.getProgress()))))),8);return;
    }
    aimLabel=text("Aim · "+Math.round(Math.toDegrees(board.angle))+"°",13,MUTED,false);add(aimLabel,12);
    aimBar=slider("Aim in degrees",359,(int)((Math.toDegrees(board.angle)+360)%360));aimBar.setEnabled(board.myTurn());aimBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar v,int value,boolean user){if(user){board.angle=(float)Math.toRadians(value);board.invalidate();aimLabel.setText("Aim · "+value+"°");}}public void onStartTrackingTouch(SeekBar v){}public void onStopTrackingTouch(SeekBar v){}});add(aimBar,0);
    TextView powerLabel=text("Power · "+Math.round(power*100)+"%",13,MUTED,false);add(powerLabel,8);SeekBar strength=slider("Shot power percent",100,Math.round(power*100));powerBar=strength;strength.setEnabled(board.myTurn());strength.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar v,int value,boolean user){power=Math.max(.01f,value/100f);powerLabel.setText("Power · "+Math.round(power*100)+"%");}public void onStartTrackingTouch(SeekBar v){}public void onStopTrackingTouch(SeekBar v){}});add(strength,0);
    add(text("Drag the cloth to aim. Then pull back from the cue ball and release to shoot, or use the sliders and Shoot button.",13,MUTED,false),8);
    Spinner pockets=spinner(new String[]{"Top left pocket","Top middle pocket","Top right pocket","Bottom right pocket","Bottom middle pocket","Bottom left pocket"});pockets.setSelection(pocket);pockets.setContentDescription("Called pocket for the eight ball");pockets.setEnabled(board.myTurn());pockets.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> a,View v,int pos,long id){pocket=pos;}public void onNothingSelected(AdapterView<?> a){}});add(pockets,8);
    add(action("Shoot",true,board.myTurn(),()->move(GamesData.obj("type","shot","angle",board.angle,"power",power,"callPocket",pocket))),12);
  }

  private void hangmanControls(JSONObject s,boolean finished,int me){
    String phase=s.optString("phase");
    if("choose".equals(phase)&&s.optInt("setter")==me&&!finished){
      String[] categories={"romance","movies","animals","science","geography","food","technology","general"};Spinner category=spinner(categories);category.setContentDescription("Secret word category");add(category,14);
      add(action("Choose a surprise word",true,board.myTurn(),()->move(GamesData.obj("type","category","category",categories[category.getSelectedItemPosition()]))),8);
      EditText word=input("Or enter your own secret word");word.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);if(Build.VERSION.SDK_INT>=26)word.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);add(word,12);
      add(action("Send secret word",false,board.myTurn(),()->move(GamesData.obj("type","word","word",word.getText().toString().trim(),"category",categories[category.getSelectedItemPosition()]))),8);return;
    }
    if(!"choose".equals(phase)){
      add(text(s.optString("category","WORD CHALLENGE").toUpperCase(Locale.US),12,ACCENT,true),12);
      String pattern=s.optString("pattern","");
      HorizontalScrollView wordStrip=new HorizontalScrollView(activity);wordStrip.setHorizontalScrollBarEnabled(false);LinearLayout tiles=row();
      for(int i=0;i<pattern.length();i++){String letter=String.valueOf(pattern.charAt(i));TextView tile=text(letter.toUpperCase(Locale.US),20,INK,true);tile.setGravity(Gravity.CENTER);if(!" ".equals(letter))tile.setBackground(new BitmapDrawable(getResources(),GamesTextures.image(activity,"hangman/key")));LinearLayout.LayoutParams tp=new LinearLayout.LayoutParams(dp(" ".equals(letter)?14:34),dp(42));tp.setMargins(dp(2),0,dp(2),0);tiles.addView(tile,tp);}
      tiles.setContentDescription(pattern.replace("_"," blank "));wordStrip.addView(tiles);add(wordStrip,4);
      add(text(s.optInt("remaining",6)+" guesses left"+(s.has("deadline")&&!finished?" · timed round":""),13,MUTED,false),7);
      if(s.has("deadline")&&!finished){TextView countdown=text("",13,0xff9f4b6f,true);add(countdown,6);long deadline=s.optLong("deadline");Runnable tick=new Runnable(){public void run(){if(countdown.getParent()==null)return;long seconds=Math.max(0,(deadline-System.currentTimeMillis()+999)/1000);countdown.setText(seconds+" seconds remaining");if(seconds>0)countdown.postDelayed(this,1000);}};countdown.post(tick);}
      if(!s.isNull("word")&&s.has("word"))add(text((finished?"The word was ":"Your secret: ")+s.optString("word"),16,INK,true),9);
      if(!s.isNull("hint"))add(text(s.optString("hint"),14,0xff6b5cb5,false),9);
      if(!finished&&s.optInt("setter")!=me){
        JSONArray guesses=GamesData.array(s,"guesses");String pendingLetter=client.pending==null||client.pending.optJSONObject("action")==null?"":client.pending.optJSONObject("action").optString("letter");
        for(int start=0;start<26;start+=7){LinearLayout row=row();for(int i=start;i<Math.min(start+7,26);i++){final String letter=""+(char)('a'+i);boolean used=false;for(int j=0;j<guesses.length();j++)used|=letter.equalsIgnoreCase(guesses.optString(j));Button key=action(letter.toUpperCase(Locale.US),false,board.myTurn()&&!used,()->move(GamesData.obj("type","guess","letter",letter)));key.setBackground(new BitmapDrawable(getResources(),GamesTextures.image(activity,"hangman/key")));key.setTextColor(used?(pattern.contains(letter)?0xff2e746a:0xff9f4b6f):INK);key.setAlpha(used?.55f:pendingLetter.equals(letter)?.4f:1);key.setContentDescription("Guess letter "+letter+(used?", already guessed":pendingLetter.equals(letter)?", sending":""));key.setPadding(0,dp(4),0,dp(4));row.addView(key,new LinearLayout.LayoutParams(0,dp(48),1));}add(row,6);}
        add(action("Reveal one free hint",false,board.myTurn()&&!s.optBoolean("hintUsed"),()->move(GamesData.obj("type","hint"))),10);
      }
    }
  }

  private void fleetControls(JSONObject s,boolean finished,int me){
    if(board.placing()){
      if(board.ownFleetPlaced()){add(text("Fleet locked. Waiting for your partner.",13,MUTED,false),6);return;}
      String[] ships={"Carrier · 5 cells","Battleship · 4 cells","Cruiser · 3 cells","Submarine · 3 cells","Destroyer · 2 cells"};
      LinearLayout selection=row();Spinner choose=spinner(ships);choose.setSelection(board.fleet.selected);choose.setContentDescription("Ship to place");choose.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> a,View v,int pos,long id){if(pos!=board.fleet.selected){board.fleet.select(pos);selection();}}public void onNothingSelected(AdapterView<?> a){}});selection.addView(choose,new LinearLayout.LayoutParams(0,dp(48),1));
      Button rotate=button(board.fleet.vertical?"Rotate ↔":"Rotate ↕",false,()->{board.fleet.rotate();selection();});rotate.setContentDescription(board.fleet.vertical?"Rotate selected ship to horizontal":"Rotate selected ship to vertical");selection.addView(rotate,new LinearLayout.LayoutParams(dp(112),dp(48)));add(selection,5);
      int count=0;for(int[] ship:board.fleet.ships)if(ship!=null)count++;
      TextView feedback=text(board.fleet.message.isEmpty()?count+" / 5 placed · mint fits, rose cannot fit":board.fleet.message,12,board.fleet.message.isEmpty()?MUTED:0xff9f4b6f,false);feedback.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);add(feedback,5);
      LinearLayout actions=row();actions.addView(button("Arrange",false,()->{board.fleet.automatic();selection();}),new LinearLayout.LayoutParams(0,dp(48),1));actions.addView(button("Clear",false,()->{board.fleet.reset();selection();}),new LinearLayout.LayoutParams(0,dp(48),1));actions.addView(action("Lock fleet",true,client.connected&&!client.busy()&&board.fleet.complete(),()->{JSONArray fleet=new JSONArray();for(int[] cells:board.fleet.ships){JSONArray list=new JSONArray();for(int c:cells)list.put(c);fleet.put(GamesData.obj("cells",list));}move(GamesData.obj("type","fleet","ships",fleet));}),new LinearLayout.LayoutParams(0,dp(48),1));add(actions,6);
    }else{
      LinearLayout oceans=row();Button own=button("Your fleet",board.showingOwnOcean(),()->{board.showOcean(true);selection();}),target=button("Their waters",!board.showingOwnOcean(),()->{board.showOcean(false);selection();});oceans.addView(own,new LinearLayout.LayoutParams(0,dp(48),1));oceans.addView(target,new LinearLayout.LayoutParams(0,dp(48),1));add(oceans,6);
      add(text(finished?"Round complete. Inspect either ocean.":board.showingOwnOcean()?"Your fleet · watching incoming fire":"Tap a square to fire. The chart follows the turn.",12,MUTED,false),4);
    }
  }
  private void coordinateControls(boolean placement){
    String[] rows={"Row A","Row B","Row C","Row D","Row E","Row F","Row G","Row H","Row I","Row J"},columns=new String[10];for(int i=0;i<10;i++)columns[i]="Column "+(i+1);
    LinearLayout coordinates=row();Spinner row=spinner(rows),column=spinner(columns);row.setContentDescription("Ocean row");column.setContentDescription("Ocean column");coordinates.addView(row,new LinearLayout.LayoutParams(0,-2,1));coordinates.addView(column,new LinearLayout.LayoutParams(0,-2,1));add(coordinates,10);
    add(action(placement?"Place selected ship at coordinates":"Fire at coordinates",false,placement?client.connected&&!client.busy():board.myTurn(),()->board.activate(row.getSelectedItemPosition()*10+column.getSelectedItemPosition())),8);
  }
  private void accessibleCheckers(JSONObject s){
    if(!board.myTurn())return;JSONArray legal=GamesData.array(s,"legal");if(legal.length()==0)return;
    String[] descriptions=new String[legal.length()];for(int i=0;i<legal.length();i++){JSONObject m=legal.optJSONObject(i);int from=m.optInt("from"),to=m.optInt("to");descriptions[i]="Row "+(from/8+1)+", column "+(from%8+1)+" to row "+(to/8+1)+", column "+(to%8+1)+(m.has("captured")?" · capture":"");}
    Spinner choices=spinner(descriptions);choices.setContentDescription("Legal checkers move");add(choices,10);add(action("Make selected move",false,true,()->{JSONObject m=legal.optJSONObject(choices.getSelectedItemPosition());move(GamesData.obj("type","move","from",m.optInt("from"),"to",m.optInt("to")));}),8);
  }

  public void move(JSONObject action){if(current==null)return;feedback("pool".equals(current.optString("game"))?"pocket":"battleship".equals(current.optString("game"))?"splash":"connect4".equals(current.optString("game"))?"drop":"move");client.move(current,action);if(board!=null)board.update(current,client.pending,client.connected);refresh();}
  public void selection(){feedback("tap");signature="";refresh();}
  public void aim(float radians){if(aimLabel!=null)aimLabel.setText("Aim · "+Math.round((Math.toDegrees(radians)+360)%360)+"°");if(aimBar!=null)aimBar.setProgress((int)((Math.toDegrees(radians)+360)%360));}
  public void charge(float value,boolean release){power=value;if(powerBar!=null)powerBar.setProgress(Math.round(value*100));if(release&&value>=.03f&&board.myTurn())move(GamesData.obj("type","shot","angle",board.angle,"power",value,"callPocket",pocket));}
  private void feedback(String sound){if(getContext().getSharedPreferences("games-settings",0).getBoolean("haptics",true))Motion.haptic(this,false);audio.play(sound);}

  private void createDialog(int game){
    LinearLayout content=column();content.setPadding(dp(18),dp(8),dp(18),dp(8));content.addView(new GamesArt(activity,game),new LinearLayout.LayoutParams(-1,dp(180)));add(content,text("Choose the little details before inviting your person.",14,MUTED,false),8);
    Spinner best=spinner(new String[]{"One round","Best of three","Best of five"});best.setContentDescription("Series length");add(content,best,12);
    Spinner theme=spinner(new String[]{"Violet","Ocean","Rose"});theme.setContentDescription("Board color theme");add(content,theme,10);
    Spinner setter=spinner(new String[]{"I choose the first word","My partner chooses the first word"}),timer=spinner(new String[]{"No timer","60 seconds","120 seconds","300 seconds"});
    if(game==2){setter.setContentDescription("First word setter");timer.setContentDescription("Hangman timer");add(content,setter,10);add(content,timer,10);}
    dialog=new AlertDialog.Builder(activity,android.R.style.Theme_Material_Light_Dialog_Alert).setTitle(GamesData.TITLES[game]).setView(content).setNegativeButton("Cancel",null).setPositiveButton("Create room",(d,w)->{
      JSONObject settings=GamesData.obj("bestOf",new int[]{1,3,5}[best.getSelectedItemPosition()],"theme",new String[]{"violet","ocean","rose"}[theme.getSelectedItemPosition()],"setter",setter.getSelectedItemPosition());
      try{if(game==2&&timer.getSelectedItemPosition()>0)settings.put("timedSeconds",new int[]{0,60,120,300}[timer.getSelectedItemPosition()]);}catch(JSONException ignored){}
      client.command("create",GamesData.obj("game",GamesData.IDS[game],"settings",settings));refresh();audio.play("invite");
    }).create();dialog.show();
  }
  private void joinDialog(String initial){EditText code=input("Six-character room code");code.setFilters(new InputFilter[]{new InputFilter.AllCaps(),new InputFilter.LengthFilter(12)});code.setText(initial);code.setSingleLine();code.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);dialog=new AlertDialog.Builder(activity,android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("Your invitation awaits").setView(code).setNegativeButton("Cancel",null).setPositiveButton("Join room",(d,w)->{client.command("join",GamesData.obj("code",code.getText().toString().trim().toUpperCase(Locale.US)));refresh();}).create();dialog.show();}
  private void share(JSONObject r){
    String code=r.optString("code"),link="asechka://games?code="+code;
    LinearLayout options=column();options.setPadding(dp(20),dp(8),dp(20),dp(16));TextView label=text(code,34,ACCENT,true);label.setTextIsSelectable(true);add(options,label,6);add(options,text(link,14,MUTED,false),8);
    add(options,button("Copy room code",false,()->{((android.content.ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Game invitation",code));Toast.makeText(activity,"Room code copied",Toast.LENGTH_SHORT).show();}),12);
    add(options,button("Share invitation link",true,()->{Intent send=new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"A game, just us two. Join room "+code+"\n"+link);activity.startActivity(Intent.createChooser(send,"Invite your person"));}),8);
    dialog=new AlertDialog.Builder(activity,android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("A little invitation").setView(options).setPositiveButton("Done",null).create();dialog.show();
  }
  private void help(int game){dialog=new AlertDialog.Builder(activity,android.R.style.Theme_Material_Light_Dialog_Alert).setTitle(GamesData.TAGS[game]+" · how to play").setMessage(GamesData.RULES[game]+"\n\nConnection interrupted? Your last unconfirmed move is saved securely and retried with the same ID. If the board changed, it is synchronized and you can choose again. Both players must vote for a rematch.\n\nAccessibility: board squares are screen-reader buttons. Pool has aim and power sliders. Fleet coordinates and legal checkers moves have native controls.").setPositiveButton("Let’s play",null).create();dialog.show();}
  private void settings(){
    android.content.SharedPreferences prefs=activity.getSharedPreferences("games-settings",0);LinearLayout options=column();options.setPadding(dp(18),dp(8),dp(18),dp(10));
    for(String[] setting:new String[][]{{"sound","Original game sounds","false"},{"haptics","Gentle haptic feedback","true"},{"reduce-motion","Reduce motion / skip pool playback","false"}}){Switch toggle=new Switch(activity);toggle.setText(setting[1]);toggle.setTextColor(INK);toggle.setMinHeight(dp(56));toggle.setChecked(prefs.getBoolean(setting[0],Boolean.parseBoolean(setting[2])));toggle.setOnCheckedChangeListener((v,checked)->{prefs.edit().putBoolean(setting[0],checked).apply();if(board!=null)board.invalidate();});add(options,toggle,8);}
    add(options,text("Your phone’s animation and haptics preferences also apply. Sounds start off. Reduced motion shows the final pool positions while the server finishes the shot.",13,MUTED,false),14);
    dialog=new AlertDialog.Builder(activity,android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("Make yourself comfortable").setView(options).setPositiveButton("Done",null).create();dialog.show();
  }

  private int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
  private LinearLayout column(){LinearLayout c=new LinearLayout(activity);c.setOrientation(LinearLayout.VERTICAL);return c;}
  private LinearLayout row(){LinearLayout r=new LinearLayout(activity);r.setGravity(Gravity.CENTER_VERTICAL);return r;}
  private GradientDrawable shape(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
  private TextView text(String value,int size,int color,boolean bold){TextView t=new TextView(activity);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setIncludeFontPadding(false);t.setLineSpacing(0,1);Compat.font(t,R.font.dm_sans,bold?700:400);return t;}
  private Button button(String value,boolean primary,Runnable click){Button b=new Button(activity);b.setText(value);b.setTextSize(15);b.setIncludeFontPadding(false);Compat.font(b,R.font.dm_sans,600);b.setTextColor(primary?0xffffffff:INK);b.setAllCaps(false);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(48));b.setMinimumHeight(dp(48));b.setPadding(dp(12),dp(10),dp(12),dp(10));b.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(0x338b79ad),shape(primary?ACCENT:Ui.PALE,16),null));b.setOnClickListener(v->click.run());return b;}
  private Button action(String value,boolean primary,boolean enabled,Runnable click){Button b=button(value,primary,click);b.setEnabled(enabled);b.setAlpha(enabled?1:.45f);return b;}
  private EditText input(String hint){EditText e=new EditText(activity);e.setHint(hint);e.setContentDescription(hint);e.setTextColor(INK);e.setHintTextColor(MUTED);e.setTextSize(16);e.setMinHeight(dp(52));e.setPadding(dp(12),dp(10),dp(12),dp(10));e.setBackground(shape(PANEL,12));return e;}
  private Spinner spinner(String[] values){Spinner s=new Spinner(activity);ArrayAdapter<String> adapter=new ArrayAdapter<String>(activity,android.R.layout.simple_spinner_item,values){public View getView(int p,View v,android.view.ViewGroup parent){TextView t=(TextView)super.getView(p,v,parent);t.setTextColor(INK);t.setTextSize(14);t.setSingleLine(false);return t;}public View getDropDownView(int p,View v,android.view.ViewGroup parent){TextView t=(TextView)super.getDropDownView(p,v,parent);t.setTextColor(INK);t.setBackgroundColor(PANEL);t.setMinHeight(dp(48));return t;}};adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);s.setAdapter(adapter);s.setMinimumHeight(dp(50));s.setBackground(shape(PANEL,12));return s;}
  private SeekBar slider(String label,int max,int value){SeekBar s=new SeekBar(activity);s.setMax(max);s.setProgress(value);s.setContentDescription(label);s.setMinimumHeight(dp(48));s.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));s.setThumbTintList(android.content.res.ColorStateList.valueOf(ACCENT));return s;}
  private void add(View view,int top){add(controlsHost==null?body:controlsHost,view,top);}
  private void add(View view,int top,int height){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,height);p.topMargin=dp(top);body.addView(view,p);}
  private void add(LinearLayout parent,View view,int top){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(top);parent.addView(view,p);}
}
