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
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.accessibilityReduceMotion) private var reduced
    @AppStorage("motion-paused") private var paused=false
    @Environment(\.dynamicTypeSize) private var textSize
    var open:(BookRoute)->Void
    var openHistory:()->Void
    private var from:String{universe.actor=="asnat" ? "asechka":"me"}
    private var other:String{from=="me" ? "asechka":"me"}
    private var routes:[(String,String,String,Bool,Int)]{[
        ("Secret vocab","Our inside-joke dictionary","text.book.closed",false,2),
        ("Open when…","A letter for every feeling","envelope",true,1),
        ("Tiny victories","Celebrate the small wins","sparkles",false,0),
        ("Recipes for two","What shall we cook?","fork.knife",false,1),
        ("Little things","Things we love about us","heart",true,2),
        ("Our beginning","Since that little yes","infinity",true,0)]}
    var body:some View {
        VStack(alignment:.leading,spacing:8){
            heartCard
            sinceCard
            LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:7),count:textSize.isAccessibilitySize ? 2:3),spacing:7){ForEach(routes.indices,id:\.self){index in
                let route=routes[index]
                Button{Touch.tap();open(BookRoute(personal:route.3,chapter:route.4))}label:{Label(route.0,systemImage:route.2).font(.system(size:12,weight:.medium)).foregroundColor(Palette.purple).multilineTextAlignment(.center).frame(maxWidth:.infinity,minHeight:48).padding(.horizontal,5).background(.white,in:RoundedRectangle(cornerRadius:16,style:.continuous)).overlay(RoundedRectangle(cornerRadius:16,style:.continuous).stroke(Palette.purple.opacity(0.09),lineWidth:1))}.accessibilityLabel(route.0).accessibilityHint(route.1)
            }}
        }.padding(.horizontal,16)
    }
    private var heartCard:some View {
        HStack(spacing:12){
            Button{Touch.tap();openHistory()}label:{VStack(alignment:.leading,spacing:3){
                TimelineView(.periodic(from:.now,by:30)){context in let today=HeartLedger.day(context.date)
                    Text("You \(universe.heartDays[today]?[from] ?? 0)  ♡  \(universe.partner) \(universe.heartDays[today]?[other] ?? 0)").font(.system(size:12)).foregroundColor(Palette.muted).accessibilityLabel("Today · you \(universe.heartDays[today]?[from] ?? 0)  ♡  \(universe.partner) \(universe.heartDays[today]?[other] ?? 0)")
                }
                TimelineView(.periodic(from:.now,by:30)){context in let streak=HeartLedger.streak(universe.heartDays,who:from,today:HeartLedger.day(context.date))
                    Text("✦ \(streak) \(streak==1 ? "day":"days")").font(.system(size:12,weight:.semibold)).foregroundColor(Palette.purple)
                }
            }.frame(maxWidth:.infinity,minHeight:48,alignment:.leading).contentShape(Rectangle())}
                .buttonStyle(.plain)
                .accessibilityLabel("Our heart history")
                .accessibilityValue("Today · you \(universe.heartDays[HeartLedger.day()]?[from] ?? 0)  ♡  \(universe.partner) \(universe.heartDays[HeartLedger.day()]?[other] ?? 0). Heart streak, \(HeartLedger.streak(universe.heartDays,who:from)) days")
                .accessibilityHint("Tap to see our daily hearts")
            HeartSendButton()
        }.padding(.horizontal,12).padding(.vertical,8).background(Palette.lavender,in:RoundedRectangle(cornerRadius:22,style:.continuous))
    }
    private var sinceCard:some View {
        Button{Touch.tap();open(BookRoute(personal:true,chapter:0))}label:{
            VStack(alignment:.leading,spacing:3){
                if let since=universe.keepsakes["since"] as? [String:Any],let start=BookDates.instant(since["startedAt"] as? String ?? "") {
                    TimelineView(.periodic(from:.now,by:1)){context in let elapsed=max(0,Int(context.date.timeIntervalSince(start)))
                        HStack(spacing:8){Text("Together ♡").font(.system(size:12)).foregroundColor(Palette.purple);Text("\(elapsed/86400) days · "+String(format:"%02d:%02d:%02d",elapsed/3600%24,elapsed/60%60,elapsed%60)).font(.system(size:18,weight:.semibold)).monospacedDigit().foregroundColor(Palette.ink)}
                    }
                    Text("Since "+BookDates.display(start,time:true)+" · Eastern").font(.system(size:10)).foregroundColor(Palette.muted)
                }else {Text("Set our beginning in Since us.").foregroundColor(Palette.muted)}
            }.frame(maxWidth:.infinity,minHeight:44,alignment:.leading).padding(.horizontal,12).padding(.vertical,7).background(Palette.blue,in:RoundedRectangle(cornerRadius:20,style:.continuous))
        }.accessibilityLabel("Our time together. Open Since us")
    }
}
struct HeartHistoryView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    var body:some View {NavigationStack{List{
        Section{Text("Every heart counts. Days follow Eastern time.").font(.subheadline).foregroundColor(Palette.muted)
            let total=universe.heartDays.values.reduce((me:0,her:0)){($0.me+($1["me"] ?? 0),$0.her+($1["asechka"] ?? 0))}
            Text("All time · Youssef \(total.me) ♡  ·  Asnat \(total.her) ♡").font(.subheadline)
            Text("Together streak · \(HeartLedger.streak(universe.heartDays,who:"both")) days").foregroundColor(Palette.purple)
        }
        Section("Our days of little hearts"){
            if universe.heartDays.isEmpty{Text("Your first heart starts our story here.").foregroundColor(Palette.muted)}
            ForEach(universe.heartDays.keys.sorted(by:>),id:\.self){day in VStack(alignment:.leading,spacing:9){Text(BookDates.day(day).map{BookDates.display($0)} ?? day).font(.headline);HStack{Text("Youssef  \(universe.heartDays[day]?["me"] ?? 0) ♡");Spacer();Text("Asnat  \(universe.heartDays[day]?["asechka"] ?? 0) ♡")}.font(.subheadline).foregroundColor(Palette.purple)}.padding(.vertical,7)}
        }
    }.scrollContentBackground(.hidden).background(Palette.background).navigationTitle("Our heart history").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}}
}
