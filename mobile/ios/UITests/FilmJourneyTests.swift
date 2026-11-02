import XCTest

final class FilmJourneyTests: XCTestCase {
    func testCameraAndDevelopedRollAreNativeAndReachableFromHome() {
        let app = XCUIApplication(); app.launchArguments = ["--preview-fixture", "--film-preview"]; app.launch()
        let camera = app.buttons.containing(.staticText, identifier: "Our disposable camera").firstMatch
        XCTAssertTrue(camera.waitForExistence(timeout: 15)); camera.tap()
        XCTAssertTrue(app.staticTexts["Our ordinary November"].waitForExistence(timeout: 8))
        let opening = XCTAttachment(screenshot: app.screenshot()); opening.name = "Disposable-camera-native"; opening.lifetime = .keepAlways; add(opening)
        let album = app.buttons.containing(.staticText, identifier: "A weekend in little pieces").firstMatch
        for _ in 0..<5 { if album.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(album.exists); album.tap()
        XCTAssertTrue(app.staticTexts["FRAME 1 / 24"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["A little surprise, kept for you. ♡"].exists)
        app.buttons["Next moment →"].tap(); XCTAssertTrue(app.staticTexts["FRAME 2 / 24"].exists)
        let reveal = XCTAttachment(screenshot: app.screenshot()); reveal.name = "Disposable-camera-reveal"; reveal.lifetime = .keepAlways; add(reveal)
    }
}
