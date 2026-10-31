import XCTest

final class GamesJourneyTests: XCTestCase {
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
        XCTAssertTrue(app.buttons["games.create.pool"].exists)
        XCTAssertFalse(app.buttons["games.create.pool"].isEnabled)
        app.buttons["Close"].tap()
        app.buttons["Home"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Create post"].exists)
    }
}
