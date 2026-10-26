import SwiftUI

struct ConnectionView:View {
    @EnvironmentObject private var universe:UniverseStore
    @Environment(\.dismiss) private var dismiss
    @State private var refreshing=false
    var body:some View {
        NavigationStack{List{
            Section{Label(universe.online ? "Connected":"Offline · your saved space is here",systemImage:universe.online ? "wifi":"wifi.slash");Text(universe.message).font(.subheadline).foregroundColor(Palette.muted)}
            Section{
                Button{Touch.tap();refreshing=true;Task{await universe.forceRefresh();refreshing=false}}label:{HStack(spacing:14){Image(systemName:"arrow.clockwise");VStack(alignment:.leading,spacing:5){Text(refreshing ? "Refreshing…":"Refresh now");Text("Get the latest photos, quotes, hearts and shared days.").font(.caption).foregroundColor(Palette.muted)};Spacer();if refreshing{ProgressView()}}.padding(.vertical,7)}.disabled(refreshing)
                Button{Touch.tap();dismiss();universe.requireCode()}label:{Label{VStack(alignment:.leading,spacing:5){Text("Reconnect & retry");Text("Enter our code again and retry saved hearts automatically.").font(.caption).foregroundColor(Palette.muted)}}icon:{Image(systemName:"heart.circle")}.padding(.vertical,7)}
            }
            Section{Text("\(universe.pending.count) saved changes waiting on this phone. Refreshing keeps your drafts and offline content.").font(.subheadline).foregroundColor(Palette.muted)}
        }.navigationTitle("Our connection").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.confirmationAction){Button("Done"){dismiss()}}}}
    }
}
