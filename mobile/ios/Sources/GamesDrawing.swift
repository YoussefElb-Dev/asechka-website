import SwiftUI
import UIKit

struct GamesDrawingView: View {
    @ObservedObject var store:GamesStore
    var room:GamesRoom
    @EnvironmentObject private var universe:UniverseStore
    @State private var tool="pen"
    @State private var color="#263451"
    @State private var width=0.012
    @State private var guess=""
    @State private var queue:[GamesJSON]=[]
    private var artist:Bool {room.player(universe.actor)==room.state["drawer"].int}
    private var phase:String {room.state["phase"].string}
    static let colors=["#263451","#a292cf","#cd8ca7","#76b4ab","#c5a576","#8cb4d5","#ffffff"]
    var body:some View {
        VStack(spacing:10){
            TimelineView(.periodic(from:.now,by:0.25)){timeline in
                let seconds=max(0,Int(ceil(((room.state["deadline"].double ?? 0)/1000)-timeline.date.timeIntervalSince1970)))
                HStack{Text("Round \(room.state["round"].int ?? 1) / \(room.state["rounds"].int ?? 3)");Spacer();Label("\(seconds)s",systemImage:"timer").monospacedDigit()}.font(.subheadline.bold())
            }
            HStack{ForEach(Array(room.players.enumerated()),id:\.element.actor){index,player in Text(Post.name(player.actor)+" · \(room.state["points"][index].int ?? 0)").font(.subheadline.bold()).foregroundColor(GamesPalette.player(index)).frame(maxWidth:.infinity)}}
            Text(phase=="choose" ? (artist ? "Choose a word" : "Your partner is choosing…") : room.state["word"].isNull ? room.state["pattern"].string.replacingOccurrences(of:"_",with:"_ ") : room.state["word"].string).font(.system(.title3,design:.rounded).bold()).multilineTextAlignment(.center).fixedSize(horizontal:false,vertical:true)
            GamesDrawingPad(strokes:room.state["strokes"].array,turnKey:room.id+"\(room.state["drawer"].int ?? 0)"+phase,canDraw:artist && phase=="draw" && store.connected,tool:tool,color:color,width:width){action in if queue.count<80{queue.append(action);flush()}}.aspectRatio(4.0/3,contentMode:.fit).clipShape(RoundedRectangle(cornerRadius:16)).overlay(RoundedRectangle(cornerRadius:16).stroke(GamesPalette.line)).accessibilityLabel("Shared drawing canvas")
            controls
            VStack(alignment:.leading,spacing:5){
                ForEach(Array(room.state["chat"].array.suffix(6).enumerated()),id:\.offset){_,entry in
                    let player=entry["player"].int ?? 0
                    Text((room.players.indices.contains(player) ? Post.name(room.players[player].actor) : "Us")+": "+entry["text"].string+(entry["kind"].string=="close" ? " · so close!" : "")).font(.subheadline).foregroundColor(entry["kind"].string=="correct" ? GamesPalette.mint : GamesPalette.ink)
                }
                if phase=="reveal" {Text(room.state["lastResult"]["correct"].bool ? "Guessed it! +\(room.state["lastResult"]["guessPoints"].int ?? 0) / artist +\(room.state["lastResult"]["drawPoints"].int ?? 0)" : "Time is up! The word was "+room.state["word"].string).bold();Text("Next turn shortly…").font(.caption)}
            }.frame(maxWidth:.infinity,alignment:.leading).gamesPanel()
        }.onChange(of:store.pending){_ in flush()}.onChange(of:room.seq){_ in flush()}.onChange(of:phase){_ in queue=[];guess=""}
    }
    @ViewBuilder private var controls:some View {
        if phase=="choose" && artist {ForEach(Array(room.state["choices"].array.enumerated()),id:\.offset){index,word in Button{store.move(room,["type":"choose","index":.int(index)])}label:{Text(word.string).gamesAction()}.disabled(!store.canAct(room))}}
        else if phase=="draw" && artist {
            HStack(spacing:4){ForEach(Self.colors,id:\.self){value in Button{color=value;tool="pen"}label:{Circle().fill(Color(uiColor:GamesDrawingBitmap.color(value))).frame(width:28,height:28).overlay(Circle().stroke(value==color ? GamesPalette.ink : GamesPalette.line,lineWidth:value==color ? 3 : 1)).frame(maxWidth:.infinity,minHeight:44)}.accessibilityLabel("Brush color "+value)}}
            HStack{Picker("Tool",selection:$tool){Text("Pen").tag("pen");Text("Eraser").tag("eraser");Text("Fill").tag("fill")}.pickerStyle(.segmented);Slider(value:$width,in:0.002...0.04).accessibilityLabel("Brush width")}
            HStack{Button("Undo"){enqueue(["type":"undo"])}.frame(maxWidth:.infinity,minHeight:44);Button("Clear"){enqueue(["type":"clear"])}.frame(maxWidth:.infinity,minHeight:44)}.disabled(!store.connected)
        } else if phase=="draw" {
            HStack{TextField("Type your guess",text:$guess).textFieldStyle(.roundedBorder).autocorrectionDisabled(false).submitLabel(.send).onSubmit{submit()}.accessibilityIdentifier("games.drawing.guess");Button("Guess"){submit()}.frame(minHeight:44).disabled(!store.canAct(room)||guess.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)}
        }
    }
    private func submit(){guard store.canAct(room) else{return};let text=guess.trimmingCharacters(in:.whitespacesAndNewlines);guard !text.isEmpty else{return};store.move(room,["type":"guess","text":.string(String(text.prefix(80)))]);guess=""}
    private func enqueue(_ action:[String:GamesJSON]){queue.append(.object(action));flush()}
    private func flush(){guard artist,phase=="draw",store.canAct(room),!queue.isEmpty else{return};let action=queue.removeFirst();store.move(room,action.object)}
}

