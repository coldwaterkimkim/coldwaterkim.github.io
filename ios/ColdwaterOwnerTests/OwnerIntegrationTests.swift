import XCTest
import UIKit
@testable import ColdwaterOwner

final class OwnerIntegrationTests: XCTestCase {
    @MainActor
    func testPhotoToPublicWebsiteAndEdit() async throws {
        setenv("CWK_UI_TESTING", "1", 1)
        setenv("CWK_TEST_SERVER_URL", "http://127.0.0.1:18119", 1)
        let store = OwnerStore()
        await store.bootstrap()
        await store.login(email: "owner@example.test", password: "ColdwaterCI-Photo-9!")
        XCTAssertTrue(store.isAuthenticated, store.lastError ?? "login failed")
        var draft = try XCTUnwrap(store.createDraft(), store.lastError ?? "draft failed")
        draft.body = "iOS photo E2E " + UUID().uuidString
        draft.category = "daily"
        try store.saveDraft(draft)
        let fixture = UIGraphicsImageRenderer(size: CGSize(width: 1200, height: 900)).image { context in
            UIColor.systemBlue.setFill(); context.fill(CGRect(x: 0, y: 0, width: 1200, height: 900))
            UIColor.systemYellow.setFill(); context.fill(CGRect(x: 160, y: 180, width: 500, height: 400))
        }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
        try XCTUnwrap(fixture.pngData()).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        await store.importPhoto(from: file, into: draft.id)
        XCTAssertEqual(store.drafts.first { $0.id == draft.id }?.photos.count, 1, store.lastError ?? "import failed")
        await store.publish(draft.id)
        let published = try await waitForPublished(store, id: draft.id)
        let recordID = try XCTUnwrap(published.recordID)
        let publicURL = URL(string: "http://127.0.0.1:18119/api/cwk/records-v2/" + recordID)!
        let (data, response) = try await URLSession.shared.data(from: publicURL)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        let record = try JSONDecoder().decode(RecordDocument.self, from: data)
        XCTAssertEqual(record.body, draft.body)
        guard case .array(let photos) = record.fields["attachments"],
              case .object(let photo) = try XCTUnwrap(photos.first),
              let photoURL = photo["url"]?.string.flatMap(URL.init(string:)) else {
            return XCTFail("published photo missing")
        }
        let (photoData, photoResponse) = try await URLSession.shared.data(from: photoURL)
        XCTAssertEqual((photoResponse as? HTTPURLResponse)?.statusCode, 200)
        XCTAssertNotNil(UIImage(data: photoData))
        // Reloading the repository proves the draft receipt is durable, not merely a UI state.
        let repository = try DraftRepository(appGroup: "group.com.coldwaterkim.owner")
        XCTAssertEqual(try repository.read(draft.id).recordID, recordID)
        XCTAssertEqual(try repository.read(draft.id).state, .published)
        var edit = try XCTUnwrap(store.editRecord(record))
        edit.body += " 수정 확인"
        try store.saveDraft(edit)
        await store.publish(edit.id)
        let edited = try await waitForPublished(store, id: edit.id)
        XCTAssertEqual(edited.recordID, recordID)
        let (after, _) = try await URLSession.shared.data(from: publicURL)
        let updated = try JSONDecoder().decode(RecordDocument.self, from: after)
        XCTAssertEqual(updated.body, edit.body)
        XCTAssertEqual(updated.fields["attachments"], record.fields["attachments"])
        XCTAssertEqual(updated.fields["firstPublishedAt"], record.fields["firstPublishedAt"])
    }

    @MainActor private func waitForPublished(_ store: OwnerStore, id: UUID) async throws -> LocalDraft {
        for _ in 0..<900 {
            if let draft = store.drafts.first(where: { $0.id == id }) {
                if draft.state == .published { return draft }
                if draft.state == .failed { throw OwnerError.message(draft.error ?? store.lastError ?? "upload failed") }
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw OwnerError.message("Timed out waiting for confirmed publication: \(store.lastError ?? "no error")")
    }

    func testRecordRoundTripPreservesLegacyContent() throws {
        let fields: [String: JSONValue] = ["id": .string("aaaaaaaaaaaaaaa"), "body": .string("본문"), "legacyHtml": .string("<table><tr><td>원문</td></tr></table>"), "embeds": .array([.object(["type": .string("youtube"), "unknownFutureProperty": .bool(true)])]), "revision": .number(4)]
        let data = try JSONEncoder().encode(RecordDocument(fields: fields))
        XCTAssertEqual(try JSONDecoder().decode(RecordDocument.self, from: data).fields, fields)
    }
}
