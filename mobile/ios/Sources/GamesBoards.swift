import SwiftUI

struct GamesTicTacToeView: View {
    @Environment(\.gamesBoardLimit) private var boardLimit
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
    @Environment(\.accessibilityReduceMotion) private var systemReduced
    @AppStorage("games.reduceMotion") private var reduced = false
    private var pendingCell: Int? { store.pending.first { $0.room == room.id }?.action["cell"].int }
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 3), spacing: 0) {
            ForEach(0..<9, id: \.self) { cell in
                Button { store.move(room, ["type": "place", "cell": .int(cell)]) } label: {
                    mark(cell).frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fit)
                        .contentShape(Rectangle())
                        .animation(systemReduced || reduced ? nil : .spring(response: 0.3, dampingFraction: 0.72), value: room.state["board"][cell])
                        .background(highlight(cell) ? GamesPalette.lilac.opacity(0.09) : Color.clear, in: RoundedRectangle(cornerRadius: 20))
                }.buttonStyle(SoftPress()).disabled(!store.myTurn(room) || !room.state["board"][cell].isNull)
                    .accessibilityLabel("Row \(cell / 3 + 1), column \(cell % 3 + 1), \(valueLabel(cell))")
                    .accessibilityIdentifier("games.tictactoe.\(cell)")
            }
        }.background(GamesSprite("tictactoe/board")).clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay { winningLine }.frame(maxWidth: min(480, boardLimit)).frame(maxWidth: .infinity)
    }
    @ViewBuilder private func mark(_ cell: Int) -> some View {
        let value = room.state["board"][cell].int
        let pending = value == nil && pendingCell == cell
        let player = value ?? (pending ? room.player(universe.actor) : nil)
        if let player {
            GamesSprite(player == 0 ? "tictactoe/x" : "tictactoe/o").scaledToFit().padding(24).opacity(pending ? 0.4 : 1)
                .transition(.scale(scale: 0.6).combined(with: .opacity))
        } else { Color.clear }
    }
    private func highlight(_ cell: Int) -> Bool { room.state["line"].array.contains(.int(cell)) || pendingCell == cell }
    private var winningLine: some View {
        GeometryReader { geometry in
            let cells = room.state["line"].array.compactMap(\.int)
            if let first = cells.first, let last = cells.last {
                Path { path in
                    path.move(to: CGPoint(x: (CGFloat(first % 3) + 0.5) * geometry.size.width / 3, y: (CGFloat(first / 3) + 0.5) * geometry.size.height / 3))
                    path.addLine(to: CGPoint(x: (CGFloat(last % 3) + 0.5) * geometry.size.width / 3, y: (CGFloat(last / 3) + 0.5) * geometry.size.height / 3))
                }.stroke(Color(red: 0.67, green: 0.57, blue: 0.79).opacity(0.65), style: StrokeStyle(lineWidth: 4, lineCap: .round))
            }
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
    private func valueLabel(_ cell: Int) -> String {
        if pendingCell == cell { return "move pending" }
        guard let player = room.state["board"][cell].int else { return "empty" }
        return player == 0 ? "cross" : "circle"
    }
}

struct GamesConnectFourView: View {
    @Environment(\.gamesBoardLimit) private var boardLimit
    @Environment(\.gamesCompact) private var compact
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
            if !compact { HStack(spacing: 3) {
                ForEach(0..<7, id: \.self) { column in
                    Button { drop(column) } label: { VStack(spacing: 2) { Image(systemName: "arrow.down"); Text("\(column + 1)").font(.caption2) }.frame(maxWidth: .infinity, minHeight: 44) }
                        .disabled(!canDrop(column)).accessibilityLabel("Drop disc into column \(column + 1)")
                        .accessibilityIdentifier("games.connect4.column.\(column)")
                }
            } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
                ForEach(0..<42, id: \.self) { cell in
                    Button { drop(cell % 7) } label: { disc(cell) }.disabled(!canDrop(cell % 7))
                        .accessibilityLabel("Row \(cell / 7 + 1), column \(cell % 7 + 1), \(cellLabel(cell)). Drop in this column")
                }
            }.padding(12).background(GamesSprite("connect4/board"))
                .clipShape(RoundedRectangle(cornerRadius: 20))
        }.frame(maxWidth: min(600, boardLimit)).frame(maxWidth: .infinity)
    }
    private func canDrop(_ column: Int) -> Bool { store.myTurn(room) && room.state["board"][column].isNull }
    private func drop(_ column: Int) { store.move(room, ["type": "drop", "column": .int(column)]) }
    private func disc(_ cell: Int) -> some View {
        let player = room.state["board"][cell].int
        let pending = player == nil && pendingCell == cell
        return ZStack {
            Circle().fill(Color(red: 0.96, green: 0.95, blue: 0.99)).shadow(color: Color(red: 0.46, green: 0.35, blue: 0.61).opacity(0.2), radius: 2, y: -2)
            if player != nil || pending {
                GamesSprite((player ?? room.player(universe.actor) ?? 0) == 0 ? "connect4/rose" : "connect4/mint").scaledToFit().padding(1).opacity(pending ? 0.4 : 1)
                    .overlay(Circle().stroke(room.state["line"].array.contains(.int(cell)) ? .white : .white.opacity(0.08), lineWidth: 2))
                    .transition(.offset(y: -160).combined(with: .opacity))
            }
        }.aspectRatio(1, contentMode: .fit).contentShape(Rectangle())
            .animation(systemReduced || reduced ? nil : .spring(response: 0.45, dampingFraction: 0.68), value: room.state["board"][cell])
    }
    private func cellLabel(_ cell: Int) -> String { room.state["board"][cell].int.map { "player \($0 + 1)" } ?? (pendingCell == cell ? "move pending" : "empty") }
}

