package app.asechka.android;

import android.content.Context;
import android.graphics.*;
import android.view.View;

/** Original little still lifes, drawn with paths and light rather than image assets. */
final class GamesArt extends View {
  private final int game;
  private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
  GamesArt(Context context, int game) {
    super(context); this.game = game;
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
  }
  protected void onDraw(Canvas c) {
    super.onDraw(c);
    c.save(); c.scale(getWidth() / 400f, getHeight() / 280f);
    int accent = GamesData.COLORS[game];
    p.setShader(new RadialGradient(230, 100, 240, new int[] {accent & 0x38ffffff, 0x00191d30}, null, Shader.TileMode.CLAMP));
    c.drawRect(0, 0, 400, 280, p); p.setShader(null);
    for (int i = 0; i < 20; i++) {
      p.setColor(i % 3 == 0 ? 0x887e92b2 : 0x337e92b2);
      c.drawCircle((i * 73 + 21) % 390, (i * 43 + 15) % 260, i % 3 == 0 ? 1.7f : 1, p);
    }
    c.save(); c.translate(200, 140); c.rotate(game == 0 ? -13 : game == 5 ? -8 : -6);
    if (game == 0) {
      fill(c, -163, -86, 163, 86, 25, 0xff45382f);
      fill(c, -151, -74, 151, 74, 18, 0xff153e3c);
      fill(c, -140, -64, 140, 64, 12, 0xff1e6355);
      for (int x : new int[] {-138, 0, 138}) for (int y : new int[] {-62, 62}) disk(c, x, y, 10, 0xff09171b);
      line(c, -137, 111, 17, 11, 6, 0xffc8aa75);
      line(c, -136, 111, -123, 102, 7, 0xffece0c8);
      ball(c, -69, 17, 17, 0, 0xfff6f0e7);
      ball(c, 55, -15, 21, 8, 0xff151b29);
      ball(c, 94, 18, 17, 3, 0xffe39488);
      ball(c, 22, 29, 17, 10, 0xff9db5ff);
      line(c, -46, 12, 23, -7, 2, 0x77eef9e9);
    } else if (game == 1) {
      fill(c, -105, -105, 105, 105, 27, 0xff29283d);
      for (int a : new int[] {-35, 35}) { line(c, a, -88, a, 88, 3, 0xff58516e); line(c, -88, a, 88, a, 3, 0xff58516e); }
      for (int[] v : new int[][] {{-70,-70},{0,0},{70,70}}) {
        line(c, v[0]-19, v[1]-19, v[0]+19, v[1]+19, 10, 0xffd2b4ff);
        line(c, v[0]+19, v[1]-19, v[0]-19, v[1]+19, 10, 0xffd2b4ff);
      }
      ring(c, 0, -70, 23, 8, 0xff8bbbc8); ring(c, -70, 70, 23, 8, 0xff8bbbc8);
      line(c, -94, -94, 94, 94, 3, 0x99eadbff);
    } else if (game == 2) {
      fill(c, -130, -79, 130, 79, 18, 0xffb28d60);
      fill(c, -122, -86, 122, 70, 16, 0xffeadac0);
      line(c, 0, -80, 0, 65, 2, 0xffc2aa89);
      for (int i = 0; i < 4; i++) line(c, -103, -42+i*23, -25, -42+i*23, 3, 0xffc3ad8a);
      p.setTextAlign(Paint.Align.CENTER); p.setTypeface(Typeface.create("serif", Typeface.ITALIC));
      p.setTextSize(78); p.setStyle(Paint.Style.FILL); p.setColor(0xff886049); c.drawText("?", 62, 29, p);
      for (int i = 0; i < 4; i++) {
        fill(c, -99+i*52, 93, -56+i*52, 136, 8, 0xff3d3540);
        p.setTypeface(Typeface.DEFAULT_BOLD); p.setTextSize(23); p.setColor(accent); c.drawText(new String[] {"L", "O", "_", "E"}[i], -78+i*52, 122, p);
      }
    } else if (game == 3) {
      fill(c, -128, -103, 128, 100, 20, 0xff314c78);
      for (int row = 0; row < 5; row++) for (int col = 0; col < 7; col++) {
        int color = 0xff141e34;
        if (row >= 3 || (col == 2 && row == 2) || (col == 3 && row == 1)) color = (col + row) % 2 == 0 ? 0xffe9c388 : 0xffb6a2ed;
        disk(c, -102+col*34, -75+row*35, 12.5f, color);
      }
      line(c, -139, 110, 139, 110, 12, 0xff617ba2);
      disk(c, 0, -139, 16, 0xffe9c388);
    } else if (game == 4) {
      fill(c, -111, -111, 111, 111, 15, 0xff4b3545);
      for (int r = 0; r < 6; r++) for (int col = 0; col < 6; col++) {
        p.setStyle(Paint.Style.FILL); p.setColor((r+col)%2 == 0 ? 0xffbea998 : 0xff4e4350);
        c.drawRect(-102+col*34, -102+r*34, -68+col*34, -68+r*34, p);
      }
      for (int[] v : new int[][] {{-51,-51},{51,-51},{-17,51}}) {
        disk(c, v[0], v[1]+4, 25, 0xff652f49); disk(c, v[0], v[1], 25, 0xffedafbd); ring(c, v[0], v[1], 17, 2, 0xffb4778d);
      }
      disk(c, 51, 51, 28, 0xff20233a); ring(c, 51, 51, 20, 2, 0xffb1b5cf);
      Path crown = new Path(); crown.moveTo(36, 46); crown.lineTo(43, 51); crown.lineTo(51, 39); crown.lineTo(59, 51); crown.lineTo(66, 46); crown.lineTo(62, 63); crown.lineTo(40, 63); crown.close();
      p.setColor(0xfff4d3a1); p.setStyle(Paint.Style.FILL); c.drawPath(crown,p);
    } else {
      for (int r = -3; r <= 3; r++) line(c, -160, r*32, 160, r*32, 1, 0xff2c475d);
      for (int col = -4; col <= 4; col++) line(c, col*32, -100, col*32, 100, 1, 0xff2c475d);
      ring(c, 35, 0, 100, 2, 0x665fa8bb); ring(c, 35, 0, 58, 1, 0x995fa8bb);
      Path ship = new Path(); ship.moveTo(-127,30); ship.lineTo(114,30); ship.lineTo(77,65); ship.lineTo(-97,65); ship.close();
      p.setColor(0xffa5c2d1); p.setStyle(Paint.Style.FILL); c.drawPath(ship,p);
      fill(c,-61,0,52,30,3,0xff7898b0); fill(c,-16,-24,18,0,3,0xffa5c2d1);
      line(c,1,-24,1,-62,4,0xffaacbd6); line(c,-20,-44,25,-44,3,0xffaacbd6);
      line(c,-68,-2,-94,-20,5,0xffb2cbd4);
      disk(c, 118, -62, 9, 0xfff0b89b); ring(c, 118, -62, 20, 2, 0x88f0b89b);
      for (int i = 0; i < 4; i++) line(c,-135+i*67,89,-105+i*67,89,3,0xff6ea3b6);
    }
    c.restore(); c.restore();
  }
  private void fill(Canvas c,float l,float t,float r,float b,float radius,int color) {
    p.setStyle(Paint.Style.FILL); p.setColor(color); c.drawRoundRect(l,t,r,b,radius,radius,p);
  }
  private void disk(Canvas c,float x,float y,float radius,int color) { p.setStyle(Paint.Style.FILL); p.setColor(color); c.drawCircle(x,y,radius,p); }
  private void line(Canvas c,float x,float y,float x2,float y2,float width,int color) {
    p.setStyle(Paint.Style.STROKE); p.setColor(color); p.setStrokeWidth(width); p.setStrokeCap(Paint.Cap.ROUND); c.drawLine(x,y,x2,y2,p);
  }
  private void ring(Canvas c,float x,float y,float radius,float width,int color) { p.setStyle(Paint.Style.STROKE); p.setColor(color); p.setStrokeWidth(width); c.drawCircle(x,y,radius,p); }
  private void ball(Canvas c,float x,float y,float radius,int id,int color) {
    disk(c,x+3,y+5,radius,0x88071015); disk(c,x,y,radius,color);
    if(id != 0) { disk(c,x,y,radius*.43f,0xfff8f2e9); p.setStyle(Paint.Style.FILL); p.setColor(0xff242331); p.setTextSize(radius*.65f); p.setTypeface(Typeface.DEFAULT_BOLD); p.setTextAlign(Paint.Align.CENTER); c.drawText(""+id,x,y+radius*.22f,p); }
    disk(c,x-radius*.3f,y-radius*.4f,radius*.17f,0x66ffffff);
  }
}
