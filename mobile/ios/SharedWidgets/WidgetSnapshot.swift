import Foundation
import WidgetKit

struct WidgetSnapshot:Codable {
    static let group="group.app.asechka.shared"
    var actor="asnat"
    var quotes:[String]=[]
    var asnat=0;var youssef=0;var todayAsnat=0;var todayYoussef=0
    var lastAsnat="";var lastYoussef=""
    var days=0;var lives=0;var todayComplete=false
    var ledger:[String:[String:Int]]=[:]
    var policyStarted="2026-10-12";var policySeed="2026-10-25";var seedDays=13
    var since:Double=0;var saved:Double=0;var day=""
    static func load()->Self {
        guard let url=FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:group)?.appendingPathComponent("widgets.json"),let data=try? Data(contentsOf:url),let value=try? JSONDecoder().decode(Self.self,from:data)else{return Self()};return value
    }
    static func time(_ value:String)->String {
        let iso=ISO8601DateFormatter();iso.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        guard let date=iso.date(from:value) ?? ISO8601DateFormatter().date(from:value)else{return "No hearts yet"}
        return stamp(date)
    }
    static func stamp(_ date:Date)->String {let f=DateFormatter();f.locale=Locale(identifier:"en_US");f.timeZone=TimeZone(identifier:"America/New_York");f.dateFormat="MMM d · h:mm a";return f.string(from:date)+" ET"}
    static func number(_ value:Int)->String{let f=NumberFormatter();f.locale=Locale(identifier:"en_US");f.numberStyle = .decimal;return f.string(from:NSNumber(value:value)) ?? String(value)}
}
