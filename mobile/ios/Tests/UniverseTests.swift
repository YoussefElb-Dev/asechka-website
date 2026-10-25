import XCTest
import CryptoKit
@testable import Asechka

final class UniverseTests:XCTestCase {
    func testSharedStreakAndStackingLivesMatchWebsiteFixtures()throws {
        let url=try XCTUnwrap(Bundle(for:Self.self).url(forResource:"heart-streak-cases",withExtension:"json"))
        let cases=try XCTUnwrap(JSONSerialization.jsonObject(with:Data(contentsOf:url)) as? [[String:Any]])
        for c in cases {
            var days=c["heartDays"] as? [String:[String:Int]] ?? [:]
            var cursor=c["through"] as? String ?? ""
            while !cursor.isEmpty && cursor>="2026-10-26" {days[cursor]=["me":1];cursor=HeartLedger.previous(cursor)}
            let r=SharedHeartStreak.calculate(days,today:try XCTUnwrap(c["today"] as? String))
            let name=c["name"] as? String ?? ""
            XCTAssertEqual(r.days,c["days"] as? Int,name);XCTAssertEqual(r.lives,c["lives"] as? Int,name)
            XCTAssertEqual(r.todayComplete,c["complete"] as? Bool,name)
            XCTAssertEqual(r.protectedDays,c["protected"] as? [String] ?? [],name)
            XCTAssertEqual(r.lastResetOn,c["reset"] as? String,name)
        }
    }

