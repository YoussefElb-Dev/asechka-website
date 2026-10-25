import SwiftUI
import PhotosUI

struct SettingsView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("haptics") private var haptics=true
    @AppStorage("motion-paused") private var paused=false
    @State private var reconnect=false
    @State private var code=""
    var body:some View {
        NavigationStack{List{
            Section{HStack(spacing:14){Avatar(actor:universe.actor,size:50);VStack(alignment:.leading){Text(universe.name).font(.headline);Text("Our little universe").foregroundColor(Palette.muted)}}}
            Section("Feel a little more"){Toggle("Haptic feedback",isOn:$haptics);Toggle("Pause gentle animations",isOn:$paused)}
            Section("Our favorite dates"){Label("Asnat · August 5",systemImage:"gift");Label("Youssef · January 25",systemImage:"gift")}
            Section("Saved changes"){
                if universe.pending.isEmpty{Text("Everything is saved on this phone.").foregroundColor(Palette.muted)}
                ForEach(universe.pending){change in VStack(alignment:.leading,spacing:8){Text(change.error ?? "Waiting for a connection").font(.subheadline);Text(String(change.createdAt.prefix(10))).font(.caption).foregroundColor(Palette.muted)
                    if change.error != nil{Text("Your change is kept here. Copy it before discarding if you want to revise it.").font(.caption).foregroundColor(Palette.muted)
                        if let json=(try? JSONSerialization.jsonObject(with:change.body)) as? [String:Any] {Text((json["text"] as? String) ?? (json["caption"] as? String) ?? (json["title"] as? String) ?? (json["note"] as? String) ?? "").textSelection(.enabled)}
                        Button("Discard this queued change",role:.destructive){universe.discard(change)}
                    }
                }}
            }
            Section{Button("Refresh our universe"){Task{await universe.refresh()}};Button("Reconnect with our code"){reconnect=true};Button("Switch profile"){universe.choose("");dismiss()};Button("Lock our little door",role:.destructive){universe.lock();dismiss()}}
            Section{Text("Photos and content save for offline use. New content checks every minute while the app is open and when the connection returns. New translations and music searches need internet.").font(.caption).foregroundColor(Palette.muted);Text("Asechka 2.2.0 · made for us ♡").font(.caption)}
        }.navigationTitle("Our little settings").toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}
            .alert("Reconnect",isPresented:$reconnect){SecureField("Our code",text:$code);Button("Open"){Task{await universe.login(code);code=""}};Button("Cancel",role:.cancel){code=""}}
        }
    }
}
struct CornerView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    @State private var letter=false
    @State private var hint=0
    @State private var littleBook=false
    @State private var personalBook=false
    private let hints=["No spoilers. Just a few butterflies.","It starts with you.","It has a little something to do with us.","Maybe there’s a question I’ve been saving…"]
    var body:some View {
        NavigationStack{ScrollView(.vertical,showsIndicators:true){VStack(alignment:.leading,spacing:20){
            Text(universe.actor=="asnat" ? "My favorite\nlittle universe.":"Our favorite\nlittle universe.").font(.custom("Manrope-Bold",size:33))
            Text("Of all the people, in all the places, somehow my heart keeps finding you.").foregroundColor(Palette.muted)
            Button("Since us · letters & little things"){personalBook=true}.primary()
            Button("Our little book"){littleBook=true}.primary()
            CachedPhoto(source:"assets/our-little-universe.png").aspectRatio(1.25,contentMode:.fit).clipShape(RoundedRectangle(cornerRadius:24))
            Button(universe.actor=="asnat" ? "Your letter ♡":"Letter to Asnat ♡"){letter=true}.primary()
            VStack(alignment:.leading,spacing:12){Text("A LITTLE MOMENT, JUST FOR US").font(.system(size:10,weight:.bold)).tracking(2).foregroundColor(Palette.purple)
                TimelineView(.periodic(from:.now,by:1)){context in let remaining=Int(max(0,Date(timeIntervalSince1970:1792177200).timeIntervalSince(context.date)))
                    Text(remaining==0 ? "Our little moment is here. ✦":String(format:"%02d d : %02d h : %02d m : %02d s",remaining/86400,remaining/3600%24,remaining/60%60,remaining%60)).font(.title3.weight(.semibold))
                }
                Text("Some things are better said in person. The next little chapter starts with us.").font(.subheadline).foregroundColor(Palette.muted)
                Text(hints[hint]).font(.subheadline);Button("A tiny hint?"){withAnimation{hint=min(hints.count-1,hint+1)}}.disabled(hint==hints.count-1)
            }.card()
            VStack(alignment:.leading,spacing:14){Text("Two favorite days.").font(.title3.weight(.semibold));birthday("Asnat",month:8,day:5);birthday("Youssef",month:1,day:25)}.card()
            VStack(alignment:.leading,spacing:10){Text("A little memory, just for today").font(.headline);Text(universe.dailyText.isEmpty ? "A new little moment, every day.":universe.dailyText).font(.subheadline)}.card()
            feeling("My favorite thought","Even in the middle of an ordinary day, a thought of you makes everything feel a little brighter.")
            feeling("My soft spot","I love you, Asechka. In the quiet moments, in the little things, and in all the ways I’m still learning to say.")
            feeling("More moments with you","More conversations. More little laughs. More time beside you. If I could wish for one thing, it would be more of us.")
            QuoteCarousel();Text("Made with a whole lot of love. Only for you. ♡").font(.caption).foregroundColor(Palette.muted)
        }.padding(22)}.background(Palette.background).navigationTitle("Our corner").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}
            .sheet(isPresented:$letter){LetterView()}
            .sheet(isPresented:$littleBook){BookView()}
            .sheet(isPresented:$personalBook){BookView(personal:true)}
    }
    private func feeling(_ title:String,_ text:String)->some View{VStack(alignment:.leading,spacing:10){Text(title).font(.headline);Text(text).font(.subheadline).foregroundColor(Palette.muted)}.card()}
    private func birthday(_ name:String,month:Int,day:Int)->some View {
        let calendar=Calendar.current;let start=calendar.startOfDay(for:Date())
        let next=calendar.nextDate(after:start.addingTimeInterval(-1),matching:DateComponents(month:month,day:day),matchingPolicy:.nextTime) ?? start
        let days=calendar.dateComponents([.day],from:start,to:next).day ?? 0
        return HStack{Image(systemName:"gift").foregroundColor(Palette.purple);Text(name+" · "+(month==8 ? "August 5":"January 25"));Spacer();Text(days==0 ? "Today ♡":"\(days) days").font(.caption).foregroundColor(Palette.muted)}
    }
}
struct LetterView:View {
    @Environment(\.dismiss) private var dismiss
    var body:some View{NavigationStack{ScrollView(.vertical,showsIndicators:true){VStack(alignment:.leading,spacing:22){Text("Dear Asechka,").font(.custom("Caveat-Medium",size:38))
        ForEach(["Asnat to the world. Asechka to me.","I wanted to make you something small, but filled with a feeling that isn’t small at all.","I love you. And I love that, in a world this big, I get to know you. Just thinking about you can turn the most ordinary moment into something I want to keep.","This little website is a piece of that feeling. A few stars, two cats, and a whole lot of things I wish I could say perfectly.","There’s one more little thing I’ve been keeping close to my heart. I won’t give it away here. Just save a moment for me on Friday.","Until then, let this be your reminder: you mean so much to me.","With all my love,\nme ♡"],id:\.self){Text($0).lineSpacing(6).textSelection(.enabled)}
    }.padding(28)}.background(Palette.lavender).navigationTitle("A letter, just for you").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Keep it close ♡"){dismiss()}}}}}
}
struct WordsView:View {
    @EnvironmentObject private var universe:UniverseStore
    @State private var text=""
    @State private var source="auto"
    @State private var tone="natural"
    @State private var targets:Set<String>=["ar-EG","ru","he","fr","es"]
    @State private var busy=false
    @State private var history=false
    static let languages=[("ar-EG","Egyptian Arabic · مصري"),("ru","Russian · Русский"),("he","Hebrew · עברית"),("fr","French · Français"),("es","Spanish · Español")]
    var body:some View {
        ScrollView(.vertical,showsIndicators:true){VStack(alignment:.leading,spacing:20){Text("Our words.").font(.custom("Manrope-Bold",size:30));Text("Written by \(universe.name), for \(universe.partner). The language roles are set for you.").foregroundColor(Palette.muted)
            VStack(alignment:.leading,spacing:15){TextEditor(text:$text).frame(minHeight:145).scrollContentBackground(.hidden);Text("\(text.count) / 1,500").font(.caption).foregroundColor(Palette.muted)
                Picker("Source",selection:$source){Text("Detect automatically").tag("auto");Text("English").tag("en");ForEach(Self.languages,id:\.0){Text($0.1).tag($0.0)}}
                Picker("Tone",selection:$tone){Text("Natural & everyday").tag("natural");Text("A little sweeter").tag("sweet");Text("Soft & poetic").tag("poetic")}
                ForEach(Self.languages,id:\.0){language in Toggle(language.1,isOn:Binding(get:{targets.contains(language.0)},set:{if $0{targets.insert(language.0)}else{targets.remove(language.0)}}))}
                Button{busy=true;Task{do{try await universe.translate(text,source:source,tone:tone,targets:Self.languages.map(\.0).filter{targets.contains($0)})}catch{universe.error=error.localizedDescription};busy=false}}label:{HStack{if busy{ProgressView().tint(.white)};Text(busy ? "Finding the right words…":"Translate our words →").frame(maxWidth:.infinity)}.primary()}.disabled(busy || text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || text.count>1500 || targets.isEmpty)
                Button("Saved translations"){history=true}
                Text("Only submitted text and language settings go to Google’s free Gemini service. Google may use free-tier content to improve products. AI translations may need a human correction.").font(.caption2).foregroundColor(Palette.muted)
            }.card()
            ForEach(universe.translations){translation in TranslationCard(translation:translation)}
        }.padding(22)}
        .onAppear{text=universe.vault.value("word-draft:"+universe.actor,as:String.self) ?? ""}
        .task(id:text){do{try await Task.sleep(nanoseconds:500_000_000)}catch{return};try? universe.vault.save("word-draft:"+universe.actor,text)}
        .onDisappear{try? universe.vault.save("word-draft:"+universe.actor,text)}
        .sheet(isPresented:$history){NavigationStack{ScrollView(.vertical,showsIndicators:true){VStack(spacing:20){ForEach(universe.vault.value("translation-history:"+universe.actor,as:[TranslationRecord].self) ?? []){record in VStack(alignment:.leading,spacing:16){Text(record.text).font(.headline);ForEach(record.results){TranslationCard(translation:$0)}}}}.padding(20)}.background(Palette.background).navigationTitle("Saved translations").toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){history=false}}}}}
    }
}
struct TranslationCard:View {
    let translation:Translation
    var body:some View{VStack(alignment:.leading,spacing:12){Text(WordsView.languages.first{$0.0==translation.language}?.1 ?? translation.language).font(.headline).foregroundColor(Palette.purple)
        Text(translation.text).font(.system(size:21)).textSelection(.enabled).frame(maxWidth:.infinity,alignment:["he","ar-EG"].contains(translation.language) ? .trailing:.leading).environment(\.layoutDirection,["he","ar-EG"].contains(translation.language) ? .rightToLeft:.leftToRight)
        if !translation.pronunciation.isEmpty{Text(translation.pronunciation).font(.subheadline)}
        Text(translation.backTranslation).font(.subheadline).foregroundColor(Palette.muted)
        if !translation.note.isEmpty{Text(translation.note).font(.caption).foregroundColor(Palette.muted)}
        Button("Copy translation ↗"){UIPasteboard.general.string=translation.text;Touch.tap(true)}
    }.card()}
}
