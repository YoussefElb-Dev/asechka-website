package app.asechka.android;
import android.content.Context;
import android.graphics.*;
import android.view.*;
final class GamesSpinView extends View {
  interface Change {void changed(float x,float y);}
  float x,y;final Change change;final Paint p=new Paint(3);
  GamesSpinView(Context c,float x,float y,Change change){super(c);this.x=x;this.y=y;this.change=change;setContentDescription("Cue ball spin. Drag the rose dot. Top is follow, bottom is draw.");setFocusable(true);}
  protected void onMeasure(int w,int h){setMeasuredDimension(MeasureSpec.getSize(w),(int)(230*getResources().getDisplayMetrics().density));}
  protected void onDraw(Canvas c){float r=Math.min(getWidth(),getHeight())*.4f,cx=getWidth()/2f,cy=getHeight()/2f;p.setStyle(Paint.Style.FILL);p.setColor(0xfff2eff8);c.drawCircle(cx,cy,r,p);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(2);p.setColor(0xffa292cf);c.drawCircle(cx,cy,r,p);c.drawLine(cx-r,cy,cx+r,cy,p);c.drawLine(cx,cy-r,cx,cy+r,p);p.setStyle(Paint.Style.FILL);p.setColor(0xffcd8ca7);c.drawCircle(cx+x*r,cy-y*r,r*.11f,p);}
  public boolean onTouchEvent(MotionEvent e){if(e.getActionMasked()==MotionEvent.ACTION_DOWN)getParent().requestDisallowInterceptTouchEvent(true);if(e.getActionMasked()==MotionEvent.ACTION_DOWN||e.getActionMasked()==MotionEvent.ACTION_MOVE){float r=Math.min(getWidth(),getHeight())*.4f;x=(e.getX()-getWidth()/2f)/r;y=-(e.getY()-getHeight()/2f)/r;float n=(float)Math.max(1,Math.hypot(x,y));x/=n;y/=n;change.changed(x,y);invalidate();return true;}if(e.getActionMasked()==MotionEvent.ACTION_UP){performClick();return true;}return true;}
  public boolean performClick(){super.performClick();return true;}
}
