import XCTest
@testable import Asechka

final class FilmTests: XCTestCase {
    func testSealedFramesDecodeWithoutCaptionsOrReactions() throws {
        let json = #"{"writable":true,"rolls":[{"id":"roll","title":"Our week","actor":"asnat","createdAt":"2026-11-02T12:00:00Z","developedAt":null,"shots":[{"id":"shot","actor":"youssef","createdAt":"2026-11-02T12:00:00Z"}]}]}"#
        let collection = try JSONDecoder().decode(FilmCollection.self, from: Data(json.utf8))
        XCTAssertTrue(collection.writable); XCTAssertNil(collection.rolls[0].developedAt)
        XCTAssertNil(collection.rolls[0].shots[0].caption); XCTAssertNil(collection.rolls[0].shots[0].reactions)
    }
    func testDevelopedFrameRetainsBothReactionsAndCaption() throws {
        let json = #"{"id":"shot","actor":"asnat","createdAt":"2026-11-02T12:00:00Z","caption":"For you ♡","reactions":{"asnat":"♡","youssef":"😂"}}"#
        let shot = try JSONDecoder().decode(FilmShot.self, from: Data(json.utf8))
        XCTAssertEqual(shot.caption, "For you ♡"); XCTAssertEqual(shot.reactions?["asnat"], "♡"); XCTAssertEqual(shot.reactions?["youssef"], "😂")
    }
}
