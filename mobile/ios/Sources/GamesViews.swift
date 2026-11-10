import SwiftUI
import UIKit

enum GamesPalette {
    static let background = Palette.background
    static let surface = Color.white
    static let inset = Palette.lavender
    static let ink = Palette.ink
    static let muted = Palette.muted
    static let line = Color(red: 217/255, green: 225/255, blue: 240/255)
    static let lilac = Palette.purple
    static let mint = Color(red: 46/255, green: 116/255, blue: 106/255)
    static let rose = Color(red: 159/255, green: 75/255, blue: 111/255)
    static func player(_ index: Int) -> Color { index == 0 ? lilac : mint }
    static func accent(_ kind: GamesKind) -> Color {
        switch kind {
        case .pool, .battleship: return mint
        case .tictactoe, .hangman: return rose
        case .connect4, .checkers, .drawing: return lilac
        }
    }
    static func theme(_ room: GamesRoom) -> Color {
        switch room.settings["theme"].string {
        case "ocean": return mint
        case "rose": return rose
        default: return lilac
        }
    }
}
extension View {
    func gamesPanel() -> some View {
        padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(GamesPalette.surface, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(GamesPalette.line.opacity(0.6)))
    }
    func gamesAction(_ prominent: Bool = true) -> some View {
        font(.system(.subheadline, design: .rounded).weight(.semibold))
            .padding(.horizontal, 16).frame(minHeight: 48)
            .frame(maxWidth: .infinity)
            .foregroundColor(prominent ? .white : GamesPalette.ink)
            .background(prominent ? GamesPalette.lilac : GamesPalette.inset, in: RoundedRectangle(cornerRadius: 14))
    }
}

