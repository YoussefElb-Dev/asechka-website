import XCTest
final class LocationVaultJourneyTests:XCTestCase {
    func testHomeChoicesAndLocationFitAndSharingNeedsConsent(){
        let app=XCUIApplication();app.launchArguments=["--preview-fixture"];app.launch()
        XCTAssertTrue(app.buttons["Time vault"].waitForExistence(timeout:15))
        let map=app.buttons["Open our location map"]
        for _ in 0..<6 { if map.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(map.waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["Secret vocab"].exists)
        let home=XCTAttachment(screenshot:app.screenshot());home.name="Home-with-location-and-vault";home.lifetime = .keepAlways;add(home)
        map.tap();let share=app.buttons["Share my location · until I stop"];XCTAssertTrue(share.waitForExistence(timeout:5));XCTAssertFalse(app.alerts.firstMatch.exists,"Opening the map must not start tracking or request permission")
        let location=XCTAttachment(screenshot:app.screenshot());location.name="Location-consent-and-map";location.lifetime = .keepAlways;add(location)
        app.buttons["Done"].tap()
        for _ in 0..<6 { if app.buttons["Time vault"].isHittable { break }; app.swipeDown() }
        app.buttons["Time vault"].tap();XCTAssertTrue(app.navigationBars["Our time vault"].waitForExistence(timeout:5))
    }
}