struct GamesDrawingPad:UIViewRepresentable {
    var strokes:[GamesJSON];var turnKey:String;var canDraw:Bool;var tool:String;var color:String;var width:Double;var onStroke:(GamesJSON)->Void
    func makeUIView(context:Context)->GamesDrawingPadView {GamesDrawingPadView()}
    func updateUIView(_ view:GamesDrawingPadView,context:Context){view.onStroke=onStroke;view.canDraw=canDraw;view.tool=tool;view.color=color;view.brushWidth=width;view.update(strokes,key:turnKey)}
}

final class GamesDrawingPadView:UIView {
    var onStroke:((GamesJSON)->Void)?;var canDraw=false;var tool="pen",color="#263451",brushWidth=0.012
    private var strokeTool="pen",strokeColor="#263451",strokeWidth=0.012
    private var strokes:[GamesJSON]=[],optimistic:[GamesJSON]=[],draft:[CGPoint]=[];private var image:UIImage?;private var key="";private var lastBatch=Date.distantPast
    override init(frame:CGRect){super.init(frame:frame);backgroundColor = .white;isMultipleTouchEnabled=false;isOpaque=true}
    required init?(coder:NSCoder){fatalError("init(coder:) has not been implemented")}
    func update(_ values:[GamesJSON],key:String){if key != self.key{self.key=key;optimistic=[];draft=[]};if values != strokes {let added=values.count-strokes.count;let appending=values.count>=strokes.count && Array(values.prefix(strokes.count))==strokes;if added>0{optimistic=Array(optimistic.dropFirst(min(added,optimistic.count)))}else if added<0{optimistic=[]};image=appending ? GamesDrawingBitmap.render(Array(values.dropFirst(strokes.count)),startingWith:image) : GamesDrawingBitmap.render(values);strokes=values;setNeedsDisplay()}}
    override func draw(_ rect:CGRect){let c=UIGraphicsGetCurrentContext()!;c.saveGState();c.scaleBy(x:bounds.width/640,y:bounds.height/480);image?.draw(in:CGRect(x:0,y:0,width:640,height:480));for stroke in optimistic{GamesDrawingBitmap.stroke(stroke,in:c)};if !draft.isEmpty{GamesDrawingBitmap.stroke(action(),in:c)};c.restoreGState()}
    private func action()->GamesJSON{.object(["type":"stroke","tool":.string(strokeTool),"color":.string(strokeColor),"width":.number(strokeWidth),"points":.array(draft.map{.array([.number($0.x),.number($0.y)])})])}
    override func touchesBegan(_ touches:Set<UITouch>,with event:UIEvent?){guard canDraw else{return};draft=[];strokeTool=tool;strokeColor=color;strokeWidth=brushWidth;lastBatch=Date();append(touches,ended:false)}
    override func touchesMoved(_ touches:Set<UITouch>,with event:UIEvent?){guard canDraw,!draft.isEmpty else{return};append(touches,ended:false)}
    override func touchesEnded(_ touches:Set<UITouch>,with event:UIEvent?){guard canDraw,!draft.isEmpty else{return};append(touches,ended:true)}
    override func touchesCancelled(_ touches:Set<UITouch>,with event:UIEvent?){draft=[];setNeedsDisplay()}
    private func append(_ touches:Set<UITouch>,ended:Bool){guard let touch=touches.first,bounds.width>0,bounds.height>0 else{return};let p=touch.location(in:self),point=CGPoint(x:min(1,max(0,p.x/bounds.width)),y:min(1,max(0,p.y/bounds.height)));draft.append(point)
        if ended || draft.count>=100 || (strokeTool != "fill" && Date().timeIntervalSince(lastBatch)>0.15 && draft.count>2){let stroke=action();optimistic.append(stroke);onStroke?(stroke);draft=ended ? [] : [point];lastBatch=Date()};setNeedsDisplay()
    }
}

