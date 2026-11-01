import XCTest
@testable import Asechka

final class PhotoCollectionTests: XCTestCase {
    private func post(_ collection: String? = nil) throws -> Post {
        var value: [String: Any] = ["id": "photo-1", "src": "assets/photo.jpg", "caption": "An ordinary little moment"]
        if let collection { value["collection"] = collection }
        return try JSONDecoder().decode(Post.self, from: JSONSerialization.data(withJSONObject: value))
    }
    func testLegacyPhotosDefaultToMemoriesAndFiltersStayDistinct() throws {
        let legacy = try post(), photography = try post("photography")
        XCTAssertNil(legacy.collection); XCTAssertEqual(legacy.photoCollection, .memories)
        XCTAssertTrue(PhotoSection.all.includes(legacy)); XCTAssertTrue(PhotoSection.memories.includes(legacy))
        XCTAssertFalse(PhotoSection.photography.includes(legacy))
        XCTAssertTrue(PhotoSection.photography.includes(photography)); XCTAssertFalse(PhotoSection.memories.includes(photography))
        XCTAssertFalse(PhotoSection.all.includes(Post(id: "quote-1", text: "Words")))
        XCTAssertEqual(try JSONDecoder().decode(Post.self, from: JSONEncoder().encode(photography)).collection, "photography")
        XCTAssertEqual(PhotoSection.photography.defaultCollection, .photography)
    }
    func testPendingPhotoUpdatesPreserveCollectionWhenOmitted() throws {
        var memories = Memories(); memories.photos = [try post("photography")]
        func apply(_ fields: [String: Any]) throws {
            var body = fields; body["operationId"] = "stable-photo-edit"; body["action"] = "updatePhoto"; body["id"] = "photo-1"
            let change = PendingChange(id: "stable-photo-edit", path: "/api/memories", body: try JSONSerialization.data(withJSONObject: body), createdAt: "2026-10-31")
            Projection.apply(change, to: &memories)
        }
        try apply(["caption": "Updated caption"])
        XCTAssertEqual(memories.photos[0].collection, "photography")
        XCTAssertTrue(memories.photos[0].pending == true)
        try apply(["caption": "Moved to memories", "collection": "memories"])
        XCTAssertEqual(memories.photos[0].collection, "memories")
    }
    func testOldDraftsAndNewPhotographyDraftsRoundTrip() throws {
        let old = #"{"text":"A draft","note":"","date":0}"#
        let legacy = try JSONDecoder().decode(PostDraft.self, from: Data(old.utf8))
        XCTAssertNil(legacy.collection)
        var draft = legacy; draft.collection = .photography; draft.photoType = true
        let saved = try JSONDecoder().decode(PostDraft.self, from: JSONEncoder().encode(draft))
        XCTAssertEqual(saved.collection, .photography); XCTAssertEqual(saved.photoType, true)
    }
}
