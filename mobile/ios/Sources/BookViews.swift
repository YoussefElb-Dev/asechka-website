import SwiftUI
import PhotosUI

struct BookEdit:Identifiable {var id=UUID();var kind:String;var entry:BookEntry?}
struct BookView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var personal=false
    @State private var chapter=0
    @State private var query=""
    @State private var filter=0
    @State private var reveal=0
    @State private var manageThings=false
    @State private var editing:BookEdit?
    @State private var letter:BookEntry?
    @State private var removal:BookEdit?
    @State private var beginning=false
    private var data:[String:Any]{personal ? universe.keepsakes:universe.journal}
    private var writable:Bool {data["writable"] as? Bool ?? false}
    private var endpoint:String{personal ? "/api/keepsakes":"/api/journal"}
    private var key:String{personal ? (chapter==1 ? "letters":"things"):(chapter==0 ? "victories":chapter==1 ? "recipes":"jokes")}
    private var kind:String{personal ? (chapter==1 ? "Letter":"Thing"):(chapter==0 ? "Victory":chapter==1 ? "Recipe":"Joke")}
    private var entries:[BookEntry]{(data[key] as? [[String:Any]] ?? []).map{BookEntry(fields:$0)}}
    private var filtered:[BookEntry]{entries.reversed().filter{item in
        if kind=="Recipe",filter != 0,item.flag("tried") != (filter==2){return false}
        return query.isEmpty || ["title","meaning","story"].map{item.string($0)}.joined(separator:" ").localizedCaseInsensitiveContains(query)
    }}
    var body:some View {
        NavigationStack{ScrollView{VStack(alignment:.leading,spacing:20){
            Text(personal ? "All the days\nthat became ours.":"Our little book.\nStill being written.").font(.custom("Manrope-Bold",size:30))
            Text("Saved for both of us. Add your own words, whenever you like.").foregroundColor(Palette.muted)
            ScrollView(.horizontal,showsIndicators:false){HStack(spacing:10){ForEach(0..<3,id:\.self){index in Button{chapter=index;query="";filter=0;Touch.tap()}label:{Text((personal ? ["Since us","Open when…","Little things"]:["Tiny victories","Recipes for two","Inside jokes"])[index]).font(.subheadline.weight(.semibold)).padding(14).background(chapter==index ? Palette.purple:Palette.lavender,in:Capsule()).foregroundColor(chapter==index ? .white:Palette.purple)}.accessibilityAddTraits(chapter==index ? .isSelected:[])}}}
            if !writable{Text("Connect and refresh once to enable shared editing. Your saved pages remain here offline.").font(.caption).foregroundColor(Palette.muted)}
            if personal && chapter==0 {sinceContent}
            else {chapterContent}
        }.padding(22)}.background(Palette.background).refreshable{await universe.refresh()}.navigationTitle(personal ? "Since us":"Our little book").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}
        .sheet(item:$editing){edit in BookEditor(kind:edit.kind,original:edit.entry,endpoint:endpoint)}
        .sheet(item:$letter){item in OpenWhenView(item:item,edit:{editing=BookEdit(kind:"Letter",entry:item)},remove:{removal=BookEdit(kind:"Letter",entry:item)},writable:writable)}
        .sheet(isPresented:$beginning){BeginningEditor(original:BookEntry(fields:data["since"] as? [String:Any] ?? [:]))}
        .confirmationDialog("Remove this entry for both of us?",isPresented:Binding(get:{removal != nil},set:{if !$0{removal=nil}}),titleVisibility:.visible){Button("Remove",role:.destructive){if let removal{remove(removal)};removal=nil};Button("Keep it",role:.cancel){removal=nil}}
    }
    @ViewBuilder private var chapterContent:some View {
        Button{editing=BookEdit(kind:kind)}label:{Label(kind=="Thing" ? "Add a little thing":kind=="Joke" ? "Add an inside joke":"Add a "+kind.lowercased(),systemImage:"plus").frame(maxWidth:.infinity).primary()}.disabled(!writable)
        if kind=="Joke" {TextField("Find one of our inside jokes…",text:$query).textFieldStyle(.roundedBorder)}
        if kind=="Recipe"{Picker("Recipe collection",selection:$filter){Text("All").tag(0);Text("Wish list").tag(1);Text("Tried").tag(2)}.pickerStyle(.segmented)}
        if entries.isEmpty {Text("A little space for something only we could write.").foregroundColor(Palette.muted).padding(.vertical,24)}
        else if kind=="Letter" {LazyVGrid(columns:[GridItem(.adaptive(minimum:145),spacing:12)],spacing:12){ForEach(entries){item in Button{letter=item;Touch.tap(true)}label:{VStack(alignment:.leading,spacing:16){Image(systemName:"envelope").font(.title2);Text(item.string("title")).font(.headline).multilineTextAlignment(.leading);Text("Open with love ♡").font(.caption)}.frame(maxWidth:.infinity,minHeight:130,alignment:.leading).padding(18).background(Palette.lavender,in:RoundedRectangle(cornerRadius:22))}}}}
        else if kind=="Thing" {
            entryCard(entries[reveal%entries.count]);Button("Another little thing ♡"){reveal=(reveal+1)%entries.count;Touch.tap()}
            DisclosureGroup("Manage all little things",isExpanded:$manageThings){ForEach(entries){item in HStack{Text(item.string("text")).font(.subheadline);Spacer();Button("Edit"){editing=BookEdit(kind:"Thing",entry:item)};Button{removal=BookEdit(kind:"Thing",entry:item)}label:{Image(systemName:"trash")}.accessibilityLabel("Remove little thing")}.padding(.vertical,10)}}
        } else {ForEach(filtered){entryCard($0)};if filtered.isEmpty{Text("No matching little memories yet.").foregroundColor(Palette.muted)}}
    }
    private func entryCard(_ item:BookEntry)->some View {
        VStack(alignment:.leading,spacing:14){
            Text(item.string(kind=="Thing" ? "text":"title")).font(kind=="Thing" ? .custom("Caveat-Medium",size:29):.title3.weight(.semibold)).textSelection(.enabled)
            if item.flag("pending"){Text("Saved on this phone · waiting to sync").font(.caption).foregroundColor(Palette.purple)}
            if kind=="Victory" {Text((item.string("who")=="me" ? "Proud of Youssef":item.string("who")=="asechka" ? "Proud of Asechka":"Proud of both of us")+" · "+item.string("date")).font(.caption).foregroundColor(Palette.purple)}
            if kind=="Recipe",!item.string("photoId").isEmpty{CachedPhoto(source:"/api/journal?photo="+item.string("photoId")).aspectRatio(1.2,contentMode:.fit).clipShape(RoundedRectangle(cornerRadius:18))}
            ForEach(["note","meaning","story","ingredients","steps"],id:\.self){field in if !item.string(field).isEmpty{VStack(alignment:.leading,spacing:6){if field=="ingredients" || field=="steps"{Text(field.capitalized).font(.headline)};Text(item.string(field)).foregroundColor(Palette.muted).textSelection(.enabled)}}
            if kind=="Recipe" {Text(item.flag("tried") ? "Tried together · Youssef \(rating(item,"me")) · Asechka \(rating(item,"asechka"))":"On our cooking wish list").font(.caption).foregroundColor(Palette.purple)}
            HStack{Button("Edit"){editing=BookEdit(kind:kind,entry:item)};Spacer();Button("Remove",role:.destructive){removal=BookEdit(kind:kind,entry:item)}}.disabled(!writable)
        }.card()
    }
    private func rating(_ item:BookEntry,_ key:String)->String {guard let value=(item.fields["ratings"] as? [String:Any])?[key] as? Int else{return "unrated"};return "\(value)/5"}
    @ViewBuilder private var sinceContent:some View {
        if let since=data["since"] as? [String:Any],let started=BookDates.instant(since["startedAt"] as? String ?? "") {
            TimelineView(.periodic(from:.now,by:60)){context in VStack(alignment:.leading,spacing:15){
                Text("SINCE WE BECAME US").font(.caption.weight(.semibold)).tracking(2).foregroundColor(Palette.purple)
                Text("\(max(0,Int(context.date.timeIntervalSince(started)/86400))) days, and counting. ♡").font(.custom("Caveat-Medium",size:36))
                Text(BookDates.display(started,time:true)+" · Eastern time").font(.subheadline).foregroundColor(Palette.muted)
                if let day=since["startedTalkingAt"] as? String,let date=BookDates.day(day){Divider();Text("We started talking.").font(.headline);Text(BookDates.display(date)).foregroundColor(Palette.purple)}
                ForEach([false,true],id:\.self){yearly in Divider();Text(yearly ? "Our next anniversary":"Our next month together").font(.headline);Text(BookDates.display(BookDates.next(started,yearly:yearly,now:context.date))).foregroundColor(Palette.purple);if let message=since[yearly ? "yearlyMessage":"monthlyMessage"] as? String,!message.isEmpty{Text(message).font(.subheadline).foregroundColor(Palette.muted)}}
            }.card()}
            Button("Edit our beginning & messages"){beginning=true}.primary().disabled(!writable)
        }
    }
    private func remove(_ edit:BookEdit){guard let entry=edit.entry else{return};do{try universe.enqueue(endpoint,["action":"remove"+edit.kind,"id":entry.id,"expectedRevision":entry.fields["revision"] ?? NSNull()])}catch{universe.error=error.localizedDescription}}
}

