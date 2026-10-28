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
        // Any visible app icon opens Home Screen editing; Asechka may be in App Library.
        var visibleIcon:XCUIElement?
        for _ in 0..<20 {
            visibleIcon=home.icons.allElementsBoundByIndex.first{$0.frame.width>10 && $0.isHittable}
            if visibleIcon != nil { break }
            Thread.sleep(forTimeInterval:0.5)
        }
        attach(home.screenshot(),"228-iPhone-before-widget-picker")
        guard let icon=visibleIcon else {XCTFail("No visible Home Screen icon.\n"+home.debugDescription);return}
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
        // SpringBoard retains an off-screen App Library search field in its hierarchy.
        // Match the widget picker's own field so typing cannot jump to that hidden field.
        let search=home.searchFields["Search Widgets"]
        XCTAssertTrue(search.waitForExistence(timeout:10),home.debugDescription)
        search.tap();search.typeText("Asechka")
        let result=home.staticTexts["Asechka"].firstMatch
        XCTAssertTrue(result.waitForExistence(timeout:10),"The widget extension must be registered in the system picker.\n"+home.debugDescription)
        result.tap()
        XCTAssertTrue(home.staticTexts["Words to keep"].firstMatch.waitForExistence(timeout:10),home.debugDescription)
        attach(home.screenshot(),"228-iPhone-system-widget-picker")
        // The final picker button has a leading space in its accessibility label.
        guard let add=visible(home.buttons.matching(NSPredicate(format:"label CONTAINS %@","Add Widget"))) else {XCTFail(home.debugDescription);return}
        add.tap()
        let done=home.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout:10),home.debugDescription);done.tap()
        // SpringBoard exposes the installed card as an app-named icon with value Widget,
        // rather than exposing the SwiftUI text inside the remote widget process.
        guard let words=visible(home.icons.matching(NSPredicate(format:"label == %@ AND value == %@","Asechka","Widget"))) else {XCTFail(home.debugDescription);return}
        XCTAssertGreaterThan(words.frame.width,words.frame.height)
        attach(home.screenshot(),"228-iPhone-home-screen-widget")
        words.tap()
        XCTAssertTrue(app.wait(for:.runningForeground,timeout:10),"Tapping the real widget opens the app")
    }
    private func visible(_ query:XCUIElementQuery)->XCUIElement? {
        let deadline=Date().addingTimeInterval(10)
        repeat {
            if let element=query.allElementsBoundByIndex.first(where:{$0.isHittable}) {return element}
            Thread.sleep(forTimeInterval:0.25)
        }while Date()<deadline
        return nil
    }
    private func attach(_ screenshot:XCUIScreenshot,_ name:String) {
        let attachment=XCTAttachment(screenshot:screenshot);attachment.name=name;attachment.lifetime = .keepAlways;add(attachment)
    }
}