enum GamesDrawingBitmap {
    static func color(_ hex:String)->UIColor {let v=Int(hex.dropFirst(),radix:16) ?? 0x263451;return UIColor(red:Double((v>>16)&255)/255,green:Double((v>>8)&255)/255,blue:Double(v&255)/255,alpha:1)}
    static func render(_ strokes:[GamesJSON],startingWith base:UIImage? = nil)->UIImage {
        var image=base ?? UIGraphicsImageRenderer(size:CGSize(width:640,height:480),format:format).image{ctx in UIColor.white.setFill();ctx.fill(CGRect(x:0,y:0,width:640,height:480))}
        for value in strokes {if value["tool"].string=="fill"{image=fill(image,at:value["points"][0],hex:value["color"].string)}else{let old=image;image=UIGraphicsImageRenderer(size:CGSize(width:640,height:480),format:format).image{ctx in old.draw(at:.zero);stroke(value,in:ctx.cgContext)}}};return image
    }
    private static var format:UIGraphicsImageRendererFormat {let f=UIGraphicsImageRendererFormat();f.scale=1;f.opaque=true;return f}
    static func stroke(_ value:GamesJSON,in c:CGContext){let points=value["points"].array;guard !points.isEmpty else{return};let tool=value["tool"].string;if tool=="fill"{return};c.saveGState();c.setStrokeColor((tool=="eraser" ? UIColor.white : color(value["color"].string)).cgColor);c.setFillColor((tool=="eraser" ? UIColor.white : color(value["color"].string)).cgColor);let width=(value["width"].double ?? 0.012)*640;c.setLineWidth(width);c.setLineCap(.round);c.setLineJoin(.round)
        let first=CGPoint(x:(points[0][0].double ?? 0)*640,y:(points[0][1].double ?? 0)*480);if points.count==1{c.fillEllipse(in:CGRect(x:first.x-width/2,y:first.y-width/2,width:width,height:width))}else{c.beginPath();c.move(to:first);for p in points.dropFirst(){c.addLine(to:CGPoint(x:(p[0].double ?? 0)*640,y:(p[1].double ?? 0)*480))};c.strokePath()};c.restoreGState()
    }
    private static func fill(_ image:UIImage,at point:GamesJSON,hex:String)->UIImage {
        guard let cg=image.cgImage else{return image};var pixels=[UInt32](repeating:0,count:640*480)
        return pixels.withUnsafeMutableBytes{bytes in
            guard let c=CGContext(data:bytes.baseAddress,width:640,height:480,bitsPerComponent:8,bytesPerRow:640*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue) else{return image}
            c.draw(cg,in:CGRect(x:0,y:0,width:640,height:480));let raw=bytes.bindMemory(to:UInt32.self),x=min(639,max(0,Int((point[0].double ?? 0)*640))),y=min(479,max(0,Int((point[1].double ?? 0)*480))),start=y*640+x,target=raw[start],v=UInt32(hex.dropFirst(),radix:16) ?? 0x263451
            let replacement=((v&255)<<16)|((v>>8&255)<<8)|(v>>16&255)|0xff000000
            if replacement != target {var stack=[start];raw[start]=replacement;while let pos=stack.popLast(){let px=pos%640;for n in [px>0 ? pos-1 : -1,px<639 ? pos+1 : -1,pos-640,pos+640] where n>=0 && n<raw.count {if raw[n]==target{raw[n]=replacement;stack.append(n)}}}}
            guard let result=c.makeImage() else{return image};return UIImage(cgImage:result)
        }
    }
}