struct BookEditor:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var kind:String;var original:BookEntry?;var endpoint:String
    @State private var draft=BookDraft()
    @State private var picker:PhotosPickerItem?
    @State private var preparing=false
    @State private var committed=false
    @State private var loaded=false
    private var key:String{"book-draft:"+universe.actor+":"+kind+":"+(original?.id ?? "new")}
    var body:some View {
        NavigationStack{Form{
            Section("In our own words"){
                if kind != "Thing" {TextField(kind=="Letter" ? "Open when…":kind=="Joke" ? "Our phrase":"Title",text:$draft.title)}
                if kind=="Letter" || kind=="Thing" {TextField("Your words",text:$draft.text,axis:.vertical).lineLimit(5...20)}
                if kind=="Victory" {TextField("Date · YYYY-MM-DD",text:$draft.date);Picker("Proud of",selection:$draft.who){Text("Youssef").tag("me");Text("Asechka").tag("asechka");Text("Both of us").tag("us")};TextField("What made you proud?",text:$draft.note,axis:.vertical).lineLimit(3...10)}
                if kind=="Joke" {TextField("What it means to us",text:$draft.meaning,axis:.vertical).lineLimit(3...10);TextField("How it started · optional",text:$draft.story,axis:.vertical).lineLimit(3...10)}
            }
            if kind=="Recipe" {
                Section("Cooking together"){TextField("Ingredients · one per line",text:$draft.ingredients,axis:.vertical).lineLimit(4...15);TextField("Steps · one per line",text:$draft.steps,axis:.vertical).lineLimit(5...20);TextField("Our notes",text:$draft.note,axis:.vertical).lineLimit(3...10);Toggle("We tried this together",isOn:$draft.tried)}
                if draft.tried{Section("Our ratings"){rating("Youssef’s rating",value:$draft.me);rating("Asechka’s rating",value:$draft.asechka)}}
                Section("A picture for our recipe"){
                    if let bytes=draft.photo,let image=UIImage(data:bytes){Image(uiImage:image).resizable().scaledToFit()}
                    else if !draft.removePhoto,let id=original?.string("photoId"),!id.isEmpty{CachedPhoto(source:"/api/journal?photo="+id).aspectRatio(1.2,contentMode:.fit)}
                    PhotosPicker(selection:$picker,matching:.images){Label(preparing ? "Preparing…":"Choose a recipe photo",systemImage:"photo")}.disabled(preparing)
                    if draft.photo != nil || !(original?.string("photoId") ?? "").isEmpty {Button("Remove photo",role:.destructive){draft.photo=nil;draft.removePhoto=true}}
                }
            }
            Section{Text("Your draft is saved privately on this phone. Shared changes sync when connected.").font(.caption).foregroundColor(Palette.muted)}
        }.navigationTitle((original==nil ? "Add ":"Edit ")+kind.lowercased()).navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.cancellationAction){Button("Cancel"){dismiss()}};ToolbarItem(placement:.confirmationAction){Button("Save",action:save).disabled(preparing || !valid)}}}
        .onAppear{if !loaded{draft=universe.vault.value(key,as:BookDraft.self) ?? BookDraft(original);loaded=true}}
        .onDisappear{if !committed{try? universe.vault.save(key,draft)}}
        .task(id:picker){guard let picker else{return};preparing=true;defer{preparing=false};do{guard let bytes=try await picker.loadTransferable(type:Data.self),bytes.count<25_000_000 else{throw URLError(.dataLengthExceedsMaximum)};draft.photo=try await Task.detached{try ComposerView.preparePhoto(bytes)}.value;draft.removePhoto=false}catch{universe.error=error.localizedDescription}}
    }
    private func rating(_ label:String,value:Binding<Int>)->some View {Picker(label,selection:value){Text("Not rated").tag(0);ForEach(1...5,id:\.self){Text("\($0) / 5").tag($0)}}}
    private var valid:Bool {
        if kind != "Thing" && (draft.title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || draft.title.count>(["Joke","Letter"].contains(kind) ? 160:140)){return false}
        if ["Thing","Letter"].contains(kind) && (draft.text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || draft.text.count>(kind=="Letter" ? 16000:2000)){return false}
        if kind=="Victory" && (BookDates.day(draft.date)==nil || draft.note.count>3000){return false}
        if kind=="Joke" && (draft.meaning.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || draft.meaning.count>3000 || draft.story.count>3000){return false}
        return kind != "Recipe" || draft.ingredients.count<=6000 && draft.steps.count<=12000 && draft.note.count<=2000
    }
    private func save(){
        var b:[String:Any]=["action":"save"+kind,"id":original?.id ?? UUID().uuidString.lowercased(),"expectedRevision":original?.fields["revision"] ?? NSNull()]
        if kind != "Thing"{b["title"]=draft.title}
        if ["Thing","Letter"].contains(kind){b["text"]=draft.text}
        if kind=="Victory"{b["date"]=draft.date;b["who"]=draft.who;b["note"]=draft.note}
        if kind=="Joke"{b["meaning"]=draft.meaning;b["story"]=draft.story}
        if kind=="Recipe"{b["ingredients"]=draft.ingredients;b["steps"]=draft.steps;b["note"]=draft.note;b["tried"]=draft.tried;b["ratings"]=["me":draft.tried && draft.me>0 ? draft.me as Any:NSNull(),"asechka":draft.tried && draft.asechka>0 ? draft.asechka as Any:NSNull()];if let bytes=draft.photo{b["photo"]="data:image/jpeg;base64,"+bytes.base64EncodedString()}else if draft.removePhoto{b["removePhoto"]=true}}
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
    var body:some View {NavigationStack{ScrollView{VStack(alignment:.leading,spacing:22){Text("♡  ✦  ♡  ✧  ♡").font(.system(size:32)).foregroundColor(Palette.purple).offset(y:celebrating ? -7:7).animation(reduced || paused ? nil:.easeInOut(duration:1.8).repeatForever(autoreverses:true),value:celebrating);Text(item.string("title")).font(.custom("Caveat-Medium",size:36));Text(item.string("text")).font(.system(size:18)).lineSpacing(7).textSelection(.enabled);HStack{Button("Edit this letter"){dismiss();DispatchQueue.main.asyncAfter(deadline:.now()+0.4){edit()}};Spacer();Button("Remove",role:.destructive){dismiss();DispatchQueue.main.asyncAfter(deadline:.now()+0.4){remove()}}}.disabled(!writable)}.padding(26)}.background(Palette.lavender).navigationTitle("Open with love").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Keep it close ♡"){dismiss()}}}}.onAppear{celebrating=true;Touch.tap(true)}}
}
