import SwiftUI

struct BookRoute:Identifiable {let id=UUID();var personal:Bool;var chapter:Int}
enum HeartLedger {
    static func day(_ date:Date=Date())->String {BookDates.dayString(date)}
    static func previous(_ day:String)->String {guard let date=BookDates.day(day),let previous=BookDates.calendar.date(byAdding:.day,value:-1,to:date)else{return ""};return self.day(previous)}
    static func streak(_ days:[String:[String:Int]],who:String,today:String=day())->Int {
        func sent(_ day:String)->Bool {who=="both" ? (days[day]?["me"] ?? 0)>0 && (days[day]?["asechka"] ?? 0)>0 : (days[day]?[who] ?? 0)>0}
        var cursor=sent(today) ? today:previous(today),count=0
        while sent(cursor){count+=1;cursor=previous(cursor)};return count
    }
    static func apply(_ body:[String:Any],to days:inout [String:[String:Int]],receipts:Set<String>,createdAt:String) {
        guard let op=body["operationId"] as? String,!receipts.contains(op),let from=body["from"] as? String else{return}
        let date=body["day"] as? String ?? day(BookDates.instant(createdAt) ?? Date())
        days[date,default:[:]][from,default:0]+=body["count"] as? Int ?? 1
    }
}

struct HomeHub:View {
    @State private var filmCamera=false
    @State private var timeVault=false
    @State private var musicSearch=false
    @State private var promptDraft=""
    @State private var promptSavedNote=""
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.accessibilityReduceMotion) private var reduced
    @AppStorage("motion-paused") private var paused=false
    @Environment(\.dynamicTypeSize) private var textSize
    var open:(BookRoute)->Void
    var openHistory:()->Void
    var openJar:()->Void = {}
    private var from:String{universe.actor=="asnat" ? "asechka":"me"}
    private var other:String{from=="me" ? "asechka":"me"}
    static let vibes:[(String,String,String)] = [
        ("miss-you","🥺","Miss you"),
        ("goodnight","🌙","Goodnight"),
        ("thinking","💭","Thinking"),
        ("proud","✨","Proud"),
        ("kiss","💋","Kiss")
    ]
    static func vibeMeta(_ key:String)->(String,String) {
        if let v=vibes.first(where:{$0.0==key}){return (v.1,v.2)}
        return ("♡","Thinking of you")
    }
    private var routes:[(String,String,String,Bool,Int)]{[
        ("Secret vocab","Our inside-joke dictionary","text.book.closed",false,0),
        ("Open when…","A letter for every feeling","envelope",true,1),
        ("Little things","Things we love about us","heart",true,2),
        ("Our beginning","Since that little yes","infinity",true,0)]}
    private var totalHearts:Int {
        universe.heartDays.values.reduce(0){$0+($1["me"] ?? 0)+($1["asechka"] ?? 0)}
    }
    private var milestoneHint:String {
        let total=totalHearts
        let nextHeart=[1000,5000,10000,25000,40000,50000,75000,100000,250000,500000,1000000].first{$0>total} ?? (((total/100000)+1)*100000)
        let streak=universe.sharedHeartStreak().days
        let nextStreak=[7,14,30,50,100,150,200,365].first{$0>streak} ?? (streak+50)
        return "\(total.formatted()) ♡ · \((nextHeart-total).formatted()) to \(nextHeart/1000)k · \(max(0,nextStreak-streak))d to \(nextStreak)d"
    }
    private func togetherMilestone(days:Int)->(label:String,remaining:Int,progress:CGFloat) {
        let marks=[50,100,150,180,200,250,300,365,500,730,1000,1095,1460,1825]
        let next=marks.first{$0>days} ?? (((days/365)+1)*365)
        let prev=marks.last{$0<=days} ?? 0
        let remaining=max(1,next-days)
        let progress=min(1.0,max(0.08,CGFloat(days-prev)/CGFloat(max(1,next-prev))))
        let label = next==365 ? "1 yr" : (next%365==0 ? "\(next/365)y" : "\(next)d")
        return (label,remaining,progress)
    }
    var body:some View {
        VStack(alignment:.leading,spacing:10){
            heartCard
            vibeRow
            sinceCard
            HStack(spacing:10){
                Button { filmCamera=true;Touch.tap() } label: {
                    VStack(alignment:.leading,spacing:8){
                        HStack{
                            Image(systemName:"camera.fill")
                                .font(.system(size:14,weight:.semibold))
                                .foregroundColor(Palette.purple)
                                .frame(width:30,height:30)
                                .background(Color.white.opacity(0.78),in:Circle())
                            Spacer()
                            Image(systemName:"arrow.up.right")
                                .font(.system(size:11,weight:.semibold))
                                .foregroundColor(Palette.purple.opacity(0.6))
                        }
                        VStack(alignment:.leading,spacing:3){
                            Text("Our disposable camera")
                                .font(.system(size:13.5,weight:.semibold))
                                .foregroundColor(Palette.ink)
                                .multilineTextAlignment(.leading)
                                .lineLimit(2)
                            Text(universe.cameraBadge)
                                .font(.system(size:10.5))
                                .foregroundColor(Palette.purple.opacity(0.85))
                                .multilineTextAlignment(.leading)
                                .lineLimit(2)
                        }
                    }
                    .padding(13)
                    .frame(maxWidth:.infinity,minHeight:108,maxHeight:.infinity,alignment:.topLeading)
                    .background(Palette.lavender,in:RoundedRectangle(cornerRadius:20,style:.continuous))
                    .overlay(RoundedRectangle(cornerRadius:20,style:.continuous).stroke(Palette.purple.opacity(0.10),lineWidth:1))
                }
                Button { timeVault=true;Touch.tap() } label: {
                    VStack(alignment:.leading,spacing:8){
                        HStack{
                            Image(systemName:"lock.shield.fill")
                                .font(.system(size:14,weight:.semibold))
                                .foregroundColor(Palette.ink)
                                .frame(width:30,height:30)
                                .background(Color.white.opacity(0.78),in:Circle())
                            Spacer()
                            Image(systemName:"arrow.up.right")
                                .font(.system(size:11,weight:.semibold))
                                .foregroundColor(Palette.ink.opacity(0.45))
                        }
                        VStack(alignment:.leading,spacing:3){
                            Text("Time vault")
                                .font(.system(size:13.5,weight:.semibold))
                                .foregroundColor(Palette.ink)
                                .multilineTextAlignment(.leading)
                                .lineLimit(2)
                            Text(universe.vaultBadge)
                                .font(.system(size:10.5))
                                .foregroundColor(Palette.muted)
                                .multilineTextAlignment(.leading)
                                .lineLimit(2)
                        }
                    }
                    .padding(13)
                    .frame(maxWidth:.infinity,minHeight:108,maxHeight:.infinity,alignment:.topLeading)
                    .background(Palette.blue,in:RoundedRectangle(cornerRadius:20,style:.continuous))
                    .overlay(RoundedRectangle(cornerRadius:20,style:.continuous).stroke(Palette.purple.opacity(0.10),lineWidth:1))
                }
                .accessibilityLabel("Time vault")
                .accessibilityValue(universe.vaultBadge)
            }
            .fixedSize(horizontal:false,vertical:true)
            pinnedJarCard
            dailyPromptCard
            momentSongCard
            if !universe.throwbackText.isEmpty { throwbackCard }
            LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:7),count:2),spacing:7){ForEach(routes.indices,id:\.self){index in
                let route=routes[index]
                Button{Touch.tap();open(BookRoute(personal:route.3,chapter:route.4))}label:{Label(route.0,systemImage:route.2).font(.system(size:12,weight:.medium)).foregroundColor(Palette.purple).multilineTextAlignment(.center).frame(maxWidth:.infinity,minHeight:44).padding(.horizontal,5).background(.white,in:RoundedRectangle(cornerRadius:16,style:.continuous)).overlay(RoundedRectangle(cornerRadius:16,style:.continuous).stroke(Palette.purple.opacity(0.09),lineWidth:1))}.accessibilityLabel(route.0).accessibilityHint(route.1)
            }}
            HomeLocationCard(model:universe.liveLocation)
        }.padding(.horizontal,16).sheet(isPresented:$filmCamera){FilmView()}.sheet(isPresented:$timeVault){TimeVaultWebView()}.sheet(isPresented:$musicSearch){MusicSearchView(forMoment:true)}
    }
    private var heartCard:some View {
        VStack(alignment:.center,spacing:10){
            Button{Touch.tap();openHistory()}label:{
                VStack(alignment:.center,spacing:4){
                    TimelineView(.periodic(from:.now,by:30)){context in
                        let today=universe.sharedHeartStreak(at:context.date).today
                        let shared=universe.sharedHeartStreak(at:context.date)
                        HStack(spacing:8){
                            Text("You \(universe.heartDays[today]?[from] ?? 0)  ♡  \(universe.partner) \(universe.heartDays[today]?[other] ?? 0)")
                                .font(.system(size:12.5,weight:.medium)).foregroundColor(Palette.ink)
                                .accessibilityLabel("Today · you \(universe.heartDays[today]?[from] ?? 0)  ♡  \(universe.partner) \(universe.heartDays[today]?[other] ?? 0)")
                            Text("·").foregroundColor(Palette.muted.opacity(0.5))
                            Text("✦ \(shared.days) days · \(shared.lives) \(shared.lives==1 ? "life":"lives")")
                                .font(.system(size:12,weight:.semibold)).foregroundColor(Palette.purple)
                        }
                        .lineLimit(1).minimumScaleFactor(0.82)
                    }
                    Text(milestoneHint).font(.system(size:10.5)).foregroundColor(Palette.muted)
                }
                .frame(maxWidth:.infinity,minHeight:36,alignment:.center)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Our heart history")
            .accessibilityValue("Today · you \(universe.heartDays[HeartLedger.day()]?[from] ?? 0)  ♡  \(universe.partner) \(universe.heartDays[HeartLedger.day()]?[other] ?? 0). Heart streak, \(universe.sharedHeartStreak().days) days, \(universe.sharedHeartStreak().lives) lives")
            .accessibilityHint("Tap to see our daily hearts")

            HeartSendButton()
                .padding(.horizontal,4)

            if let partnerVibe=universe.heartVibes[other] {
                Text("\(partnerVibe.symbol) \(universe.partner): \(partnerVibe.label)")
                    .font(.system(size:11,weight:.semibold)).foregroundColor(Palette.purple)
                    .padding(.horizontal,10).padding(.vertical,4)
                    .background(Color.white.opacity(0.7),in:Capsule())
            }
        }
        .padding(.horizontal,14).padding(.vertical,13)
        .background(Palette.lavender,in:RoundedRectangle(cornerRadius:22,style:.continuous))
        .overlay(RoundedRectangle(cornerRadius:22,style:.continuous).stroke(Palette.purple.opacity(0.10),lineWidth:1))
    }
    private var vibeRow:some View {
        ScrollView(.horizontal,showsIndicators:false){
            HStack(spacing:6){
                ForEach(Self.vibes,id:\.0){v in
                    Button{Touch.tap(true);do{try universe.sendHeart(vibe:v.0)}catch{universe.error=error.localizedDescription}}label:{
                        Text("\(v.1) \(v.2)").font(.system(size:11,weight:.medium)).padding(.horizontal,10).padding(.vertical,6).background(.white,in:Capsule()).overlay(Capsule().stroke(Palette.purple.opacity(0.14),lineWidth:1)).foregroundColor(Palette.ink)
                    }
                }
            }
        }
    }
    private var pinnedJarCard:some View {
        Button{Touch.tap();openJar()}label:{
            VStack(alignment:.leading,spacing:5){
                HStack{Text("PINNED IN OUR LOVE JAR").font(.system(size:10,weight:.bold)).tracking(1.6).foregroundColor(Palette.purple);Spacer();Text("Write ♡").font(.system(size:11,weight:.semibold)).foregroundColor(Palette.purple)}
                if let note=universe.pinnedNote {
                    Text("“\(note.text ?? note.preview)”").font(.system(size:14,weight:.medium)).foregroundColor(Palette.ink).multilineTextAlignment(.leading).lineLimit(3)
                    Text("From \(Post.name(note.from)) · \(note.day)").font(.system(size:11)).foregroundColor(Palette.muted)
                } else {
                    Text("Drop a warm note in our Love Jar and pin it right here on Home. ♡").font(.system(size:13)).foregroundColor(Palette.muted).multilineTextAlignment(.leading)
                }
            }.frame(maxWidth:.infinity,alignment:.leading).padding(14).background(.white,in:RoundedRectangle(cornerRadius:18)).overlay(RoundedRectangle(cornerRadius:18).stroke(Palette.lavender,lineWidth:1))
        }.buttonStyle(.plain)
    }
    private var dailyPromptCard:some View {
        let prompt=universe.dailyPrompt
        let myAns=prompt?.answers[universe.actor]
        let otherActor=universe.actor=="asnat" ? "youssef":"asnat"
        let otherAns=prompt?.answers[otherActor]
        return VStack(alignment:.leading,spacing:8){
            Text("TODAY’S QUESTION").font(.system(size:10,weight:.bold)).tracking(1.6).foregroundColor(Palette.purple)
            Text(prompt?.prompt ?? "What small moment made you smile today?").font(.system(size:15,weight:.semibold)).foregroundColor(Palette.ink)
            if prompt?.revealed == true {
                VStack(alignment:.leading,spacing:5){
                    Text("Asnat: \(prompt?.answers["asnat"]?.text ?? "")").font(.system(size:13))
                    Text("Youssef: \(prompt?.answers["youssef"]?.text ?? "")").font(.system(size:13))
                }.padding(10).frame(maxWidth:.infinity,alignment:.leading).background(Palette.background,in:RoundedRectangle(cornerRadius:12))
                Button(promptSavedNote.isEmpty ? "Save both answers to Quotes ♡" : promptSavedNote){
                    guard let p=prompt,promptSavedNote.isEmpty else{return}
                    let txt="Q: \(p.prompt)\nAsnat: \(p.answers["asnat"]?.text ?? "")\nYoussef: \(p.answers["youssef"]?.text ?? "")"
                    do{try universe.enqueue("/api/memories",["action":"addQuote","date":HeartLedger.day(),"author":universe.actor,"text":txt,"note":"Today’s Question"])
                        promptSavedNote="Saved to Quotes ♡";Touch.tap(true)
                    }catch{universe.error=error.localizedDescription}
                }.font(.system(size:12,weight:.semibold)).foregroundColor(Palette.purple)
            } else if myAns?.answered == true {
                Text("You answered: “\(myAns?.text ?? "")”").font(.system(size:13)).foregroundColor(Palette.ink)
                Text(otherAns?.answered == true ? "Revealing soon…" : "Waiting for \(universe.partner) to unlock both answers ♡").font(.system(size:11)).foregroundColor(Palette.muted)
            } else {
                HStack(spacing:8){
                    TextField("Your quick answer…",text:$promptDraft).textFieldStyle(.roundedBorder).font(.system(size:13))
                    Button("Send"){
                        do{try universe.answerPrompt(promptDraft);promptDraft="";Touch.tap(true)}catch{universe.error=error.localizedDescription}
                    }.font(.system(size:13,weight:.semibold)).padding(.horizontal,14).padding(.vertical,8).background(Palette.purple,in:Capsule()).foregroundColor(.white).disabled(promptDraft.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                }
                if otherAns?.answered == true {
                    Text("\(universe.partner) already answered · reply to reveal! ✦").font(.system(size:11,weight:.semibold)).foregroundColor(Palette.purple)
                }
            }
        }.frame(maxWidth:.infinity,alignment:.leading).padding(14).background(.white,in:RoundedRectangle(cornerRadius:18)).overlay(RoundedRectangle(cornerRadius:18).stroke(Palette.lavender,lineWidth:1))
    }
    private var momentSongCard:some View {
        HStack(spacing:12){
            if let song=universe.momentSong {
                CachedPhoto(source:song.artworkUrl ?? "",living:false).frame(width:52,height:52).clipShape(RoundedRectangle(cornerRadius:12))
                VStack(alignment:.leading,spacing:2){
                    Text("SONG OF THE MOMENT").font(.system(size:9,weight:.bold)).tracking(1.5).foregroundColor(Palette.purple)
                    Text(song.title).font(.system(size:14,weight:.semibold)).lineLimit(1)
                    Text(song.artist + (song.note?.isEmpty == false ? " · \(song.note!)":"")).font(.system(size:11)).foregroundColor(Palette.muted).lineLimit(1)
                }
            } else {
                Image(systemName:"music.note").font(.title3).foregroundColor(Palette.purple).frame(width:44,height:44).background(Palette.lavender,in:RoundedRectangle(cornerRadius:12))
                VStack(alignment:.leading,spacing:2){
                    Text("SONG OF THE MOMENT").font(.system(size:9,weight:.bold)).tracking(1.5).foregroundColor(Palette.purple)
                    Text("Pick the track on repeat right now").font(.system(size:13)).foregroundColor(Palette.muted)
                }
            }
            Spacer()
            Button(universe.momentSong == nil ? "Pick" : "Swap"){musicSearch=true;Touch.tap()}.font(.system(size:12,weight:.semibold)).padding(.horizontal,12).padding(.vertical,7).background(Palette.lavender,in:Capsule()).foregroundColor(Palette.purple)
        }.padding(12).background(.white,in:RoundedRectangle(cornerRadius:18)).overlay(RoundedRectangle(cornerRadius:18).stroke(Palette.lavender,lineWidth:1))
    }
    private var throwbackCard:some View {
        VStack(alignment:.leading,spacing:4){
            Text(universe.throwbackLabel.uppercased()).font(.system(size:10,weight:.bold)).tracking(1.6).foregroundColor(Palette.purple)
            Text("“\(universe.throwbackText)”").font(.system(size:13)).foregroundColor(Palette.ink).lineLimit(3)
        }.frame(maxWidth:.infinity,alignment:.leading).padding(14).background(Palette.blue,in:RoundedRectangle(cornerRadius:18))
    }
    private var sinceCard:some View {
        Button{Touch.tap();open(BookRoute(personal:true,chapter:0))}label:{
            Group{
                if let since=universe.keepsakes["since"] as? [String:Any],let start=BookDates.instant(since["startedAt"] as? String ?? "") {
                    TimelineView(.periodic(from:.now,by:1)){context in
                        let elapsed=max(0,Int(context.date.timeIntervalSince(start)))
                        let days=elapsed/86400
                        let m=togetherMilestone(days:days)
                        HStack(alignment:.center,spacing:10){
                            VStack(alignment:.leading,spacing:3){
                                Text("Together ♡").font(.system(size:11.5,weight:.semibold)).foregroundColor(Palette.purple)
                                Text("\(days) days · "+String(format:"%02d:%02d:%02d",elapsed/3600%24,elapsed/60%60,elapsed%60))
                                    .font(.system(size:18,weight:.bold)).monospacedDigit().foregroundColor(Palette.ink)
                                    .lineLimit(1).minimumScaleFactor(0.85)
                                Text("Since "+BookDates.shortDisplay(start)+" · ET")
                                    .font(.system(size:10)).foregroundColor(Palette.muted)
                                    .lineLimit(1).minimumScaleFactor(0.8)
                            }
                            Spacer(minLength:6)
                            HStack(spacing:10){
                                ZStack{
                                    Circle().stroke(Palette.purple.opacity(0.16),lineWidth:4.2)
                                    Circle().trim(from:0,to:m.progress)
                                        .stroke(Palette.violet,style:StrokeStyle(lineWidth:4.2,lineCap:.round))
                                        .rotationEffect(.degrees(-90))
                                    Text(m.label).font(.system(size:11,weight:.bold)).foregroundColor(Palette.ink)
                                }.frame(width:46,height:46)
                                VStack(alignment:.leading,spacing:2){
                                    Text("Next milestone").font(.system(size:9.5,weight:.semibold)).foregroundColor(Palette.muted).lineLimit(1)
                                    Text("in \(m.remaining) \(m.remaining==1 ? "day":"days")").font(.system(size:12.5,weight:.bold)).foregroundColor(Palette.violet).lineLimit(1)
                                }
                            }
                            .frame(minWidth:170,alignment:.center)
                            .padding(.horizontal,14).padding(.vertical,9)
                            .background(Color.white.opacity(0.82),in:RoundedRectangle(cornerRadius:16,style:.continuous))
                            .overlay(RoundedRectangle(cornerRadius:16,style:.continuous).stroke(Palette.purple.opacity(0.10),lineWidth:1))
                        }
                    }
                } else {
                    Text("Set our beginning in Since us.").foregroundColor(Palette.muted)
                }
            }
            .frame(maxWidth:.infinity,minHeight:58,alignment:.leading)
            .padding(.horizontal,14).padding(.vertical,11)
            .background(Palette.blue,in:RoundedRectangle(cornerRadius:20,style:.continuous))
            .overlay(RoundedRectangle(cornerRadius:20,style:.continuous).stroke(Palette.purple.opacity(0.08),lineWidth:1))
        }.accessibilityLabel("Our time together. Open Since us")
    }
}
struct HeartHistoryView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    private var last7Days:[(day:String,me:Int,her:Int)] {
        var result:[(String,Int,Int)]=[]
        var cursor=HeartLedger.day()
        for _ in 0..<7 {
            let row=universe.heartDays[cursor]
            result.append((cursor,row?["me"] ?? 0,row?["asechka"] ?? 0))
            cursor=HeartLedger.previous(cursor)
        }
        return result.reversed()
    }
    var body:some View {NavigationStack{List{
        Section("Weekly heart recap"){
            let days=last7Days
            let maxCount=max(1,days.map{$0.me+$0.her}.max() ?? 1)
            let weekTotal=days.reduce(0){$0+$1.me+$1.her}
            Text("Last 7 days · \(weekTotal.formatted()) hearts together ♡").font(.subheadline.weight(.semibold)).foregroundColor(Palette.purple)
            HStack(alignment:.bottom,spacing:8){
                ForEach(days,id:\.day){d in
                    let sum=d.me+d.her
                    VStack(spacing:4){
                        Text(sum>0 ? "\(sum)":"").font(.system(size:9)).foregroundColor(Palette.muted)
                        RoundedRectangle(cornerRadius:5).fill(sum>0 ? Palette.purple:Palette.lavender).frame(height:max(6,CGFloat(sum)/CGFloat(maxCount)*64))
                        Text(String(d.day.suffix(2))).font(.system(size:10)).foregroundColor(Palette.muted)
                    }.frame(maxWidth:.infinity)
                }
            }.padding(.vertical,6)
        }
        Section{Text("Every heart counts. Days follow Eastern time.").font(.subheadline).foregroundColor(Palette.muted)
            let total=universe.heartDays.values.reduce((me:0,her:0)){($0.me+($1["me"] ?? 0),$0.her+($1["asechka"] ?? 0))}
            Text("All time · Youssef \(total.me.formatted()) ♡  ·  Asnat \(total.her.formatted()) ♡").font(.subheadline)
            let shared=universe.sharedHeartStreak()
            Text("Our shared streak · \(shared.days) days · \(shared.lives) \(shared.lives==1 ? "life":"lives")").foregroundColor(Palette.purple)
            Text("One heart from either of us keeps our day. A missed day uses a life; without one, we start again. Unused lives stack.").font(.subheadline).foregroundColor(Palette.muted)
            Text("Next life · \(shared.nextLifeOn) · one more every month on the 12th").font(.subheadline)
            ForEach(shared.protectedDays,id:\.self){day in Text("\(day) · protected with a life ♡").font(.subheadline).foregroundColor(Palette.purple)}
        }
        Section("Our days of little hearts"){
            if universe.heartDays.isEmpty{Text("Your first heart starts our story here.").foregroundColor(Palette.muted)}
            ForEach(universe.heartDays.keys.sorted(by:>),id:\.self){day in VStack(alignment:.leading,spacing:9){Text(BookDates.day(day).map{BookDates.display($0)} ?? day).font(.headline);HStack{Text("Youssef  \(universe.heartDays[day]?["me"] ?? 0) ♡");Spacer();Text("Asnat  \(universe.heartDays[day]?["asechka"] ?? 0) ♡")}.font(.subheadline).foregroundColor(Palette.purple)}.padding(.vertical,7)}
        }
    }.scrollContentBackground(.hidden).background(Palette.background).navigationTitle("Our heart history").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}}
}
