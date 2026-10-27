import SwiftUI
import WidgetKit

struct UniverseEntry: TimelineEntry { let date: Date; let value: WidgetSnapshot }

struct UniverseProvider: TimelineProvider {
    func placeholder(in context: Context) -> UniverseEntry { UniverseEntry(date: Date(), value: .preview) }
    func getSnapshot(in context: Context, completion: @escaping (UniverseEntry) -> Void) {
        completion(UniverseEntry(date: Date(), value: context.isPreview ? .preview : .load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<UniverseEntry>) -> Void) {
        let now = Date(), snapshot = WidgetSnapshot.load()
        // Explicit day and quote boundaries keep cached counters correct across midnight.
        var dates = (0..<9).map { now.addingTimeInterval(Double($0) * 3600) }
        var eastern = Calendar(identifier: .gregorian)
        eastern.timeZone = TimeZone(identifier: "America/New_York")!
        if let midnight = eastern.date(byAdding: .day, value: 1, to: eastern.startOfDay(for: now)) { dates.append(midnight) }
        dates.append(Date(timeIntervalSince1970: (floor(now.timeIntervalSince1970 / 21600) + 1) * 21600))
        if snapshot.since > 0 {
            let days = max(0, floor((now.timeIntervalSince1970 - snapshot.since) / 86400))
            dates.append(Date(timeIntervalSince1970: snapshot.since + (days + 1) * 86400))
        }
        let entries = Set(dates.filter { $0 >= now && $0 <= now.addingTimeInterval(9 * 3600) }).sorted().map { UniverseEntry(date: $0, value: snapshot) }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(1800))))
    }
}

struct UniverseWidgetView: View {
    let entry: UniverseEntry
    let kind: Int
    private let purple = Color(red: 107/255, green: 92/255, blue: 181/255)
    private let ink = Color(red: 38/255, green: 52/255, blue: 81/255)
    private var content: WidgetPresentation { WidgetPresentation(kind: kind, date: entry.date, snapshot: entry.value) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(content.title).font(.system(size: 11, weight: .semibold))
                Spacer(minLength: 4)
                Image(systemName: kind == 0 ? "quote.opening" : kind == 5 ? "sparkles" : "heart").font(.system(size: 13, weight: .medium))
            }.foregroundColor(purple)
            Group {
                if kind == 0 {
                    HStack(alignment: .center, spacing: 12) {
                        Text("“").font(.system(size: 55, weight: .medium, design: .serif)).foregroundColor(purple.opacity(0.4)).accessibilityHidden(true)
                        Text(content.quote).font(.system(size: 19, weight: .medium, design: .rounded)).lineLimit(3).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else if content.connected {
                    HStack(alignment: .center, spacing: 14) {
                        metric(label: content.leftLabel, value: content.leftValue, note: content.leftNote, timer: false)
                        Capsule().fill(purple.opacity(0.16)).frame(width: 1, height: 52).accessibilityHidden(true)
                        metric(label: content.rightLabel, value: content.rightValue, note: content.rightNote, timer: kind == 4 && content.value.since > 0)
                    }
                } else {
                    HStack(spacing: 12) {
                        Image(systemName: "heart").font(.system(size: 29)).foregroundColor(purple)
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Open Asechka ♡").font(.system(size: 21, weight: .semibold, design: .rounded))
                            Text("Connect our saved moments in the app.").font(.system(size: 11)).foregroundColor(ink.opacity(0.7))
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }.frame(maxHeight: .infinity)
            Text(content.connected ? "Saved · " + WidgetSnapshot.stamp(Date(timeIntervalSince1970: entry.value.saved)) : "asechka. · tap to connect")
                .font(.system(size: 9)).foregroundColor(ink.opacity(0.55)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .foregroundColor(ink).padding(16).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "asechka://home"))
    }

    private func metric(label: String, value: String, note: String, timer: Bool) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.system(size: 11, weight: .medium)).foregroundColor(purple).lineLimit(1)
            Group {
                if timer { Text(content.clockStart, style: .timer).monospacedDigit() }
                else { Text(value) }
            }.font(.system(size: kind == 1 && label == content.rightLabel ? 17 : 26, weight: .bold, design: .rounded))
                .lineLimit(kind == 1 && label == content.rightLabel ? 2 : 1).minimumScaleFactor(0.65)
            Text(note).font(.system(size: 10)).foregroundColor(ink.opacity(0.7)).lineLimit(2).minimumScaleFactor(0.8)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct UniverseWidget: Widget {
    let kind: Int
    init() { kind = 0 }
    init(kind: Int) { self.kind = kind }
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "asechka.widget.\(kind)", provider: UniverseProvider()) { entry in
            if #available(iOS 17.0, *) {
                UniverseWidgetView(entry: entry, kind: kind).containerBackground(for: .widget) { widgetBackground }
            } else {
                UniverseWidgetView(entry: entry, kind: kind).background(widgetBackground)
            }
        }
        .configurationDisplayName(WidgetPresentation.titles[kind])
        .description("Our saved moments, side by side. Tap to open Asechka.")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
    private var widgetBackground: some View {
        LinearGradient(colors: [Color(red: 238/255, green: 235/255, blue: 248/255), Color(red: 234/255, green: 241/255, blue: 252/255)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

#if WIDGET_EXTENSION
struct WordsWidget: Widget { var body: some WidgetConfiguration { UniverseWidget(kind: 0).body } }
struct YourHeartsWidget: Widget { var body: some WidgetConfiguration { UniverseWidget(kind: 1).body } }
struct BothHeartsWidget: Widget { var body: some WidgetConfiguration { UniverseWidget(kind: 2).body } }
struct TodayWidget: Widget { var body: some WidgetConfiguration { UniverseWidget(kind: 3).body } }
struct TogetherWidget: Widget { var body: some WidgetConfiguration { UniverseWidget(kind: 4).body } }
struct StreakWidget: Widget { var body: some WidgetConfiguration { UniverseWidget(kind: 5).body } }
@main struct AsechkaWidgetBundle: WidgetBundle {
    var body: some Widget {
        WordsWidget()
        YourHeartsWidget()
        BothHeartsWidget()
        TodayWidget()
        TogetherWidget()
        StreakWidget()
    }
}
#endif
