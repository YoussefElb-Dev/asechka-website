import SwiftUI
import UIKit

enum Palette {
    static let ink=Color(red:38/255,green:52/255,blue:81/255)
    static let muted=Color(red:100/255,green:112/255,blue:139/255)
    static let purple=Color(red:107/255,green:92/255,blue:181/255)
    static let background=Color(red:247/255,green:249/255,blue:1)
    static let lavender=Color(red:238/255,green:235/255,blue:248/255)
    static let blue=Color(red:234/255,green:241/255,blue:252/255)
    static let gradient=LinearGradient(colors:[lavender,blue],startPoint:.topLeading,endPoint:.bottomTrailing)
}
enum Touch {
    private static let soft=UIImpactFeedbackGenerator(style:.soft)
    private static let confirmation=UINotificationFeedbackGenerator()
    static func tap(_ success:Bool=false){
        guard UserDefaults.standard.object(forKey:"haptics") as? Bool != false else{return}
        if success{confirmation.notificationOccurred(.success);confirmation.prepare()}else{soft.impactOccurred();soft.prepare()}
    }
}
struct SoftPress:ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduced
    func makeBody(configuration:Configuration)->some View {
        configuration.label.contentShape(Rectangle()).scaleEffect(configuration.isPressed && !reduced ? 0.96:1)
            .opacity(configuration.isPressed ? 0.8:1)
            .animation(reduced ? nil:.spring(response:0.32,dampingFraction:0.65),value:configuration.isPressed)
    }
}
extension View {
    func card()->some View {self.padding(20).frame(maxWidth:.infinity,alignment:.leading).background(.white,in:RoundedRectangle(cornerRadius:24))}
    func primary()->some View {self.font(.system(size:15,weight:.semibold)).padding(.horizontal,20).frame(minHeight:48).foregroundColor(.white).background(Palette.purple,in:RoundedRectangle(cornerRadius:16))}
}
struct Avatar:View {
    var actor:String
    var size:CGFloat=38
    var body:some View {
        Text(actor=="asnat" ? "A":actor=="youssef" ? "Y":"♡")
            .font(.system(size:size*0.37,weight:.semibold)).foregroundColor(Palette.purple)
            .frame(width:size,height:size).background(Palette.gradient,in:Circle())
    }
}
@main struct AsechkaApp:App {
    @StateObject private var universe=UniverseStore()
    var body:some Scene {WindowGroup{RootView().environmentObject(universe).tint(Palette.purple).preferredColorScheme(.light).buttonStyle(SoftPress())}}
}
struct ComposeRequest:Identifiable {let id=UUID();var photo:Bool;var post:Post?}
struct PostSelection:Identifiable {var post:Post;var id:String{post.key}}
struct RootView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var tab=0
    @State private var composer:ComposeRequest?
    @State private var messages=false
    @State private var settings=false
    @State private var connection=false
    @Namespace private var tabMotion
    @State private var corner=false
    @State private var savedOnly=false
    private let tabs=[("house","Home"),("photo.on.rectangle","Photos"),("quote.bubble","Quotes"),("music.note","Music"),("sparkles","Our days"),("character.bubble","Words")]
    var body:some View {
        Group {
            if universe.storageUnavailable {VStack(spacing:20){Image(systemName:"lock.shield").font(.largeTitle);Text("Your saved space is temporarily unavailable.").font(.title2);Text("Restart the app to try again.").foregroundColor(Palette.muted)}.multilineTextAlignment(.center).padding(32)}
            else if universe.actor.isEmpty {IdentityView()}
            else if !universe.unlocked {DoorView()}
            else {shell}
        }
        .font(.custom("DMSans-Regular",size:15)).foregroundColor(Palette.ink)
        .background(Palette.background.ignoresSafeArea())
        .overlay{if universe.unlocked && universe.requiresCode{Palette.background.ignoresSafeArea().accessibilityHidden(true)}}
        .accessibilityHidden(universe.unlocked && universe.requiresCode)
        .background(AppDoorWindow().frame(width:0,height:0))
        .background(MessagePopupWindow().frame(width:0,height:0))
        .sheet(isPresented:$messages){MessageHub()}
        .onChange(of:phase){if $0 != .active{universe.requireCode(background:$0 == .background)}}
        .sheet(item:$composer){request in ComposerView(request:request)}
        .sheet(isPresented:$corner){CornerView()}
        .sheet(isPresented:$settings){SettingsView()}
        .sheet(isPresented:$connection){ConnectionView()}
        .alert("A little moment",isPresented:Binding(get:{universe.error != nil},set:{if !$0{universe.error=nil}})) {
            Button("OK",role:.cancel){universe.error=nil}
        }message:{Text(universe.error ?? "")}
        .task {if universe.unlocked && !universe.requiresCode {await universe.refresh()}}
        .task(id:phase){
            guard phase == .active else{return}
            while !Task.isCancelled {
                if universe.unlocked && !universe.requiresCode{await universe.refreshSharedHearts()}
                do{try await Task.sleep(nanoseconds:5_000_000_000)}catch{return}
            }
        }
        .task(id:phase){
            guard phase == .active else{await universe.finishHeartSaves();HeartRain.shared.stop();return}
            if universe.unlocked && !universe.requiresCode {await universe.refresh()}
            while !Task.isCancelled {
                do{try await Task.sleep(nanoseconds:60_000_000_000)}catch{return}
                if universe.unlocked && !universe.requiresCode{await universe.refresh()}
            }
        }
    }
    private var shell:some View {
        VStack(spacing:0){
            HStack(spacing:8){
                Text("asechka.").font(.custom("Manrope-Bold",size:25))
                Spacer()
                Button{Touch.tap();composer=ComposeRequest(photo:tab != 2)}label:{Image(systemName:"plus.app").font(.system(size:22)).frame(width:44,height:44)}.accessibilityLabel("Create post")
                Button{Touch.tap();messages=true}label:{Image("little-message").resizable().scaledToFit().frame(width:34,height:34).frame(width:44,height:44)}.accessibilityLabel("Messages")
                Button{Touch.tap();connection=true}label:{Image(systemName:"arrow.clockwise").font(.system(size:20)).frame(width:44,height:44)}.accessibilityLabel("Refresh and reconnect")
                Button{Touch.tap();settings=true}label:{Avatar(actor:universe.actor,size:38)}.accessibilityLabel("Profile and settings")
            }.padding(.horizontal,20).padding(.vertical,7)
            Button{connection=true}label:{HStack(spacing:5){Circle().fill(universe.online ? Palette.purple:Palette.muted).frame(width:5,height:5);Text(universe.message).font(.system(size:11));Spacer()}.foregroundColor(Palette.muted).padding(.horizontal,23).padding(.bottom,9)}
            Group{
                if tab<3 {FeedView(mode:tab,savedOnly:$savedOnly,create:{composer=ComposeRequest(photo:$0)},corner:{corner=true},navigate:{tab=$0})}
                else if tab==3 {SoundtrackView()}
                else if tab==4 {DaysView()}
                else {WordsView()}
            }.frame(maxWidth:.infinity,maxHeight:.infinity).id(tab)
                .transition(.opacity.combined(with:.offset(x:reduced ? 0:8)))
        }
        .safeAreaInset(edge:.bottom,spacing:0){
            HStack(spacing:0){ForEach(0..<tabs.count,id:\.self){index in
                Button{Touch.tap();withAnimation(reduced ? nil:.easeInOut(duration:0.22)){tab=index}}label:{
                    VStack(spacing:4){
                        Image(["our-home","photo-moments","quote-words","our-music","our-days","translate-words"][index]).renderingMode(.template).resizable().scaledToFit().frame(width:32,height:32).frame(width:46,height:32).foregroundColor(tab==index ? .white:Palette.purple)
                            .background{if tab==index{Capsule().fill(Palette.purple).matchedGeometryEffect(id:"active-tab",in:tabMotion)}}
                        Text(tabs[index].1).font(.system(size:10,weight:tab==index ? .bold:.medium)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                        .foregroundColor(tab==index ? Palette.purple:Palette.muted).frame(maxWidth:.infinity,minHeight:59).background(tab==index ? Palette.lavender:.clear,in:RoundedRectangle(cornerRadius:18))
                }.accessibilityLabel(tabs[index].1).accessibilityAddTraits(tab==index ? .isSelected:[])
            }}.padding(.horizontal,8).padding(.top,7).background(.white.shadow(.drop(color:.black.opacity(0.05),radius:10,y:-3)))
        }
    }
}
struct IdentityView:View {
    @EnvironmentObject private var universe:UniverseStore
    var body:some View {
        VStack(spacing:22){Spacer();Image(systemName:"sparkles").font(.system(size:40)).foregroundColor(Palette.purple)
            Text("Our little us.").font(.custom("Manrope-Bold",size:34))
            Text("Two people. One little universe.\nWho’s here today?").multilineTextAlignment(.center).foregroundColor(Palette.muted)
            ForEach(["asnat","youssef"],id:\.self){actor in
                Button{Touch.tap(true);universe.choose(actor)}label:{HStack(spacing:14){Avatar(actor:actor,size:52);VStack(alignment:.leading,spacing:4){Text(Post.name(actor)).font(.headline);Text(actor=="asnat" ? "August 5 · our Asechka":"January 25 · made with love").font(.caption).foregroundColor(Palette.muted)};Spacer();Image(systemName:"arrow.right")}.padding(18).background(.white,in:RoundedRectangle(cornerRadius:24))}
            };Spacer();Text("Made with a whole lot of love. ♡").font(.caption).foregroundColor(Palette.muted)
        }.padding(28)
    }
}
