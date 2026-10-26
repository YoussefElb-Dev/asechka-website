import SwiftUI
import UIKit

struct DoorView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var code=""
    @State private var typing=false
    @State private var shake:CGFloat=0
    @FocusState private var keyboard:Bool
    private let columns=Array(repeating:GridItem(.flexible(),spacing:12),count:3)
    var body:some View {
        GeometryReader{geometry in
            ScrollView{
                VStack(spacing:0){
                    Image(systemName:"heart").font(.system(size:29,weight:.light)).foregroundColor(Palette.purple)
                        .frame(width:60,height:60).background(Palette.gradient,in:RoundedRectangle(cornerRadius:25)).accessibilityHidden(true)
                    Text("Welcome home, \(universe.name). ").font(.custom("Manrope-Bold",size:26)).multilineTextAlignment(.center).padding(.top,14)
                    Text("Our little world, kept just for us.\nEnter our code to come inside.").font(.system(size:14)).multilineTextAlignment(.center).foregroundColor(Palette.muted).padding(.top,8)
                    Group {
                        if typing {
                            SecureField("Our little code",text:$code).textContentType(.password).autocorrectionDisabled().textInputAutocapitalization(.never).focused($keyboard).submitLabel(.go).onSubmit(open)
                        } else {
                            HStack(spacing:8){
                                if code.isEmpty {Text("Our little code").font(.system(size:17)).foregroundColor(Palette.muted)}
                                else {ForEach(0..<min(code.count,12),id:\.self){_ in Circle().fill(Palette.purple).frame(width:9,height:9)};if code.count>12{Text("+\(code.count-12)").font(.caption)}}
                            }.accessibilityElement(children:.ignore).accessibilityLabel("Our little code").accessibilityValue(code.isEmpty ? "Empty":"\(code.count) characters entered")
                        }
                    }.frame(maxWidth:.infinity,minHeight:56).padding(.horizontal,14).background(.white,in:RoundedRectangle(cornerRadius:20)).padding(.top,20).offset(x:shake)
                    Text(universe.doorError ?? "A little door. A whole lot of love.").font(.system(size:12)).multilineTextAlignment(.center).foregroundColor(Palette.muted).frame(minHeight:38).accessibilityIdentifier("Door status")
                    if !typing {
                        LazyVGrid(columns:columns,spacing:10){ForEach(1...12,id:\.self){value in
                            Button{
                                Touch.tap()
                                if value==10{code=""}else if value==12{if !code.isEmpty{code.removeLast()}}else if code.count<160{code += value==11 ? "0":"\(value)"}
                            }label:{
                                Group{if value==10{Image(systemName:"heart")}else if value==12{Image(systemName:"delete.left")}else{Text(value==11 ? "0":"\(value)").font(.custom("Manrope-Regular",size:25))}}
                                    .font(.system(size:22,weight:.light)).frame(maxWidth:.infinity,minHeight:58).background(value==10 ? Palette.lavender:value==12 ? Palette.blue:.white,in:RoundedRectangle(cornerRadius:23))
                            }.accessibilityLabel(value==10 ? "Clear code":value==12 ? "Delete digit":"Digit \(value==11 ? 0:value)")
                        }}.disabled(universe.busy)
                    }
                    Button(action:open){HStack{if universe.busy{ProgressView().tint(.white)};Text(universe.busy ? "Opening…":"Open our little door →").frame(maxWidth:.infinity)}.primary()}.disabled(universe.busy).padding(.top,18).accessibilityIdentifier("Unlock door")
                    if universe.biometricEnabled && BiometricAccess.available {
                        Button{Task{await universe.biometricLogin()}}label:{Label("Unlock with \(BiometricAccess.name)",systemImage:BiometricAccess.symbol).frame(maxWidth:.infinity,minHeight:48).background(Palette.lavender,in:RoundedRectangle(cornerRadius:16))}.disabled(universe.busy).padding(.top,8)
                    }
                    Button(typing ? "Use number pad":"Use keyboard"){Touch.tap();typing.toggle();keyboard=typing}.frame(minHeight:44).font(.system(size:14)).disabled(universe.busy).padding(.top,5)
                    Text("Only us, always. ♡").font(.system(size:12)).foregroundColor(Palette.muted).padding(.top,8)
                }.padding(.horizontal,26).padding(.vertical,22).frame(maxWidth:420).frame(maxWidth:.infinity,minHeight:geometry.size.height)
            }.scrollDismissesKeyboard(.interactively)
        }.background(Palette.background.ignoresSafeArea()).foregroundColor(Palette.ink).buttonStyle(SoftPress())
            .onChange(of:phase){if $0 != .active{code="";keyboard=false;typing=false}}
            .onReceive(NotificationCenter.default.publisher(for:UIApplication.willResignActiveNotification)){_ in code="";keyboard=false;typing=false}
            .onChange(of:universe.doorError){value in
                guard value != nil else{return};code=""
                if !reduced{withAnimation(.easeInOut(duration:0.08).repeatCount(4,autoreverses:true)){shake=7};DispatchQueue.main.asyncAfter(deadline:.now()+0.35){shake=0}}
            }
    }
    private func open(){guard !universe.busy else{return};keyboard=false;Task{await universe.login(code);code=""}}
}

/// A separate native window covers presented editors without dismissing their unsaved drafts.
struct AppDoorWindow:UIViewRepresentable {
    @EnvironmentObject var universe:UniverseStore
    func makeCoordinator()->Coordinator{Coordinator(universe)}
    func makeUIView(context:Context)->UIView{let view=DoorAnchor();view.isUserInteractionEnabled=false;context.coordinator.anchor=view;view.attached={ [weak coordinator=context.coordinator] in coordinator?.update() };return view}
    func updateUIView(_ view:UIView,context:Context){context.coordinator.update()}
    static func dismantleUIView(_ view:UIView,coordinator:Coordinator){coordinator.hide()}
    @MainActor final class Coordinator:NSObject {
        let universe:UniverseStore
        weak var anchor:UIView?
        weak var previous:UIWindow?
        var door:UIWindow?
        init(_ universe:UniverseStore){self.universe=universe;super.init();NotificationCenter.default.addObserver(self,selector:#selector(protect),name:UIApplication.willResignActiveNotification,object:nil)}
        deinit{NotificationCenter.default.removeObserver(self)}
        @objc func protect(){universe.requireCode();update()}
        func update(){
            guard universe.requiresCode,universe.unlocked,!universe.actor.isEmpty else{hide();return}
            guard door==nil else{return}
            guard let scene=anchor?.window?.windowScene ?? UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene}).first else{return}
            previous=scene.windows.first(where:{$0.isKeyWindow})
            previous?.accessibilityElementsHidden=true
            let window=UIWindow(windowScene:scene)
            window.windowLevel=UIWindow.Level(rawValue:UIWindow.Level.alert.rawValue+2)
            window.backgroundColor=UIColor(Palette.background)
            window.rootViewController=UIHostingController(rootView:DoorView().environmentObject(universe).preferredColorScheme(.light))
            window.rootViewController?.view.accessibilityViewIsModal=true
            door=window;window.makeKeyAndVisible()
        }
        func hide(){guard let window=door else{return};window.isHidden=true;door=nil;previous?.accessibilityElementsHidden=false;previous?.makeKey();previous=nil}
    }
}

private final class DoorAnchor:UIView {
    var attached:(()->Void)?
    override func didMoveToWindow(){super.didMoveToWindow();if window != nil{attached?()}}
}