struct GamesView: View {
    @ObservedObject var store: GamesStore
    @EnvironmentObject private var universe: UniverseStore
    @State private var creating: GamesKind?
    @State private var preferences = false
    @State private var code = ""
    @State private var history = false
    @State private var joining = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                GamesConnectionBanner(store: store)
                if let room = store.selectedRoom, room.status == "lobby" {
                    Button { store.activeRoomID = nil } label: { Label("All games", systemImage: "arrow.left").frame(minHeight: 44) }
                    GamesRoomView(store: store, room: room)
                } else {
                    roomList
                    featuredPool
                    invitationPanel
                    Text("A little competition. A lot of us.").font(.title2.bold())
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 155), spacing: 14)], spacing: 14) {
                        ForEach(GamesKind.allCases) { kind in
                            Button { creating = kind } label: { GamesCard(kind: kind) }
                                .buttonStyle(.plain).accessibilityLabel("\(kind.title). \(kind.subtitle). Create a room")
                                .accessibilityIdentifier("games.card.\(kind.rawValue)")
                        }
                    }
                }
            }.padding(18).frame(maxWidth: 920)
                .frame(maxWidth: .infinity)
        }
        .background(GamesPalette.background.ignoresSafeArea())
        .foregroundColor(GamesPalette.ink).tint(GamesPalette.lilac)
        .refreshable { store.refresh() }
        .sheet(item: $creating) { kind in GamesCreateView(store: store, kind: kind) }
        .sheet(isPresented: $preferences) { GamesPreferencesView() }
        .background(GamesPlayPresentation(store: store, universe: universe).frame(width: 0, height: 0))
        .onAppear { if !store.invitation.isEmpty { code = store.invitation; joining = true } }
        .onChange(of: store.invitation) { if !$0.isEmpty { code = $0; joining = true } }
    }
    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text("PLAY, STAY A WHILE").font(.caption.weight(.bold)).tracking(2).foregroundColor(GamesPalette.lilac)
                Text("Our game room.").font(.system(.title, design: .rounded).bold())
                HStack(spacing: 6) {
                    Circle().fill(partnerOnline ? GamesPalette.mint : GamesPalette.muted).frame(width: 7, height: 7)
                    Text("\(universe.partner) is \(partnerOnline ? "here" : "away")").font(.subheadline).foregroundColor(GamesPalette.muted)
                }.accessibilityElement(children: .combine)
            }
            Spacer(minLength: 8)
            Button { preferences = true } label: { Image(systemName: "slider.horizontal.3").font(.title3).frame(width: 44, height: 44).background(GamesPalette.inset, in: Circle()) }
                .accessibilityLabel("Games sound, haptics and motion settings")
                .accessibilityIdentifier("games.preferences")
        }
    }
    private var partnerOnline: Bool { store.connected && store.presence.contains(universe.actor == "asnat" ? "youssef" : "asnat") }
    private var featuredPool: some View {
        Button { creating = .pool } label: {
            VStack(alignment: .leading, spacing: 12) {
                GamesCover(kind: .pool).aspectRatio(1.5, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 18))
                Text("TONIGHT’S LITTLE ESCAPE").font(.caption2.bold()).tracking(2).foregroundColor(GamesPalette.lilac)
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(GamesKind.pool.title).font(.system(.title, design: .rounded).bold())
                        Text("8-ball pool · Live multiplayer for two").font(.subheadline).foregroundColor(GamesPalette.muted)
                    }
                    Spacer(); Image(systemName: "play.circle.fill").font(.largeTitle).foregroundColor(GamesPalette.lilac)
                }
                Text("A private table, a called pocket, and nowhere else to be.").font(.subheadline).foregroundColor(GamesPalette.muted)
            }.gamesPanel()
        }.buttonStyle(.plain).accessibilityLabel("Featured Velvet Eight. 8-ball pool. Live multiplayer. Create a room")
            .accessibilityIdentifier("games.featured.pool")
    }
    private var invitationPanel: some View {
        DisclosureGroup(isExpanded: $joining) {
            HStack(spacing: 10) {
                TextField("Room code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .submitLabel(.go).onSubmit { store.join(code) }.padding(12).background(GamesPalette.background, in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityIdentifier("games.join.code")
                Button { store.join(code) } label: { Text("Join").padding(.horizontal, 16).frame(minHeight: 46).background(GamesPalette.lilac, in: RoundedRectangle(cornerRadius: 12)).foregroundColor(.white) }
                    .disabled(!store.connected || store.working || code.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityIdentifier("games.join")
            }.padding(.top, 12)
        } label: { Label("Join with a room code", systemImage: "link").font(.subheadline.weight(.semibold)).frame(minHeight: 30) }
            .gamesPanel()
    }
    @ViewBuilder private var roomList: some View {
        let active = store.rooms.filter { !$0.finished }
        let finished = store.rooms.filter { $0.finished }
        if !active.isEmpty {
            Text("Pick up where we left off").font(.headline)
            ForEach(active) { room in roomRow(room) }
        }
        if !finished.isEmpty {
            DisclosureGroup(isExpanded: $history) {
                VStack(spacing: 10) { ForEach(finished) { room in roomRow(room) } }.padding(.top, 12)
            } label: { Text("Our match history · \(finished.count)").font(.headline) }
        }
    }
    private func roomRow(_ room: GamesRoom) -> some View {
        Button { store.select(room) } label: {
            HStack(spacing: 12) {
                Image(systemName: room.kind?.symbol ?? "gamecontroller").font(.title2).foregroundColor(GamesPalette.lilac).frame(width: 38)
                VStack(alignment: .leading, spacing: 5) {
                    Text(room.kind?.title ?? "Game room").font(.headline)
                    Text("\(room.code) · \(room.finished ? "Finished" : room.status == "lobby" ? "Lobby" : "Resume") · Round \(room.round)").font(.caption).foregroundColor(GamesPalette.muted)
                    if room.finished { Text(GamesRoomView.resultText(room)).font(.caption).foregroundColor(GamesPalette.mint) }
                }
                Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption)
            }.gamesPanel()
        }.buttonStyle(.plain)
    }
}

