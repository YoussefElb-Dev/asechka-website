import SwiftUI
import PhotosUI

struct BookEdit:Identifiable {var id=UUID();var kind:String;var entry:BookEntry?}
struct BookView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var personal=false
    @State private var chapter=0
    @State private var query=""
    @State private var reveal=0
    @State private var manageKeepsakes=false
    @State private var editing:BookEdit?
    @State private var letter:BookEntry?
    @State private var removal:BookEdit?
    @State private var beginning=false
    init(personal:Bool=false,initialChapter:Int=0){self.personal=personal;_chapter=State(initialValue:personal ? max(0,min(2,initialChapter)):0)}
    private var data:[String:Any]{personal ? universe.keepsakes:universe.journal}
    private var writable:Bool {data["writable"] as? Bool ?? false}
    private var endpoint:String{personal ? "/api/keepsakes":"/api/journal"}
    private var key:String{personal ? (chapter==1 ? "letters":"things"):"jokes"}
    private var kind:String{personal ? (chapter==1 ? "Letter":"Thing"):"Joke"}
    private var entries:[BookEntry]{(data[key] as? [[String:Any]] ?? []).map{BookEntry(fields:$0)}}
    private var filtered:[BookEntry]{entries.reversed().filter{item in
        query.isEmpty || ["title","meaning","story"].map{item.string($0)}.joined(separator:" ").localizedCaseInsensitiveContains(query)
    }}
    var body:some View {
        NavigationStack{ScrollView(.vertical,showsIndicators:true){VStack(alignment:.leading,spacing:20){
            Text(personal ? "All the days\nthat became ours.":"Our secret vocab.").font(.custom("Manrope-Bold",size:30))
            Text(personal ? "Our beginning, Open when letters, and the little things kept close.":"Nicknames, phrases, and inside jokes that make sense to just the two of us.").foregroundColor(Palette.muted)
            if personal {
                ScrollView(.horizontal,showsIndicators:false){HStack(spacing:10){ForEach(0..<3,id:\.self){index in Button{chapter=index;query="";Touch.tap()}label:{Text(["Since us","Open when…","Little things"][index]).font(.subheadline.weight(.semibold)).padding(14).background(chapter==index ? Palette.purple:Palette.lavender,in:Capsule()).foregroundColor(chapter==index ? .white:Palette.purple)}.accessibilityAddTraits(chapter==index ? .isSelected:[])}}}
            }
            if !writable{Text("Connect and refresh once to enable shared editing. Your saved pages remain here offline.").font(.caption).foregroundColor(Palette.muted)}
            if personal && chapter==0 {sinceContent}
            else {chapterContent}
        }.padding(22)}.background(Palette.background).refreshable{await universe.refresh()}.navigationTitle(personal ? "Us & keepsakes":"Secret vocab").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}
        .sheet(item:$editing){edit in BookEditor(kind:edit.kind,original:edit.entry,endpoint:endpoint)}
        .sheet(item:$letter){item in OpenWhenView(item:item,edit:{editing=BookEdit(kind:"Letter",entry:item)},remove:{removal=BookEdit(kind:"Letter",entry:item)},writable:writable && manageKeepsakes)}
        .sheet(isPresented:$beginning){BeginningEditor(original:BookEntry(fields:data["since"] as? [String:Any] ?? [:]))}
        .confirmationDialog("Remove this entry for both of us?",isPresented:Binding(get:{removal != nil},set:{if !$0{removal=nil}}),titleVisibility:.visible){Button("Remove",role:.destructive){if let removal{remove(removal)};removal=nil};Button("Keep it",role:.cancel){removal=nil}}
    }
    @ViewBuilder private var chapterContent:some View {
        if !personal {
            Button{editing=BookEdit(kind:"Joke")}label:{Label("Add to secret vocab",systemImage:"plus").frame(maxWidth:.infinity).primary()}.disabled(!writable)
            TextField("Find one of our inside jokes…",text:$query).textFieldStyle(.roundedBorder)
        } else {
            Toggle("Manage & edit keepsakes",isOn:$manageKeepsakes).font(.subheadline).padding(.horizontal,4)
            if manageKeepsakes {
                Button{editing=BookEdit(kind:kind)}label:{Label(kind=="Thing" ? "Add a little thing":"Add a letter",systemImage:"plus").frame(maxWidth:.infinity).primary()}.disabled(!writable)
            }
        }
        if entries.isEmpty {Text("A little space for something only we could write.").foregroundColor(Palette.muted).padding(.vertical,24)}
        else if kind=="Letter" {LazyVGrid(columns:[GridItem(.adaptive(minimum:145),spacing:12)],spacing:12){ForEach(entries){item in Button{letter=item;Touch.tap(true)}label:{VStack(alignment:.leading,spacing:16){Image(systemName:"envelope").font(.title2);Text(item.string("title")).font(.headline).multilineTextAlignment(.leading);Text("Open with love ♡").font(.caption)}.frame(maxWidth:.infinity,minHeight:130,alignment:.leading).padding(18).background(Palette.lavender,in:RoundedRectangle(cornerRadius:22))}}}}
        else if kind=="Thing" {
            entryCard(entries[reveal%entries.count]);Button("Another little thing ♡"){reveal=(reveal+1)%entries.count;Touch.tap()}
            if manageKeepsakes {
                ForEach(entries){item in HStack{Text(item.string("text")).font(.subheadline);Spacer();Button("Edit"){editing=BookEdit(kind:"Thing",entry:item)};Button{removal=BookEdit(kind:"Thing",entry:item)}label:{Image(systemName:"trash")}.accessibilityLabel("Remove little thing")}.padding(.vertical,10)}
            }
        } else {ForEach(filtered){entryCard($0)};if filtered.isEmpty{Text("No matching little memories yet.").foregroundColor(Palette.muted)}}
    }
    private func entryCard(_ item:BookEntry)->some View {
        VStack(alignment:.leading,spacing:14){
            Text(item.string(kind=="Thing" ? "text":"title")).font(kind=="Thing" ? .custom("Caveat-Medium",size:29):.title3.weight(.semibold)).textSelection(.enabled)
            if item.flag("pending"){Text("Saved on this phone · waiting to sync").font(.caption).foregroundColor(Palette.purple)}
            ForEach(["note","meaning","story"],id:\.self){field in if !item.string(field).isEmpty{Text(item.string(field)).foregroundColor(Palette.muted).textSelection(.enabled)}}
            if !personal || manageKeepsakes {
                HStack{Button("Edit"){editing=BookEdit(kind:kind,entry:item)};Spacer();Button("Remove",role:.destructive){removal=BookEdit(kind:kind,entry:item)}}.disabled(!writable)
            }
        }.card()
    }
    @ViewBuilder private var sinceContent:some View {
        if let since=data["since"] as? [String:Any],let started=BookDates.instant(since["startedAt"] as? String ?? "") {
            TimelineView(.periodic(from:.now,by:60)){context in VStack(alignment:.leading,spacing:15){
                Text("SINCE WE BECAME US").font(.caption.weight(.semibold)).tracking(2).foregroundColor(Palette.purple)
                Text("\(max(0,Int(context.date.timeIntervalSince(started)/86400))) days, and counting. ♡").font(.custom("Caveat-Medium",size:36))
                Text(BookDates.display(started,time:true)+" · Eastern time").font(.subheadline).foregroundColor(Palette.muted)
                if let day=since["startedTalkingAt"] as? String,let date=BookDates.day(day){Divider();Text("We started talking.").font(.headline);Text(BookDates.display(date)).foregroundColor(Palette.purple)}
                ForEach([false,true],id:\.self){yearly in Divider();Text(yearly ? "Our next anniversary":"Our next month together").font(.headline);Text(BookDates.display(BookDates.next(started,yearly:yearly,now:context.date))).foregroundColor(Palette.purple);if let message=since[yearly ? "yearlyMessage":"monthlyMessage"] as? String,!message.isEmpty{Text(message).font(.subheadline).foregroundColor(Palette.muted)}}
            }.card()}
            DisclosureGroup("Settings & edit keepsakes",isExpanded:$manageKeepsakes){
                Button("Edit our beginning & messages"){beginning=true}.primary().disabled(!writable).padding(.top,8)
            }
        }
    }
    private func remove(_ edit:BookEdit){guard let entry=edit.entry else{return};do{try universe.enqueue(endpoint,["action":"remove"+edit.kind,"id":entry.id,"expectedRevision":entry.fields["revision"] ?? NSNull()])}catch{universe.error=error.localizedDescription}}
}

