import XCTest

final class FilmJourneyTests: XCTestCase {
    func testCenterLensOpensTheCameraAndCanBeCancelled() {
        let app = openFilm(capturePreview: true)
        let lens = app.buttons["film.camera.open"]
        XCTAssertTrue(lens.isHittable)
        // Tap the artwork's center, exactly where the old decorative lens did nothing.
        lens.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.navigationBars["Keep this moment"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Keep this moment ●"].exists)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Disposable-center-lens-opens-camera"; attachment.lifetime = .keepAlways; add(attachment)
        app.buttons["Cancel"].tap()
        XCTAssertTrue(lens.waitForExistence(timeout: 5))
        XCTAssertTrue(lens.isHittable)
        let take = app.buttons["film.camera.take"]
        for _ in 0..<4 { if take.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(take.isHittable); take.tap()
        XCTAssertTrue(app.navigationBars["Keep this moment"].waitForExistence(timeout: 5))
    }
    func testCenterLensExplainsAnUnavailableConnection() {
        let app = openFilm(capturePreview: false)
        app.buttons["film.camera.open"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let notice = app.alerts["Our disposable camera"]
        XCTAssertTrue(notice.waitForExistence(timeout: 5))
        XCTAssertTrue(notice.staticTexts["Reconnect our shared camera using Refresh, then try again."].exists)
        notice.buttons["OK"].tap()
        XCTAssertTrue(app.buttons["film.camera.open"].isHittable)
        XCTAssertFalse(app.navigationBars["Keep this moment"].exists)
    }
    private func openFilm(capturePreview: Bool) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-fixture", "--film-preview"] + (capturePreview ? ["--film-capture-preview"] : [])
        app.launch()
        let camera = app.buttons.containing(.staticText, identifier: "Our disposable camera").firstMatch
        XCTAssertTrue(camera.waitForExistence(timeout: 15)); camera.tap()
        XCTAssertTrue(app.staticTexts["Our ordinary November"].waitForExistence(timeout: 8))
        return app
    }
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