struct GamesConnectionBanner: View {
    @ObservedObject var store: GamesStore
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 9) {
                if store.connecting { ProgressView().controlSize(.small) }
                else { Image(systemName: store.connected ? "checkmark.circle.fill" : "wifi.slash").foregroundColor(store.connected ? GamesPalette.mint : GamesPalette.rose) }
                Text(store.connectionText).font(.caption).frame(maxWidth: .infinity, alignment: .leading)
                if !store.connected { Button("Retry") { store.reconnect() }.frame(minHeight: 44) }
            }
            if !store.pending.isEmpty {
                HStack { Text("\(store.pending.count) move waiting for confirmation").font(.caption); Spacer(); Button("Sync") { store.retryPending() }.frame(minHeight: 44) }
            }
            if let error = store.error {
                HStack(alignment: .top) {
                    Text(error).font(.subheadline).foregroundColor(GamesPalette.rose).accessibilityLabel("Games error: \(error)")
                    Spacer(); Button { store.error = nil } label: { Image(systemName: "xmark.circle").frame(width: 44, height: 44) }.accessibilityLabel("Dismiss games error")
                }
            }
        }.padding(.horizontal, 14).padding(.vertical, store.connected ? 10 : 4)
            .background(GamesPalette.inset.opacity(0.65), in: RoundedRectangle(cornerRadius: 16))
    }
}

struct GamesCard: View {
    var kind: GamesKind
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GamesCover(kind: kind).aspectRatio(1.5, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 13)).accessibilityHidden(true)
            Text(kind.classic.uppercased()).font(.caption2.bold()).foregroundColor(GamesPalette.accent(kind))
            Text(kind.title).font(.system(.headline, design: .rounded)).fixedSize(horizontal: false, vertical: true)
            Text(kind.subtitle).font(.caption).foregroundColor(GamesPalette.muted).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            HStack { Text("JUST THE TWO OF US").font(.system(size: 8, weight: .bold)).tracking(1); Spacer(); Image(systemName: "arrow.up.right") }
                .foregroundColor(GamesPalette.accent(kind))
        }.padding(16).frame(maxWidth: .infinity, minHeight: 255, alignment: .topLeading)
            .background(GamesPalette.surface, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(GamesPalette.line.opacity(0.7)))
            .foregroundColor(GamesPalette.ink)
    }
}

struct GamesCover: View {
    var kind: GamesKind
    private var image: UIImage? {
        GamesAssets.cover(kind)
    }
    var body: some View {
        GeometryReader { geometry in
            if let image { Image(uiImage: image).resizable().scaledToFit().frame(width: geometry.size.width, height: geometry.size.height) }
            else { GamesArtwork(kind: kind) }
        }
    }
}

struct GamesCreateView: View {
    @ObservedObject var store: GamesStore
    var kind: GamesKind
    @Environment(\.dismiss) private var dismiss
    @State private var bestOf = 1
    @State private var theme = "violet"
    @State private var setter = 0
    @State private var timed = false
    @State private var seconds = 120
    @State private var drawRounds=3
    @State private var drawSeconds=80
    @State private var customWords=""
    @State private var customOnly=false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        GamesCover(kind: kind).aspectRatio(1.5, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 16)).accessibilityHidden(true)
                        Text(kind.title).font(.title2.bold()).foregroundColor(GamesPalette.ink)
                        Text(kind.subtitle).font(.subheadline).foregroundColor(GamesPalette.muted)
                    }.padding(.vertical, 4)
                }
                Section("Make it ours") {
                    if kind != .drawing {Picker("Series", selection: $bestOf) { Text("One round").tag(1); Text("Best of three").tag(3); Text("Best of five").tag(5) }}
                    if kind == .drawing {Stepper("\(drawRounds) rounds",value:$drawRounds,in:1...5);Stepper("\(drawSeconds) seconds to draw",value:$drawSeconds,in:30...180,step:10);TextField("Custom words, separated by commas",text:$customWords);Toggle("Only our custom words",isOn:$customOnly)}
                    Picker("Board accent", selection: $theme) { Text("Violet").tag("violet"); Text("Ocean").tag("ocean"); Text("Rose").tag("rose") }
                    if kind == .hangman {
                        Picker("First word setter", selection: $setter) { Text("Room creator").tag(0); Text("Joining player").tag(1) }
                        Toggle("Timed guesses", isOn: $timed)
                        if timed { Stepper("\(seconds) seconds", value: $seconds, in: 30...600, step: 30) }
                    }
                }
                Section { Text(kind.rules).font(.subheadline) } header: { Text("How to play") }
                Section {
                    Button {
                        var settings: [String: GamesJSON] = ["bestOf": .int(bestOf), "theme": .string(theme), "setter": .int(setter)]
                        if kind == .hangman && timed { settings["timedSeconds"] = .int(seconds) }
                        if kind == .drawing {settings["rounds"] = .int(drawRounds);settings["drawSeconds"] = .int(drawSeconds);settings["customWords"] = .array(customWords.split(separator:",").map{.string($0.trimmingCharacters(in:.whitespacesAndNewlines))});settings["customOnly"] = .bool(customOnly)}
                        store.create(kind, settings: .object(settings)); dismiss()
                    } label: { Text("Create our room").gamesAction() }
                        .buttonStyle(.plain).listRowBackground(Color.clear)
                        .disabled(!store.connected || store.working).accessibilityIdentifier("games.create.\(kind.rawValue)")
                    if !store.connected { Text("Connect to Games before creating a room.").font(.caption) }
                }
            }.scrollContentBackground(.hidden).background(GamesPalette.background)
                .navigationTitle("A new little match").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }.foregroundColor(GamesPalette.ink).tint(GamesPalette.lilac).preferredColorScheme(.light)
    }
}

