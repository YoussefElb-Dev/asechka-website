import SwiftUI

struct GamesTicTacToeView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.accessibilityReduceMotion) private var systemReduced
    @AppStorage("games.reduceMotion") private var reduced = false
    private var pendingCell: Int? { store.pending.first { $0.room == room.id }?.action["cell"].int }
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
            ForEach(0..<9, id: \.self) { cell in
                Button { store.move(room, ["type": "place", "cell": .int(cell)]) } label: {
                    mark(cell).frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fit)
                        .animation(systemReduced || reduced ? nil : .spring(response: 0.3, dampingFraction: 0.72), value: room.state["board"][cell])
                        .background(GamesPalette.surface, in: RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(highlight(cell) ? GamesPalette.theme(room) : GamesPalette.line, lineWidth: highlight(cell) ? 3 : 1))
                }.buttonStyle(SoftPress()).disabled(!store.myTurn(room) || !room.state["board"][cell].isNull)
                    .accessibilityLabel("Row \(cell / 3 + 1), column \(cell % 3 + 1), \(valueLabel(cell))")
                    .accessibilityIdentifier("games.tictactoe.\(cell)")
            }
        }.frame(maxWidth: 480).frame(maxWidth: .infinity)
    }
    @ViewBuilder private func mark(_ cell: Int) -> some View {
        let value = room.state["board"][cell].int
        let pending = value == nil && pendingCell == cell
        let player = value ?? (pending ? room.player(universe.actor) : nil)
        if let player {
            Image(systemName: player == 0 ? "xmark" : "circle").font(.system(size: 42, weight: .medium))
                .foregroundColor(GamesPalette.player(player)).opacity(pending ? 0.4 : 1)
                .transition(.scale(scale: 0.6).combined(with: .opacity))
        } else { Color.clear }
    }
    private func highlight(_ cell: Int) -> Bool { room.state["line"].array.contains(.int(cell)) || pendingCell == cell }
    private func valueLabel(_ cell: Int) -> String {
        if pendingCell == cell { return "move pending" }
        guard let player = room.state["board"][cell].int else { return "empty" }
        return player == 0 ? "cross" : "circle"
    }
}

struct GamesConnectFourView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.accessibilityReduceMotion) private var systemReduced
    @AppStorage("games.reduceMotion") private var reduced = false
    private var pendingColumn: Int? { store.pending.first { $0.room == room.id }?.action["column"].int }
    private var pendingCell: Int? {
        guard let column = pendingColumn else { return nil }
        return (0..<6).reversed().map { $0 * 7 + column }.first { room.state["board"][$0].isNull }
    }
    var body: some View {
        VStack(spacing: 10) {
            Text("Tap any column to drop a disc.").font(.subheadline).foregroundColor(GamesPalette.muted)
            HStack(spacing: 3) {
                ForEach(0..<7, id: \.self) { column in
                    Button { drop(column) } label: { VStack(spacing: 2) { Image(systemName: "arrow.down"); Text("\(column + 1)").font(.caption2) }.frame(maxWidth: .infinity, minHeight: 44) }
                        .disabled(!canDrop(column)).accessibilityLabel("Drop disc into column \(column + 1)")
                        .accessibilityIdentifier("games.connect4.column.\(column)")
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
                ForEach(0..<42, id: \.self) { cell in
                    Button { drop(cell % 7) } label: { disc(cell) }.disabled(!canDrop(cell % 7))
                        .accessibilityLabel("Row \(cell / 7 + 1), column \(cell % 7 + 1), \(cellLabel(cell)). Drop in this column")
                }
            }.padding(10).background(GamesPalette.theme(room).opacity(0.14), in: RoundedRectangle(cornerRadius: 20))
        }.frame(maxWidth: 600).frame(maxWidth: .infinity)
    }
    private func canDrop(_ column: Int) -> Bool { store.myTurn(room) && room.state["board"][column].isNull }
    private func drop(_ column: Int) { store.move(room, ["type": "drop", "column": .int(column)]) }
    private func disc(_ cell: Int) -> some View {
        let player = room.state["board"][cell].int
        let pending = player == nil && pendingCell == cell
        let color = player.map(GamesPalette.player) ?? (pending ? GamesPalette.player(room.player(universe.actor) ?? 0).opacity(0.4) : GamesPalette.background)
        return ZStack {
            Circle().fill(GamesPalette.background)
            if player != nil || pending {
                Circle().fill(color)
                    .overlay(Circle().stroke(room.state["line"].array.contains(.int(cell)) ? .white : .white.opacity(0.08), lineWidth: 2))
                    .overlay { if let player { Text(player == 0 ? "✦" : "○").font(.caption).foregroundColor(GamesPalette.background) } }
                    .transition(.offset(y: -160).combined(with: .opacity))
            }
        }.aspectRatio(1, contentMode: .fit)
            .animation(systemReduced || reduced ? nil : .spring(response: 0.45, dampingFraction: 0.68), value: room.state["board"][cell])
    }
    private func cellLabel(_ cell: Int) -> String { room.state["board"][cell].int.map { "player \($0 + 1)" } ?? (pendingCell == cell ? "move pending" : "empty") }
}