struct BookEditor:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var kind:String;var original:BookEntry?;var endpoint:String
    @State private var draft=BookDraft()
    @State private var committed=false
    @State private var loaded=false
    private var key:String{"book-draft:"+universe.actor+":"+kind+":"+(original?.id ?? "new")}
    var body:some View {
        NavigationStack{Form{
            Section("In our own words"){
                if kind != "Thing" {TextField(kind=="Letter" ? "Open when…":kind=="Joke" ? "Our phrase":"Title",text:$draft.title)}
                if kind=="Letter" || kind=="Thing" {TextField("Your words",text:$draft.text,axis:.vertical).lineLimit(5...20)}
                if kind=="Joke" {TextField("What it means to us",text:$draft.meaning,axis:.vertical).lineLimit(3...10);TextField("How it started · optional",text:$draft.story,axis:.vertical).lineLimit(3...10)}
            }
            Section{Text("Your draft is saved privately on this phone. Shared changes sync when connected.").font(.caption).foregroundColor(Palette.muted)}
        }.navigationTitle((original==nil ? "Add ":"Edit ")+kind.lowercased()).navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.cancellationAction){Button("Cancel"){dismiss()}};ToolbarItem(placement:.confirmationAction){Button("Save",action:save).disabled(!valid)}}}
        .onAppear{if !loaded{draft=universe.vault.value(key,as:BookDraft.self) ?? BookDraft(original);loaded=true}}
        .onDisappear{if !committed{try? universe.vault.save(key,draft)}}
    }
    private var valid:Bool {
        if kind != "Thing" && (draft.title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || draft.title.count>160){return false}
        if ["Thing","Letter"].contains(kind) && (draft.text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || draft.text.count>(kind=="Letter" ? 16000:2000)){return false}
        if kind=="Joke" && (draft.meaning.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || draft.meaning.count>3000 || draft.story.count>3000){return false}
        return true
    }
    private func save(){
        var b:[String:Any]=["action":"save"+kind,"id":original?.id ?? UUID().uuidString.lowercased(),"expectedRevision":original?.fields["revision"] ?? NSNull()]
        if kind != "Thing"{b["title"]=draft.title}
        if ["Thing","Letter"].contains(kind){b["text"]=draft.text}
        if kind=="Joke"{b["meaning"]=draft.meaning;b["story"]=draft.story}
        do{try universe.vault.save(key,draft);try universe.enqueue(endpoint,b);committed=true;universe.vault.remove(key);Touch.tap(true);dismiss()}catch{universe.error=error.localizedDescription}
    }
}