struct GamesPreferencesView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("games.sound") private var sound = false
    @AppStorage("games.haptics") private var haptics = true
    @AppStorage("games.reduceMotion") private var reduceMotion = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Your game room") {
                    Toggle("Game sounds", isOn: $sound)
                    Toggle("Game haptics", isOn: $haptics)
                    Toggle("Reduce game motion", isOn: $reduceMotion)
                }
                Section { Text("Reduced motion shows the final pool result immediately. Your device’s Reduce Motion setting is always respected. All games also offer labeled native controls for VoiceOver.").font(.subheadline) }
            }.scrollContentBackground(.hidden).background(GamesPalette.background)
                .navigationTitle("Play your way").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }.foregroundColor(GamesPalette.ink).tint(GamesPalette.lilac).preferredColorScheme(.light)
    }
}

struct GamesRoomView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
    @State private var rules = false
    @State private var copied = false
    private var me: Int? { room.player(universe.actor) }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            title
            players
            if room.status == "lobby" { lobby }
            else {
                Text(room.finished ? Self.resultText(room) : turnText).font(.title3.bold()).foregroundColor(GamesPalette.theme(room)).accessibilityAddTraits(.updatesFrequently)
                board
                if room.finished { finishPanel }
                reactions
            }
        }.sheet(isPresented: $rules) { rulesSheet }
    }
    private var title: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Text(room.kind?.title ?? "Our room").font(.system(.title, design: .rounded).bold())
                Spacer(); Button { rules = true } label: { Image(systemName: "questionmark.circle").font(.title2).frame(width: 44, height: 44) }.accessibilityLabel("Game rules")
            }
            HStack {
                Button {
                    UIPasteboard.general.string = room.code; copied = true
                } label: { Label(copied ? "Copied \(room.code)" : "Code \(room.code)", systemImage: "doc.on.doc").font(.subheadline.monospaced()).frame(minHeight: 44) }
                Spacer()
                if let invitation = room.invitation { ShareLink(item: invitation) { Label("Invite", systemImage: "square.and.arrow.up").frame(minHeight: 44) } }
            }
            Text("Round \(room.round) · Best of \(room.settings["bestOf"].int ?? 1) · \(room.scores.map(String.init).joined(separator: " : "))").font(.caption).foregroundColor(GamesPalette.muted)
        }
    }
    private var players: some View {
        VStack(spacing: 10) {
            ForEach(Array(room.players.enumerated()), id: \.element.actor) { index, player in
                HStack(spacing: 10) {
                    Text(String(Post.name(player.actor).prefix(1))).font(.headline).frame(width: 36, height: 36).background(GamesPalette.player(index).opacity(0.2), in: Circle())
                    Text(Post.name(player.actor) + (player.actor == universe.actor ? " · you" : "")).font(.subheadline.bold())
                    Spacer()
                    Text(room.status == "lobby" && player.ready ? "Ready" : store.connected && store.presence.contains(player.actor) ? "Here" : "Away")
                        .font(.caption).foregroundColor(store.connected && store.presence.contains(player.actor) ? GamesPalette.mint : GamesPalette.muted)
                }
            }
            if room.players.count < 2 { Text("A place saved for your person.").font(.subheadline).foregroundColor(GamesPalette.muted).frame(maxWidth: .infinity, minHeight: 36) }
        }.gamesPanel()
    }
    private var lobby: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Before we begin").font(.headline)
            Text("Share the invitation, then both mark ready. The room creator starts the match.").foregroundColor(GamesPalette.muted)
            if let me {
                Button { store.ready(room) } label: { Text(room.players[me].ready ? "I’m not ready yet" : "I’m ready").gamesAction() }.disabled(!store.connected || store.working)
                if me == 0 {
                    Button { store.start(room) } label: { Label("Start together", systemImage: "play.fill").gamesAction(false) }
                        .disabled(!store.connected || store.working || room.players.count != 2 || !room.players.allSatisfy(\.ready))
                } else { Text("Your person will start when you’re both ready.").font(.caption).foregroundColor(GamesPalette.muted) }
            } else {
                Button { store.join(room.code) } label: { Text("Join this room").gamesAction() }.disabled(!store.connected || store.working || room.players.count >= 2)
            }
        }.gamesPanel()
    }
    private var turnText: String {
        if room.game == "battleship" && room.state["phase"].string == "placement" { return "Arrange your secret fleet" }
        if room.game == "hangman" && room.state["phase"].string == "choose" { return room.state["setter"].int == me ? "Choose a secret word" : "Your person is choosing a word" }
        guard let turn = room.state["turn"].int, room.players.indices.contains(turn) else { return "Waiting for the board…" }
        return turn == me ? "Your move" : "\(Post.name(room.players[turn].actor))’s move"
    }
    @ViewBuilder private var board: some View {
        switch room.kind {
        case .tictactoe: GamesTicTacToeView(store: store, room: room)
        case .connect4: GamesConnectFourView(store: store, room: room)
        case .checkers: GamesCheckersView(store: store, room: room)
        case .hangman: GamesHangmanView(store: store, room: room)
        case .battleship: GamesBattleshipView(store: store, room: room)
        case .drawing: GamesDrawingView(store:store,room:room)
        case .pool: GamesPoolView(store: store, room: room)
        case nil: Text("This game is not supported by this version.")
        }
    }
    private var finishPanel: some View {
        GamesOutcomeCard(store: store, room: room, compact: false)
    }
    private var reactions: some View {
        VStack(spacing: 8) {
            HStack { ForEach(["♡", "👏", "🎉", "😮", "✨", "👍"], id: \.self) { emoji in
                Button { store.react(room, emoji: emoji) } label: { Text(emoji).font(.title2).frame(maxWidth: .infinity, minHeight: 44) }.disabled(!store.connected || me == nil).accessibilityLabel("Send reaction \(emoji)")
            } }
            if !store.reaction.isEmpty { Text(store.reaction).font(.headline).foregroundColor(GamesPalette.mint).accessibilityAddTraits(.updatesFrequently) }
        }
    }
    private var rulesSheet: some View {
        NavigationStack {
            ScrollView { VStack(alignment: .leading, spacing: 18) { Text(room.kind?.title ?? "Game rules").font(.title.bold()); Text(room.kind?.rules ?? "").lineSpacing(6) }.padding(24) }
                .background(GamesPalette.background)
                .navigationTitle("How we play").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { rules = false } } }
        }.foregroundColor(GamesPalette.ink).tint(GamesPalette.lilac).preferredColorScheme(.light)
    }
    static func resultText(_ room: GamesRoom) -> String {
        if room.winner.string == "draw" { return "A lovely tie. One more?" }
        if let winner = room.winner.int, room.players.indices.contains(winner) { return "\(Post.name(room.players[winner].actor)) wins this round ♡" }
        return "Round complete"
    }
}

