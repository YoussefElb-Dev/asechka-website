import Foundation

/// JSON preserves unknown rule fields without duplicating the authoritative rules on iOS.
enum GamesJSON: Codable, Equatable {
    case null, bool(Bool), number(Double), string(String), array([GamesJSON]), object([String: GamesJSON])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([GamesJSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: GamesJSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
    subscript(_ key: String) -> GamesJSON { object[key] ?? .null }
    subscript(_ index: Int) -> GamesJSON { array.indices.contains(index) ? array[index] : .null }
    var object: [String: GamesJSON] { if case .object(let v) = self { return v }; return [:] }
    var array: [GamesJSON] { if case .array(let v) = self { return v }; return [] }
    var string: String { if case .string(let v) = self { return v }; return "" }
    var double: Double? { if case .number(let v) = self { return v }; return nil }
    var int: Int? { guard let v = double, v.isFinite, v >= Double(Int.min), v < Double(Int.max) else { return nil }; return Int(v) }
    var bool: Bool { if case .bool(let v) = self { return v }; return false }
    var isNull: Bool { self == .null }
    static func int(_ v: Int) -> GamesJSON { .number(Double(v)) }
    static func ints(_ v: [Int]) -> GamesJSON { .array(v.map { .int($0) }) }
    func decode<T: Decodable>(_ type: T.Type) throws -> T { try JSONDecoder().decode(type, from: JSONEncoder().encode(self)) }
}
extension GamesJSON: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByBooleanLiteral {
    init(stringLiteral value: String) { self = .string(value) }
    init(integerLiteral value: Int) { self = .int(value) }
    init(booleanLiteral value: Bool) { self = .bool(value) }
}

enum GamesKind: String, CaseIterable, Identifiable, Codable {
    case pool, tictactoe, hangman, connect4, checkers, battleship, drawing
    var id: String { rawValue }
    var title: String {
        switch self {
        case .pool: return "Velvet Eight"
        case .tictactoe: return "Three Little Marks"
        case .hangman: return "Between the Letters"
        case .connect4: return "Four in Orbit"
        case .checkers: return "Crown & Capture"
        case .drawing: return "Scribble Together"
        case .battleship: return "Midnight Fleet"
        }
    }
    var subtitle: String {
        switch self {
        case .pool: return "A quiet table. A little friendly rivalry."
        case .tictactoe: return "Your move, my favorite opponent."
        case .hangman: return "A secret word, just between us."
        case .connect4: return "Find a line in our little universe."
        case .checkers: return "Small steps. Beautiful strategy."
        case .drawing: return "A little doodle. A very good guess."
        case .battleship: return "Two captains under the same stars."
        }
    }
    var symbol: String {
        switch self {
        case .pool: return "circle.circle.fill"
        case .tictactoe: return "number"
        case .hangman: return "textformat.abc"
        case .connect4: return "circle.grid.3x3.fill"
        case .checkers: return "crown.fill"
        case .drawing: return "paintbrush.pointed.fill"
        case .battleship: return "sailboat.fill"
        }
    }
    var classic: String {
        switch self {
        case .pool: return "8-ball pool"
        case .tictactoe: return "Tic-tac-toe"
        case .hangman: return "Hangman"
        case .connect4: return "Connect four"
        case .checkers: return "American checkers"
        case .drawing: return "Draw & guess"
        case .battleship: return "Battleship"
        }
    }
    var rules: String {
        switch self {
        case .pool:
            return "Aim by dragging on the table or use the angle control, then set power. Angles run clockwise from right. Only the eight requires a called pocket: the numbered pockets run clockwise, 1 top-left, 2 top-middle, 3 top-right, 4 bottom-right, 5 bottom-middle, 6 bottom-left (sent as indices 0–5).\n\nOn the break, pocket a ball or drive four object balls to cushions. Groups stay open after the break; an eight on the break is spotted. The first legal numbered ball potted after the break assigns solids and stripes. A legal pot of your group keeps the turn.\n\nContact your own group first (any numbered ball except the eight on an open table); a pocket or cushion contact must follow. Missing, wrong contact, scratching or an illegal break gives the opponent full-table ball in hand. Tap a clear spot or use X/Y controls and confirm placement.\n\nClear your group before shooting the eight: eligibility is checked before the shot. Potting your last group ball and the eight together loses. The eight must enter the called pocket without a foul. Cue-ball tip position adds follow, draw and side spin. There is no jump, rerack or kitchen option. The server resolves the shot; native sampled playback runs until the table is available."
        case .tictactoe:
            return "Take turns placing a spark on an empty square. Complete a row, column or diagonal of three to win. A full board without a line is a draw. Choose a single round, best of three or best of five before creating the room. Rematch continues the series."
        case .hangman:
            return "The setter writes a secret English word and category, or chooses a category for a server word. The other player guesses one letter at a time. Each wrong guess uses a chance. Reveal the pattern before chances run out. One free hint per round gives a clue and reveals a letter. A timed room also has a server deadline. The setter can see the secret; the guessing player cannot. Rematches swap setter."
        case .connect4:
            return "Choose a column to drop your disc into its lowest empty space. Connect four horizontally, vertically or diagonally. A full board without a line is a draw."
        case .checkers:
            return "American checkers on the dark squares. Select a piece, then a highlighted destination. Captures are mandatory; continue with the same piece when another jump is available. Ordinary pieces move and capture forward, kings in both directions. Promotion ends the turn. Win when your opponent has no pieces or legal moves. Threefold repetition or 80 quiet half-moves is a draw."
        case .drawing:
            return "Take turns choosing a secret word and drawing it. Your partner guesses against the clock. Fast guesses earn more points, and the artist earns points too. Letter hints appear as time passes. Use the pen, eraser, bucket fill, brush sizes, undo and clear. Each round gives both of you a turn to draw. Most points wins. Custom words, rounds and drawing time can be chosen before creating the room."
        case .battleship:
            return "Place ships of lengths 5, 4, 3, 3 and 2 on your private 10×10 chart. Select a ship, rotate it, then tap its starting cell; ships must stay in bounds and cannot overlap. Confirm the entire fleet to lock it in. Once both fleets are ready, take turns firing on the opponent’s chart. Red marks hits, small dots mark misses. Sink all five ships to win. Your opponent’s unsunk fleet stays private."
        }
    }
}

struct GamesPlayer: Codable, Equatable {
    var actor: String
    var ready: Bool
    var online: Bool
}
struct GamesRoom: Codable, Identifiable, Equatable {
    var id: String
    var code: String
    var game: String
    var settings: GamesJSON
    var players: [GamesPlayer]
    var status: String
    var seq: Int
    var state: GamesJSON
    var scores: [Int]
    var result: GamesJSON
    var seriesWinner: GamesJSON
    var rematchReady: [String]
    var round: Int
    var availableAt: Double
    var updatedAt: GamesJSON

    enum CodingKeys: String, CodingKey { case id, code, game, settings, players, status, seq, state, scores, result, seriesWinner, rematchReady, round, availableAt, updatedAt }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        code = try c.decode(String.self, forKey: .code)
        game = try c.decode(String.self, forKey: .game)
        settings = try c.decodeIfPresent(GamesJSON.self, forKey: .settings) ?? .object([:])
        players = try c.decodeIfPresent([GamesPlayer].self, forKey: .players) ?? []
        status = try c.decode(String.self, forKey: .status)
        seq = try c.decode(Int.self, forKey: .seq)
        state = try c.decodeIfPresent(GamesJSON.self, forKey: .state) ?? .null
        scores = try c.decodeIfPresent([Int].self, forKey: .scores) ?? [0, 0]
        result = try c.decodeIfPresent(GamesJSON.self, forKey: .result) ?? .null
        seriesWinner = try c.decodeIfPresent(GamesJSON.self, forKey: .seriesWinner) ?? .null
        rematchReady = try c.decodeIfPresent([String].self, forKey: .rematchReady) ?? []
        round = try c.decodeIfPresent(Int.self, forKey: .round) ?? 1
        availableAt = try c.decodeIfPresent(Double.self, forKey: .availableAt) ?? 0
        updatedAt = try c.decodeIfPresent(GamesJSON.self, forKey: .updatedAt) ?? .null
    }
    var kind: GamesKind? { GamesKind(rawValue: game) }
    var finished: Bool { status == "finished" || !state["winner"].isNull }
    var winner: GamesJSON { result.isNull ? state["winner"] : result }
    func player(_ actor: String) -> Int? { players.firstIndex { $0.actor == actor } }
    var invitation: URL? {
        var c = URLComponents(); c.scheme = "asechka"; c.host = "games"
        c.queryItems = [URLQueryItem(name: "code", value: code)]
        return c.url
    }
    func poolElapsed(at date: Date) -> Double {
        let duration = state["lastShot"]["duration"].double ?? 0
        let start = availableAt > 0 ? availableAt / 1000 - duration : (updatedAt.double ?? 0) / 1000
        return max(0, date.timeIntervalSince1970 - start)
    }
    static func invitationCode(_ url: URL) -> String? {
        guard url.scheme?.lowercased() == "asechka", url.host?.lowercased() == "games",
              let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { return nil }
        let code = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !code.isEmpty, code.count <= 16, code.allSatisfy({ $0.isASCII && $0.isLetter || $0.isNumber && $0.isASCII }) else { return nil }
        return code
    }
}

struct GamesPendingMove: Codable, Equatable, Identifiable {
    var id: String
    var room: String
    var seq: Int
    var action: GamesJSON
    var message: GamesJSON { .object(["type": "move", "id": .string(id), "room": .string(room), "seq": .int(seq), "action": action]) }
}

enum GamesCheckersReplay {
    static func board(moves: [GamesJSON], through step: Int) -> [GamesJSON] {
        var board = Array(repeating: GamesJSON.null, count: 64)
        for cell in 0..<64 where (cell / 8 + cell % 8) % 2 == 1 && (cell / 8 < 3 || cell / 8 > 4) {
            board[cell] = .object(["player": .int(cell / 8 < 3 ? 0 : 1), "king": .bool(false)])
        }
        for move in moves.prefix(max(0, step)) {
            guard let from = move["from"].int, let to = move["to"].int,
                  board.indices.contains(from), board.indices.contains(to) else { break }
            var piece = board[from].object
            board[from] = .null
            if move["promoted"].bool { piece["king"] = .bool(true) }
            board[to] = .object(piece)
            if let captured = move["captured"].int, board.indices.contains(captured) { board[captured] = .null }
        }
        return board
    }
    static func notation(_ move: GamesJSON) -> String {
        let from = move["from"].int ?? 0, to = move["to"].int ?? 0
        let start = from / 8 * 4 + from % 8 / 2 + 1
        let end = to / 8 * 4 + to % 8 / 2 + 1
        return "\(start)\(move["captured"].isNull ? "–" : "×")\(end)\(move["promoted"].bool ? " ♛" : "")"
    }
}

enum GamesFleet {
    static let lengths = [5, 4, 3, 3, 2]
    static func cells(start: Int, length: Int, vertical: Bool) -> [Int]? {
        guard (0..<100).contains(start), length > 0 else { return nil }
        let row = start / 10, column = start % 10
        guard vertical ? row + length <= 10 : column + length <= 10 else { return nil }
        return (0..<length).map { start + $0 * (vertical ? 10 : 1) }
    }
    static func valid(_ ships: [[Int]]) -> Bool {
        guard ships.count == lengths.count else { return false }
        var used = Set<Int>()
        for (index, cells) in ships.enumerated() {
            guard cells.count == lengths[index], let first = cells.first else { return false }
            let horizontal = Self.cells(start: first, length: cells.count, vertical: false)
            let vertical = Self.cells(start: first, length: cells.count, vertical: true)
            guard cells == horizontal || cells == vertical else { return false }
            for cell in cells { guard used.insert(cell).inserted else { return false } }
        }
        return true
    }
    static func coordinate(_ cell: Int) -> String { "\(String(UnicodeScalar(65 + max(0, min(9, cell / 10)))!))\(cell % 10 + 1)" }
}

struct GamesBall: Equatable, Identifiable {
    var q: [Double] = [1,0,0,0]
    var id: Int
    var x: Double
    var y: Double
    var pocketed: Bool
    init?(_ value: GamesJSON) {
        guard let id = value["id"].int, let x = value["x"].double, let y = value["y"].double, x.isFinite, y.isFinite else { return nil }
        self.id = id; self.x = x; self.y = y; pocketed = value["pocketed"].bool
        let rotation=value["q"].array.compactMap(\.double);if rotation.count==4 {q=rotation}
    }
}
struct GamesPoolFrame: Equatable {
    var time: Double
    var balls: [GamesBall]
    static func read(_ shot: GamesJSON) -> [GamesPoolFrame] {
        var result: [GamesPoolFrame] = []
        for (index, frame) in shot["frames"].array.enumerated() {
            let values: [GamesJSON] = frame.array.isEmpty ? frame["balls"].array : frame.array
            let balls: [GamesBall] = values.compactMap { GamesBall($0) }
            guard !balls.isEmpty else { continue }
            // The service timestamps frames in seconds (t), or milliseconds (time/ms).
            let seconds: Double
            if let time = frame["t"].double { seconds = time }
            else if let milliseconds = frame["time"].double { seconds = milliseconds / 1000 }
            else if let milliseconds = frame["ms"].double { seconds = milliseconds / 1000 }
            else { seconds = Double(index) / 30 }
            result.append(GamesPoolFrame(time: max(0, seconds), balls: balls))
        }
        return result.sorted { $0.time < $1.time }
    }
    static func sample(_ frames: [GamesPoolFrame], at time: Double) -> [GamesBall] {
        guard let first = frames.first else { return [] }
        guard let upper = frames.firstIndex(where: { $0.time > time }) else { return frames.last?.balls ?? [] }
        guard upper > 0 else { return first.balls }
        let a = frames[upper - 1], b = frames[upper]
        let fraction = min(1, max(0, (time - a.time) / max(0.001, b.time - a.time)))
        return a.balls.map { ball in
            guard let next = b.balls.first(where: { $0.id == ball.id }), !ball.pocketed else { return ball }
            var result = ball; result.x += (next.x - ball.x) * fraction; result.y += (next.y - ball.y) * fraction
            result.q = GamesPoolVisual.blend(ball.q,next.q,fraction)
            result.pocketed = next.pocketed && fraction >= 1
            return result
        }
    }
}
