import SwiftUI
import UIKit

enum Palette {
    static let ink=Color(red:38/255,green:52/255,blue:81/255)
    static let muted=Color(red:100/255,green:112/255,blue:139/255)
    static let purple=Color(red:107/255,green:92/255,blue:181/255)
    static let violet=Color(red:108/255,green:92/255,blue:231/255)
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
extension Notification.Name {
    static let scrollToTop=Notification.Name("asechka.scrollToTop")
}
struct SoftPress:ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduced
    func makeBody(configuration:Configuration)->some View {
        configuration.label.contentShape(Rectangle()).scaleEffect(configuration.isPressed && !reduced ? 0.96:1)
            .opacity(configuration.isPressed ? 0.8:1)
            .animation(reduced ? nil:.spring(response:0.32,dampingFraction:0.65),value:configuration.isPressed)
    }
}
struct NavTabButtonStyle:ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduced
    func makeBody(configuration:Configuration)->some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduced ? 0.93:1)
            .opacity(configuration.isPressed ? 0.88:1)
            .animation(reduced ? nil:.spring(response:0.24,dampingFraction:0.72),value:configuration.isPressed)
    }
}
extension View {
    func card()->some View {self.padding(20).frame(maxWidth:.infinity,alignment:.leading).background(.white,in:RoundedRectangle(cornerRadius:24)).overlay(RoundedRectangle(cornerRadius:24).stroke(Palette.lavender,lineWidth:1))}
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
    var body:some Scene {WindowGroup{RootView().autocorrectionDisabled(false).environmentObject(universe).tint(Palette.purple).preferredColorScheme(.light).buttonStyle(SoftPress())}}
}
struct ComposeRequest:Identifiable {let id=UUID();var photo:Bool;var post:Post?;var collection:PhotoCollection = .memories}
struct PostSelection:Identifiable {var post:Post;var id:String{post.key}}
struct RootView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var tab=0
    @State private var visitedTabs:Set<Int>=[0]
    @State private var composer:ComposeRequest?
    @State private var messages=false
    @State private var settings=false
    @State private var connection=false
    @Namespace private var tabMotion
    @State private var corner=false
    @State private var savedOnly=false
    @State private var photoSection:PhotoSection = .all
    @State private var memoryTab=0
    @State private var keyboardOpen=false
    private let tabs=[("house","house.fill","Home"),("photo.on.rectangle","photo.on.rectangle.fill","Memories"),("sparkles","sparkles","Our days"),("character.bubble","character.bubble.fill","Words"),("gamecontroller","gamecontroller.fill","Games")]
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
        .background(KeyboardDismissWindow().frame(width:0,height:0))
        .background(MessagePopupWindow().frame(width:0,height:0))
        .onReceive(NotificationCenter.default.publisher(for:UIResponder.keyboardWillShowNotification)){_ in keyboardOpen=true}
        .onReceive(NotificationCenter.default.publisher(for:UIResponder.keyboardWillHideNotification)){_ in keyboardOpen=false}
        .sheet(isPresented:$messages){MessageHub()}
        .onChange(of:phase){if $0 != .active{universe.requireCode(background:$0 == .background)}}
        .sheet(item:$composer){request in ComposerView(request:request)}
        .sheet(isPresented:$corner){CornerView()}
        .sheet(isPresented:$settings){SettingsView()}
        .sheet(isPresented:$connection){ConnectionView()}
        .onOpenURL{url in
            guard let code=GamesRoom.invitationCode(url) else{return}
            visitedTabs.insert(4)
            if reduced {tab=4} else {withAnimation(.spring(response:0.32,dampingFraction:0.78,blendDuration:0.1)){tab=4}}
            universe.games.openInvitation(code)
        }
        .onAppear{
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--preview-fixture") && ProcessInfo.processInfo.arguments.contains("--games-preview"){visitedTabs.insert(4);tab=4}
            #endif
        }
        .task(id:"\(universe.actor)|\(universe.unlocked)|\(universe.requiresCode)|\(universe.online)|\(phase == .active)"){
            universe.games.configure(universe,active:phase == .active)
            universe.liveLocation.configure(active:phase == .active)
        }
        .alert("A little moment",isPresented:Binding(get:{universe.error != nil},set:{if !$0{universe.error=nil}})) {
            Button("OK",role:.cancel){universe.error=nil}
        }message:{Text(universe.error ?? "")}
        .task {if universe.unlocked && !universe.requiresCode {await universe.refresh()}}
        .task(id:phase){
            guard phase == .active else{return}
            while !Task.isCancelled {
                if universe.unlocked && !universe.requiresCode{await universe.refreshSharedHearts()}
                do{try await Task.sleep(nanoseconds:2_000_000_000)}catch{return}
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
    private var windowSafeBottom:CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap{$0 as? UIWindowScene}
            .flatMap{$0.windows}
            .first{$0.isKeyWindow}?.safeAreaInsets.bottom ?? 0
    }
    private func switchTab(_ target:Int){
        if target == tab {
            Touch.tap()
            NotificationCenter.default.post(name:.scrollToTop,object:target)
            return
        }
        Touch.tap()
        visitedTabs.insert(target)
        if reduced {tab=target}
        else {withAnimation(.spring(response:0.32,dampingFraction:0.78,blendDuration:0.1)){tab=target}}
    }
    private var topBar:some View {
        HStack(spacing:10){
            VStack(alignment:.leading,spacing:2){
                HStack(spacing:7){
                    Text("asechka.").font(.custom("Manrope-Bold",size:24)).foregroundColor(Palette.ink)
                    if tab > 0 {
                        Text(tabs[tab].2)
                            .font(.system(size:11,weight:.bold))
                            .foregroundColor(Palette.violet)
                            .padding(.horizontal,9).padding(.vertical,3)
                            .background(Palette.lavender,in:Capsule())
                            .transition(.opacity.combined(with:.scale(scale:0.88,anchor:.leading)))
                    }
                }.animation(reduced ? nil:.spring(response:0.28,dampingFraction:0.82),value:tab)
                Button{Touch.tap();connection=true}label:{
                    HStack(spacing:5){
                        Circle().fill(universe.online ? Color(red:46/255,green:196/255,blue:126/255):Palette.muted).frame(width:6,height:6)
                        Text(universe.message).font(.system(size:11,weight:.medium)).foregroundColor(Palette.muted).lineLimit(1)
                    }
                }.buttonStyle(.plain)
            }
            Spacer(minLength:4)
            HStack(spacing:4){
                Button{Touch.tap();messages=true}label:{
                    Image(systemName:"envelope.fill")
                        .font(.system(size:16,weight:.semibold))
                        .foregroundColor(Palette.ink.opacity(0.82))
                        .frame(width:36,height:36)
                        .background(Color.white.opacity(0.9),in:Circle())
                        .overlay(Circle().stroke(Palette.purple.opacity(0.10),lineWidth:1))
                }.accessibilityLabel("Messages")
                Button{Touch.tap();connection=true}label:{
                    Image(systemName:"arrow.clockwise")
                        .font(.system(size:15,weight:.semibold))
                        .foregroundColor(Palette.ink.opacity(0.82))
                        .frame(width:36,height:36)
                        .background(Color.white.opacity(0.9),in:Circle())
                        .overlay(Circle().stroke(Palette.purple.opacity(0.10),lineWidth:1))
                }.accessibilityLabel("Refresh and reconnect")
                Button{Touch.tap();settings=true}label:{
                    Avatar(actor:universe.actor,size:36)
                        .overlay(Circle().stroke(Color.white,lineWidth:2))
                        .shadow(color:Palette.purple.opacity(0.15),radius:4,x:0,y:2)
                }.accessibilityLabel("Profile and settings")
            }
            .padding(4)
            .background(.ultraThinMaterial,in:Capsule())
            .background(Color.white.opacity(0.65),in:Capsule())
            .overlay(Capsule().stroke(Palette.purple.opacity(0.12),lineWidth:1))
        }
        .padding(.horizontal,18).padding(.top,8).padding(.bottom,10)
    }
    private var tabContent:some View {
        ZStack{
            if visitedTabs.contains(0) {
                FeedView(mode:0,savedOnly:$savedOnly,photoSection:$photoSection,memoryTab:$memoryTab,create:{composer=ComposeRequest(photo:$0,collection:.memories)},corner:{corner=true},openJar:{messages=true},navigate:{switchTab($0)})
                    .opacity(tab==0 ? 1:0)
                    .allowsHitTesting(tab==0)
                    .accessibilityHidden(tab != 0)
                    .zIndex(tab==0 ? 1:0)
            }
            if visitedTabs.contains(1) {
                FeedView(mode:1,savedOnly:$savedOnly,photoSection:$photoSection,memoryTab:$memoryTab,create:{composer=ComposeRequest(photo:$0,collection:photoSection.defaultCollection)},corner:{corner=true},openJar:{messages=true},navigate:{switchTab($0)})
                    .opacity(tab==1 ? 1:0)
                    .allowsHitTesting(tab==1)
                    .accessibilityHidden(tab != 1)
                    .zIndex(tab==1 ? 1:0)
            }
            if visitedTabs.contains(2) {
                DaysView()
                    .opacity(tab==2 ? 1:0)
                    .allowsHitTesting(tab==2)
                    .accessibilityHidden(tab != 2)
                    .zIndex(tab==2 ? 1:0)
            }
            if visitedTabs.contains(3) {
                WordsView()
                    .opacity(tab==3 ? 1:0)
                    .allowsHitTesting(tab==3)
                    .accessibilityHidden(tab != 3)
                    .zIndex(tab==3 ? 1:0)
            }
            if visitedTabs.contains(4) {
                GamesView(store:universe.games)
                    .opacity(tab==4 ? 1:0)
                    .allowsHitTesting(tab==4)
                    .accessibilityHidden(tab != 4)
                    .zIndex(tab==4 ? 1:0)
            }
        }
        .animation(reduced ? nil:.easeOut(duration:0.16),value:tab)
        .frame(maxWidth:.infinity,maxHeight:.infinity)
    }
    private var floatingDock:some View {
        HStack(spacing:10){
            HStack(spacing:3){
                ForEach(0..<tabs.count,id:\.self){index in
                    let active = tab == index
                    Button{switchTab(index)}label:{
                        ZStack{
                            if active {
                                Capsule()
                                    .fill(Color.white.opacity(0.92))
                                    .overlay(
                                        Capsule()
                                            .strokeBorder(Palette.purple.opacity(0.18),lineWidth:1)
                                    )
                                    .shadow(color:Palette.purple.opacity(0.15),radius:6,x:0,y:2)
                                    .matchedGeometryEffect(id:"active-nav-pill",in:tabMotion)
                            }
                            HStack(spacing:6){
                                Image(systemName:active ? tabs[index].1 : tabs[index].0)
                                    .font(.system(size:17.5,weight:active ? .bold : .medium))
                                    .foregroundColor(active ? Palette.violet : Palette.ink.opacity(0.64))
                                    .scaleEffect(active ? 1.06 : 0.96)
                                    .frame(width:22,height:22)
                                if active {
                                    Text(tabs[index].2)
                                        .font(.system(size:13,weight:.bold))
                                        .foregroundColor(Palette.violet)
                                        .lineLimit(1)
                                        .fixedSize(horizontal:true,vertical:false)
                                        .transition(.asymmetric(insertion:.opacity.combined(with:.scale(scale:0.86,anchor:.leading)),removal:.opacity))
                                }
                            }
                            .padding(.horizontal,active ? 15 : 0)
                            .frame(maxWidth:active ? nil : .infinity)
                            .frame(height:46)
                        }
                        .frame(maxWidth:active ? nil : .infinity)
                        .frame(height:46)
                        .contentShape(Capsule())
                    }
                    .buttonStyle(NavTabButtonStyle())
                    .accessibilityLabel(tabs[index].2)
                    .accessibilityAddTraits(active ? .isSelected : [])
                }
            }
            .padding(7)
            .frame(maxWidth:.infinity)
            .animation(reduced ? nil:.spring(response:0.32,dampingFraction:0.78,blendDuration:0.1),value:tab)
            .background(
                ZStack{
                    Capsule().fill(.ultraThinMaterial)
                    Capsule().fill(LinearGradient(colors:[Palette.lavender.opacity(0.32),Palette.blue.opacity(0.26)],startPoint:.topLeading,endPoint:.bottomTrailing))
                }
            )
            .overlay(
                Capsule()
                    .strokeBorder(LinearGradient(colors:[Color.white.opacity(0.90),Palette.purple.opacity(0.20)],startPoint:.top,endPoint:.bottom),lineWidth:1.2)
            )
            .shadow(color:Palette.purple.opacity(0.16),radius:12,x:0,y:5)

            Button{
                Touch.tap()
                composer=ComposeRequest(photo:!(tab==1 && memoryTab==2),collection:tab==1 ? photoSection.defaultCollection:.memories)
            }label:{
                Image(systemName:"plus")
                    .font(.system(size:22,weight:.bold))
                    .foregroundColor(.white)
                    .frame(width:60,height:60)
                    .background(
                        LinearGradient(colors:[Palette.violet,Palette.purple],startPoint:.topLeading,endPoint:.bottomTrailing),
                        in:Circle()
                    )
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.55),lineWidth:1.4))
                    .shadow(color:Palette.violet.opacity(0.32),radius:12,x:0,y:5)
            }
            .buttonStyle(SoftPress())
            .accessibilityLabel("Create post")
        }
    }
    private var shell:some View {
        let hasHomeBar=windowSafeBottom > 16
        let dockBottomPad:CGFloat = hasHomeBar ? 17 : 10
        return ZStack(alignment:.bottom){
            VStack(spacing:0){
                topBar
                tabContent
            }
            if !keyboardOpen {
                floatingDock
                    .padding(.horizontal,14)
                    .padding(.bottom,dockBottomPad)
            }
        }
        .ignoresSafeArea(.container,edges:.bottom)
    }
}
struct IdentityView:View {
    @EnvironmentObject private var universe:UniverseStore
    var body:some View {
        VStack(spacing:18){Spacer()
            Image(systemName:"sparkles").font(.system(size:36)).foregroundColor(Palette.purple).frame(width:62,height:62).background(Palette.lavender,in:RoundedRectangle(cornerRadius:22))
            Text("OUR LITTLE UNIVERSE").font(.system(size:11,weight:.bold)).tracking(2).foregroundColor(Palette.purple)
            Text("Our little us.").font(.custom("Manrope-Bold",size:34))
            Text("Two people. One little home.\nWho’s here today?").multilineTextAlignment(.center).foregroundColor(Palette.muted)
            ForEach(["asnat","youssef"],id:\.self){actor in
                Button{Touch.tap(true);universe.choose(actor)}label:{HStack(spacing:14){Avatar(actor:actor,size:52);VStack(alignment:.leading,spacing:4){Text(Post.name(actor)).font(.headline);Text(actor=="asnat" ? "Birthday · August 5 · our Asechka":"Birthday · January 25 · made with love").font(.caption).foregroundColor(Palette.muted)};Spacer();Image(systemName:"arrow.right").foregroundColor(Palette.purple)}.padding(18).background(.white,in:RoundedRectangle(cornerRadius:24)).overlay(RoundedRectangle(cornerRadius:24).stroke(Palette.lavender,lineWidth:1))}
            };Spacer();Text("Made with a whole lot of love. ♡").font(.caption).foregroundColor(Palette.muted)
        }.padding(28)
    }
}
