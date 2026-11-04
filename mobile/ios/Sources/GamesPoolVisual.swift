import SwiftUI

enum GamesPoolVisual {
    static let colors: [Color] = [.init(red:0.98,green:0.97,blue:0.95),.init(red:0.77,green:0.65,blue:0.46),.init(red:0.55,green:0.71,blue:0.84),GamesPalette.rose,GamesPalette.lilac,.init(red:0.87,green:0.68,blue:0.60),GamesPalette.mint,.init(red:0.68,green:0.53,blue:0.64),GamesPalette.ink]
    static func rotate(_ q: [Double], _ x: Double, _ y: Double, _ z: Double) -> SIMD3<Double> {
        let t = SIMD3(2*(q[2]*z-q[3]*y),2*(q[3]*x-q[1]*z),2*(q[1]*y-q[2]*x))
        return SIMD3(x+q[0]*t.x+q[2]*t.z-q[3]*t.y,y+q[0]*t.y+q[3]*t.x-q[1]*t.z,z+q[0]*t.z+q[1]*t.y-q[2]*t.x)
    }
    static func blend(_ a: [Double], _ b: [Double], _ t: Double) -> [Double] {
        let sign = zip(a,b).reduce(0.0){$0+$1.0*$1.1} < 0 ? -1.0 : 1.0
        let q = (0..<4).map{a[$0]*(1-t)+b[$0]*t*sign}, n = sqrt(q.reduce(0){$0+$1*$1})
        return q.map{$0/max(n,0.000001)}
    }
    static func ball(_ ball: GamesBall, _ context: GraphicsContext) {
        var c=context;c.translateBy(x:ball.x,y:ball.y)
        c.fill(Path(ellipseIn:CGRect(x:-10,y:-7,width:23,height:21)),with:.color(GamesPalette.ink.opacity(0.22)))
        let shape=Path(ellipseIn:CGRect(x:-11,y:-11,width:22,height:22)), id=ball.id
        let color=colors[id==0 ? 0 : id==8 ? 8 : (id-1)%8+1]
        c.fill(shape,with:.color(id>8 ? colors[0] : color));c.clip(to:shape)
        if id>8 {
            for i in 0..<40 {
                let a=Double(i)*2*Double.pi/40,b=Double(i+1)*2*Double.pi/40
                let vs=[rotate(ball.q,cos(a)*0.9165,sin(a)*0.9165,-0.4),rotate(ball.q,cos(b)*0.9165,sin(b)*0.9165,-0.4),rotate(ball.q,cos(b)*0.9165,sin(b)*0.9165,0.4),rotate(ball.q,cos(a)*0.9165,sin(a)*0.9165,0.4)]
                var points:[CGPoint]=[]
                for j in 0..<4 {let v=vs[j],u=vs[(j+1)%4];if v.z>=0{points.append(CGPoint(x:v.x*11,y:v.y*11))};if (v.z>=0) != (u.z>=0){let t=v.z/(v.z-u.z);points.append(CGPoint(x:(v.x+(u.x-v.x)*t)*11,y:(v.y+(u.y-v.y)*t)*11))}}
                if let first=points.first {var path=Path();path.move(to:first);for point in points.dropFirst(){path.addLine(to:point)};path.closeSubpath();c.fill(path,with:.color(color))}
            }
        }
        if id==0 {
            for dot in [SIMD3<Double>(1,0,0),SIMD3(-1,0,0),SIMD3(0,1,0),SIMD3(0,-1,0),SIMD3(0,0,1),SIMD3(0,0,-1)] {let n=rotate(ball.q,dot.x,dot.y,dot.z);if n.z>0.08{c.fill(Path(ellipseIn:CGRect(x:n.x*10-1.4,y:n.y*10-n.z*1.4,width:2.8,height:n.z*2.8)),with:.color(GamesPalette.rose))}}
        } else {
            for side in [1.0,-1.0] {let n=rotate(ball.q,0,0,side);if n.z>0.08 {var patch=c;patch.translateBy(x:n.x*9.3,y:n.y*9.3);patch.rotate(by:.radians(atan2(n.y,n.x)));patch.scaleBy(x:n.z,y:1);patch.fill(Path(ellipseIn:CGRect(x:-4.8,y:-4.8,width:9.6,height:9.6)),with:.color(.white));patch.rotate(by:.degrees(90));patch.draw(Text("\(id)").font(.system(size:6.8,weight:.bold)).foregroundColor(GamesPalette.ink),at:.zero)}}
        }
        c.fill(shape,with:.radialGradient(Gradient(colors:[.white.opacity(0.32),.clear,GamesPalette.ink.opacity(0.5)]),center:CGPoint(x:-4,y:-5),startRadius:0,endRadius:19))
    }
    struct Hit {var x:Double;var y:Double;var id:Int;var nx:Double;var ny:Double}
    static func hit(_ balls:[GamesBall],_ x:Double,_ y:Double,_ dx:Double,_ dy:Double,_ ignore:Int,_ limit:Double)->Hit {
        var t=limit,nx=0.0,ny=0.0,id = -1
        if dx>1e-8 && (989-x)/dx<t {t=(989-x)/dx;nx = -1;ny=0};if dx < -1e-8 && (11-x)/dx<t {t=(11-x)/dx;nx=1;ny=0}
        if dy>1e-8 && (489-y)/dy<t {t=(489-y)/dy;nx=0;ny = -1};if dy < -1e-8 && (11-y)/dy<t {t=(11-y)/dy;nx=0;ny=1}
        for b in balls where !b.pocketed && b.id != ignore {let bx=b.x-x,by=b.y-y,along=bx*dx+by*dy,disc=484-(bx*bx+by*by-along*along);if disc<0{continue};let v=along-sqrt(disc);if v>0.01 && v<t {t=v;id=b.id;nx=(bx-dx*t)/22;ny=(by-dy*t)/22}}
        return Hit(x:x+dx*max(0,t),y:y+dy*max(0,t),id:id,nx:nx,ny:ny)
    }
    static func guide(_ balls:[GamesBall],angle:Double,in c:GraphicsContext) {
        guard let cue=balls.first(where:{$0.id==0 && !$0.pocketed}) else{return}
        func line(_ x:Double,_ y:Double,_ ex:Double,_ ey:Double,_ color:Color){var p=Path();p.move(to:CGPoint(x:x,y:y));p.addLine(to:CGPoint(x:ex,y:ey));c.stroke(p,with:.color(color),style:StrokeStyle(lineWidth:2,lineCap:.round))}
        let dx=cos(angle),dy=sin(angle),h=hit(balls,cue.x,cue.y,dx,dy,0,2000)
        line(cue.x,cue.y,h.x,h.y,.white.opacity(0.8));c.stroke(Path(ellipseIn:CGRect(x:h.x-11,y:h.y-11,width:22,height:22)),with:.color(.white.opacity(0.8)),lineWidth:1.6)
        if h.id>=0 {let dot=dx*h.nx+dy*h.ny,ox=h.x+22*h.nx,oy=h.y+22*h.ny,out=hit(balls,ox,oy,h.nx,h.ny,h.id,190);line(ox,oy,out.x,out.y,GamesPalette.rose);let tx=dx-dot*h.nx,ty=dy-dot*h.ny,n=hypot(tx,ty);if n>0.04{let tail=hit(balls,h.x,h.y,tx/n,ty/n,0,130*n);line(h.x,h.y,tail.x,tail.y,GamesPalette.mint)}}
        else if h.nx != 0 || h.ny != 0 {let dot=dx*h.nx+dy*h.ny,out=hit(balls,h.x+h.nx*0.1,h.y+h.ny*0.1,dx-2*dot*h.nx,dy-2*dot*h.ny,0,160);line(h.x,h.y,out.x,out.y,GamesPalette.mint.opacity(0.6))}
    }
}

