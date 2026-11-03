import Foundation
import SwiftUI
import AVFoundation
import UIKit

extension UniverseStore {
    func gamesTicket() async throws -> (ticket: String, url: URL) {
        let body = try JSONSerialization.data(withJSONObject: ["actor": actor])
        let data = try await request("/api/games-session", body: body)
        let value = try JSONDecoder().decode(GamesJSON.self, from: data)
        guard !value["ticket"].string.isEmpty, let url = URL(string: value["url"].string),
              url.scheme?.lowercased() == "wss", url.host != nil, url.user == nil, url.password == nil else {
            throw ServerError(message: "Games need a secure real-time server address.", status: 503)
        }
        return (value["ticket"].string, url)
    }
}

enum GamesFeedback {
    @MainActor private static var players: [String: AVAudioPlayer] = [:]
    @MainActor static func play(_ cue: String = "move", haptic: Bool = true) {
        if haptic && UserDefaults.standard.object(forKey: "games.haptics") as? Bool != false { Touch.tap() }
        guard UserDefaults.standard.bool(forKey: "games.sound") else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            if players[cue] == nil, let url = Bundle.main.url(forResource: cue, withExtension: "wav", subdirectory: "default/games/audio") {
                players[cue] = try AVAudioPlayer(contentsOf: url)
            }
            players[cue]?.currentTime = 0; players[cue]?.play()
        } catch { /* Optional effects never prevent a game action. */ }
    }
}

/// One socket for the authenticated actor. Moves are durable before transmission and never projected optimistically.
@MainActor final class GamesStore: ObservableObject {
    @Published private(set) var rooms: [GamesRoom] = []
    @Published private(set) var presence: Set<String> = []
    @Published private(set) var connected = false
    @Published private(set) var connecting = false
    @Published private(set) var connectionText = "Connect to play together"
    @Published private(set) var pending: [GamesPendingMove] = []
    @Published private(set) var working = false
    @Published var error: String?
    @Published var activeRoomID: String?
    @Published var invitation = ""
    @Published private(set) var reaction = ""
    private weak var universe: UniverseStore?
    private var actor = ""
    private var eligible = false
    private var socket: URLSessionWebSocketTask?
    private var session: URLSession?
    private var connectionTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var generation = UUID()
    private var retry = 0
    private var commands: [String: String] = [:]
    private var commandRooms: [String: String] = [:]
    private var commandTimes: [String: Date] = [:]
    private var selectOnReply = Set<String>()
    private var syncPending = Set<String>()
    private var sentAt: [String: Date] = [:]
    private var lastReceived = Date()
    private var reactionTask: Task<Void, Never>?
    var selectedRoom: GamesRoom? { rooms.first { $0.id == activeRoomID } }
    private var pendingKey: String { "games.moves:" + actor }
    private var roomsKey: String { "games.rooms:" + actor }

