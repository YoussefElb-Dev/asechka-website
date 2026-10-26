import SwiftUI
import UIKit

/// Used only to connect a new phone to the existing protected website.
struct DoorView:View {
    @EnvironmentObject private var universe:UniverseStore
    @State private var code=""
    var body:some View {
        ScrollView{VStack(alignment:.leading,spacing:24){
            Avatar(actor:universe.actor,size:66).padding(.top,50)
            Text("Connect our little space.").font(.custom("Manrope-Bold",size:32))
            Text("Connect once with our website code. We’ll keep you signed in on this phone.").foregroundColor(Palette.muted)
            SecureField("Our website code",text:$code).textContentType(.password).textInputAutocapitalization(.never).autocorrectionDisabled().padding(17).background(.white,in:RoundedRectangle(cornerRadius:16)).onSubmit{Task{await universe.login(code);code=""}}
            if let error=universe.doorError{Text(error).font(.footnote).foregroundColor(Palette.muted)}
            Button{Task{await universe.login(code);code=""}}label:{Text(universe.busy ? "Connecting…":"Connect our space ♡").frame(maxWidth:.infinity).primary()}.disabled(universe.busy || code.isEmpty)
            Button("Switch profile"){universe.choose("")}
        }.padding(26)}
    }
}

private struct BiometricGate:View {
    @EnvironmentObject private var universe:UniverseStore
    var body:some View {
        VStack(spacing:24){
            Image(systemName:BiometricAccess.symbol).font(.system(size:46,weight:.light)).foregroundColor(Palette.purple)
            Text("A little moment, just for us.").font(.custom("Manrope-Bold",size:26)).multilineTextAlignment(.center)
            Button{Task{await universe.biometricLogin()}}label:{Text("Unlock with \(BiometricAccess.name)").frame(maxWidth:.infinity).primary()}.disabled(universe.busy)
            Text("Your phone’s passcode is available through the system prompt.").font(.footnote).foregroundColor(Palette.muted).multilineTextAlignment(.center)
            if let error=universe.doorError{Text(error).font(.footnote).foregroundColor(Palette.muted)}
        }.padding(32).frame(maxWidth:.infinity,maxHeight:.infinity).background(Palette.background.ignoresSafeArea()).buttonStyle(SoftPress())
            .task{if UIApplication.shared.applicationState == .active{await universe.biometricLogin()}}
            .onReceive(NotificationCenter.default.publisher(for:UIApplication.didBecomeActiveNotification)){_ in Task{await universe.biometricLogin()}}
    }
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
            window.rootViewController=UIHostingController(rootView:BiometricGate().environmentObject(universe).preferredColorScheme(.light))
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
