import XCTest
final class LocationVaultJourneyTests:XCTestCase {
    func testHomeChoicesAndLocationFitBeforePostsAndSharingNeedsConsent(){
        let app=XCUIApplication();app.launchArguments=["--preview-fixture"];app.launch()
        let map=app.buttons["Open our location map"];XCTAssertTrue(map.waitForExistence(timeout:15));XCTAssertTrue(map.isHittable,"The location map must be visible on Home without scrolling")
        XCTAssertTrue(app.buttons["Time vault"].isHittable);XCTAssertTrue(app.buttons["Recipes for two"].isHittable)
        let home=XCTAttachment(screenshot:app.screenshot());home.name="Home-with-location-and-vault";home.lifetime = .keepAlways;add(home)
        map.tap();let share=app.buttons["Share my location · until I stop"];XCTAssertTrue(share.waitForExistence(timeout:5));XCTAssertFalse(app.alerts.firstMatch.exists,"Opening the map must not start tracking or request permission")
        let location=XCTAttachment(screenshot:app.screenshot());location.name="Location-consent-and-map";location.lifetime = .keepAlways;add(location)
        app.buttons["Done"].tap();app.buttons["Time vault"].tap();XCTAssertTrue(app.navigationBars["Our time vault"].waitForExistence(timeout:5))
    }
}
