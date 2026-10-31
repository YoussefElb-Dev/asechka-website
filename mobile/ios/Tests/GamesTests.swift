import XCTest
@testable import Asechka

final class GamesTests: XCTestCase {
    private func room(_ state: String = "null", status: String = "lobby", extra: String = "") throws -> GamesRoom {
        let source = """
        {"id":"room-1","code":"ABC123","game":"tictactoe","settings":{"bestOf":3,"theme":"violet"},"players":[{"actor":"asnat","ready":true,"online":true},{"actor":"youssef","ready":true,"online":false}],"status":"\(status)","seq":7,"state":\(state),"scores":[0,0],"result":null,"updatedAt":100000\(extra)}
        """
        return try JSONDecoder().decode(GamesRoom.self, from: Data(source.utf8))
    }
    @MainActor func testLobbyNullAndPlayerZeroWinAreDistinct() throws {
        let lobby = try room()
        XCTAssertTrue(lobby.state.isNull); XCTAssertFalse(lobby.finished)
        let won = try room(#"{"turn":1,"winner":0,"board":[0,0,0,null,1,null,1,null,null],"line":[0,1,2]}"#, status: "finished")
        XCTAssertTrue(won.finished); XCTAssertEqual(won.winner.int, 0)
        XCTAssertEqual(GamesRoomView.resultText(won), "Asnat wins this round ♡")
        let decoded = try JSONDecoder().decode(GamesRoom.self, from: JSONEncoder().encode(won))
        XCTAssertEqual(decoded, won)
    }
    func testSixStateShapesDecodeWithoutInventingHiddenData() throws {
        let shapes = [
            #"{"turn":0,"winner":null,"board":[null,0,1],"line":[]}"#,
            #"{"turn":1,"winner":null,"board":[null,1],"line":[0]}"#,
            #"{"turn":0,"winner":null,"board":[null,{"player":0,"king":true}],"forced":1,"legal":[{"from":1,"to":10,"captured":5}]}"#,
            #"{"turn":1,"winner":null,"phase":"guess","setter":0,"pattern":"__a__","guesses":["a"],"remaining":5,"hint":null}"#,
            #"{"turn":0,"winner":null,"phase":"placement","fleets":[[{"cells":[0,1,2,3,4]}],null],"shots":[[],[]],"hits":[[],[]],"sunk":[[],[]]}"#,
            #"{"turn":0,"winner":null,"balls":[{"id":0,"x":250,"y":250,"pocketed":false}],"groups":[null,null],"ballInHand":false,"foul":null,"lastShot":null}"#
        ]
        for source in shapes {
            let value = try room(source, status: "playing")
            XCTAssertFalse(value.finished)
            XCTAssertEqual(try JSONDecoder().decode(GamesRoom.self, from: JSONEncoder().encode(value)), value)
        }
        let hangman = try room(shapes[3], status: "playing")
        XCTAssertTrue(hangman.state["word"].isNull)
        XCTAssertFalse(String(decoding: try JSONEncoder().encode(hangman), as: UTF8.self).contains("secretHint"))
        let fleet = try room(shapes[4], status: "playing")
        XCTAssertTrue(fleet.state["fleets"][1].isNull)
        XCTAssertTrue(fleet.state["sunkShips"][0].array.isEmpty)
    }
    func testMoveEnvelopePersistsSameIDSeqAndAllActionFields() throws {
        let actions: [[String: GamesJSON]] = [
            ["type": "place", "cell": 4], ["type": "drop", "column": 6],
            ["type": "move", "from": 9, "to": 18], ["type": "guess", "letter": "a"],
            ["type": "word", "word": "hello", "category": "general"], ["type": "category", "category": "romance"], ["type": "hint"],
            ["type": "fire", "cell": 99], ["type": "fleet", "ships": .array([.object(["cells": .ints([0, 1])])])],
            ["type": "shot", "angle": .number(.pi / 2), "power": .number(0.65), "callPocket": 5],
            ["type": "place", "x": 300, "y": 250]
        ]
        for action in actions {
            let original = GamesPendingMove(id: "stable-uuid", room: "room-1", seq: 7, action: .object(action))
            let retry = try JSONDecoder().decode(GamesPendingMove.self, from: JSONEncoder().encode(original))
            XCTAssertEqual(original.message, retry.message)
            XCTAssertEqual(retry.message["id"].string, "stable-uuid")
            XCTAssertEqual(retry.message["seq"].int, 7)
            XCTAssertEqual(retry.message["action"], .object(action))
        }
    }
    func testFleetRotationBoundsAndOverlap() {
        XCTAssertEqual(GamesFleet.cells(start: 8, length: 2, vertical: false), [8, 9])
        XCTAssertNil(GamesFleet.cells(start: 9, length: 2, vertical: false))
        XCTAssertEqual(GamesFleet.cells(start: 9, length: 5, vertical: true), [9, 19, 29, 39, 49])
        XCTAssertNil(GamesFleet.cells(start: 69, length: 5, vertical: true))
        let ships = zip([0, 20, 40, 60, 80], GamesFleet.lengths).map { GamesFleet.cells(start: $0.0, length: $0.1, vertical: false)! }
        XCTAssertTrue(GamesFleet.valid(ships))
        var overlap = ships; overlap[4] = [0, 1]
        XCTAssertFalse(GamesFleet.valid(overlap))
        XCTAssertEqual(GamesFleet.coordinate(99), "J10")
    }
    func testPoolSamplesUseSecondsAndReconnectElapsedTime() throws {
        let shot = try JSONDecoder().decode(GamesJSON.self, from: Data(#"{"duration":2,"frames":[{"t":0,"balls":[{"id":0,"x":100,"y":250,"pocketed":false}]},{"t":2,"balls":[{"id":0,"x":300,"y":250,"pocketed":false}]}]}"#.utf8))
        let frames = GamesPoolFrame.read(shot)
        XCTAssertEqual(frames.count, 2); XCTAssertEqual(frames.last?.time, 2)
        XCTAssertEqual(GamesPoolFrame.sample(frames, at: 1).first?.x, 200)
        XCTAssertEqual(GamesPoolFrame.sample(frames, at: 10).first?.x, 300)
        var value = try room(#"{"turn":1,"winner":null}"#, status: "playing", extra: ",\"availableAt\":102000")
        value.state = .object(["lastShot": shot])
        XCTAssertEqual(value.poolElapsed(at: Date(timeIntervalSince1970: 101)), 1, accuracy: 0.001)
        XCTAssertGreaterThan(value.poolElapsed(at: Date(timeIntervalSince1970: 110)), 2)
    }
    func testInviteParsingAndRematchVotes() throws {
        XCTAssertEqual(GamesRoom.invitationCode(try XCTUnwrap(URL(string: "asechka://games?code=abC123"))), "ABC123")
        XCTAssertNil(GamesRoom.invitationCode(try XCTUnwrap(URL(string: "https://games?code=ABC123"))))
        XCTAssertNil(GamesRoom.invitationCode(try XCTUnwrap(URL(string: "asechka://games?code=bad%20code"))))
        let value = try room("null", extra: ",\"rematchReady\":[\"asnat\"],\"round\":2,\"seriesWinner\":0")
        XCTAssertEqual(value.rematchReady, ["asnat"]); XCTAssertEqual(value.round, 2)
        XCTAssertEqual(value.seriesWinner.int, 0)
    }
    @MainActor func testRoomsBeforeWelcomePendingReceiptAndStaleRollback() throws {
        let universe = UniverseStore(previewFixture: true)
        let store = universe.games
        store.configure(universe, active: true)
        let room = try room(#"{"turn":0,"winner":null,"board":[null,null,null,null,null,null,null,null,null]}"#, status: "playing")
        let json = try JSONDecoder().decode(GamesJSON.self, from: JSONEncoder().encode(room))
        store.receive(.object(["type": "rooms", "rooms": .array([json]), "presence": .array(["asnat"])]))
        XCTAssertFalse(store.connected); XCTAssertEqual(store.rooms.count, 1)
        store.receive(.object(["type": "welcome", "actor": "asnat", "rooms": .array([json]), "presence": .array(["asnat"])]))
        XCTAssertTrue(store.connected); XCTAssertFalse(store.presence.contains("youssef"))
        store.move(room, ["type": "place", "cell": 4])
        let pending = try XCTUnwrap(store.pending.first)
        XCTAssertEqual(universe.vault.value("games.moves:asnat", as: [GamesPendingMove].self)?.first?.id, pending.id)
        XCTAssertFalse(store.canAct(room))
        store.receive(.object(["type": "ack", "id": .string(pending.id), "seq": 8]))
        XCTAssertTrue(store.pending.isEmpty)
        store.move(room, ["type": "place", "cell": 0])
        let stale = try XCTUnwrap(store.pending.first)
        store.receive(.object(["type": "error", "id": .string(stale.id), "error": "Board changed", "code": "STALE_STATE"]))
        XCTAssertTrue(store.pending.isEmpty); XCTAssertFalse(store.canAct(room)); XCTAssertEqual(store.error, "Board changed")
        store.receive(.object(["type": "room", "room": json]))
        XCTAssertTrue(store.canAct(room))
        XCTAssertTrue(store.rooms.first?.state["board"][0].isNull == true)
    }
}
