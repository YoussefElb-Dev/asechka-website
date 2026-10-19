import SwiftUI
import PhotosUI

struct WishSelection:Identifiable{var wish:Wish?;let id=UUID()}
struct DaysView:View {
    @EnvironmentObject private var universe:UniverseStore
    @State private var editing:WishSelection?
    @State private var filter=0
    var body:some View {
        ScrollView{VStack(alignment:.leading,spacing:20){
            Text("Our little days.").font(.custom("Manrope-Bold",size:30))
            Text("Places to go. Things to try. A little more us.").foregroundColor(Palette.muted)
            VStack(alignment:.leading,spacing:14){Text("Thinking of you.").font(.title3.weight(.semibold));Text("A little heart, from \(universe.name) to \(universe.partner).").foregroundColor(Palette.muted)
                Button{do{try universe.enqueue("/api/together",["action":"sendHeart","from":universe.actor=="asnat" ? "asechka":"me"]);Touch.tap(true)}catch{universe.error=error.localizedDescription}}label:{Label("Send a heart to \(universe.partner)",systemImage:"heart.fill").primary()}
                ForEach(["asechka","me"],id:\.self){who in if let date=universe.hearts[who]{Text("\(who=="asechka" ? "Asnat":"Youssef") sent a heart · \(String(date.prefix(10))) ♡").font(.caption).foregroundColor(Palette.muted)}}
            }.card()
            HStack{Text("Our wish list").font(.title3.weight(.semibold));Spacer();Button{editing=WishSelection(wish:nil)}label:{Image(systemName:"plus").font(.title2).frame(width:44,height:44)}}
            Picker("Plans",selection:$filter){Text("All").tag(0);Text("Still dreaming").tag(1);Text("Made memories").tag(2)}.pickerStyle(.segmented)
            ForEach(universe.wishes.filter{filter==0 || (filter==1 ? $0.completed != true:$0.completed==true)}){wish in
                VStack(alignment:.leading,spacing:14){
                    HStack(alignment:.top){Button{if wish.completed==true{toggle(wish,false)}else{editing=WishSelection(wish:Wish(id:wish.id,title:wish.title,place:wish.place,note:wish.note,completed:true,revision:wish.revision,photoId:wish.photoId))}}label:{Image(systemName:wish.completed==true ? "checkmark.circle.fill":"circle").font(.title2).frame(width:44,height:44)}.accessibilityLabel("Mark plan complete")
                        VStack(alignment:.leading,spacing:7){Text(wish.title).font(.headline);if let place=wish.place,!place.isEmpty{Label(place,systemImage:"mappin").font(.subheadline).foregroundColor(Palette.muted)}};Spacer()
                        Menu{Button("Edit"){editing=WishSelection(wish:wish)};Button("Remove",role:.destructive){remove(wish)}}label:{Image(systemName:"ellipsis").frame(width:40,height:44)}
                    }
                    if let note=wish.note,!note.isEmpty{Text(note).font(.subheadline).foregroundColor(Palette.muted)}
                    if let id=wish.photoId{CachedPhoto(source:"/api/together-photo?kind=bucket&id="+id).aspectRatio(1.2,contentMode:.fit).clipShape(RoundedRectangle(cornerRadius:18))}
                    Text(wish.completed==true ? "A memory we made ♡":"Still dreaming together").font(.caption).foregroundColor(Palette.purple)
                }.card()
            }
            if universe.wishes.isEmpty {Text("Our next adventure starts with a little wish.").foregroundColor(Palette.muted).padding(.vertical,25)}
        }.padding(22)}.refreshable{await universe.refresh()}
            .sheet(item:$editing){selection in WishEditor(original:selection.wish)}
    }
    private func toggle(_ wish:Wish,_ done:Bool){do{try universe.enqueue("/api/together",["action":"toggleItem","id":wish.id,"completed":done,"expectedRevision":wish.revision as Any? ?? NSNull()]);Touch.tap()}catch{universe.error=error.localizedDescription}}
    private func remove(_ wish:Wish){do{try universe.enqueue("/api/together",["action":"removeItem","id":wish.id,"expectedRevision":wish.revision as Any? ?? NSNull()])}catch{universe.error=error.localizedDescription}}
}
struct WishDraft:Codable{var title="";var place="";var note="";var completed=false;var photo:Data?}
struct WishEditor:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var original:Wish?
    @State private var draft=WishDraft()
    @State private var picker:PhotosPickerItem?
    @State private var preparing=false
    @State private var committed=false
    private var key:String{"wish-draft:"+universe.actor+":"+(original?.id ?? "new")}
    var body:some View {
        NavigationStack{Form{
            Section("A little wish"){TextField("What shall we do?",text:$draft.title);TextField("A place · optional",text:$draft.place);TextField("A little note",text:$draft.note,axis:.vertical).lineLimit(3...8)}
            Section{Toggle("We made this memory",isOn:$draft.completed)}
            if draft.completed {Section("A photo to keep"){
                if let data=draft.photo,let image=UIImage(data:data){Image(uiImage:image).resizable().scaledToFit()}
                else if let id=original?.photoId{CachedPhoto(source:"/api/together-photo?kind=bucket&id="+id).aspectRatio(1.1,contentMode:.fit)}
                PhotosPicker(selection:$picker,matching:.images){Label(preparing ? "Preparing…":"Choose a photo",systemImage:"photo")}.disabled(preparing)
            }}
        }.navigationTitle(original==nil ? "A new little plan":"Our little plan").navigationBarTitleDisplayMode(.inline).toolbar{
            ToolbarItem(placement:.cancellationAction){Button("Cancel"){dismiss()}}
            ToolbarItem(placement:.confirmationAction){Button("Save",action:save).disabled(preparing || draft.title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || draft.title.count>140 || draft.place.count>140 || draft.note.count>1000)}
        }}.onAppear{draft=universe.vault.value(key,as:WishDraft.self) ?? WishDraft(title:original?.title ?? "",place:original?.place ?? "",note:original?.note ?? "",completed:original?.completed ?? false)}
            .onDisappear{if !committed{try? universe.vault.save(key,draft)}}
            .task(id:picker){guard let picker else{return};preparing=true;defer{preparing=false};do{guard let bytes=try await picker.loadTransferable(type:Data.self),bytes.count<25_000_000 else{throw URLError(.dataLengthExceedsMaximum)};draft.photo=try await Task.detached{try ComposerView.preparePhoto(bytes)}.value}catch{universe.error=error.localizedDescription}}
    }
    private func save(){var body:[String:Any]=["action":"saveItem","id":original?.id ?? UUID().uuidString.lowercased(),"title":draft.title,"place":draft.place,"note":draft.note,"completed":draft.completed,"expectedRevision":original?.revision as Any? ?? NSNull()]
        if draft.completed,let data=draft.photo{body["photo"]="data:image/jpeg;base64,"+data.base64EncodedString()}
        do{try universe.enqueue("/api/together",body);committed=true;universe.vault.remove(key);Touch.tap(true);dismiss()}catch{universe.error=error.localizedDescription}
    }
}
struct SongSelection:Identifiable{var song:Song;var id:String{song.id}}
struct SoundtrackView:View {
    @EnvironmentObject private var universe:UniverseStore
    @State private var search=false
    @State private var editing:SongSelection?
    var body:some View {
        ScrollView{VStack(alignment:.leading,spacing:20){Text("Our soundtrack.").font(.custom("Manrope-Bold",size:30));Text("Ten little places for the songs that sound like us.").foregroundColor(Palette.muted)
            Button{search=true}label:{Label("Find our next favorite",systemImage:"magnifyingglass").frame(maxWidth:.infinity).primary()}
            ForEach(1...10,id:\.self){rank in
                if let song=universe.songs.first(where:{$0.rank==rank}) {VStack(alignment:.leading,spacing:14){
                    HStack(spacing:14){Text(String(rank)).font(.system(size:13,weight:.bold)).foregroundColor(Palette.purple).frame(width:22);CachedPhoto(source:song.artworkUrl ?? "",living:false).frame(width:70,height:70).clipShape(RoundedRectangle(cornerRadius:15));VStack(alignment:.leading,spacing:6){Text(song.title).font(.headline);Text(song.artist).font(.subheadline).foregroundColor(Palette.muted)};Spacer()
                        Menu{Button("Edit song note"){editing=SongSelection(song:song)};Button("Remove song",role:.destructive){remove(song)}}label:{Image(systemName:"ellipsis").frame(width:40,height:44)}
                    }
                    if let note=song.note,!note.isEmpty{Text(note).font(.subheadline).foregroundColor(Palette.muted)}
                    if let url=song.trackUrl.flatMap(URL.init(string:)){Link(destination:url){Label("Listen on Apple Music",systemImage:"play.fill").font(.subheadline)}}
                }.card()}
                else {Button{search=true}label:{HStack{Text(String(rank)).font(.caption.weight(.bold)).frame(width:22);Image(systemName:"music.note");Text("A little space for our next favorite").font(.subheadline);Spacer();Image(systemName:"plus")}.foregroundColor(Palette.muted).card()}}
            }
        }.padding(22)}.refreshable{await universe.refresh()}
            .sheet(isPresented:$search){MusicSearchView()}
            .sheet(item:$editing){selection in NavigationStack{SongSaveView(song:selection.song,existing:true)}}
    }
    private func remove(_ song:Song){do{try universe.enqueue("/api/music",["action":"remove","rank":song.rank ?? 1,"expectedId":song.savedId ?? song.revision as Any? ?? NSNull()])}catch{universe.error=error.localizedDescription}}
}
struct MusicSearchView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    @State private var query=""
    @State private var results:[Song]=[]
    @State private var searching=false
    var body:some View {
        NavigationStack{List{
            HStack{TextField("A song or an artist",text:$query).submitLabel(.search).onSubmit{find()};Button("Search",action:find).disabled(searching || query.trimmingCharacters(in:.whitespaces).isEmpty)}
            if searching{ProgressView("Finding our songs…")}
            ForEach(results){song in NavigationLink{SongSaveView(song:song,existing:false,onSave:{dismiss()})}label:{HStack(spacing:12){CachedPhoto(source:song.artworkUrl ?? "",living:false).frame(width:52,height:52).clipShape(RoundedRectangle(cornerRadius:10));VStack(alignment:.leading,spacing:5){Text(song.title).font(.headline);Text(song.artist).font(.subheadline).foregroundColor(Palette.muted)}}}}
        }.navigationTitle("Find a song").toolbar{ToolbarItem(placement:.cancellationAction){Button("Close"){dismiss()}}}}
    }
    private func find(){searching=true;Task{do{results=try await universe.search(query)}catch{universe.error=error.localizedDescription};searching=false}}
}
struct SongSaveView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var song:Song
    var existing:Bool
    var onSave:(()->Void)?
    @State private var rank=1
    @State private var note=""
    var body:some View {
        Form{Section{HStack(spacing:14){CachedPhoto(source:song.artworkUrl ?? "",living:false).frame(width:80,height:80).clipShape(RoundedRectangle(cornerRadius:16));VStack(alignment:.leading,spacing:7){Text(song.title).font(.headline);Text(song.artist).foregroundColor(Palette.muted)}}}
            Section("A little place in our top ten"){Picker("Spot",selection:$rank){ForEach(1...10,id:\.self){Text("\($0)").tag($0)}}.disabled(existing);TextField("What does this song mean to us?",text:$note,axis:.vertical).lineLimit(3...8)}
            Section{Button("Keep in our soundtrack ♡",action:save).disabled(note.count>500)}
        }.navigationTitle(existing ? "Our song":"Keep this song").onAppear{rank=song.rank ?? (1...10).first{value in !universe.songs.contains{$0.rank==value}} ?? 1;note=song.note ?? ""}
    }
    private func save(){let current=universe.songs.first{$0.rank==rank};do{try universe.vault.save("song:\(song.trackId)",song);try universe.enqueue("/api/music",["action":"save","rank":rank,"trackId":song.trackId,"note":note,"expectedId":current?.savedId ?? current?.revision as Any? ?? NSNull()]);Touch.tap(true);if let onSave{onSave()}else{dismiss()}}catch{universe.error=error.localizedDescription}}
}
