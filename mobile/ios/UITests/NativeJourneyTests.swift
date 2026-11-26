import XCTest

final class NativeJourneyTests:XCTestCase {
    func testIncomingEnvelopeClosesToHistoryOnly() {
        let app=XCUIApplication();app.launchArguments=["--preview-fixture","--incoming-message"];app.launch()
        let close=app.buttons["Keep it in my heart ♡"]
        XCTAssertTrue(close.waitForExistence(timeout:15));capture("226-iPhone-incoming-art");close.tap()
        XCTAssertFalse(close.waitForExistence(timeout:2));app.buttons["Messages"].tap();app.buttons["Love Jar & note history"].tap()
        XCTAssertTrue(app.staticTexts["Read once · kept in our hearts"].waitForExistence(timeout:5));capture("226-iPhone-closed-message")
    }
    func testLittleMessageComposerHistoryAndFastPhotos() {
        let app=XCUIApplication();app.launchArguments=["--preview-fixture"];app.launch()
        XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout:15));app.buttons["Messages"].tap()
        XCTAssertTrue(app.textViews["Your little message"].waitForExistence(timeout:5));app.textViews["Your little message"].tap();app.textViews["Your little message"].typeText("A little love, saved offline.")
        capture("226-iPhone-message-composer");app.buttons["Save to send when online"].tap()
        XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout:5));app.buttons["Messages"].tap();app.buttons["Love Jar & note history"].tap()
        XCTAssertTrue(app.staticTexts["A little love, saved offline."].waitForExistence(timeout:5));capture("226-iPhone-message-history")
        app.buttons["message-history-close"].tap();app.buttons["Our home-screen widgets"].tap();XCTAssertTrue(app.staticTexts["Words to keep"].waitForExistence(timeout:5));capture("226-iPhone-widgets");app.navigationBars.buttons.element(boundBy:0).tap();app.buttons["message-composer-close"].tap();app.buttons["Memories"].firstMatch.tap()
        for _ in 0..<5{app.swipeUp(velocity:.fast);app.swipeDown(velocity:.fast)}
        XCTAssertTrue(app.buttons["Create post"].exists);capture("226-iPhone-photos")
    }
    func testNormalReopenHasNoPasswordScreenAndPreservesComposer() {
        let app=XCUIApplication();app.launchArguments=["--preview-fixture"];app.launch()
        XCTAssertTrue(app.buttons["Create post"].waitForExistence(timeout:15))
        XCTAssertFalse(app.buttons["Digit 1"].exists)
        app.buttons["Memories"].firstMatch.tap()
        app.buttons["Quotes"].firstMatch.tap();app.buttons["Create post"].tap()
        let editor=app.textViews["Quote text"];XCTAssertTrue(editor.waitForExistence(timeout:5));editor.tap();editor.typeText("A draft kept while we step away.")
        XCUIDevice.shared.press(.home);app.activate()
        XCTAssertTrue(editor.waitForExistence(timeout:8))
        XCTAssertEqual(editor.value as? String,"A draft kept while we step away.")
        XCTAssertFalse(app.buttons["Unlock door"].exists)
        XCTAssertFalse(app.buttons["Digit 1"].exists)
    }
    func testNativeFeedOfflineConversationAndComposer() {
        let app=XCUIApplication()
        app.launchArguments=["--preview-fixture"]
        app.launch()
        XCTAssertTrue(app.buttons["Create post"].waitForExistence(timeout:15))
        for label in ["Home","Memories","Our days","Words","Games"] {
            XCTAssertTrue(app.buttons[label].firstMatch.exists,"Missing bottom destination: "+label)
        }
        capture("01-iPhone-home")
        app.buttons["Memories"].firstMatch.tap()
        app.buttons["Photos"].firstMatch.tap()
        let picture=app.otherElements["Our shared photo"].firstMatch
        XCTAssertTrue(picture.waitForExistence(timeout:8))
        XCTAssertTrue(NSPredicate(format:"value == %@","Saved image").evaluate(with:picture))
        capture("02-iPhone-photos")
        app.buttons["Quotes"].firstMatch.tap()
        app.buttons["Create post"].tap()
        let editor=app.textViews["Quote text"]
        XCTAssertTrue(editor.waitForExistence(timeout:5))
        editor.tap();editor.typeText("A little native moment, saved offline.")
        capture("03-iPhone-composer")
        app.buttons["Share"].tap()
        XCTAssertTrue(app.buttons["Create post"].waitForExistence(timeout:5))
        app.buttons["Home"].firstMatch.tap()
        let like=app.buttons["Like post"].firstMatch
        reveal(like,in:app)
        XCTAssertTrue(like.waitForExistence(timeout:5));like.tap()
        XCTAssertTrue(app.buttons["Unlike post"].firstMatch.waitForExistence(timeout:5))
        app.buttons["Comments"].firstMatch.tap()
        let comment=app.textFields["Leave a little love…"]
        XCTAssertTrue(comment.waitForExistence(timeout:5))
        comment.tap();comment.typeText("Kept close, even offline.")
        app.buttons["Send comment"].tap()
        XCTAssertTrue(app.staticTexts["Kept close, even offline."].firstMatch.waitForExistence(timeout:5))
        capture("04-iPhone-comments")
        app.buttons["Done"].tap()
        app.buttons["Our days"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Our little days."].firstMatch.waitForExistence(timeout:5))
        capture("05-iPhone-days")
        app.buttons["Words"].firstMatch.tap()
        capture("06-iPhone-words")
    }
    func testHomeShortcutsHeartsAndHiddenHistory() {
        let app=XCUIApplication();app.launchArguments=["--preview-fixture"];app.launch()
        let send=app.buttons["Send a heart to Youssef"].firstMatch
        XCTAssertTrue(send.waitForExistence(timeout:15))
        reveal(send,in:app)
        for _ in 0..<15{send.tap()}
        let streak=app.buttons["Our heart history"].firstMatch
        XCTAssertTrue(app.buttons.matching(NSPredicate(format:"label == %@ AND value CONTAINS %@","Our heart history","Today · you 15")).firstMatch.waitForExistence(timeout:5))
        capture("12-iPhone-home-hearts")
        XCTAssertTrue(streak.exists);reveal(streak,in:app);XCTAssertTrue(streak.isHittable);streak.tap()
        XCTAssertTrue(app.navigationBars["Our heart history"].waitForExistence(timeout:5));capture("13-iPhone-heart-history");app.buttons["Done"].tap()
        for shortcut in ["Secret vocab","Open when…","Little things","Our beginning"] {
            let button=app.buttons[shortcut].firstMatch;reveal(button,in:app);XCTAssertTrue(button.isHittable,shortcut);button.tap()
            if shortcut=="Secret vocab" {XCTAssertTrue(app.textFields["Find one of our inside jokes…"].waitForExistence(timeout:5));capture("14-iPhone-secret-vocab")}
            app.buttons["Done"].tap()
        }
        app.buttons["Profile and settings"].tap();capture("16-iPhone-settings");app.buttons["Done"].tap()
    }
    private func reveal(_ element:XCUIElement,in app:XCUIApplication) {
        let scroll=app.scrollViews.firstMatch
        for _ in 0..<16 {
            let frame=element.frame,viewport=scroll.frame
            let top=viewport.minY+8,bottom=min(viewport.maxY-8,app.buttons["Home"].firstMatch.frame.minY-12)
            if element.isHittable && frame.minY>=top && frame.maxY<=bottom{return}
            let below=frame.isEmpty || frame.maxY>bottom
            let start=scroll.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:below ? 0.78:0.28))
            let end=scroll.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:below ? 0.38:0.68))
            start.press(forDuration:0.02,thenDragTo:end)
        }
    }
    func testSecretVocabAndSinceUsAreNativeAndEditableOffline() {
        let app=XCUIApplication();app.launchArguments=["--preview-fixture"];app.launch()
        XCTAssertTrue(app.buttons["Our days"].firstMatch.waitForExistence(timeout:15));app.buttons["Our days"].firstMatch.tap()
        app.buttons["Secret vocab"].tap()
        XCTAssertTrue(app.textFields["Find one of our inside jokes…"].waitForExistence(timeout:5))
        app.buttons["Done"].tap();app.buttons["Since us · letters & little things"].tap()
        XCTAssertTrue(app.staticTexts["September 27, 2026"].waitForExistence(timeout:5));capture("09-iPhone-since-us")
        app.buttons["Open when…"].tap();capture("10-iPhone-open-when-letters")
        let letter=app.buttons.matching(NSPredicate(format:"label CONTAINS %@","Open with love")).firstMatch
        XCTAssertTrue(letter.waitForExistence(timeout:5));letter.tap();XCTAssertTrue(app.buttons["Keep it close ♡"].waitForExistence(timeout:5));capture("11-iPhone-letter")
    }
    private func capture(_ name:String) {
        let attachment=XCTAttachment(screenshot:XCUIApplication().screenshot())
        attachment.name=name;attachment.lifetime = .keepAlways;add(attachment)
    }
}
