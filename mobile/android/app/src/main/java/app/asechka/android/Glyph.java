package app.asechka.android;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;

/** Original, consistently weighted line symbols for the shared visual language. */
final class Glyph extends Drawable {
  private final String name;
  private final int color;
  Glyph(String name,int color){this.name=name;this.color=color;}
  public void draw(Canvas c){c.save();Rect b=getBounds();c.translate(b.left,b.top);c.scale(b.width()/24f,b.height()/24f);draw(c,name,color);c.restore();}
  public void setAlpha(int alpha){}
  public void setColorFilter(ColorFilter filter){}
  public int getOpacity(){return PixelFormat.TRANSLUCENT;}
  public int getIntrinsicWidth(){return 24;}
  public int getIntrinsicHeight(){return 24;}
  static ImageView view(Context context,String name,int color){ImageView v=new ImageView(context);v.setImageDrawable(new Glyph(name,color));return v;}
  static void leading(TextView v,String name,int color,int size,int gap){Ui u=new Ui(v.getContext());Glyph d=new Glyph(name,color);d.setBounds(0,0,u.dp(size),u.dp(size));v.setCompoundDrawablesRelative(d,null,null,null);v.setCompoundDrawablePadding(u.dp(gap));}
  static void draw(Canvas c,String name,int color){
    Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);p.setColor(color);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(1.65f);p.setStrokeCap(Paint.Cap.ROUND);p.setStrokeJoin(Paint.Join.ROUND);Path q=new Path();
    switch(name){
      case "home": q.moveTo(2,10);q.lineTo(12,2);q.lineTo(22,10);q.moveTo(5,9);q.lineTo(5,22);q.lineTo(10,22);q.lineTo(10,15);q.lineTo(14,15);q.lineTo(14,22);q.lineTo(19,22);q.lineTo(19,9);break;
      case "photos": c.drawRoundRect(2,2,18,18,2,2,p);c.drawRoundRect(6,6,22,22,2,2,p);q.moveTo(7,18);q.lineTo(12,13);q.lineTo(16,17);q.lineTo(19,14);q.lineTo(22,17);c.drawCircle(11,10,1,p);break;
      case "quote": c.drawRoundRect(2,3,22,19,3,3,p);q.moveTo(16,19);q.lineTo(18,23);q.lineTo(11,19);c.drawArc(7,8,11,14,0,175,false,p);c.drawArc(14,8,18,14,0,175,false,p);q.moveTo(7,8);q.lineTo(10,8);q.lineTo(10,11);q.moveTo(14,8);q.lineTo(17,8);q.lineTo(17,11);break;
      case "music": q.moveTo(10,18);q.lineTo(10,5);q.lineTo(20,3);q.lineTo(20,16);q.moveTo(10,9);q.lineTo(20,7);c.drawOval(4,16,10,21,p);c.drawOval(14,14,20,19,p);break;
      case "days":case "sparkles": star(c,p,14,13,8);star(c,p,5,5,3);star(c,p,4,19,2);return;
      case "words": c.drawRoundRect(5,2,23,18,3,3,p);q.moveTo(17,18);q.lineTo(13,22);q.lineTo(13,18);q.moveTo(3,6);q.lineTo(1,6);q.lineTo(1,21);q.lineTo(7,21);q.moveTo(9,13);q.lineTo(13,5);q.lineTo(17,13);q.moveTo(11,10);q.lineTo(15,10);break;
      case "games": q.moveTo(8,6);q.cubicTo(2,5,0,17,3,20);q.cubicTo(5,22,8,17,10,17);q.lineTo(14,17);q.cubicTo(16,17,19,22,21,20);q.cubicTo(24,17,22,5,16,6);q.close();q.moveTo(6,10);q.lineTo(6,15);q.moveTo(3.5f,12.5f);q.lineTo(8.5f,12.5f);c.drawCircle(17,11,0.7f,p);c.drawCircle(19.5f,14,0.7f,p);break;
      case "plus": q.moveTo(12,5);q.lineTo(12,19);q.moveTo(5,12);q.lineTo(19,12);break;
      case "plus.square": c.drawRoundRect(2,2,22,22,4,4,p);q.moveTo(12,7);q.lineTo(12,17);q.moveTo(7,12);q.lineTo(17,12);break;
      case "envelope":case "letter":c.drawRoundRect(2,4,22,20,2,2,p);q.moveTo(3,6);q.lineTo(12,13);q.lineTo(21,6);q.moveTo(3,19);q.lineTo(9,12);q.moveTo(21,19);q.lineTo(15,12);break;
      case "refresh": c.drawArc(3,3,21,21,-52,300,false,p);q.moveTo(15,2);q.lineTo(20,5);q.lineTo(16,9);break;
      case "heart":case "heart.fill":q.moveTo(12,21);q.cubicTo(9,18,2,13,2,7.5f);q.cubicTo(2,1,9,1,12,6);q.cubicTo(15,1,22,1,22,7.5f);q.cubicTo(22,13,15,18,12,21);q.close();if(name.endsWith("fill"))p.setStyle(Paint.Style.FILL_AND_STROKE);break;
      case "bookmark":case "bookmark.fill":q.moveTo(6,2);q.lineTo(18,2);q.lineTo(18,22);q.lineTo(12,17);q.lineTo(6,22);q.close();if(name.endsWith("fill"))p.setStyle(Paint.Style.FILL_AND_STROKE);break;
      case "book":c.drawRoundRect(4,2,20,22,2,2,p);c.drawLine(7,2,7,22,p);c.drawLine(11,7,17,7,p);c.drawLine(11,11,17,11,p);c.drawLine(11,15,15,15,p);break;
      case "fork":q.moveTo(3,2);q.lineTo(3,7);q.cubicTo(3,12,10,12,10,7);q.lineTo(10,2);q.moveTo(6.5f,2);q.lineTo(6.5f,22);q.moveTo(20,2);q.cubicTo(14,4,14,12,20,12);q.lineTo(20,22);q.moveTo(20,2);q.lineTo(20,12);break;
      case "infinity":q.moveTo(12,12);q.cubicTo(4,-1,-4,17,5,18);q.cubicTo(12,19,13,5,19,6);q.cubicTo(28,7,20,25,12,12);break;
      case "camera":c.drawRoundRect(2,6,22,21,3,3,p);q.moveTo(7,6);q.lineTo(9,3);q.lineTo(15,3);q.lineTo(17,6);c.drawCircle(12,13,4,p);break;
      case "vault":q.moveTo(12,2);q.lineTo(21,6);q.lineTo(20,15);q.quadTo(18,20,12,23);q.quadTo(6,20,4,15);q.lineTo(3,6);q.close();c.drawRoundRect(8,10,16,17,1,1,p);c.drawArc(9,6,15,14,180,180,false,p);break;
      case "location":q.moveTo(3,10);q.lineTo(22,2);q.lineTo(14,21);q.lineTo(11,13);q.close();p.setStyle(Paint.Style.FILL);break;
      case "expand":q.moveTo(9,3);q.lineTo(3,3);q.lineTo(3,9);q.moveTo(3,3);q.lineTo(10,10);q.moveTo(15,21);q.lineTo(21,21);q.lineTo(21,15);q.moveTo(21,21);q.lineTo(14,14);break;
      case "search":c.drawCircle(10,10,7,p);q.moveTo(15,15);q.lineTo(22,22);break;
      case "comment":c.drawRoundRect(2,3,22,18,5,5,p);q.moveTo(16,18);q.lineTo(21,22);q.lineTo(20,16);break;
      case "send":q.moveTo(2,10);q.lineTo(22,2);q.lineTo(15,22);q.lineTo(11,13);q.close();c.drawLine(11,13,22,2,p);break;
      case "circle":c.drawCircle(12,12,9,p);break;
      case "check.circle":c.drawCircle(12,12,9,p);q.moveTo(7,12);q.lineTo(10,15);q.lineTo(17,8);break;
      case "settings":for(int i=0;i<3;i++){float y=5+i*7;c.drawLine(2,y,22,y,p);c.drawCircle(i==1?15:8,y,2,p);}break;
      case "more":p.setStyle(Paint.Style.FILL);for(int x=5;x<=19;x+=7)c.drawCircle(x,12,1.6f,p);return;
      case "close":q.moveTo(5,5);q.lineTo(19,19);q.moveTo(19,5);q.lineTo(5,19);break;
      case "chevron":q.moveTo(9,5);q.lineTo(16,12);q.lineTo(9,19);break;
      case "arrow.up.right":q.moveTo(5,19);q.lineTo(20,4);q.moveTo(9,4);q.lineTo(20,4);q.lineTo(20,15);break;
      default:c.drawCircle(12,12,8,p);
    }
    c.drawPath(q,p);
  }
  private static void star(Canvas c,Paint p,float x,float y,float r){Path q=new Path();q.moveTo(x,y-r);q.quadTo(x,y,x+r,y);q.quadTo(x,y,x,y+r);q.quadTo(x,y,x-r,y);q.quadTo(x,y,x,y-r);Paint.Style old=p.getStyle();p.setStyle(Paint.Style.FILL);c.drawPath(q,p);p.setStyle(old);}
}
