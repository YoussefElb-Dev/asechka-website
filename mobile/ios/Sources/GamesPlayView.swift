import SwiftUI
import UIKit

private struct GamesCompactKey: EnvironmentKey { static let defaultValue = false }
private struct GamesBoardLimitKey: EnvironmentKey { static let defaultValue: CGFloat = 600 }
extension EnvironmentValues {
    var gamesCompact: Bool { get { self[GamesCompactKey.self] } set { self[GamesCompactKey.self] = newValue } }
    var gamesBoardLimit: CGFloat { get { self[GamesBoardLimitKey.self] } set { self[GamesBoardLimitKey.self] = newValue } }
}

/// A match uses the screen; invitations, rules and reactions live in its menu.
struct GamesPlayView: View {
    @ObservedObject var store: GamesStore
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var details = false
    @State private var preferences = false
    var body: some View {
        GeometryReader { geometry in
            if let room = store.selectedRoom {
                VStack(spacing: 6) {
                    heading(room)
                    if !store.connected || store.error != nil { GamesConnectionBanner(store: store) }
                    if room.kind == .pool {
                        GamesPoolView(store: store, room: room, compact: true)
                    } else {
                        ScrollView {
                            VStack(spacing: 8) {
                                game(room)
                                if room.finished { rematch(room) }
                            }.frame(maxWidth: .infinity)
                        }
                    }
                }.padding(.horizontal, 12).padding(.vertical, 6)
                    .environment(\.gamesCompact, true)
                    .environment(\.gamesBoardLimit, boardLimit(room, geometry.size))
                    .onAppear { orient(room.kind == .pool) }
                    .onChange(of: room.game) { _ in orient(room.kind == .pool) }
                    .task(id: room.game) {
                        // The scene and full-screen presentation can still be activating
                        // during onAppear, especially when restoring a saved match.
                        do { try await Task.sleep(nanoseconds: 500_000_000) } catch { return }
                        orient(room.kind == .pool)
                    }
            }
        }.background(GamesPalette.background.ignoresSafeArea())
            .foregroundColor(GamesPalette.ink).tint(GamesPalette.lilac)
            .sheet(isPresented: $details) { if let room = store.selectedRoom { detailsSheet(room) } }
            .sheet(isPresented: $preferences) { GamesPreferencesView() }
            .onDisappear { orient(false) }
            .onChange(of: scenePhase) { phase in
                if phase == .active { orient(store.selectedRoom?.kind == .pool) }
            }
    }
    private func boardLimit(_ room: GamesRoom, _ size: CGSize) -> CGFloat {
        let reserve: CGFloat = room.kind == .battleship ? 290 : room.kind == .hangman ? 450 : room.kind == .checkers ? 190 : room.kind == .connect4 ? 170 : 105
        return max(120, min(size.width - 24, size.height - reserve))
    }
    private func heading(_ room: GamesRoom) -> some View {
        VStack(spacing: 2) {
            HStack {
                Button { store.activeRoomID = nil } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("All games").accessibilityIdentifier("games.play.back")
                Text(room.kind?.title ?? "Our game").font(.headline).frame(maxWidth: .infinity)
                Button { details = true } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Game details and controls")
            }
            Text(status(room) + " · " + room.scores.map(String.init).joined(separator: " : "))
                .font(.subheadline.bold()).foregroundColor(GamesPalette.theme(room)).accessibilityAddTraits(.updatesFrequently)
        }
    }
    private func status(_ room: GamesRoom) -> String {
        if room.finished { return GamesRoomView.resultText(room) }
        if room.kind == .battleship && room.state["phase"].string == "placement" { return "Arrange your secret fleet" }
        if room.kind == .hangman && room.state["phase"].string == "choose" { return "Choose a secret word" }
        return room.state["turn"].int == room.player(universe.actor) ? "Your move" : "Your partner’s move"
    }
    @ViewBuilder private func game(_ room: GamesRoom) -> some View {
        switch room.kind {
        case .tictactoe: GamesTicTacToeView(store: store, room: room)
        case .connect4: GamesConnectFourView(store: store, room: room)
        case .checkers: GamesCheckersView(store: store, room: room)
        case .hangman: GamesHangmanView(store: store, room: room)
        case .battleship: GamesBattleshipView(store: store, room: room)
        case .pool: EmptyView()
        case nil: Text("This game is unavailable.")
        }
    }
    private func rematch(_ room: GamesRoom) -> some View {
        Button { store.rematch(room) } label: { Text(room.rematchReady.contains(universe.actor) ? "Waiting for your partner" : "Play another round").gamesAction() }
            .disabled(!store.connected || store.working || room.rematchReady.contains(universe.actor))
    }
    private func detailsSheet(_ room: GamesRoom) -> some View {
        NavigationStack {
            List {
                Section("Our match") {
                    Text("Round \(room.round) · Room \(room.code)")
                    ForEach(room.players, id: \.actor) { player in Text(Post.name(player.actor) + (store.presence.contains(player.actor) ? " · here" : " · away")) }
                    if let url = room.invitation { ShareLink("Invite / share", item: url) }
                }
                Section("How to play") { Text(room.kind?.rules ?? "") }
                Section("A little reaction") {
                    HStack { ForEach(["♡", "👏", "🎉", "✨"], id: \.self) { emoji in Button(emoji) { store.react(room, emoji: emoji) }.frame(maxWidth: .infinity, minHeight: 44).disabled(!store.connected) } }
                }
                Button("Sound and motion") { details = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { preferences = true } }
            }.navigationTitle("Our game").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { details = false } } }
        }
    }
    private func orient(_ pool: Bool) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }) else { return }
        guard let root = scene.windows.first(where: { !$0.isHidden && $0.windowLevel == .normal })?.rootViewController else { return }
        var visible = root
        while let presented = visible.presentedViewController { visible = presented }
        root.setNeedsUpdateOfSupportedInterfaceOrientations()
        visible.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: pool ? .landscape : .portrait)) { error in
            #if DEBUG
            print("Game orientation request: \(error.localizedDescription)")
            #endif
        }
    }
}
