import Foundation

/// Content shared by the real extension and the in-app gallery.
struct WidgetPresentation {
    static let titles = ["Words to keep", "Your little hearts", "Hearts, from us both", "A little love today", "Our time together", "Our shared streak"]
    let kind: Int
    let date: Date
    let snapshot: WidgetSnapshot

    var value: WidgetSnapshot {
        var v = snapshot
        v.day = SharedHeartStreak.day(date)
        v.todayAsnat = v.ledger[v.day]?["asechka"] ?? 0
        v.todayYoussef = v.ledger[v.day]?["me"] ?? 0
        let streak = SharedHeartStreak.calculate(v.ledger, policy: ["startedOn": v.policyStarted, "seededThrough": v.policySeed, "seedDays": v.seedDays], today: v.day)
        v.days = streak.days; v.lives = streak.lives; v.todayComplete = streak.todayComplete
        return v
    }
    var title: String { Self.titles[kind] }
    var connected: Bool { snapshot.saved > 0 }
    var quote: String {
        let quotes = snapshot.quotes.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !quotes.isEmpty else { return "A little life, a lot of love." }
        return quotes[Int(date.timeIntervalSince1970 / 21600) % quotes.count]
    }
    var elapsedDays: Int { max(0, Int((date.timeIntervalSince1970 - value.since) / 86400)) }
    var clockStart: Date { Date(timeIntervalSince1970: value.since) }
    var leftLabel: String {
        switch kind {
        case 1: return value.actor == "asnat" ? "Asnat" : "Youssef"
        case 2, 3: return "Asnat"
        case 4: return "Together"
        default: return "Our streak"
        }
    }
    var leftValue: String {
        let n = WidgetSnapshot.number
        switch kind {
        case 1: return n(value.actor == "asnat" ? value.asnat : value.youssef) + " ♡"
        case 2: return n(value.asnat) + " ♡"
        case 3: return n(value.todayAsnat) + " ♡"
        case 4: return value.since > 0 ? n(elapsedDays) : "—"
        default: return n(value.days)
        }
    }
    var leftNote: String {
        switch kind {
        case 1: return "all hearts sent"
        case 2: return WidgetSnapshot.time(value.lastAsnat)
        case 3: return "hearts today"
        case 4: return "days of us"
        default: return "days together"
        }
    }
    var rightLabel: String {
        switch kind {
        case 1: return "Last sent"
        case 2, 3: return "Youssef"
        case 4: return "And counting"
        default: return "Saved lives"
        }
    }
    var rightValue: String {
        switch kind {
        case 1: return WidgetSnapshot.time(value.actor == "asnat" ? value.lastAsnat : value.lastYoussef)
        case 2: return WidgetSnapshot.number(value.youssef) + " ♡"
        case 3: return WidgetSnapshot.number(value.todayYoussef) + " ♡"
        case 4: return value.since > 0 ? "" : "Set our beginning"
        default: return WidgetSnapshot.number(value.lives) + " ✦"
        }
    }
    var rightNote: String {
        switch kind {
        case 1: return "a little love, kept close"
        case 2: return WidgetSnapshot.time(value.lastYoussef)
        case 3: return "hearts today · ET"
        case 4: return "hours · minutes · seconds"
        default: return value.todayComplete ? "Today is covered ♡" : "Send a heart today"
        }
    }
}
