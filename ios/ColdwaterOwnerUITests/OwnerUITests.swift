import XCTest

final class OwnerUITests: XCTestCase {
    @MainActor
    func testNativeComposerAndDraftSurvivesRelaunch() throws {
        let app = XCUIApplication()
        app.launchEnvironment["CWK_UI_TESTING"] = "1"
        app.launchEnvironment["CWK_TEST_SERVER_URL"] = "http://127.0.0.1:18119"
        app.launch()
        let compose = app.buttons["drafts.compose"]
        XCTAssertTrue(compose.waitForExistence(timeout: 15))
        compose.tap()
        let body = app.textViews["compose.body"]
        XCTAssertTrue(body.waitForExistence(timeout: 5))
        body.tap()
        let text = "자동 저장 확인 " + UUID().uuidString
        body.typeText(text)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Native photo composer"; screenshot.lifetime = .keepAlways
        add(screenshot)
        // Normal dismissal must flush the debounced save before reopening the app.
        app.buttons["닫기"].firstMatch.tap()
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts[text].waitForExistence(timeout: 10))
    }
}