struct GamesSpinControl: View {
    @Binding var x:Double
    @Binding var y:Double
    var body:some View {
        VStack(spacing:12){Text("Cue-ball spin").font(.title2.bold());Text("Top adds follow. Bottom adds draw. Left / right changes cushion rebound.").font(.subheadline).multilineTextAlignment(.center)
            GeometryReader{g in let r=min(g.size.width,g.size.height)*0.4;let center=CGPoint(x:g.size.width/2,y:g.size.height/2)
                ZStack{Circle().fill(GamesPalette.surface);Circle().stroke(GamesPalette.lilac,lineWidth:2);Path{p in p.move(to:CGPoint(x:0,y:r));p.addLine(to:CGPoint(x:r*2,y:r));p.move(to:CGPoint(x:r,y:0));p.addLine(to:CGPoint(x:r,y:r*2))}.stroke(GamesPalette.lilac.opacity(0.4));Circle().fill(GamesPalette.rose).frame(width:24,height:24).offset(x:x*r,y:-y*r)}.frame(width:r*2,height:r*2).position(center).contentShape(Circle()).gesture(DragGesture(minimumDistance:0,coordinateSpace:.named("spin")).onChanged{v in let a=(v.location.x-center.x)/r,b = -(v.location.y-center.y)/r,n=max(1,hypot(a,b));x=a/n;y=b/n})
            }.coordinateSpace(name:"spin").frame(height:270).accessibilityLabel("Spin selector. Top is follow, bottom is draw.")
            HStack{Text("Side");Slider(value:$x,in:-1...1).onChange(of:x){_ in y = min(sqrt(max(0,1-x*x)),max(-sqrt(max(0,1-x*x)),y))}};HStack{Text("Follow / draw");Slider(value:$y,in:-1...1).onChange(of:y){_ in x=min(sqrt(max(0,1-y*y)),max(-sqrt(max(0,1-y*y)),x))}}
            Button("Center cue tip"){x=0;y=0}
        }.padding(24).foregroundColor(GamesPalette.ink).tint(GamesPalette.lilac)
    }
}