struct GamesCheckersView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @State private var selected: Int?
    @State private var replayStep: Int?
    @State private var showHistory = false
    private var moves: [GamesJSON] { room.state["moves"].array }
    private var displayBoard: [GamesJSON] {
        if let replayStep { return GamesCheckersReplay.board(moves: moves, through: replayStep) }
        return room.state["board"].array
    }
    private var legal: [GamesJSON] { room.state["legal"].array }
    private var source: Int? { room.state["forced"].int ?? selected }
    private var pendingTo: Int? { store.pending.first { $0.room == room.id }?.action["to"].int }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(room.state["forced"].isNull ? "Select a piece, then a lit square. Captures are mandatory." : "Keep jumping with the highlighted piece.")
                .font(.subheadline).foregroundColor(GamesPalette.muted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 1), count: 8), spacing: 1) {
                ForEach(0..<64, id: \.self) { cell in
                    Button { select(cell) } label: { square(cell) }
                        .buttonStyle(.plain).disabled(replayStep != nil || !store.myTurn(room) || !interactive(cell))
                        .accessibilityLabel(label(cell)).accessibilityIdentifier("games.checkers.\(cell)")
                }
            }.padding(4).background(GamesPalette.surface, in: RoundedRectangle(cornerRadius: 12))
            if let source { Text("Selected: row \(source / 8 + 1), column \(source % 8 + 1)").font(.caption).foregroundColor(GamesPalette.lilac) }
            if !moves.isEmpty { replayControls }
        }.frame(maxWidth: 600).frame(maxWidth: .infinity)
            .onChange(of: room.seq) { _ in selected = room.state["forced"].int; replayStep = nil }
    }
    private var replayControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button(replayStep == nil ? "Replay this round" : "Return to current board") { replayStep = replayStep == nil ? 0 : nil }
                    .frame(minHeight: 44)
                Spacer()
                Text("\(moves.count) moves").font(.caption).foregroundColor(GamesPalette.muted)
            }
            if let step = replayStep {
                HStack {
                    Button("Previous") { replayStep = max(0, step - 1) }.disabled(step == 0).frame(minHeight: 44)
                    Spacer()
                    Text(step == 0 ? "Starting position" : "Move \(step): \(GamesCheckersReplay.notation(moves[step - 1]))").font(.caption)
                    Spacer()
                    Button("Next") { replayStep = min(moves.count, step + 1) }.disabled(step == moves.count).frame(minHeight: 44)
                }
                Slider(value: Binding(get: { Double(replayStep ?? moves.count) }, set: { replayStep = Int($0) }), in: 0...Double(max(1, moves.count)), step: 1)
                    .accessibilityLabel("Replay move").accessibilityValue("\(step) of \(moves.count)")
            }
            DisclosureGroup("Move history", isExpanded: $showHistory) {
                ForEach(moves.indices, id: \.self) { index in
                    Text("\(index + 1). Player \((moves[index]["player"].int ?? 0) + 1) · \(GamesCheckersReplay.notation(moves[index]))")
                        .font(.caption.monospaced()).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 3)
                }
            }
        }
    }
    private func destination(_ cell: Int) -> Bool { legal.contains { $0["from"].int == source && $0["to"].int == cell } }
    private func interactive(_ cell: Int) -> Bool { destination(cell) || legal.contains { $0["from"].int == cell } }
    private func select(_ cell: Int) {
        if destination(cell), let source { store.move(room, ["type": "move", "from": .int(source), "to": .int(cell)]) }
        else if legal.contains(where: { $0["from"].int == cell }) { selected = cell; GamesFeedback.play() }
    }
    private func square(_ cell: Int) -> some View {
        let piece = displayBoard.indices.contains(cell) ? displayBoard[cell] : GamesJSON.null
        let dark = (cell / 8 + cell % 8) % 2 == 1
        return ZStack {
            Rectangle().fill(dark ? Color(red: 0.78, green: 0.73, blue: 0.86) : Color(red: 0.97, green: 0.95, blue: 0.99))
            if let player = piece["player"].int {
                Circle().fill(GamesPalette.player(player)).padding(5)
                    .overlay(Circle().stroke(.black.opacity(0.25), lineWidth: 2).padding(9))
                if piece["king"].bool { Image(systemName: "crown.fill").font(.caption).foregroundColor(GamesPalette.background) }
                else { Text(player == 0 ? "1" : "2").font(.caption2.bold()).foregroundColor(GamesPalette.background) }
            }
            if replayStep == nil && destination(cell) { Circle().fill(GamesPalette.mint.opacity(0.5)).padding(13) }
            if replayStep == nil && (source == cell || pendingTo == cell) { Rectangle().stroke(GamesPalette.theme(room), lineWidth: 3) }
        }.aspectRatio(1, contentMode: .fit)
    }
    private func label(_ cell: Int) -> String {
        let piece = displayBoard.indices.contains(cell) ? displayBoard[cell] : GamesJSON.null
        let occupant = piece["player"].int.map { "player \($0 + 1) \(piece["king"].bool ? "king" : "piece")" } ?? "empty"
        return "Row \(cell / 8 + 1), column \(cell % 8 + 1), \(occupant)\(destination(cell) ? ", legal destination" : "")\(source == cell ? ", selected" : "")"
    }
}