struct BeginningEditor:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var original:BookEntry
    @State private var start=Date()
    @State private var talking=Date()
    @State private var showTalking=true
    @State private var monthly=""
    @State private var yearly=""
    var body:some View {NavigationStack{Form{Section("When we became a couple · Eastern time"){DatePicker("Our beginning",selection:$start).environment(\.timeZone,BookDates.eastern)};Section("Our first conversation"){Toggle("Show when we started talking",isOn:$showTalking);if showTalking{DatePicker("We started talking",selection:$talking,displayedComponents:.date).environment(\.timeZone,BookDates.eastern)}};Section("Anniversary messages"){TextField("Monthly message",text:$monthly,axis:.vertical).lineLimit(3...10);TextField("Yearly message",text:$yearly,axis:.vertical).lineLimit(3...10)}}.navigationTitle("Our beginning").toolbar{ToolbarItem(placement:.cancellationAction){Button("Cancel"){dismiss()}};ToolbarItem(placement:.confirmationAction){Button("Save",action:save).disabled(monthly.count>2000 || yearly.count>2000)}}}.onAppear{start=BookDates.instant(original.string("startedAt")) ?? Date();talking=BookDates.day(original.string("startedTalkingAt")) ?? Date();showTalking = !original.string("startedTalkingAt").isEmpty;monthly=original.string("monthlyMessage");yearly=original.string("yearlyMessage")}}
    private func save(){do{try universe.enqueue("/api/keepsakes",["action":"saveSince","id":original.id,"expectedRevision":original.fields["revision"] ?? NSNull(),"startedAt":ISO8601DateFormatter().string(from:start),"startedTalkingAt":showTalking ? BookDates.dayString(talking) as Any:NSNull(),"monthlyMessage":monthly,"yearlyMessage":yearly]);Touch.tap(true);dismiss()}catch{universe.error=error.localizedDescription}}
}
struct OpenWhenView:View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduced
    @AppStorage("motion-paused") private var paused=false
    var item:BookEntry;var edit:()->Void;var remove:()->Void;var writable:Bool
    @State private var celebrating=false
    var body:some View {NavigationStack{ScrollView(.vertical,showsIndicators:true){VStack(alignment:.leading,spacing:22){Text("♡  ✦  ♡  ✧  ♡").font(.system(size:32)).foregroundColor(Palette.purple).offset(y:celebrating ? -7:7).animation(reduced || paused ? nil:.easeInOut(duration:1.8).repeatForever(autoreverses:true),value:celebrating);Text(item.string("title")).font(.custom("Caveat-Medium",size:36));Text(item.string("text")).font(.system(size:18)).lineSpacing(7).textSelection(.enabled);if writable{HStack{Button("Edit this letter"){dismiss();DispatchQueue.main.asyncAfter(deadline:.now()+0.4){edit()}};Spacer();Button("Remove",role:.destructive){dismiss();DispatchQueue.main.asyncAfter(deadline:.now()+0.4){remove()}}}}}.padding(26)}.background(Palette.lavender).navigationTitle("Open with love").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Keep it close ♡"){dismiss()}}}}.overlay{LetterCelebration()}.onAppear{celebrating=true;Touch.tap(true)}}
}
