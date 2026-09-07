import XCTest
@testable import ColdwaterOwner

final class DraftRepositoryTests: XCTestCase {
    private func withRepository(_ body: (DraftRepository) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("DraftRepositoryTests-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try body(DraftRepository(testingRoot: root))
    }

    func testMissingJSONPreservesOriginalAndLoadsHealthyDraft() throws {
        try withRepository { repository in
            var healthy = LocalDraft(); healthy.body = "healthy draft"
            try repository.save(healthy)
            let interruptedID = UUID()
            try FileManager.default.createDirectory(at: repository.directory(interruptedID), withIntermediateDirectories: true)
            let original = repository.file(interruptedID, "source.heic")
            let bytes = Data([0, 1, 2, 3, 255]); try bytes.write(to: original)

            let drafts = try repository.loadAll()
            XCTAssertEqual(drafts.map(\.id), [healthy.id])
            XCTAssertEqual(repository.unreadableDraftIDs, [interruptedID])
            XCTAssertEqual(try Data(contentsOf: original), bytes)
            XCTAssertTrue(FileManager.default.fileExists(atPath: repository.directory(interruptedID).path))
            XCTAssertFalse(FileManager.default.fileExists(atPath: repository.file(interruptedID, "draft.json").path))
        }
    }

    func testCorruptJSONIsReportedWithoutDeletingOrHidingOtherDrafts() throws {
        try withRepository { repository in
            let healthy = LocalDraft(); try repository.save(healthy)
            let corruptID = UUID()
            try FileManager.default.createDirectory(at: repository.directory(corruptID), withIntermediateDirectories: true)
            let corrupt = Data("{\"body\": unfinished".utf8)
            try corrupt.write(to: repository.file(corruptID, "draft.json"))

            XCTAssertEqual(try repository.loadAll().map(\.id), [healthy.id])
            XCTAssertEqual(repository.unreadableDraftIDs, [corruptID])
            XCTAssertEqual(try Data(contentsOf: repository.file(corruptID, "draft.json")), corrupt)

            // External/manual recovery can restore a draft; the next scan clears the warning.
            var recovered = LocalDraft(); recovered.id = corruptID
            try repository.save(recovered)
            XCTAssertEqual(Set(try repository.loadAll().map(\.id)), Set([healthy.id, corruptID]))
            XCTAssertTrue(repository.unreadableDraftIDs.isEmpty)
        }
    }
}
