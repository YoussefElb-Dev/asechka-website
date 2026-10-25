import SwiftUI
import UIKit

/// A non-key, touch-through application window above sheets, cards, navigation, and headers.
@MainActor final class HeartRain:NSObject {
    static let shared=HeartRain()
    static let particleLimit=96
    private(set) var overlayWindow:UIWindow?
    private var surface:HeartSurface?
    private var link:CADisplayLink?
    func emit(at anchor:CGRect) {
        guard !UIAccessibility.isReduceMotionEnabled,!UserDefaults.standard.bool(forKey:"motion-paused"),
              let scene=UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene}).first(where:{$0.activationState == .foregroundActive}) else{return}
        if overlayWindow == nil || overlayWindow?.windowScene !== scene {
            stop()
            let window=HeartWindow(windowScene:scene),controller=UIViewController(),canvas=HeartSurface(frame:.zero)
            controller.view=canvas;controller.view.backgroundColor = .clear
            window.rootViewController=controller;window.backgroundColor = .clear
            window.windowLevel = UIWindow.Level(rawValue:UIWindow.Level.alert.rawValue+1);window.isUserInteractionEnabled=false
            window.accessibilityElementsHidden=true;window.isHidden=false
            overlayWindow=window;surface=canvas
        }
        surface?.emit(at:CGPoint(x:anchor.midX,y:anchor.midY))
        if link == nil {
            let display=CADisplayLink(target:self,selector:#selector(frame(_:)))
            display.preferredFrameRateRange=CAFrameRateRange(minimum:60,maximum:60,preferred:60)
            display.add(to:.main,forMode:.common);link=display
        }
    }
    @objc private func frame(_ display:CADisplayLink) {
        guard let surface else{stop();return}
        surface.advance(display.targetTimestamp)
        if surface.particles.isEmpty{stop()}
    }
    func stop(){link?.invalidate();link=nil;overlayWindow?.isHidden=true;overlayWindow=nil;surface=nil}
}
private final class HeartWindow:UIWindow {
    override func hitTest(_ point:CGPoint,with event:UIEvent?)->UIView?{nil}
}
private struct FloatingHeart {
    let born:CFTimeInterval=CACurrentMediaTime()
    let origin:CGPoint
    let phase=CGFloat.random(in:0...6.283)
    let size=CGFloat.random(in:20...35)
    let duration=Double.random(in:2...2.45)
    let color=Int.random(in:0..<3)
}
private final class HeartSurface:UIView {
    var particles:[FloatingHeart]=[]
    private let sprites:[UIImage]=[UIColor(red:0.63,green:0.55,blue:0.83,alpha:1),UIColor(red:0.53,green:0.62,blue:0.81,alpha:1),UIColor(red:0.83,green:0.58,blue:0.74,alpha:1)].map{color in
        UIGraphicsImageRenderer(size:CGSize(width:48,height:48)).image{_ in
            color.setFill();let p=UIBezierPath();p.move(to:CGPoint(x:24,y:43))
            p.addCurve(to:CGPoint(x:4,y:16),controlPoint1:CGPoint(x:19,y:37),controlPoint2:CGPoint(x:2,y:27))
            p.addCurve(to:CGPoint(x:24,y:12),controlPoint1:CGPoint(x:6,y:1),controlPoint2:CGPoint(x:20,y:1))
            p.addCurve(to:CGPoint(x:44,y:16),controlPoint1:CGPoint(x:28,y:1),controlPoint2:CGPoint(x:42,y:1))
            p.addCurve(to:CGPoint(x:24,y:43),controlPoint1:CGPoint(x:46,y:27),controlPoint2:CGPoint(x:29,y:37));p.close();p.fill()
        }
    }
    override init(frame:CGRect){super.init(frame:frame);isOpaque=false;isUserInteractionEnabled=false;accessibilityElementsHidden=true}
    required init?(coder:NSCoder){fatalError("init(coder:) is unavailable")}
    func emit(at point:CGPoint){if particles.count>=HeartRain.particleLimit{particles.removeFirst()};particles.append(FloatingHeart(origin:point))}
    func advance(_ now:CFTimeInterval){particles.removeAll{now-$0.born >= $0.duration};setNeedsDisplay()}
    override func draw(_ rect:CGRect){
        guard let c=UIGraphicsGetCurrentContext() else{return}
        let now=CACurrentMediaTime()
        for p in particles {
            let t=CGFloat((now-p.born)/p.duration);guard t>=0,t<1 else{continue}
            let x=p.origin.x+sin(t*7+p.phase)*26,y=p.origin.y-t*(p.origin.y+90)
            let size=p.size*(0.6+0.4*min(1,t*12))
            c.saveGState();c.setAlpha(min(1,t*15)*min(1,(1-t)*4));c.translateBy(x:x,y:y);c.rotate(by:sin(t*5+p.phase)*0.24)
            sprites[p.color].draw(in:CGRect(x:-size/2,y:-size/2,width:size,height:size));c.restoreGState()
        }
    }
}
private struct HeartAnchor:PreferenceKey {
    static var defaultValue=CGRect.zero
    static func reduce(value:inout CGRect,nextValue:()->CGRect){value=nextValue()}
}
struct HeartSendButton:View {
    @EnvironmentObject private var universe:UniverseStore
    @State private var anchor=CGRect.zero
    var body:some View {
        Button{HeartRain.shared.emit(at:anchor);Touch.tap();do{try universe.sendHeart()}catch{universe.error=error.localizedDescription}}label:{
            HStack(spacing:8){
                Image(systemName:"heart.fill").font(.system(size:16,weight:.semibold)).foregroundColor(Color(red:174/255,green:118/255,blue:156/255))
                Text("Send a heart").font(.system(size:14,weight:.semibold)).foregroundColor(Palette.ink)
            }.padding(.horizontal,14).frame(minHeight:48).background(.white,in:Capsule())
                .overlay(Capsule().stroke(Palette.purple.opacity(0.14),lineWidth:1))
        }.fixedSize(horizontal:true,vertical:false)
            .accessibilityLabel("Send a heart to \(universe.partner)")
            .background(GeometryReader{proxy in Color.clear.preference(key:HeartAnchor.self,value:proxy.frame(in:.global))})
            .onPreferenceChange(HeartAnchor.self){anchor=$0}
    }
}
