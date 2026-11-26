import XCTest
@testable import Asechka

final class FilmTests: XCTestCase {
    func testSealedFramesDecodeWithoutCaptionsOrReactions() throws {
        let json = #"{"writable":true,"rollSize":8,"rolls":[{"id":"roll","title":"Our week","actor":"asnat","createdAt":"2026-11-02T12:00:00Z","developedAt":null,"capacity":8,"canDevelopEarly":true,"shots":[{"id":"shot","actor":"youssef","createdAt":"2026-11-02T12:00:00Z"}]}]}"#
        let collection = try JSONDecoder().decode(FilmCollection.self, from: Data(json.utf8))
        XCTAssertTrue(collection.writable); XCTAssertNil(collection.rolls[0].developedAt)
        XCTAssertEqual(collection.rolls[0].rollCapacity, 8)
        XCTAssertEqual(collection.rolls[0].canDevelopEarly, true)
        XCTAssertNil(collection.rolls[0].shots[0].caption); XCTAssertNil(collection.rolls[0].shots[0].reactions)
    }
    func testLegacyRollCapacityPreserves24Shots() throws {
        let shots = (0..<12).map { "{\"id\":\"s\($0)\",\"actor\":\"asnat\",\"createdAt\":\"2026-11-02T12:00:00Z\"}" }.joined(separator: ",")
        let json = "{\"writable\":true,\"rolls\":[{\"id\":\"legacy\",\"title\":\"Old\",\"actor\":\"asnat\",\"createdAt\":\"2026-10-01T12:00:00Z\",\"developedAt\":null,\"shots\":[" + shots + "]}]}"
        let collection = try JSONDecoder().decode(FilmCollection.self, from: Data(json.utf8))
        XCTAssertEqual(collection.rolls[0].rollCapacity, 24)
    }
    func testDevelopedFrameRetainsBothReactionsAndCaption() throws {
        let json = #"{"id":"shot","actor":"asnat","createdAt":"2026-11-02T12:00:00Z","caption":"For you ♡","reactions":{"asnat":"♡","youssef":"😂"}}"#
        let shot = try JSONDecoder().decode(FilmShot.self, from: Data(json.utf8))
        XCTAssertEqual(shot.caption, "For you ♡"); XCTAssertEqual(shot.reactions?["asnat"], "♡"); XCTAssertEqual(shot.reactions?["youssef"], "😂")
    }
}