struct GamesOutcomeCard: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    var compact = false
    @EnvironmentObject private var universe: UniverseStore
    private var me: Int? { room.player(universe.actor) }
    private var isDraw: Bool { room.winner.string == "draw" }
    private var iWon: Bool {
        if let me, let w = room.winner.int { return w == me }
        if room.kind == .drawing, let me {
            let myPts = room.state["points"][me].int ?? 0
            let theirPts = room.state["points"][1 - me].int ?? 0
            if myPts != theirPts { return myPts > theirPts }
        }
        return false
    }
    private var accentColor: Color {
        if isDraw { return GamesPalette.lilac }
        return iWon ? GamesPalette.mint : GamesPalette.rose
    }
    private var badgeText: String {
        if !room.seriesWinner.isNull, let sw = room.seriesWinner.int, sw == me {
            return "✦ SERIES CHAMPION · ROUND \(room.round) ✦"
        }
        if isDraw { return "✧ A LOVELY TIE · ROUND \(room.round) ✧" }
        return iWon ? "✦ VICTORY · ROUND \(room.round) ✦" : "♡ CLOSE MATCH · ROUND \(room.round) ♡"
    }
    private var personalHeadline: String {
        if isDraw { return "A lovely tie. One more? ♡" }
        return iWon ? "You won this round! ♡" : GamesRoomView.resultText(room)
    }
    private var personalSubtitle: String {
        if isDraw { return "Great minds think alike this round." }
        return iWon ? "Beautifully played, my love." : "Every game with you is my favorite. Ready for a comeback?"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 10 : 14) {
            HStack {
                Text(badgeText)
                    .font(.caption2.bold())
                    .tracking(1.4)
                    .foregroundColor(accentColor)
                Spacer()
                Text("Round \(room.round) · Best of \(room.settings["bestOf"].int ?? 1)")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(GamesPalette.muted)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(personalHeadline)
                    .font(.system(compact ? .headline : .title3, design: .rounded).bold())
                    .foregroundColor(GamesPalette.ink)
                if iWon {
                    Text(GamesRoomView.resultText(room))
                        .font(.caption.weight(.semibold))
                        .foregroundColor(accentColor)
                }
                Text(personalSubtitle)
                    .font(.caption)
                    .foregroundColor(GamesPalette.muted)
            }
            if let winner = room.seriesWinner.int, room.players.indices.contains(winner) {
                Text("\(Post.name(room.players[winner].actor)) wins the series ♡")
                    .font(.subheadline.bold())
                    .foregroundColor(GamesPalette.lilac)
            }
            HStack(spacing: 10) {
                ForEach(Array(room.players.enumerated()), id: \.element.actor) { index, player in
                    HStack(spacing: 6) {
                        Circle()
                            .fill(GamesPalette.player(index).opacity(0.22))
                            .frame(width: 26, height: 26)
                            .overlay(Text(String(Post.name(player.actor).prefix(1))).font(.caption.bold()).foregroundColor(GamesPalette.player(index)))
                        Text(Post.name(player.actor))
                            .font(.caption.bold())
                        Spacer(minLength: 2)
                        Text("\(room.scores.indices.contains(index) ? room.scores[index] : 0)")
                            .font(.subheadline.monospacedDigit().bold())
                            .foregroundColor(GamesPalette.player(index))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(GamesPalette.inset.opacity(0.65), in: RoundedRectangle(cornerRadius: 12))
                }
            }
            Text(summaryText)
                .font(.caption)
                .foregroundColor(GamesPalette.muted)
            let voted = room.rematchReady.contains(universe.actor)
            Button { store.rematch(room) } label: {
                Text(voted ? (compact ? "Waiting for your partner" : "Waiting for your person’s vote…") : (compact ? "Play another round" : (room.seriesWinner.isNull ? "Play another round" : "Play a new series"))).gamesAction()
            }
            .disabled(!store.connected || store.working || voted || me == nil)
            .accessibilityIdentifier("games.outcome.rematch")
            if !room.rematchReady.isEmpty {
                Text(room.rematchReady.map(Post.name).joined(separator: " & ") + " wants to play again.")
                    .font(.caption)
                    .foregroundColor(GamesPalette.mint)
            }
            HStack(spacing: 8) {
                ForEach(["♡", "👏", "🎉", "✨"], id: \.self) { emoji in
                    Button { store.react(room, emoji: emoji) } label: {
                        Text(emoji)
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 38)
                            .background(GamesPalette.inset.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .disabled(!store.connected || me == nil)
                    .accessibilityLabel("Send reaction \(emoji)")
                }
            }
        }
        .padding(compact ? 14 : 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GamesPalette.surface, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(accentColor.opacity(0.55), lineWidth: 1.5))
        .accessibilityElement(children: .contain)
    }
    private var summaryText: String {
        switch room.kind {
        case .pool:
            let pocketed = room.state["balls"].array.filter { $0["pocketed"].bool && $0["id"].int != 0 }.count
            let grp = room.state["groups"][me ?? 0].string
            return "\(pocketed) balls pocketed · \(grp.isEmpty ? "Open table" : grp.capitalized)"
        case .tictactoe:
            let moves = room.state["board"].array.filter { !$0.isNull }.count
            return "\(moves) moves played · \(isDraw ? "Full board draw" : "Three aligned in orbit")"
        case .hangman:
            let word = room.state["word"].string
            let rem = room.state["remaining"].int ?? 0
            return (word.isEmpty ? "" : "Secret word: \(word.uppercased()) · ") + "\(rem) / 6 chances left"
        case .connect4:
            let discs = room.state["board"].array.filter { !$0.isNull }.count
            return "\(discs) discs dropped · \(isDraw ? "Full column grid" : "Four connected in orbit")"
        case .checkers:
            let moves = room.state["moves"].array.count
            let kings = room.state["board"].array.filter { $0["king"].bool }.count
            return "\(moves) moves played · \(kings) crowned \(kings == 1 ? "king" : "kings")"
        case .battleship:
            let idx = me ?? 0
            let shots = room.state["shots"][idx].array.count
            let hits = room.state["hits"][idx].array.count
            let acc = shots > 0 ? Int(round(Double(hits) * 100.0 / Double(shots))) : 0
            return "\(hits)/\(shots) hits (\(acc)% accuracy) · \(room.state["sunkShips"][idx].array.count)/5 ships sunk"
        case .drawing:
            let pts = room.players.enumerated().map { "\(Post.name($0.element.actor)): \(room.state["points"][$0.offset].int ?? 0) pts" }.joined(separator: " · ")
            return pts.isEmpty ? "Sketch & Guess complete" : pts
        case nil:
            return "Match complete"
        }
    }
}

