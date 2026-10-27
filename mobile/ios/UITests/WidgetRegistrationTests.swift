import XCTest

final class WidgetRegistrationTests: XCTestCase {
    func testWidgetCanBeAddedFromTheActualHomeScreenGallery() {
        continueAfterFailure=false
        let app=XCUIApplication();app.launchArguments=["--preview-fixture"];app.launch()
        XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout:15))
        app.buttons["Messages"].tap();app.buttons["Our home-screen widgets"].tap()
        XCTAssertTrue(app.staticTexts["Widget extension included"].waitForExistence(timeout:5))
        let preview=app.otherElements["widget-preview-2"]
        if preview.exists { XCTAssertGreaterThan(preview.frame.width,preview.frame.height) }
        attach(app.screenshot(),"228-iPhone-horizontal-widgets")

        XCUIDevice.shared.press(.home)
        let home=XCUIApplication(bundleIdentifier:"com.apple.springboard")
        let icon=home.icons["Asechka"].firstMatch
        for _ in 0..<4 { if icon.exists && icon.isHittable { break };home.swipeLeft() }
        XCTAssertTrue(icon.waitForExistence(timeout:8),home.debugDescription)
        icon.press(forDuration:1.5)
        let editHome=home.buttons["Edit Home Screen"]
        XCTAssertTrue(editHome.waitForExistence(timeout:8),home.debugDescription);editHome.tap()
        let edit=home.buttons["Edit"].firstMatch
        if edit.waitForExistence(timeout:3) {
            edit.tap()
            let add=home.buttons["Add Widget"].firstMatch
            XCTAssertTrue(add.waitForExistence(timeout:5),home.debugDescription);add.tap()
        } else {
            let add=home.buttons["Add"].firstMatch
            XCTAssertTrue(add.waitForExistence(timeout:5),home.debugDescription);add.tap()
        }
        let search=home.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout:10),home.debugDescription)
        search.tap();search.typeText("Asechka")
        let result=home.staticTexts["Asechka"].firstMatch
        XCTAssertTrue(result.waitForExistence(timeout:10),"The widget extension must be registered in the system picker.\n"+home.debugDescription)
        result.tap()
        XCTAssertTrue(home.staticTexts["Words to keep"].firstMatch.waitForExistence(timeout:10),home.debugDescription)
        attach(home.screenshot(),"228-iPhone-system-widget-picker")
        let add=home.buttons["Add Widget"].firstMatch
        XCTAssertTrue(add.waitForExistence(timeout:5),home.debugDescription);add.tap()
        XCUIDevice.shared.press(.home)
        let words=home.staticTexts["Words to keep"].firstMatch
        XCTAssertTrue(words.waitForExistence(timeout:10),home.debugDescription)
        attach(home.screenshot(),"228-iPhone-home-screen-widget")
        words.tap()
        XCTAssertTrue(app.wait(for:.runningForeground,timeout:10),"Tapping the real widget opens the app")
    }
    private func attach(_ screenshot:XCUIScreenshot,_ name:String) {
        let attachment=XCTAttachment(screenshot:screenshot);attachment.name=name;attachment.lifetime = .keepAlways;add(attachment)
    }
}