struct GamesHangmanView: View {
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
    @State private var word = ""
    @State private var category = "romance"
    private let categories = ["romance", "movies", "animals", "science", "geography", "food", "technology", "general"]
    private var setter: Bool { room.player(universe.actor) == room.state["setter"].int }
    private var guessing: Bool { store.canAct(room) && !setter && room.state["phase"].string == "guess" }
    private var pendingLetter: String { store.pending.first { $0.room == room.id }?.action["letter"].string ?? "" }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if room.state["phase"].string == "choose" {
                if setter { choose }
                else { GamesCover(kind: .hangman).aspectRatio(1.5, contentMode: .fit); Text("A secret is on its way. Your keyboard appears when your person chooses a word.").foregroundColor(GamesPalette.muted) }
            } else { guessingBoard }
        }.gamesPanel().onChange(of: room.round) { _ in word = "" }
    }
    private var choose: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("Category", selection: $category) { ForEach(categories, id: \.self) { Text($0.capitalized).tag($0) } }
                .pickerStyle(.menu)
            SecureField("Your secret English word or phrase", text: $word).textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(14).background(.black.opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityIdentifier("games.hangman.word")
            Button { store.move(room, ["type": "word", "word": .string(word), "category": .string(category)]); word = "" } label: { Text("Keep this word between us").gamesAction() }
                .disabled(!store.canAct(room) || word.trimmingCharacters(in: .whitespaces).count < 2 || word.count > 64)
            Button { store.move(room, ["type": "category", "category": .string(category)]) } label: { Text("Choose a server word for me").gamesAction(false) }.disabled(!store.canAct(room))
            Text("English letters, spaces, apostrophes and hyphens. Your person only sees the hidden pattern.").font(.caption).foregroundColor(GamesPalette.muted)
        }
    }
    private var guessingBoard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Text(room.state["category"].string.capitalized).font(.headline); Spacer(); Text("\(room.state["remaining"].int ?? 6) chances").font(.subheadline).foregroundColor(GamesPalette.rose) }
            GamesWordProgress(remaining: room.state["remaining"].int ?? 6).frame(height: 100).accessibilityHidden(true)
            Text(room.state["pattern"].string.uppercased().map(String.init).joined(separator: " "))
                .font(.system(.title, design: .monospaced).bold()).fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Word pattern: " + room.state["pattern"].string.replacingOccurrences(of: "_", with: " blank "))
            if let deadline = room.state["deadline"].double, !room.finished {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let seconds = max(0, Int(ceil(deadline / 1000 - context.date.timeIntervalSince1970)))
                    Text(seconds > 0 ? "\(seconds)s remaining" : "Time is up · waiting for the server").font(.caption.monospacedDigit()).foregroundColor(GamesPalette.rose)
                }
            }
            if !room.state["word"].string.isEmpty { Text("\(room.finished ? "The word was" : "Your secret"): \(room.state["word"].string)").font(.subheadline).privacySensitive() }
            if !room.state["hint"].string.isEmpty { Text(room.state["hint"].string).font(.subheadline).foregroundColor(GamesPalette.mint) }
            if !setter && !room.finished { keyboard }
            if setter && !room.finished { Text("Your person is guessing. Cheer them on below.").font(.subheadline).foregroundColor(GamesPalette.muted) }
        }
    }
    private var keyboard: some View {
        VStack(spacing: 10) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 6), spacing: 6) {
                ForEach(Array("abcdefghijklmnopqrstuvwxyz").map(String.init), id: \.self) { letter in
                    let guessed = room.state["guesses"].array.contains(.string(letter))
                    Button { store.move(room, ["type": "guess", "letter": .string(letter)]) } label: {
                        Text(letter.uppercased()).font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                            .background(guessed || pendingLetter == letter ? GamesPalette.lilac.opacity(0.18) : .white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                    }.disabled(!guessing || guessed).opacity(guessed ? 0.4 : 1)
                        .accessibilityLabel("Guess \(letter.uppercased())\(guessed ? ", already guessed" : pendingLetter == letter ? ", pending" : "")")
                }
            }
            Button { store.move(room, ["type": "hint"]) } label: { Label("One free hint · reveals a letter", systemImage: "lightbulb").gamesAction(false) }
                .disabled(!guessing || room.state["hintUsed"].bool)
        }
    }
}

struct GamesWordProgress: View {
    var remaining: Int
    var body: some View {
        Canvas { context, size in
            let missing = max(0, 6 - remaining)
            let radius = min(size.width / 3, size.height / 2 - 8)
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            for i in 0..<6 {
                let angle = Double(i) * .pi / 3 - .pi / 2
                let point = CGPoint(x: center.x + CGFloat(cos(angle)) * radius, y: center.y + CGFloat(sin(angle)) * radius)
                let dot = CGRect(x: point.x - 7, y: point.y - 7, width: 14, height: 14)
                context.fill(Path(ellipseIn: dot), with: .color(i < missing ? GamesPalette.rose.opacity(0.18) : GamesPalette.rose))
            }
            context.draw(Text("♡").font(.system(size: 36)).foregroundColor(GamesPalette.rose), at: center)
        }
    }
}
