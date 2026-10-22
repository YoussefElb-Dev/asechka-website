import Foundation

struct BookEntry: Identifiable {
    var fields:[String:Any]
    var id:String { string("id") }
    func string(_ key:String)->String { fields[key] as? String ?? "" }
    func flag(_ key:String)->Bool { fields[key] as? Bool ?? false }
}
enum BookProjection {
    static func collection(_ action:String)->String {
        if action.hasSuffix("Victory"){return "victories"}
        if action.hasSuffix("Recipe"){return "recipes"}
        if action.hasSuffix("Joke"){return "jokes"}
        return action.hasSuffix("Letter") ? "letters":"things"
    }
    static func apply(_ body:[String:Any],to data:inout [String:Any],createdAt:String) {
        guard let action=body["action"] as? String,let id=body["id"] as? String,let op=body["operationId"] as? String else{return}
        let key=collection(action)
        var entries=data[key] as? [[String:Any]] ?? []
        let index=entries.firstIndex{$0["id"] as? String==id}
        var item=action=="saveSince" ? data["since"] as? [String:Any] ?? [:] : index.map{entries[$0]} ?? [:]
        if action.hasPrefix("remove"){entries.removeAll{$0["id"] as? String==id};data[key]=entries;return}
        for (field,value) in body where !["action","operationId","expectedRevision","photo","removePhoto"].contains(field){item[field]=value}
        item["revision"]=op;item["pending"]=true
        if action=="saveSince" {data["since"]=item;return}
        if item["createdAt"]==nil{item["createdAt"]=createdAt}
        if action=="saveRecipe" {
            if body["photo"] != nil{item["photoId"]=op}
            else if body["removePhoto"] as? Bool==true || item["photoId"]==nil{item["photoId"]=NSNull()}
        }
        if let index{entries[index]=item}else{entries.append(item)}
        data[key]=entries
    }
}
enum BookDates {
    static let eastern=TimeZone(identifier:"America/New_York")!
    static var calendar:Calendar {var c=Calendar(identifier:.gregorian);c.timeZone=eastern;return c}
    static func instant(_ value:String)->Date? {
        let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        return f.date(from:value) ?? ISO8601DateFormatter().date(from:value)
    }
    static func day(_ value:String)->Date? {
        let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=eastern;f.dateFormat="yyyy-MM-dd";f.isLenient=false
        guard let date=f.date(from:value),f.string(from:date)==value else{return nil};return date
    }
    static func dayString(_ date:Date)->String {let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=eastern;f.dateFormat="yyyy-MM-dd";return f.string(from:date)}
    static func display(_ date:Date,time:Bool=false)->String {let f=DateFormatter();f.locale=Locale(identifier:"en_US");f.timeZone=eastern;f.dateFormat=time ? "MMMM d, yyyy 'at' h:mm a":"MMMM d, yyyy";return f.string(from:date)}
    static func next(_ start:Date,yearly:Bool,now:Date=Date())->Date {
        let component:Calendar.Component=yearly ? .year:.month
        var count=max(1,calendar.dateComponents([component],from:start,to:now).value(for:component) ?? 1)
        var next=calendar.date(byAdding:component,value:count,to:start) ?? now
        if next<=now{count+=1;next=calendar.date(byAdding:component,value:count,to:start) ?? now}
        return next
    }
}
struct BookDraft:Codable {
    var title="";var text="";var note="";var meaning="";var story="";var ingredients="";var steps=""
    var date=BookDates.dayString(Date());var who="us";var tried=false;var me=0;var asechka=0;var photo:Data?;var removePhoto=false
    init(){}
    init(_ item:BookEntry?){self.init();guard let item else{return};title=item.string("title");text=item.string("text");note=item.string("note");meaning=item.string("meaning");story=item.string("story");ingredients=item.string("ingredients");steps=item.string("steps");if !item.string("date").isEmpty{date=item.string("date")};if !item.string("who").isEmpty{who=item.string("who")};tried=item.flag("tried");let ratings=item.fields["ratings"] as? [String:Any];me=ratings?["me"] as? Int ?? 0;asechka=ratings?["asechka"] as? Int ?? 0}
}
extension UniverseStore {
    func restoreBook(_ path:String,_ name:String)->[String:Any] {
        var data:[String:Any]=[:]
        if let bytes=vault.read("snapshot:"+path),let saved=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any]{data=saved}
        else if let url=Bundle.main.url(forResource:name,withExtension:"json",subdirectory:"default"),let bytes=try? Data(contentsOf:url),let saved=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any]{data=saved;data["writable"]=false}
        for change in pending where change.path==path {if let body=(try? JSONSerialization.jsonObject(with:change.body)) as? [String:Any]{BookProjection.apply(body,to:&data,createdAt:change.createdAt)}}
        return data
    }
}
