import SwiftUI
import UIKit
import WidgetKit

struct LittleMessage:Codable,Identifiable,Equatable {
    var id:String;var from:String;var to:String;var text:String?;var preview:String;var day:String;var createdAt:String;var closedAt:String?;var mode:String?;var pinned:Bool?;var pending:Bool?
    var isJar:Bool { mode == "jar" }
}
struct MessageHub:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    @State private var text=""
    @State private var keepInJar=true
    @State private var pinToHome=true
    @State private var history=false
    private var remaining:Int{max(0,3-universe.littleMessages.filter{$0.from==universe.actor && $0.day==HeartLedger.day()}.count)}
    var body:some View {
        NavigationStack{ScrollView{VStack(alignment:.leading,spacing:18){
            Label("Our Love Jar",systemImage:"heart.text.square").font(.custom("Manrope-Bold",size:27))
            Text("\(remaining) of 3 notes left today").font(.subheadline).foregroundColor(Palette.purple)
            Text("Leave a warm note for \(universe.partner). Keep it in our Love Jar & pin it on Home, or send a read-once secret.").foregroundColor(Palette.muted)
            Picker("Note style",selection:$keepInJar){
                Text("Love Jar (keep)").tag(true)
                Text("Read once").tag(false)
            }.pickerStyle(.segmented)
            if keepInJar {
                Toggle("Pin this note to Home",isOn:$pinToHome).font(.subheadline)
            }
            TextEditor(text:$text).frame(minHeight:160).padding(12).scrollContentBackground(.hidden).background(.white,in:RoundedRectangle(cornerRadius:22)).overlay(RoundedRectangle(cornerRadius:22).stroke(Palette.lavender)).accessibilityLabel("Your little message")
                .onChange(of:text){if $0.count>1000{text=String($0.prefix(1000))};try? universe.vault.save("message-draft:"+universe.actor,text)}
            HStack{Text("\(text.count) / 1,000");Spacer();Text("Resets at midnight Eastern")}.font(.caption).foregroundColor(Palette.muted)
            Button{do{try universe.sendMessage(text,mode:keepInJar ? "jar":"once",pinned:keepInJar && pinToHome);text="";Touch.tap(true);dismiss()}catch{universe.error=error.localizedDescription}}label:{Label(universe.online ? (keepInJar ? "Drop in our Love Jar ♡":"Send read-once secret"):"Save to send when online",systemImage:"paperplane.fill").frame(maxWidth:.infinity).padding(17).background(Palette.purple,in:Capsule()).foregroundColor(.white)}.disabled(text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || remaining==0)
            NavigationLink{WidgetGallery()}label:{Label("Our home-screen widgets",systemImage:"square.grid.2x2").frame(maxWidth:.infinity).padding(16).background(Palette.blue,in:Capsule())}
            Button{history=true}label:{Label("Love Jar & note history",systemImage:"clock.arrow.circlepath").frame(maxWidth:.infinity).padding(16).background(Palette.lavender,in:Capsule())}
        }.padding(24)}.background(Palette.background).navigationTitle("Our Love Jar").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}.accessibilityIdentifier("message-composer-close")}}}
        .onAppear{text=universe.vault.value("message-draft:"+universe.actor,as:String.self) ?? ""}
        .sheet(isPresented:$history){MessageHistory()}
    }
}
struct MessageHistory:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var body:some View {NavigationStack{ScrollView{LazyVStack(alignment:.leading,spacing:14){
        Text("Love Jar notes stay readable forever and can be pinned on Home. Read-once secrets keep only a short preview.").font(.subheadline).foregroundColor(Palette.muted)
        ForEach(universe.littleMessages.reversed()){message in VStack(alignment:.leading,spacing:9){
            HStack{
                Text((message.from==universe.actor ? "To \(Post.name(message.to))":"From \(Post.name(message.from))")+" · "+message.day).font(.caption).foregroundColor(Palette.purple)
                Spacer()
                if message.pinned==true {Text("Pinned ♡").font(.caption2.weight(.semibold)).padding(.horizontal,8).padding(.vertical,3).background(Palette.lavender,in:Capsule()).foregroundColor(Palette.purple)}
            }
            Text(message.isJar ? (message.text ?? message.preview) : message.preview).font(.body).textSelection(.enabled)
            HStack{
                Text(message.isJar ? (message.pending==true ? "Waiting to sync":"Kept in Love Jar ♡") : (message.closedAt==nil ? (message.pending==true ? "Waiting to sync":"Waiting to be received"):"Read once · kept in our hearts")).font(.caption).foregroundColor(Palette.muted)
                Spacer()
                if message.isJar {
                    Button(message.pinned==true ? "Unpin":"Pin to Home"){
                        do{try universe.pinMessage(message,pinned:!(message.pinned==true));Touch.tap()}catch{universe.error=error.localizedDescription}
                    }.font(.caption.weight(.semibold)).foregroundColor(Palette.purple)
                }
            }
        }.frame(maxWidth:.infinity,alignment:.leading).padding(18).background(.white,in:RoundedRectangle(cornerRadius:22))}
        if universe.littleMessages.isEmpty{Text("Our first Love Jar note is waiting to be written. ♡").padding(.vertical,30)}
    }.padding(22)}.background(Palette.background).navigationTitle("Love Jar & history").toolbar{Button("Done"){dismiss()}.accessibilityIdentifier("message-history-close")}}}
}
struct IncomingMessage:View {
    @EnvironmentObject private var universe:UniverseStore
    let message:LittleMessage
    var body:some View {ZStack{Color.black.opacity(0.24).ignoresSafeArea();VStack(spacing:18){Image(systemName:message.isJar ? "heart.text.square.fill":"envelope.open.fill").font(.system(size:36)).foregroundColor(Palette.purple);Text(message.isJar ? "A new Love Jar note":"A little message for you").font(.custom("Manrope-Bold",size:25));Text("From \(Post.name(message.from)) · "+(message.isJar ? "saved in our Love Jar":"just this once")).font(.subheadline).foregroundColor(Palette.muted);ScrollView{Text(message.text ?? "").font(.system(size:21)).lineSpacing(7).frame(maxWidth:.infinity,alignment:.leading).padding(.vertical,12)}.frame(maxHeight:320);Text(message.isJar ? "This note stays safe in our Love Jar and on Home.":"Closing keeps only a short note in history. The full message won’t open again.").font(.caption).foregroundColor(Palette.muted);Button{do{try universe.closeMessage(message);Touch.tap(true)}catch{universe.error=error.localizedDescription}}label:{Text(message.isJar ? "Keep in our Love Jar ♡":"Keep it in my heart ♡").fontWeight(.semibold).frame(maxWidth:.infinity).padding(17).background(Palette.purple,in:Capsule()).foregroundColor(.white)}}.padding(26).background(Palette.background,in:RoundedRectangle(cornerRadius:30)).padding(22).frame(maxWidth:500).shadow(color:.black.opacity(0.1),radius:30)}.tint(Palette.purple)}
}
/// Above sheets and editors, below the optional biometric privacy window.
struct MessagePopupWindow:UIViewRepresentable {
    @EnvironmentObject var universe:UniverseStore
    func makeCoordinator()->Coordinator{Coordinator(universe)}
    func makeUIView(context:Context)->UIView{UIView()}
    func updateUIView(_ view:UIView,context:Context){context.coordinator.update()}
    static func dismantleUIView(_ view:UIView,coordinator:Coordinator){coordinator.hide()}
    @MainActor final class Coordinator:NSObject {
        let universe:UniverseStore;var window:UIWindow?;var current="";weak var previous:UIWindow?
        init(_ universe:UniverseStore){self.universe=universe;super.init();NotificationCenter.default.addObserver(self,selector:#selector(update),name:UIApplication.didBecomeActiveNotification,object:nil);NotificationCenter.default.addObserver(self,selector:#selector(hide),name:UIApplication.willResignActiveNotification,object:nil)}
        deinit{NotificationCenter.default.removeObserver(self)}
        @objc func update(){guard universe.unlocked,!universe.requiresCode,UIApplication.shared.applicationState == .active,let message=universe.incomingMessage else{hide();return};guard current != message.id else{return};hide();guard let scene=UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene}).first else{return};previous=scene.windows.first{$0.isKeyWindow};let w=UIWindow(windowScene:scene);w.windowLevel=UIWindow.Level(rawValue:UIWindow.Level.alert.rawValue+1);w.backgroundColor = .clear;w.rootViewController=UIHostingController(rootView:IncomingMessage(message:message).environmentObject(universe).preferredColorScheme(.light));w.rootViewController?.view.backgroundColor = .clear;w.rootViewController?.view.accessibilityViewIsModal=true;previous?.accessibilityElementsHidden=true;window=w;current=message.id;w.makeKeyAndVisible()}
        @objc func hide(){guard let w=window else{return};w.isHidden=true;window=nil;current="";previous?.accessibilityElementsHidden=false;previous?.makeKey();previous=nil}
    }
}

