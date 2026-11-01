import XCTest

final class GamesJourneyTests: XCTestCase {
    func testPhotographyFilterAndComposerDefault() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-fixture"]
        app.launch()
        XCTAssertTrue(app.buttons["Photos"].firstMatch.waitForExistence(timeout: 15))
        app.buttons["Photos"].firstMatch.tap()
        let photography = app.segmentedControls["photos.collection.filter"].buttons["Photography"]
        XCTAssertTrue(photography.waitForExistence(timeout: 5))
        photography.tap()
        XCTAssertTrue(app.staticTexts["Photography."].exists)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Photography-native-section"; attachment.lifetime = .keepAlways; add(attachment)
        app.buttons["Create post"].tap()
        let selected = app.segmentedControls["composer.photo.collection"].buttons["Photography"]
        XCTAssertTrue(selected.waitForExistence(timeout: 5))
        XCTAssertTrue(selected.isSelected)
        XCTAssertTrue(app.buttons["Choose a photo"].exists)
    }
    func testSeventhNativeTabAndOfflineHub() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-fixture", "--games-preview"]
        app.launch()
        XCTAssertTrue(app.buttons["Games"].firstMatch.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Our game room."].waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Games-native-hub"; attachment.lifetime = .keepAlways; add(attachment)
        XCTAssertTrue(app.buttons["games.featured.pool"].exists)
        app.buttons["games.featured.pool"].tap()
        XCTAssertTrue(app.navigationBars["A new little match"].waitForExistence(timeout: 5))
        let create = app.buttons["games.create.pool"]
        for _ in 0..<8 {
            if create.exists { break }
            app.swipeUp()
        }
        XCTAssertTrue(create.exists)
        if create.exists { XCTAssertFalse(create.isEnabled) }
        app.buttons["Close"].tap()
        app.buttons["Home"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Create post"].exists)
    }
}
