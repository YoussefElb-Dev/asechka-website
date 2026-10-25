import Foundation

/// Same calendar policy as the website. Lives are derived from saved dates, never spent per device.
struct SharedHeartStreak {
    var days=0, lives=0, livesEarned=0, livesUsed=0
    var todayComplete=false
    var today="", nextLifeOn="", lastResetOn:String?
    var protectedDays:[String]=[]
    private static var calendar:Calendar {var c=Calendar(identifier:.gregorian);c.timeZone=TimeZone(secondsFromGMT:0)!;return c}
    private static func date(_ day:String)->Date {BookDates.instant(day+"T12:00:00Z")!}
    private static func iso(_ date:Date)->String {
        let c=calendar.dateComponents([.year,.month,.day],from:date)
        return String(format:"%04d-%02d-%02d",c.year!,c.month!,c.day!)
    }
    private static func anniversary(_ start:String,_ day:String,_ offset:Int=0)->String {
        var parts=calendar.dateComponents([.year,.month],from:date(day));parts.day=1;parts.hour=12
        let month=calendar.date(byAdding:.month,value:offset,to:calendar.date(from:parts)!)!
        let number=min(Int(start.suffix(2))!,calendar.range(of:.day,in:.month,for:month)!.count)
        return iso(calendar.date(byAdding:.day,value:number-1,to:month)!)
    }
    private static func earned(_ start:String,_ day:String)->Int {
        guard day>=start else{return 0}
        let a=calendar.dateComponents([.year,.month],from:date(start)),b=calendar.dateComponents([.year,.month],from:date(day))
        return max(0,1+(b.year!-a.year!)*12+b.month!-a.month!-(day<anniversary(start,day) ? 1:0))
    }
    static func calculate(_ heartDays:[String:[String:Int]],policy:[String:Any]=[:],today:String=HeartLedger.day())->SharedHeartStreak {
        let start=policy["startedOn"] as? String ?? "2026-10-12",seed=policy["seededThrough"] as? String ?? "2026-10-25"
        var r=SharedHeartStreak();r.today=today;r.days=policy["seedDays"] as? Int ?? 13;r.lives=earned(start,seed)
        func sent(_ day:String)->Bool {(heartDays[day]?["me"] ?? 0)>0 || (heartDays[day]?["asechka"] ?? 0)>0}
        if today<=seed {
            r.days=max(0,r.days-Int(date(seed).timeIntervalSince(date(today))/86400));r.lives=earned(start,today)
        }else {
            var grants=r.lives,cursor=date(seed).addingTimeInterval(86400)
            while iso(cursor)<today {
                let day=iso(cursor),available=earned(start,day);r.lives+=available-grants;grants=available
                if sent(day){r.days=r.days>0 ? r.days+1:1}
                else if r.days>0 && r.lives>0 {r.lives-=1;r.livesUsed+=1;r.days+=1;r.protectedDays.append(day)}
                else if r.days>0 {r.days=0;r.lastResetOn=day}
                cursor=cursor.addingTimeInterval(86400)
            }
            r.lives+=earned(start,today)-grants
            if sent(today){r.days=r.days>0 ? r.days+1:1}
        }
        r.livesEarned=earned(start,today);r.nextLifeOn=anniversary(start,today,today<anniversary(start,today) ? 0:1)
        r.todayComplete=today<=seed || sent(today)
        return r
    }
}
