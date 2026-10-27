import Foundation
import WidgetKit

@MainActor enum WidgetBridge {
    private static var previous:Data?
    private static var lastReload=Date.distantPast
    private static var reload:Task<Void,Never>?
    static func save(_ store:UniverseStore){
        guard store.unlocked,let url=FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:WidgetSnapshot.group)?.appendingPathComponent("widgets.json")else{return}
        var value=WidgetSnapshot();value.actor=store.actor;value.quotes=store.memories.quotes.compactMap(\.text)
        value.asnat=store.heartDays.values.reduce(0){$0+($1["asechka"] ?? 0)};value.youssef=store.heartDays.values.reduce(0){$0+($1["me"] ?? 0)}
        value.day=HeartLedger.day();value.todayAsnat=store.heartDays[value.day]?["asechka"] ?? 0;value.todayYoussef=store.heartDays[value.day]?["me"] ?? 0
        value.ledger=store.heartDays;value.policyStarted=store.heartStreakPolicy["startedOn"] as? String ?? "2026-10-12";value.policySeed=store.heartStreakPolicy["seededThrough"] as? String ?? "2026-10-25";value.seedDays=store.heartStreakPolicy["seedDays"] as? Int ?? 13
        value.lastAsnat=store.hearts["asechka"] ?? "";value.lastYoussef=store.hearts["me"] ?? ""
        let streak=store.sharedHeartStreak();value.days=streak.days;value.lives=streak.lives;value.todayComplete=streak.todayComplete
        value.since=BookDates.instant((store.keepsakes["since"] as? [String:Any])?["startedAt"] as? String ?? "")?.timeIntervalSince1970 ?? 0
        // Reload only for meaningful changes; never spend WidgetKit's budget on every tap.
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys]
        guard let comparison=try? encoder.encode(value),comparison != previous else{return};previous=comparison;value.saved=Date().timeIntervalSince1970
        if let data=try? encoder.encode(value){do{try data.write(to:url,options:.atomic);if Date().timeIntervalSince(lastReload)>=30{lastReload=Date();WidgetCenter.shared.reloadAllTimelines()}else if reload==nil{reload=Task{try? await Task.sleep(nanoseconds:30_000_000_000);lastReload=Date();WidgetCenter.shared.reloadAllTimelines();reload=nil}}}catch{}}
    }
    static func clear(){reload?.cancel();reload=nil;if let url=FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:WidgetSnapshot.group)?.appendingPathComponent("widgets.json"){try? FileManager.default.removeItem(at:url)};previous=nil;WidgetCenter.shared.reloadAllTimelines()}
}