struct GamesCheckersView: View {
    @Environment(\.gamesBoardLimit) private var boardLimit
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
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 8), spacing: 0) {
                ForEach(0..<64, id: \.self) { cell in
                    Button { select(cell) } label: { square(cell) }
                        .buttonStyle(.plain).disabled(replayStep != nil || !store.myTurn(room) || !interactive(cell))
                        .accessibilityLabel(label(cell)).accessibilityIdentifier("games.checkers.\(cell)")
                }
            }.background(GamesSprite("checkers/board")).padding(8)
                .background(LinearGradient(colors: [Color(red: 0.88, green: 0.78, blue: 0.80), Color(red: 0.72, green: 0.61, blue: 0.66)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 16))
            if let source { Text("Selected: row \(source / 8 + 1), column \(source % 8 + 1)").font(.caption).foregroundColor(GamesPalette.lilac) }
            if !moves.isEmpty { replayControls }
        }.frame(maxWidth: min(600, boardLimit)).frame(maxWidth: .infinity)
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
        return ZStack {
            Color.clear
            if let player = piece["player"].int {
                GamesSprite("checkers/\(player == 0 ? "rose" : "mint")\(piece["king"].bool ? "-king" : "")").scaledToFit().padding(4)
            }
            if replayStep == nil && destination(cell) { Circle().fill(GamesPalette.mint.opacity(0.5)).padding(13) }
            if replayStep == nil && (source == cell || pendingTo == cell) { Rectangle().stroke(GamesPalette.theme(room), lineWidth: 3) }
        }.aspectRatio(1, contentMode: .fit).contentShape(Rectangle())
    }
    private func label(_ cell: Int) -> String {
        let piece = displayBoard.indices.contains(cell) ? displayBoard[cell] : GamesJSON.null
        let occupant = piece["player"].int.map { "player \($0 + 1) \(piece["king"].bool ? "king" : "piece")" } ?? "empty"
        return "Row \(cell / 8 + 1), column \(cell % 8 + 1), \(occupant)\(destination(cell) ? ", legal destination" : "")\(source == cell ? ", selected" : "")"
    }
}

