import XCTest
final class LocationVaultJourneyTests:XCTestCase {
    func testHomeChoicesAndLocationFitAndSharingNeedsConsent(){
        let app=XCUIApplication();app.launchArguments=["--preview-fixture"];app.launch()
        XCTAssertTrue(app.buttons["Time vault"].waitForExistence(timeout:15))
        let homeTop=XCTAttachment(screenshot:app.screenshot());homeTop.name="Home-top-dashboard";homeTop.lifetime = .keepAlways;add(homeTop)
        let winMaxY=app.windows.firstMatch.frame.maxY
        let tabMaxY=app.buttons["Home"].firstMatch.frame.maxY
        XCTAssertLessThanOrEqual(winMaxY - tabMaxY, 28, "Bottom navigator must sit close to the bottom edge (gap=\(winMaxY - tabMaxY))")
        let promptField=app.textFields["Your quick answer…"].firstMatch
        if promptField.waitForExistence(timeout:3) && promptField.isHittable {
            promptField.tap()
            if app.keyboards.firstMatch.waitForExistence(timeout:3) {
                app.staticTexts["asechka."].firstMatch.tap()
                let dismissed=NSPredicate(format:"exists == false")
                let exp=XCTNSPredicateExpectation(predicate:dismissed,object:app.keyboards.firstMatch)
                XCTAssertEqual(XCTWaiter.wait(for:[exp],timeout:3),.completed,"Tapping outside text field must dismiss keyboard")
            }
        }
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
