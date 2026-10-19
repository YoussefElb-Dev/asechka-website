import XCTest
import CryptoKit
@testable import Asechka

final class UniverseTests:XCTestCase {
    func pending(_ body:[String:Any])throws->PendingChange {
        PendingChange(id:UUID().uuidString,path:"/api/memories",body:try JSONSerialization.data(withJSONObject:body),createdAt:"2026-10-18T12:00:00Z")
    }
    func testBothProfilesAndIdempotentComments()throws {
        var data=Memories();data.quotes=[Post(id:"first",date:"2026-10-18",text:"Our little us")]
        for actor in ["asnat","youssef"] {Projection.apply(try pending(["action":"setLike","kind":"quote","id":"first","actor":actor,"liked":true,"operationId":UUID().uuidString]),to:&data)}
        XCTAssertEqual(data.quotes[0].social?.likes,["asnat":true,"youssef":true])
        let comment=try pending(["action":"addComment","kind":"quote","id":"first","actor":"asnat","text":"♡ أحبك","operationId":"comment"])
        Projection.apply(comment,to:&data);Projection.apply(comment,to:&data)
        XCTAssertEqual(data.quotes[0].social?.comments.count,1)
        XCTAssertEqual(data.quotes[0].social?.comments[0].author,"asnat")
        Projection.apply(try pending(["action":"removeComment","kind":"quote","id":"first","actor":"asnat","commentId":"comment","operationId":"remove"]),to:&data)
        XCTAssertTrue(data.quotes[0].social?.comments.isEmpty==true)
    }
    func testOfflinePhotoThenCaptionEditRetainsConversation()throws {
        var data=Memories()
        Projection.apply(try pending(["action":"addPhoto","date":"2026-08-05","caption":"Birthday","author":"asnat","photo":"data:image/jpeg;base64,abc","operationId":"new"]),to:&data)
        XCTAssertEqual(data.photos[0].src,"assets/photos/2026/08/new.jpg")
        Projection.apply(try pending(["action":"setLike","kind":"photo","id":"new","actor":"youssef","liked":true,"operationId":"like"]),to:&data)
        Projection.apply(try pending(["action":"updatePhoto","date":"2026-08-05","caption":"A birthday to remember","id":"new","operationId":"edit"]),to:&data)
        XCTAssertEqual(data.photos[0].caption,"A birthday to remember")
        XCTAssertEqual(data.photos[0].social?.likes["youssef"],true)
        XCTAssertEqual(data.photos[0].editVersion,"local:edit")
        XCTAssertTrue(data.photos[0].imageURL.contains("id=new&v=edit"))
    }
    func testDecodingOriginalAndLegacyPosts()throws {
        let json=Data(#"{"version":1,"quotes":["a legacy quote",{"id":"quote","date":"2026-10-18","text":"A newer quote","social":{"likes":{"asnat":true}}}],"photos":[]}"#.utf8)
        let data=try JSONDecoder().decode(Memories.self,from:json)
        XCTAssertEqual(data.quotes.count,2);XCTAssertEqual(data.quotes[0].text,"a legacy quote")
        XCTAssertEqual(data.quotes[1].social?.comments,[])
    }
    func testEncryptedStorageRoundTripAndTamperDetection()throws {
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:folder)}
        let vault=try Vault(directory:folder,key:SymmetricKey(size:.bits256))
        let plain=Data("a private little draft ♡".utf8)
        try vault.write("draft",plain);XCTAssertEqual(vault.read("draft"),plain)
        let file=try XCTUnwrap(FileManager.default.contentsOfDirectory(at:folder,includingPropertiesForKeys:nil).first)
        var bytes=try Data(contentsOf:file);XCTAssertNil(String(data:bytes,encoding:.utf8))
        bytes[bytes.count-1] ^= 1;try bytes.write(to:file);XCTAssertNil(vault.read("draft"))
    }
}