/// Original geometric cover art, drawn locally at the card's native resolution.
struct GamesArtwork: View {
    var kind: GamesKind
    var body: some View {
        Canvas { context, size in
            var c = context
            c.translateBy(x: size.width / 2, y: size.height / 2)
            let unit = min(size.width / 2.8, size.height / 2.2)
            c.scaleBy(x: unit, y: unit)
            let accent = GamesPalette.accent(kind)
            switch kind {
            case .drawing:
                c.fill(Path(roundedRect:CGRect(x:-1,y:-0.8,width:2,height:1.6),cornerRadius:0.12),with:.color(.white))
                var doodle=Path();doodle.move(to:CGPoint(x:-0.7,y:0.3));doodle.addCurve(to:CGPoint(x:0.7,y:-0.2),control1:CGPoint(x:-0.7,y:-1),control2:CGPoint(x:0.5,y:1));c.stroke(doodle,with:.color(accent),style:StrokeStyle(lineWidth:0.09,lineCap:.round))
            case .pool:
                c.fill(Path(roundedRect: CGRect(x: -1.25, y: -0.76, width: 2.5, height: 1.52), cornerRadius: 0.2), with: .color(accent.opacity(0.2)))
                c.stroke(Path(roundedRect: CGRect(x: -1.25, y: -0.76, width: 2.5, height: 1.52), cornerRadius: 0.2), with: .color(accent), lineWidth: 0.045)
                ball(c, x: -0.55, y: 0.3, radius: 0.17, color: .white)
                ball(c, x: 0.45, y: -0.05, radius: 0.21, color: .black)
                ball(c, x: 0.74, y: 0.29, radius: 0.16, color: GamesPalette.rose)
                var cue = Path(); cue.move(to: CGPoint(x: -1.15, y: 0.7)); cue.addLine(to: CGPoint(x: -0.72, y: 0.4)); c.stroke(cue, with: .color(.white.opacity(0.7)), lineWidth: 0.055)
            case .tictactoe:
                var grid = Path()
                for a in [-0.36, 0.36] { grid.move(to: CGPoint(x: a, y: -0.95)); grid.addLine(to: CGPoint(x: a, y: 0.95)); grid.move(to: CGPoint(x: -0.95, y: a)); grid.addLine(to: CGPoint(x: 0.95, y: a)) }
                c.stroke(grid, with: .color(accent.opacity(0.3)), lineWidth: 0.045)
                for p in [CGPoint(x: -0.7, y: -0.7), .zero, CGPoint(x: 0.7, y: 0.7)] { var cross = Path(); cross.move(to: CGPoint(x: p.x - 0.18, y: p.y - 0.18)); cross.addLine(to: CGPoint(x: p.x + 0.18, y: p.y + 0.18)); cross.move(to: CGPoint(x: p.x + 0.18, y: p.y - 0.18)); cross.addLine(to: CGPoint(x: p.x - 0.18, y: p.y + 0.18)); c.stroke(cross, with: .color(accent), lineWidth: 0.07) }
                c.stroke(Path(ellipseIn: CGRect(x: 0.5, y: -0.9, width: 0.4, height: 0.4)), with: .color(.white), lineWidth: 0.06)
            case .hangman:
                c.draw(Text("A _ O R E").font(.system(size: 0.42, weight: .bold, design: .serif)).foregroundColor(accent), at: CGPoint(x: 0, y: 0.15))
                c.draw(Text("a little mystery").font(.system(size: 0.2, design: .monospaced)).foregroundColor(.white.opacity(0.6)), at: CGPoint(x: 0, y: 0.7))
                var line = Path(); line.move(to: CGPoint(x: -0.75, y: -0.6)); line.addQuadCurve(to: CGPoint(x: 0.75, y: -0.6), control: CGPoint(x: 0, y: -1.1)); c.stroke(line, with: .color(accent.opacity(0.5)), lineWidth: 0.04)
            case .connect4:
                for row in 0..<4 { for col in 0..<5 { let color: Color = (row == col || row + 1 == col) ? accent : GamesPalette.mint.opacity(0.25); ball(c, x: Double(col) * 0.43 - 0.86, y: Double(row) * 0.43 - 0.65, radius: 0.16, color: color) } }
            case .checkers:
                for row in 0..<4 { for col in 0..<4 where (row + col) % 2 == 1 { c.fill(Path(CGRect(x: Double(col) * 0.48 - 0.96, y: Double(row) * 0.48 - 0.96, width: 0.48, height: 0.48)), with: .color(accent.opacity(0.18))) } }
                ball(c, x: -0.24, y: -0.24, radius: 0.34, color: accent)
                c.draw(Text("♛").font(.system(size: 0.45)).foregroundColor(GamesPalette.background), at: CGPoint(x: -0.24, y: -0.24))
                ball(c, x: 0.73, y: 0.72, radius: 0.3, color: GamesPalette.mint)
            case .battleship:
                for row in 0..<5 { for col in 0..<7 { ball(c, x: Double(col) * 0.34 - 1.02, y: Double(row) * 0.34 - 0.68, radius: 0.02, color: accent.opacity(0.5)) } }
                let hull = CGRect(x: -0.9, y: -0.23, width: 1.8, height: 0.46)
                c.fill(Path(roundedRect: hull, cornerRadius: 0.23), with: .color(accent.opacity(0.8)))
                c.stroke(Path(ellipseIn: CGRect(x: 0.55, y: 0.35, width: 0.4, height: 0.4)), with: .color(GamesPalette.rose), lineWidth: 0.04)
                c.stroke(Path(ellipseIn: CGRect(x: 0.43, y: 0.23, width: 0.64, height: 0.64)), with: .color(GamesPalette.rose.opacity(0.4)), lineWidth: 0.02)
            }
        }
    }
    private func ball(_ c: GraphicsContext, x: Double, y: Double, radius: Double, color: Color) {
        c.fill(Path(ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)), with: .color(color))
    }
}
