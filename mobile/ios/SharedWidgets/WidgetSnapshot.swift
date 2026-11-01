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
    private static let sharedContainer:URL? = {
        var groups=[group]
        // Sideload signers may rename the requested group. Read only this bundle's profile;
        // iOS still decides which containers the signed app/extension may access.
        if let profile=Bundle.main.url(forResource:"embedded",withExtension:"mobileprovision"),let data=try? Data(contentsOf:profile){groups += provisionedGroups(in:data)}
        for name in groups {
            if let url=FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:name),FileManager.default.isWritableFile(atPath:url.path){return url}
        }
        return nil
    }()
    static var storageURL:URL? { sharedContainer?.appendingPathComponent("widgets.json") }
    static func provisionedGroups(in data:Data)->[String] {
        var payload=data
        if let start=data.range(of:Data("<plist".utf8)),let end=data.range(of:Data("</plist>".utf8)),start.lowerBound<end.upperBound {payload=Data(data[start.lowerBound..<end.upperBound])}
        guard let raw=try? PropertyListSerialization.propertyList(from:payload,options:[],format:nil),let profile=raw as? [String:Any],let entitlements=profile["Entitlements"] as? [String:Any],let groups=entitlements["com.apple.security.application-groups"] as? [String]else{return []}
        // Some signers replace the requested identifier with the containing app's
        // bundle identifier (for example group.app.asechka.ios.<team>).
        // Only use Asechka groups actually allowed by this bundle's own profile.
        return Array(Set(groups.filter{$0.hasPrefix("group.") && $0.contains("app.asechka.") && !$0.contains("*")})).sorted()
    }
    static var preview:Self {
        var v=Self();v.quotes=["Every ordinary day feels a little brighter with you."];v.asnat=128;v.youssef=116
        v.lastAsnat="2026-10-27T17:20:00Z";v.lastYoussef="2026-10-27T17:24:00Z"
        v.ledger=[SharedHeartStreak.day(Date()):["asechka":12,"me":8]]
        v.since=Date().addingTimeInterval(-12*86400-3*3600-24*60).timeIntervalSince1970
        v.saved=Date().timeIntervalSince1970;return v
    }
    static func load()->Self {
        guard let url=storageURL,let data=try? Data(contentsOf:url),let value=try? JSONDecoder().decode(Self.self,from:data)else{return Self()};return value
    }
    static func time(_ value:String)->String {
        let iso=ISO8601DateFormatter();iso.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        guard let date=iso.date(from:value) ?? ISO8601DateFormatter().date(from:value)else{return "No hearts yet"}
        return stamp(date)
    }
    static func stamp(_ date:Date)->String {let f=DateFormatter();f.locale=Locale(identifier:"en_US");f.timeZone=TimeZone(identifier:"America/New_York");f.dateFormat="MMM d · h:mm a";return f.string(from:date)+" ET"}
    static func number(_ value:Int)->String{let f=NumberFormatter();f.locale=Locale(identifier:"en_US");f.numberStyle = .decimal;return f.string(from:NSNumber(value:value)) ?? String(value)}
}