    func configure(_ universe: UniverseStore, active: Bool) {
        let changed = actor != universe.actor
        self.universe = universe
        if changed {
            disconnect()
            actor = universe.actor
            rooms = universe.vault.value(roomsKey, as: [GamesRoom].self) ?? []
            pending = universe.vault.value(pendingKey, as: [GamesPendingMove].self) ?? []
            activeRoomID = universe.vault.value("games.active:" + actor, as: String.self)
            presence = []; error = nil
        }
        eligible = active && universe.unlocked && !universe.requiresCode && universe.online && ["asnat", "youssef"].contains(actor)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--preview-fixture") && ProcessInfo.processInfo.arguments.contains(where: { $0.hasPrefix("--games-play=") }) {
            eligible = false; connected = true; presence = ["asnat", "youssef"]; connectionText = "Local play preview"; return
        }
        #endif
        if eligible {
            if !connected && !connecting { connect() }
        } else {
            disconnect()
            connectionText = universe.online ? "Games paused · reconnect when you return" : "Offline · your rooms are saved"
        }
    }
    func openInvitation(_ code: String) {
        invitation = code
        if connected { join(code) }
    }
    func select(_ room: GamesRoom) {
        activeRoomID = room.id
        do { try universe?.vault.save("games.active:" + actor, room.id) } catch { self.error = error.localizedDescription }
        if connected { command("sync", ["room": .string(room.id)]) }
    }
    func reconnect() { guard eligible else { return }; disconnect(); retry = 0; connect() }
    private func disconnect() {
        generation = UUID()
        connectionTask?.cancel(); heartbeatTask?.cancel()
        connectionTask = nil; heartbeatTask = nil
        socket?.cancel(with: .goingAway, reason: nil); socket = nil
        session?.invalidateAndCancel(); session = nil
        connected = false; connecting = false; presence = []
        commands = [:]; commandRooms = [:]; commandTimes = [:]; working = false; selectOnReply = []; syncPending = []
    }
    private func connect() {
        guard eligible, !connecting, !connected, let universe else { return }
        connecting = true
        connectionText = retry == 0 ? "Opening our game room…" : "Reconnecting · attempt \(retry + 1)"
        let token = UUID(); generation = token
        connectionTask = Task { [weak self] in
            guard let self else { return }
            do {
                if self.retry > 0 { try await Task.sleep(nanoseconds: UInt64(min(30, pow(2, Double(min(self.retry, 5))))) * 1_000_000_000) }
                let ticket = try await universe.gamesTicket()
                guard !Task.isCancelled, self.generation == token, self.eligible else { return }
                let config = URLSessionConfiguration.ephemeral
                config.httpShouldSetCookies = false; config.httpCookieStorage = nil; config.urlCache = nil
                let session = URLSession(configuration: config)
                let socket = session.webSocketTask(with: ticket.url)
                socket.maximumMessageSize = 8 * 1024 * 1024
                self.session = session; self.socket = socket
                socket.resume()
                let auth = GamesJSON.object(["type": "auth", "ticket": .string(ticket.ticket)])
                let bytes = try JSONEncoder().encode(auth)
                try await socket.send(.string(String(decoding: bytes, as: UTF8.self)))
                self.lastReceived = Date()
                self.startHeartbeat(token)
                while !Task.isCancelled, self.generation == token {
                    let message = try await socket.receive()
                    let data: Data
                    switch message {
                    case .data(let bytes): data = bytes
                    case .string(let text): data = Data(text.utf8)
                    @unknown default: continue
                    }
                    guard self.generation == token else { return }
                    self.lastReceived = Date()
                    self.receive(try JSONDecoder().decode(GamesJSON.self, from: data))
                }
            } catch {
                guard !Task.isCancelled, self.generation == token else { return }
                self.failed(error, token: token)
            }
        }
    }
    private func failed(_ failure: Error, token: UUID) {
        guard generation == token else { return }
        disconnect()
        connectionText = failure.localizedDescription
        if let server = failure as? ServerError, [401, 403, 503].contains(server.status) {
            error = server.message
            return
        }
        retry += 1
        if eligible { connect() }
    }
    private func startHeartbeat(_ token: UUID) {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 5_000_000_000) } catch { return }
                guard let self, self.generation == token else { return }
                if Date().timeIntervalSince(self.lastReceived) > 45 { self.failed(URLError(.timedOut), token: token); return }
                if self.connected {
                    self.command("ping")
                    for move in self.pending where !self.syncPending.contains(move.room) {
                        if Date().timeIntervalSince(self.sentAt[move.id] ?? .distantPast) > 10 { self.transmit(move.message); self.sentAt[move.id] = Date() }
                    }
                    if self.commandTimes.values.contains(where: { Date().timeIntervalSince($0) > 20 }) {
                        // A command receipt was lost. Re-auth/list recovers the actual rooms.
                        self.failed(URLError(.timedOut), token: token); return
                    }
                }
            }
        }
    }
    private func transmit(_ message: GamesJSON) {
        guard let socket else { return }
        let token = generation
        Task { [weak self] in
            do {
                let data = try JSONEncoder().encode(message)
                // Text works with both the production Node endpoint and other RFC 6455 services.
                guard let text = String(data: data, encoding: .utf8) else { return }
                try await socket.send(.string(text))
            } catch { self?.failed(error, token: token) }
        }
    }
    @discardableResult private func command(_ type: String, _ fields: [String: GamesJSON] = [:], selecting: Bool = false) -> String? {
        guard connected else { return nil }
        let id = UUID().uuidString.lowercased()
        var body = fields; body["type"] = .string(type); body["id"] = .string(id)
        commands[id] = type; commandTimes[id] = Date()
        if !fields["room", default: .null].string.isEmpty { commandRooms[id] = fields["room", default: .null].string }
        if selecting { selectOnReply.insert(id) }
        working = commands.values.contains { ["create", "join", "ready", "start", "rematch"].contains($0) }
        transmit(.object(body))
        return id
    }
    func refresh() { command("list") }
    func create(_ kind: GamesKind, settings: GamesJSON) {
        guard !working else { return }; error = nil
        command("create", ["game": .string(kind.rawValue), "settings": settings], selecting: true)
    }
    func join(_ value: String) {
        let code = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !code.isEmpty, code.count <= 16, !working else { return }
        invitation = code; error = nil
        command("join", ["code": .string(code)], selecting: true)
    }
    func ready(_ room: GamesRoom) {
        guard let index = room.player(actor), !working else { return }
        command("ready", ["room": .string(room.id), "ready": .bool(!room.players[index].ready)])
    }
    func start(_ room: GamesRoom) { guard !working else { return }; command("start", ["room": .string(room.id)]) }
    func rematch(_ room: GamesRoom) { guard !working else { return }; command("rematch", ["room": .string(room.id)]) }
    func react(_ room: GamesRoom, emoji: String) { command("react", ["room": .string(room.id), "emoji": .string(emoji)]) }
    func hasPending(_ room: GamesRoom) -> Bool { pending.contains { $0.room == room.id } }
    func canAct(_ room: GamesRoom) -> Bool { connected && !syncPending.contains(room.id) && room.status == "playing" && !room.finished && !hasPending(room) && room.player(actor) != nil }
    func myTurn(_ room: GamesRoom) -> Bool { canAct(room) && room.player(actor) == room.state["turn"].int }
    func move(_ room: GamesRoom, _ action: [String: GamesJSON]) {
        guard canAct(room), let universe else { return }
        let move = GamesPendingMove(id: UUID().uuidString.lowercased(), room: room.id, seq: room.seq, action: .object(action))
        let next = pending + [move]
        do { try universe.vault.save(pendingKey, next) }
        catch { self.error = "Could not save your move: " + error.localizedDescription; return }
        pending = next; error = nil; sentAt[move.id] = Date(); transmit(move.message)
        GamesFeedback.play(room.game == "connect4" ? "drop" : room.game == "pool" ? "collision" : room.game == "battleship" ? "splash" : "move")
    }
    func retryPending() {
        guard connected else { reconnect(); return }
        for move in pending { syncPending.insert(move.room); command("sync", ["room": .string(move.room)]) }
    }
    private func settle(_ id: String) {
        commands.removeValue(forKey: id); commandTimes.removeValue(forKey: id)
        commandRooms.removeValue(forKey: id)
        selectOnReply.remove(id)
        working = commands.values.contains { ["create", "join", "ready", "start", "rematch"].contains($0) }
        guard pending.contains(where: { $0.id == id }) else { return }
        pending.removeAll { $0.id == id }; sentAt.removeValue(forKey: id)
        do { try universe?.vault.save(pendingKey, pending) } catch { self.error = error.localizedDescription }
    }
    private func saveRooms() {
        do { try universe?.vault.save(roomsKey, rooms) } catch { self.error = error.localizedDescription }
    }
    func receive(_ event: GamesJSON) {
        let id = event["id"].string
        switch event["type"].string {
        case "welcome":
            guard event["actor"].string == actor else { error = "The game profile did not match. Reconnect with your profile."; disconnect(); return }
            connected = true; connecting = false; retry = 0; connectionText = "Connected · live with your person"
            updateRooms(event)
            command("list")
            for room in Set(pending.map(\.room) + [activeRoomID].compactMap { $0 }) {
                syncPending.insert(room); command("sync", ["room": .string(room)])
            }
            if !invitation.isEmpty { join(invitation) }
        case "rooms":
            // Presence announcements can precede welcome during authentication.
            updateRooms(event); if !id.isEmpty { settle(id) }
        case "room":
            do {
                let room = try event["room"].decode(GamesRoom.self)
                let old = rooms.first { $0.id == room.id }
                if old == nil || room.seq >= old!.seq {
                    rooms.removeAll { $0.id == room.id }; rooms.insert(room, at: 0); saveRooms()
                }
                if old?.finished == false && room.finished { GamesFeedback.play(room.winner.int == room.player(actor) ? "win" : "lose", haptic: false) }
                if !id.isEmpty { settle(id) }
                if syncPending.remove(room.id) != nil {
                    for move in pending where move.room == room.id { transmit(move.message); sentAt[move.id] = Date() }
                }
            } catch { self.error = "Could not read this room. Reconnect to sync it." }
        case "ack":
            // Room broadcasts may precede or follow the acknowledgement.
            let selected = selectOnReply.contains(id)
            let selectedID = event["room"].string
            settle(id)
            if selected {
                if !selectedID.isEmpty { activeRoomID = selectedID; invitation = ""; try? universe?.vault.save("games.active:" + actor, selectedID) }
                command("list")
            }
        case "error":
            let move = pending.first { $0.id == id }
            let code = event["code"].string
            error = event["error"].string.isEmpty ? "That action could not be completed." : event["error"].string
            if let move { syncPending.insert(move.room); command("sync", ["room": .string(move.room)]) }
            if commands[id] == "sync", let roomID = commandRooms[id] {
                syncPending.remove(roomID)
                if ["NOT_FOUND", "FORBIDDEN"].contains(code) {
                    for item in pending.filter({ $0.room == roomID }) { settle(item.id) }
                }
            }
            // STALE_STATE is terminal for this ID. The next deliberate action uses the synchronized seq.
            settle(id)
            if code == "AUTH" || code == "UNAUTHORIZED" { disconnect() }
        case "pong": settle(id)
        case "reaction":
            guard event["room"].string == activeRoomID else { return }
            reaction = Post.name(event["actor"].string) + " " + event["emoji"].string
            reactionTask?.cancel()
            reactionTask = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: 3_000_000_000) } catch { return }
                self?.reaction = ""
            }
        default: break
        }
    }
    private func updateRooms(_ event: GamesJSON) {
        presence = Set(event["presence"].array.map(\.string))
        do {
            let incoming = try event["rooms"].decode([GamesRoom].self)
            rooms = incoming.map { room in
                if let old = rooms.first(where: { $0.id == room.id }), old.seq > room.seq { return old }
                return room
            }
            saveRooms()
        } catch { self.error = "Could not read your game rooms. Try reconnecting." }
    }
}