struct GamesHangmanView: View {
    @Environment(\.gamesCompact) private var compact
    @ObservedObject var store: GamesStore
    var room: GamesRoom
    @EnvironmentObject private var universe: UniverseStore
    @State private var word = ""
    @State private var category = "romance"
    @State private var personal = false
    private let categories = ["romance", "movies", "animals", "science", "geography", "food", "technology", "general"]
    private var setter: Bool { room.player(universe.actor) == room.state["setter"].int }
    private var guessing: Bool { store.canAct(room) && !setter && room.state["phase"].string == "guess" }
    private var pendingLetter: String { store.pending.first { $0.room == room.id }?.action["letter"].string ?? "" }
    private var hintPending: Bool { store.pending.contains { $0.room == room.id && $0.action["type"].string == "hint" } }
    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 18) {
            if room.state["phase"].string == "choose" {
                if setter { choose }
                else { GamesCover(kind: .hangman).aspectRatio(1.5, contentMode: .fit); Text("A secret is on its way. Your keyboard appears when your person chooses a word.").foregroundColor(GamesPalette.muted) }
            } else { guessingBoard }
        }.gamesPanel().onChange(of: room.round) { _ in word = ""; personal = false }
    }
    private var choose: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("Category", selection: $category) { ForEach(categories, id: \.self) { Text($0.capitalized).tag($0) } }
                .pickerStyle(.menu)
            TextField("Your secret English word or phrase", text: $word).textInputAutocapitalization(.never).autocorrectionDisabled(false)
                .padding(14).background(.black.opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityIdentifier("games.hangman.word")
            Toggle("Personal reference", isOn: $personal).accessibilityIdentifier("games.hangman.personal")
            if personal { Text("Only letter hints. AI and descriptive clues are turned off for this word.").font(.caption).foregroundColor(GamesPalette.muted) }
            Button { store.move(room, ["type": "word", "word": .string(word), "category": .string(category), "personal": .bool(personal)]); word = "" } label: { Text("Keep this word between us").gamesAction() }
                .disabled(!store.canAct(room) || word.trimmingCharacters(in: .whitespaces).count < 2 || word.count > 64)
            Button { store.move(room, ["type": "category", "category": .string(category)]) } label: { Text("Choose a server word for me").gamesAction(false) }.disabled(!store.canAct(room))
            Text("English letters, spaces, apostrophes and hyphens. Your person only sees the hidden pattern.").font(.caption).foregroundColor(GamesPalette.muted)
        }
    }
    private var guessingBoard: some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 16) {
            HStack { Text(room.state["personal"].bool ? "Personal reference" : room.state["category"].string.capitalized).font(.headline); Spacer(); Text("\(room.state["remaining"].int ?? 6) \((room.state["remaining"].int ?? 6) == 1 ? "chance" : "chances")").font(.subheadline).foregroundColor(GamesPalette.rose) }
            GamesWordProgress(remaining: room.state["remaining"].int ?? 6).aspectRatio(1.5, contentMode: .fit).frame(maxHeight: compact ? 110 : nil).accessibilityHidden(true)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 28, maximum: 34), spacing: 4)], alignment: .center, spacing: 5) {
                let letters = Array(room.state["pattern"].string.uppercased()).map(String.init)
                ForEach(letters.indices, id: \.self) { index in
                    Text(letters[index]).font(.system(.headline, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.6)
                        .frame(maxWidth: .infinity).frame(height: 42)
                        .background { if letters[index] != " " { GamesSprite("hangman/key") } }
                }
            }.accessibilityElement(children: .ignore)
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
                            .foregroundColor(guessed && room.state["pattern"].string.contains(letter) ? GamesPalette.mint : guessed ? GamesPalette.rose : GamesPalette.ink)
                            .background(GamesSprite("hangman/key"))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(pendingLetter == letter ? GamesPalette.lilac : .clear, lineWidth: 2))
                    }.disabled(!guessing || guessed).opacity(guessed ? 0.4 : 1)
                        .accessibilityLabel("Guess \(letter.uppercased())\(guessed ? ", already guessed" : pendingLetter == letter ? ", pending" : "")")
                }
            }
            Button { store.move(room, ["type": "hint"]) } label: {
                HStack {
                    if hintPending { ProgressView().tint(GamesPalette.lilac); Text(!store.connected ? "Waiting for connection…" : room.state["personal"].bool ? "Revealing a letter…" : "Thinking of a hint…") }
                    else { Label("One free hint · reveals a letter", systemImage: "lightbulb") }
                }.gamesAction(false)
            }
                .disabled(!guessing || room.state["hintUsed"].bool)
        }
    }
}

struct GamesWordProgress: View {
    var remaining: Int
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                GamesSprite("hangman/book")
                VStack(spacing: 12) {
                    ForEach(0..<5, id: \.self) { _ in Capsule().fill(Color(red: 0.79, green: 0.72, blue: 0.87)).frame(height: 3) }
                }.frame(width: geometry.size.width * 0.28).position(x: geometry.size.width * 0.28, y: geometry.size.height * 0.48)
                GamesSprite("common/heart").frame(width: geometry.size.width * 0.16, height: geometry.size.width * 0.16)
                    .opacity(remaining == 0 ? 0.25 : 1).position(x: geometry.size.width * 0.70, y: geometry.size.height * 0.43)
                HStack(spacing: geometry.size.width * 0.015) { ForEach(0..<6, id: \.self) { index in Circle().fill(index < remaining ? GamesPalette.rose : GamesPalette.rose.opacity(0.15)).frame(width: geometry.size.width * 0.025, height: geometry.size.width * 0.025) } }
                    .frame(width: geometry.size.width * 0.225, height: geometry.size.width * 0.025)
                    .position(x: geometry.size.width * 0.70, y: geometry.size.height * 0.69)
            }
        }
    }
}