    func testDeferredHeartSavesKeepOrderWithOtherEdits()async throws {
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let vault=try Vault(directory:folder,key:SymmetricKey(size:.bits256))
        defer{try? FileManager.default.removeItem(at:folder)}
        for count in 1...150 {vault.saveDeferred("outbox",[count]){_ in}}
        try vault.save("outbox",[150,999])
        await vault.drain()
        XCTAssertEqual(vault.value("outbox",as:[Int].self),[150,999],"An older background heart save must never overwrite a later post or acknowledgement")
        vault.saveDeferred("outbox",[151,999]){_ in}
        await vault.drain()
        XCTAssertEqual(vault.value("outbox",as:[Int].self),[151,999])
    }
    func testHeartCountsStreakAndEasternMidnight()throws {
        var days:[String:[String:Int]]=["2026-10-31":["me":2,"asechka":1],"2026-11-01":["me":15,"asechka":4]]
        XCTAssertEqual(HeartLedger.streak(days,who:"me",today:"2026-11-02"),2)
        XCTAssertEqual(HeartLedger.streak(days,who:"both",today:"2026-11-02"),2)
        XCTAssertEqual(HeartLedger.streak(days,who:"me",today:"2026-11-03"),0)
        XCTAssertEqual(HeartLedger.day(try XCTUnwrap(BookDates.instant("2026-11-02T04:59:59Z"))),"2026-11-01")
        let body:[String:Any]=["operationId":"saved","from":"me","day":"2026-11-01","count":80]
        HeartLedger.apply(body,to:&days,receipts:["saved"],createdAt:"");XCTAssertEqual(days["2026-11-01"]?["me"],15)
        HeartLedger.apply(body,to:&days,receipts:[],createdAt:"");XCTAssertEqual(days["2026-11-01"]?["me"],95)
    }
    func testBookProjectionKeepsRecipesPhotosRatingsAndOtherEntries() {
        var book:[String:Any]=["version":1,"recipes":[],"victories":[],"jokes":[]]
        let saved:[String:Any]=["action":"saveRecipe","id":"recipe","operationId":"photo-id","title":"Our meal","ingredients":"Rice\nWater","steps":"Cook together","note":"","tried":true,"ratings":["me":4,"asechka":5],"photo":"data:image/jpeg;base64,test"]
        BookProjection.apply(saved,to:&book,createdAt:"2026-10-22T12:00:00Z")
        BookProjection.apply(saved,to:&book,createdAt:"2026-10-22T12:00:00Z")
        var recipes=book["recipes"] as? [[String:Any]] ?? []
        XCTAssertEqual(recipes.count,1);XCTAssertEqual(recipes[0]["photoId"] as? String,"photo-id")
        XCTAssertEqual((recipes[0]["ratings"] as? [String:Int])?["asechka"],5)
        BookProjection.apply(["action":"saveJoke","id":"joke","operationId":"joke-revision","title":"Our phrase","meaning":"Only us"],to:&book,createdAt:"2026-10-22T12:00:00Z")
        BookProjection.apply(["action":"saveRecipe","id":"recipe","operationId":"new-revision","removePhoto":true],to:&book,createdAt:"2026-10-22T13:00:00Z")
        recipes=book["recipes"] as? [[String:Any]] ?? []
        XCTAssertTrue(recipes[0]["photoId"] is NSNull);XCTAssertEqual(recipes[0]["ingredients"] as? String,"Rice\nWater")
        BookProjection.apply(["action":"removeRecipe","id":"recipe","operationId":"remove"],to:&book,createdAt:"")
        XCTAssertEqual((book["recipes"] as? [[String:Any]])?.count,0)
        XCTAssertEqual((book["jokes"] as? [[String:Any]])?.count,1)
    }
    func testConversationDateAndKeepsakeEditsPreserveCoupleBeginning() throws {
        let file=try XCTUnwrap(Bundle.main.url(forResource:"keepsakes",withExtension:"json",subdirectory:"default"))
        var data=try XCTUnwrap(JSONSerialization.jsonObject(with:Data(contentsOf:file)) as? [String:Any])
        let start=(data["since"] as? [String:Any])?["startedAt"] as? String
        BookProjection.apply(["action":"saveSince","id":"since","operationId":"edit","startedTalkingAt":"2026-09-27"],to:&data,createdAt:"")
        XCTAssertEqual((data["since"] as? [String:Any])?["startedAt"] as? String,start)
        XCTAssertNil(BookDates.day("2026-02-30"));XCTAssertEqual(BookDates.dayString(try XCTUnwrap(BookDates.day("2026-09-27"))),"2026-09-27")
        let began=try XCTUnwrap(BookDates.instant("2026-10-16T19:41:00.000Z"))
        let now=try XCTUnwrap(BookDates.instant("2026-10-22T12:00:00Z"))
        XCTAssertEqual(BookDates.dayString(BookDates.next(began,yearly:false,now:now)),"2026-11-16")
        XCTAssertEqual(BookDates.dayString(BookDates.next(began,yearly:true,now:now)),"2027-10-16")
    }
    func testBundledPhotosDecodeWithoutInternet()throws {
        var previous = -1
        var used=Set<Int>()
        for index in 0..<2000 {
            let next=QuoteBackgrounds.next(index % 2 == 0 ? "Repeated quote ♡":"Quote \(index) 😀",after:previous)
            XCTAssertNotEqual(next,previous);XCTAssertTrue((0..<10).contains(next));used.insert(next);previous=next
        }
        XCTAssertEqual(used.count,10)
        for index in 0..<10 {
            let src=QuoteBackgrounds.source(index)
            let url=try XCTUnwrap(Bundle.main.url(forResource:String(src.dropFirst(7)),withExtension:nil,subdirectory:"default"),src)
            XCTAssertNotNil(CachedPhoto.thumbnail(try Data(contentsOf:url)),src)
        }
        let file=try XCTUnwrap(Bundle.main.url(forResource:"memories",withExtension:"json",subdirectory:"default"))
        let memories=try JSONDecoder().decode(Memories.self,from:Data(contentsOf:file))
        XCTAssertFalse(memories.photos.isEmpty)
        for photo in memories.photos {
            let src=try XCTUnwrap(photo.src)
            let url=try XCTUnwrap(Bundle.main.url(forResource:String(src.dropFirst(7)),withExtension:nil,subdirectory:"default"),src)
            XCTAssertNotNil(CachedPhoto.thumbnail(try Data(contentsOf:url)),src)
        }
    }
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
