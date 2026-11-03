import XCTest

final class GamesJourneyTests: XCTestCase {
    func testFocusedGamesKeepPrimaryActionsVisible() {
        for game in ["tictactoe", "connect4", "checkers", "hangman", "battleship", "pool"] {
            let app = XCUIApplication()
            app.launchArguments = ["--preview-fixture", "--games-preview", "--games-play=\(game)"]
            app.launch()
            XCTAssertTrue(app.buttons["games.play.back"].waitForExistence(timeout: 15), game)
            XCTAssertFalse(app.buttons["Create post"].isHittable, "Match uses the screen: \(game)")
            if game == "pool" {
                let landscape = NSPredicate { _, _ in app.frame.width > app.frame.height }
                expectation(for: landscape, evaluatedWith: app)
                waitForExpectations(timeout: 8)
                XCTAssertTrue(app.buttons["Fine controls"].isHittable)
            }
            if game == "tictactoe" { XCTAssertTrue(app.buttons["games.tictactoe.8"].isHittable) }
            if game == "battleship" {
                XCTAssertTrue(app.buttons["games.battleship.commit"].exists)
                app.buttons["Arrange"].tap()
                app.buttons["Rotate selected ship to vertical"].tap()
                XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Cannot rotate here:")).firstMatch.waitForExistence(timeout: 3))
                let start = app.buttons["games.battleship.own.0"], target = app.buttons["games.battleship.own.5"]
                start.press(forDuration: 0.1, thenDragTo: target)
                app.buttons["Rotate selected ship to vertical"].tap()
                XCTAssertTrue(app.buttons["games.battleship.own.15"].label.contains("ship"), "Rotate changes the placed ship immediately")
                target.press(forDuration: 0.1, thenDragTo: app.buttons["games.battleship.own.95"])
                XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "stayed in its last position")).firstMatch.waitForExistence(timeout: 3))
                XCTAssertTrue(app.buttons["games.battleship.own.15"].label.contains("ship"), "Invalid drop retains the last valid position")
            }
            if game == "hangman" { XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Guess Z")).firstMatch.isHittable) }
            capture(app, "Games-focused-\(game)")
            app.buttons["games.play.back"].tap()
            XCTAssertTrue(app.staticTexts["Our game room."].waitForExistence(timeout: 5))
            app.terminate()
        }
    }
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
        capture(app, "Games-light-pool-match-sheet")
        let create = app.buttons["games.create.pool"]
        for _ in 0..<8 {
            if create.exists { break }
            app.swipeUp()
        }
        XCTAssertTrue(create.exists)
        if create.exists { XCTAssertFalse(create.isEnabled) }
        app.buttons["Close"].tap()
        let preferences = app.buttons["games.preferences"]
        for _ in 0..<8 {
            if preferences.isHittable { break }
            app.swipeDown()
        }
        preferences.tap()
        XCTAssertTrue(app.navigationBars["Play your way"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["Game sounds"].exists)
        capture(app, "Games-light-preferences")
        app.buttons["Done"].tap()
        app.buttons["Home"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Create post"].exists)
    }
    func testEveryGameMatchSheet() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-fixture", "--games-preview"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Our game room."].waitForExistence(timeout: 15))
        for game in ["pool", "tictactoe", "hangman", "connect4", "checkers", "battleship"] {
            let card = app.buttons["games.card.\(game)"]
            // SwiftUI can report a card as hittable when only its top edge is
            // visible above the tab bar. Bring its center into the content area.
            let top = app.buttons["Create post"].frame.maxY + 20
            let bottom = app.buttons["Games"].firstMatch.frame.minY - 20
            for _ in 0..<12 {
                if card.isHittable && card.frame.midY > top && card.frame.midY < bottom { break }
                if card.exists && card.frame.midY < top { app.swipeDown() }
                else { app.swipeUp() }
            }
            XCTAssertTrue(card.isHittable, "Native card is reachable: \(game)")
            XCTAssertGreaterThan(card.frame.midY, top, "Card center clears the header: \(game)")
            XCTAssertLessThan(card.frame.midY, bottom, "Card center clears the tabs: \(game)")
            card.tap()
            XCTAssertTrue(app.navigationBars["A new little match"].waitForExistence(timeout: 5))
            capture(app, "Games-light-sheet-\(game)")
            app.buttons["Close"].tap()
        }
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
