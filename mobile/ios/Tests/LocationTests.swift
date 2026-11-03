import XCTest
@testable import Asechka
final class LocationTests:XCTestCase {
    func testPausedLocationsNeverClaimToBeLive(){let json = #"{"serverTime":1900000000000,"people":[{"actor":"asnat","sharing":true,"live":false,"position":{"latitude":40,"longitude":-74,"accuracy":20,"capturedAt":1899999880000}},{"actor":"youssef","sharing":false,"live":false}]}"#;let value=try! JSONDecoder().decode(LocationSnapshot.self,from:Data(json.utf8));XCTAssertTrue(value.people[0].status(at:Date(timeIntervalSince1970:1900000000)).contains("paused"));XCTAssertEqual(value.people[1].status(at:Date()),"Not sharing")}
    func testLocationBackgroundPurposeAndCapabilityArePresent(){XCTAssertNotNil(Bundle.main.object(forInfoDictionaryKey:"NSLocationAlwaysAndWhenInUseUsageDescription"));XCTAssertTrue((Bundle.main.object(forInfoDictionaryKey:"UIBackgroundModes") as? [String])?.contains("location") == true)}
}