struct WidgetGallery:View {
    @EnvironmentObject private var universe:UniverseStore
    @State private var refreshed=false
    var body:some View {ScrollView{VStack(alignment:.leading,spacing:16){
        Text("Long-press your Home Screen, choose Edit → Add Widget, then search for Asechka. Choose any of our six wide widgets.").font(.subheadline).foregroundColor(Palette.muted)
        VStack(alignment:.leading,spacing:10){
            Label(WidgetBridge.extensionPresent ? "Widget extension included":"Widget extension missing",systemImage:WidgetBridge.extensionPresent ? "checkmark.circle":"exclamationmark.circle").font(.subheadline.weight(.semibold)).accessibilityIdentifier("widget-extension-status")
            if !WidgetBridge.extensionPresent{Text("In Sideloadly, leave Remove App Extensions (Plug-ins) unchecked, then reinstall this IPA using the same Apple ID.").font(.caption)}
            Label(WidgetBridge.sharedDataAvailable ? "Shared widget data connected":"Shared widget data unavailable",systemImage:WidgetBridge.sharedDataAvailable ? "checkmark.circle":"exclamationmark.circle").font(.subheadline).accessibilityIdentifier("widget-data-status")
            if !WidgetBridge.sharedDataAvailable{Text("The app and widget need the same provisioned App Group to share your saved counts. A signing tool may remove or change that permission. Without it, personal counts cannot appear in widgets.").font(.caption).foregroundColor(Palette.muted)}
            Button{WidgetBridge.refresh(universe);refreshed=true;Touch.tap()}label:{Label(refreshed ? "Widgets refreshed":"Refresh widgets",systemImage:"arrow.clockwise")}.accessibilityIdentifier("refresh-widgets")
        }.card()
        ForEach(0..<6,id:\.self){kind in UniverseWidgetView(entry:UniverseEntry(date:Date(),value:snapshot),kind:kind).frame(height:164).background(Palette.gradient).clipShape(RoundedRectangle(cornerRadius:24)).accessibilityIdentifier("widget-preview-\(kind)")}
        Text("Saved content works offline. The together timer runs live; other updates follow the phone’s widget schedule. Open Asechka to sync new content.").font(.caption).foregroundColor(Palette.muted)
    }.padding(22)}.background(Palette.background).navigationTitle("Our widgets").task{WidgetBridge.refresh(universe)}}
    private var snapshot:WidgetSnapshot{var v=WidgetSnapshot();v.actor=universe.actor;v.quotes=universe.memories.quotes.compactMap(\.text);v.ledger=universe.heartDays;v.asnat=universe.heartDays.values.reduce(0){$0+($1["asechka"] ?? 0)};v.youssef=universe.heartDays.values.reduce(0){$0+($1["me"] ?? 0)};v.lastAsnat=universe.hearts["asechka"] ?? "";v.lastYoussef=universe.hearts["me"] ?? "";v.since=BookDates.instant((universe.keepsakes["since"] as? [String:Any])?["startedAt"] as? String ?? "")?.timeIntervalSince1970 ?? 0;v.saved=Date().timeIntervalSince1970;return v}
}
