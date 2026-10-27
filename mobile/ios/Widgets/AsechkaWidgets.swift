import SwiftUI
import WidgetKit

struct UniverseEntry:TimelineEntry {let date:Date;let value:WidgetSnapshot}
struct UniverseProvider:TimelineProvider {
    func placeholder(in context:Context)->UniverseEntry{var v=WidgetSnapshot();v.quotes=["A little life, a lot of love."];return UniverseEntry(date:Date(),value:v)}
    func getSnapshot(in context:Context,completion:@escaping(UniverseEntry)->Void){completion(UniverseEntry(date:Date(),value:WidgetSnapshot.load()))}
    func getTimeline(in context:Context,completion:@escaping(Timeline<UniverseEntry>)->Void){let now=Date(),snapshot=WidgetSnapshot.load();let entries=(0..<8).map{UniverseEntry(date:now.addingTimeInterval(Double($0)*3600),value:snapshot)};completion(Timeline(entries:entries,policy:.after(now.addingTimeInterval(6*3600))))}
}
struct UniverseWidgetView:View {
    @Environment(\.widgetFamily) private var family
    let entry:UniverseEntry;let kind:Int
    private let purple=Color(red:107/255,green:92/255,blue:181/255),ink=Color(red:38/255,green:52/255,blue:81/255)
    private let titles=["Words to keep","Your little hearts","Hearts, from us both","A little love today","Our time together","Our shared streak"]
    private var value:WidgetSnapshot{
        var v=entry.value;v.day=SharedHeartStreak.day(entry.date);v.todayAsnat=v.ledger[v.day]?["asechka"] ?? 0;v.todayYoussef=v.ledger[v.day]?["me"] ?? 0
        let s=SharedHeartStreak.calculate(v.ledger,policy:["startedOn":v.policyStarted,"seededThrough":v.policySeed,"seedDays":v.seedDays],today:v.day);v.days=s.days;v.lives=s.lives;v.todayComplete=s.todayComplete;return v
    }
    private var main:String {
        let n=WidgetSnapshot.number
        if value.saved==0{return kind==0 ? "A little life, a lot of love.":"Open Asechka ♡"}
        switch kind {
        case 0:let quotes=value.quotes;return quotes.isEmpty ? "A little life, a lot of love.":"“"+quotes[Int(entry.date.timeIntervalSince1970/21600)%quotes.count]+"”"
        case 1:return n(value.actor=="asnat" ? value.asnat:value.youssef)+" ♡"
        case 2:return "Asnat  \(n(value.asnat)) ♡\nYoussef  \(n(value.youssef)) ♡"
        case 3:return "Asnat  \(n(value.todayAsnat)) ♡\nYoussef  \(n(value.todayYoussef)) ♡"
        case 4:return value.since>0 ? "\(n(max(0,Int((entry.date.timeIntervalSince1970-value.since)/86400)))) days ♡":"Our beginning, kept close"
        default:return n(value.days)+" days ✦"
        }
    }
    private var detail:String {
        guard value.saved>0 else{return "Open the app to connect this widget"}
        switch kind{case 0:return "A different little thought every six hours";case 1:return (value.actor=="asnat" ? "Asnat":"Youssef")+" · all hearts sent";case 2:return "Asnat · "+WidgetSnapshot.time(value.lastAsnat);case 3:return value.day+" · Eastern time";case 4:return value.since>0 ? "Since "+WidgetSnapshot.stamp(Date(timeIntervalSince1970:value.since)):"Set our beginning in the app";default:return "\(value.lives) saved \(value.lives==1 ? "life":"lives")"}
    }
    private var extra:String {
        guard value.saved>0 else{return "Shared widgets need App Group support"}
        switch kind{case 1:return "Last · "+WidgetSnapshot.time(value.actor=="asnat" ? value.lastAsnat:value.lastYoussef);case 2:return "Youssef · "+WidgetSnapshot.time(value.lastYoussef);case 3:return "Every little tap counts";case 4:return "A little more us, every second";case 5:return value.todayComplete ? "Today is covered ♡":"Send a heart to cover today";default:return ""}
    }
    var body:some View {
        VStack(alignment:.leading,spacing:family == .systemSmall ? 7:10){
            HStack{Text(titles[kind]).font(.system(size:11,weight:.semibold));Spacer();Image(["quote-words","send-love","send-love","send-love","our-time","shared-streak"][kind]).resizable().scaledToFit().frame(width:28,height:28)}.foregroundColor(purple)
            Spacer(minLength:0)
            Text(main).font(.system(size:kind==0 ? family == .systemSmall ? 17:22:kind==2 || kind==3 ? 21:29,weight:kind==0 ? .medium:.bold,design:.rounded)).foregroundColor(ink).lineLimit(kind==0 ? family == .systemSmall ? 4:7:3).minimumScaleFactor(0.65).fixedSize(horizontal:false,vertical:false)
            if kind==4,value.since>0{Text(Date(timeIntervalSince1970:value.since),style:.timer).font(.system(size:19,weight:.semibold,design:.rounded)).monospacedDigit().foregroundColor(purple)}
            Text(detail).font(.system(size:11)).foregroundColor(ink.opacity(0.75)).lineLimit(2).minimumScaleFactor(0.7)
            if !extra.isEmpty{Text(extra).font(.system(size:10)).foregroundColor(purple).lineLimit(2).minimumScaleFactor(0.7)}
            Spacer(minLength:0)
            Text(value.saved>0 ? "Saved · "+WidgetSnapshot.stamp(Date(timeIntervalSince1970:value.saved)):"asechka. · tap to open").font(.system(size:9)).foregroundColor(ink.opacity(0.55)).lineLimit(1).minimumScaleFactor(0.65)
        }.padding(16).frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading).background{Image("widget-orbit").resizable().scaledToFill().clipped()}.widgetURL(URL(string:"asechka://home"))
    }
}
struct UniverseWidget:Widget {
    let kind:Int
    init(){kind=0}
    init(kind:Int){self.kind=kind}
    private let names=["Words to keep","Your little hearts","Hearts, from us both","A little love today","Our time together","Our shared streak"]
    var body:some WidgetConfiguration {StaticConfiguration(kind:"asechka.widget.\(kind)",provider:UniverseProvider()){entry in
        if #available(iOS 17.0,*){UniverseWidgetView(entry:entry,kind:kind).containerBackground(for:.widget){Color(red:238/255,green:235/255,blue:248/255)}}else{UniverseWidgetView(entry:entry,kind:kind)}
    }.configurationDisplayName(names[kind]).description("A little piece of us, kept close. Tap to open Asechka.").supportedFamilies([.systemSmall,.systemMedium,.systemLarge])}
}
#if WIDGET_EXTENSION
@main struct AsechkaWidgetBundle:WidgetBundle {var body:some Widget{UniverseWidget(kind:0);UniverseWidget(kind:1);UniverseWidget(kind:2);UniverseWidget(kind:3);UniverseWidget(kind:4);UniverseWidget(kind:5)}}

#endif
