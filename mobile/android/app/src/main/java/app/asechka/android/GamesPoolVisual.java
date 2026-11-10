package app.asechka.android;

import android.graphics.*;
import org.json.*;
import java.util.*;

/** Sphere rotation and first-contact geometry, in the server's table units. */
final class GamesPoolVisual {
  static final int[] COLORS={0xfffaf8f3,0xffc5a576,0xff8cb4d5,0xffcd8ca7,0xffa292cf,0xffddad9a,0xff76b4ab,0xffad87a3,0xff263451};
  static double[] q(JSONObject b){JSONArray a=b.optJSONArray("q");return a!=null&&a.length()==4?new double[]{a.optDouble(0),a.optDouble(1),a.optDouble(2),a.optDouble(3)}:new double[]{1,0,0,0};}
  static double[] blend(double[] a,double[] b,double t){double dot=0,n=0;for(int i=0;i<4;i++)dot+=a[i]*b[i];double[] v=new double[4];for(int i=0;i<4;i++){v[i]=a[i]*(1-t)+b[i]*t*(dot<0?-1:1);n+=v[i]*v[i];}for(int i=0;i<4;i++)v[i]/=Math.sqrt(Math.max(n,.000001));return v;}
  static double[] rotate(double[] q,double x,double y,double z){double tx=2*(q[2]*z-q[3]*y),ty=2*(q[3]*x-q[1]*z),tz=2*(q[1]*y-q[2]*x);return new double[]{x+q[0]*tx+q[2]*tz-q[3]*ty,y+q[0]*ty+q[3]*tx-q[1]*tz,z+q[0]*tz+q[1]*ty-q[2]*tx};}
  static void ball(Canvas c,double x,double y,int id,double[] q,Paint p){
    c.save();c.translate((float)x,(float)y);
    p.setStyle(Paint.Style.FILL);p.setShader(null);p.setColor(0x55263451);c.drawOval(-10,-7,13,14,p);
    int color=COLORS[id==0?0:id==8?8:(id-1)%8+1];p.setColor(id>8?0xfffaf8f3:color);c.drawCircle(0,0,11,p);
    c.save();Path clip=new Path();clip.addCircle(0,0,11,Path.Direction.CW);c.clipPath(clip);
    if(id>8){p.setColor(color);for(int i=0;i<40;i++){double a=i*Math.PI*2/40,b=(i+1)*Math.PI*2/40;double[][] vs={rotate(q,Math.cos(a)*.9165,-.4,Math.sin(a)*.9165),rotate(q,Math.cos(b)*.9165,-.4,Math.sin(b)*.9165),rotate(q,Math.cos(b)*.9165,.4,Math.sin(b)*.9165),rotate(q,Math.cos(a)*.9165,.4,Math.sin(a)*.9165)};Path path=new Path();boolean started=false;for(int j=0;j<4;j++){double[] v=vs[j],u=vs[(j+1)%4];if(v[2]>=0){if(!started){path.moveTo((float)v[0]*11,(float)v[1]*11);started=true;}else path.lineTo((float)v[0]*11,(float)v[1]*11);}if((v[2]>=0)!=(u[2]>=0)){double t=v[2]/(v[2]-u[2]);float px=(float)(v[0]+(u[0]-v[0])*t)*11,py=(float)(v[1]+(u[1]-v[1])*t)*11;if(!started){path.moveTo(px,py);started=true;}else path.lineTo(px,py);}}path.close();c.drawPath(path,p);}}
    if(id==0){for(double[] dot:new double[][]{{1,0,0},{-1,0,0},{0,1,0},{0,-1,0},{0,0,1},{0,0,-1}}){double[] n=rotate(q,dot[0],dot[1],dot[2]);if(n[2]>.08){p.setColor(0xffcd8ca7);c.drawOval((float)n[0]*10-1.4f,(float)n[1]*10-(float)n[2]*1.4f,(float)n[0]*10+1.4f,(float)n[1]*10+(float)n[2]*1.4f,p);}}}
    else for(int side:new int[]{1,-1}){double[] n=rotate(q,0,0,side);if(n[2]>.08){c.save();c.translate((float)n[0]*9.3f,(float)n[1]*9.3f);c.rotate((float)Math.toDegrees(Math.atan2(n[1],n[0])));c.scale((float)n[2],1);p.setColor(0xfffffdf8);c.drawCircle(0,0,4.8f,p);c.rotate(90);p.setColor(0xff263451);p.setTextSize(6.8f);p.setTypeface(Typeface.DEFAULT_BOLD);p.setTextAlign(Paint.Align.CENTER);c.drawText(""+id,0,-(p.ascent()+p.descent())/2,p);p.setTextAlign(Paint.Align.LEFT);c.restore();}}
    p.setShader(new RadialGradient(-4,-5,19,new int[]{0x55ffffff,0x00ffffff,0x88263451},new float[]{0,.45f,1},Shader.TileMode.CLAMP));c.drawCircle(0,0,11,p);p.setShader(null);c.restore();c.restore();
  }
  // Returns closest ray intersection with a ball's expanded radius or a cushion.
  static double[] hit(JSONArray balls,double x,double y,double dx,double dy,int ignore,double limit){
    double t=limit,nx=0,ny=0;int id=-1;
    if(dx>1e-8&& (989-x)/dx<t){t=(989-x)/dx;nx=-1;ny=0;}if(dx<-1e-8&&(11-x)/dx<t){t=(11-x)/dx;nx=1;ny=0;}if(dy>1e-8&&(489-y)/dy<t){t=(489-y)/dy;nx=0;ny=-1;}if(dy<-1e-8&&(11-y)/dy<t){t=(11-y)/dy;nx=0;ny=1;}
    for(int i=0;i<balls.length();i++){JSONObject b=balls.optJSONObject(i);if(b==null||b.optBoolean("pocketed")||b.optInt("id")==ignore)continue;double bx=b.optDouble("x")-x,by=b.optDouble("y")-y,along=bx*dx+by*dy,disc=484-(bx*bx+by*by-along*along);if(disc<0)continue;double v=along-Math.sqrt(disc);if(v>.01&&v<t){t=v;id=b.optInt("id");nx=(bx-dx*t)/22;ny=(by-dy*t)/22;}}
    return new double[]{x+dx*Math.max(0,t),y+dy*Math.max(0,t),id,nx,ny};
  }
  static void line(Canvas c,Paint p,double x,double y,double ex,double ey,int color){p.setShader(null);p.setColor(color);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(2);p.setStrokeCap(Paint.Cap.ROUND);c.drawLine((float)x,(float)y,(float)ex,(float)ey,p);p.setStyle(Paint.Style.FILL);}
  static void guide(Canvas c,Paint p,JSONArray balls,double angle,int player,JSONArray groups){
    JSONObject cue=null;for(int i=0;i<balls.length();i++)if(balls.optJSONObject(i).optInt("id")==0)cue=balls.optJSONObject(i);if(cue==null||cue.optBoolean("pocketed"))return;
    double x=cue.optDouble("x"),y=cue.optDouble("y"),dx=Math.cos(angle),dy=Math.sin(angle);double[] h=hit(balls,x,y,dx,dy,0,2000);line(c,p,x,y,h[0],h[1],0xcceef7f2);p.setColor(0xcceef7f2);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(1.6f);c.drawCircle((float)h[0],(float)h[1],11,p);p.setStyle(Paint.Style.FILL);
    if(h[2]>=0){double dot=dx*h[3]+dy*h[4],ox=h[0]+22*h[3],oy=h[1]+22*h[4];double[] out=hit(balls,ox,oy,h[3],h[4],(int)h[2],190);line(c,p,ox,oy,out[0],out[1],0xffcd8ca7);double tx=dx-dot*h[3],ty=dy-dot*h[4],len=Math.hypot(tx,ty);if(len>.04){double[] tail=hit(balls,h[0],h[1],tx/len,ty/len,0,130*len);line(c,p,h[0],h[1],tail[0],tail[1],0xff76b4ab);}}
    else if(h[3]!=0||h[4]!=0){double dot=dx*h[3]+dy*h[4];double[] out=hit(balls,h[0]+h[3]*.1,h[1]+h[4]*.1,dx-2*dot*h[3],dy-2*dot*h[4],0,160);line(c,p,h[0],h[1],out[0],out[1],0x8876b4ab);}
  }
}
