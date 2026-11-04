package app.asechka.android;

import android.content.Context;
import android.graphics.*;
import android.view.View;

/** Every letter remains visible, wrapping long phrases onto additional rows. */
final class WordTiles extends View {
  final String pattern;
  final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
  final float density;
  int columns=1;
  WordTiles(Context context,String pattern){super(context);this.pattern=pattern.toUpperCase(java.util.Locale.US);density=getResources().getDisplayMetrics().density;setContentDescription("Word pattern: "+pattern.replace("_"," blank "));}
  protected void onMeasure(int width,int height){int w=MeasureSpec.getSize(width);columns=Math.max(1,(int)(w/(32*density)));int rows=Math.max(1,(pattern.length()+columns-1)/columns);setMeasuredDimension(w,(int)(rows*46*density));}
  protected void onDraw(Canvas canvas){
    super.onDraw(canvas);float tile=Math.min(34*density,getWidth()/(float)Math.min(columns,Math.max(1,pattern.length()))-4*density);
    int rows=(pattern.length()+columns-1)/columns;
    for(int row=0;row<rows;row++){int count=Math.min(columns,pattern.length()-row*columns);float left=(getWidth()-count*(tile+4*density))/2;
      for(int col=0;col<count;col++){char letter=pattern.charAt(row*columns+col);if(letter==' ')continue;float x=left+col*(tile+4*density),y=row*46*density;
        paint.setColor(0xfff4f0fa);canvas.drawRoundRect(x,y,x+tile,y+40*density,7*density,7*density,paint);
        paint.setColor(0xffd4c8e5);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(density);canvas.drawRoundRect(x,y,x+tile,y+40*density,7*density,7*density,paint);paint.setStyle(Paint.Style.FILL);
        paint.setColor(Ui.INK);paint.setTextAlign(Paint.Align.CENTER);paint.setTypeface(Typeface.MONOSPACE);paint.setTextSize(Math.min(20*density,tile*.65f));canvas.drawText(String.valueOf(letter),x+tile/2,y+20*density-(paint.ascent()+paint.descent())/2,paint);
      }
    }
  }
}
