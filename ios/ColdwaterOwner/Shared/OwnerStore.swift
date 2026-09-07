import Foundation
import Combine
import UIKit

@MainActor public final class OwnerStore: ObservableObject {
    @Published public private(set) var drafts: [LocalDraft] = []
    @Published public private(set) var isAuthenticated = false
    @Published public private(set) var accountEmail = ""
    @Published public var lastError: String?
    @Published public private(set) var unreadableDraftIDs: [UUID] = []
    @Published public private(set) var isBusy = false
    @Published public private(set) var progress: [UUID: Double] = [:]
    @Published public private(set) var records: [RecordDocument] = []
    private var environment: OwnerEnvironment?
    private var repository: DraftRepository?
    private var keychain: OwnerKeychain?
    private var transfer: BackgroundTransfer?
    private var restored: [String: BackgroundTransfer] = [:]
    private var token: String?
    private var leases: [String: SessionLease] = [:]
    private var isExtension = false
    private var scheduling: Set<UUID> = []
    public init(sessionIdentifier: String = "com.coldwaterkim.owner.uploads") {
        do {
            let e = try OwnerEnvironment(); environment = e
            repository = try DraftRepository(appGroup: e.appGroup); keychain = OwnerKeychain(group: e.keychainGroup)
            isExtension = sessionIdentifier.hasPrefix("com.coldwaterkim.owner.share.uploads")
            let actualIdentifier = isExtension ? sessionIdentifier + "." + UUID().uuidString : sessionIdentifier
            leases[actualIdentifier] = try SessionLease(root: repository!.root, identifier: actualIdentifier)
            transfer = makeTransfer(actualIdentifier, group: e.appGroup)
        } catch { lastError = error.localizedDescription }
    }
    private func makeTransfer(_ identifier: String, group: String) -> BackgroundTransfer {
        let t = BackgroundTransfer(identifier: identifier, group: group)
        t.onComplete = { [weak self] result in await self?.completed(result) }
        t.onProgress = { [weak self] description, value in if let id = UUID(uuidString: String(description.split(separator: "/").first ?? "")) { self?.progress[id] = value } }
        return t
    }
    public func restoreBackgroundSession(identifier: String, completionHandler: @escaping () -> Void) {
        do {
            guard let e = environment, let repository else { throw OwnerError.message("공유 저장소가 준비되지 않았어.") }
            // SwiftUI .task may never run on a background launch.
            try reload(); token = try keychain?.token(); isAuthenticated = token != nil
            let t: BackgroundTransfer
            if transfer?.identifier == identifier { t = transfer! }
            else if let existing = restored[identifier] { t = existing }
            else {
                leases[identifier] = try SessionLease(root: repository.root, identifier: identifier)
                t = makeTransfer(identifier, group: e.appGroup); restored[identifier] = t
            }
            t.finishedEvents = completionHandler
            Task { _ = await t.tasks() }
        } catch { lastError = error.localizedDescription; completionHandler() }
    }
    public var publishedRecords: [RecordDocument] { records }
    public func refreshPublished() async { await loadRecords() }
    public func bootstrap() async {
        do {
            try reload(); token = try keychain?.token(); isAuthenticated = token != nil
            if isAuthenticated {
                do { try await refreshToken() } catch { lastError = error.localizedDescription }
                if !isExtension {
                    for draft in drafts where [.preparing, .uploading, .publishing, .verifying].contains(draft.state) {
                        // A live extension keeps its lease, so foreground launch does not touch its task/body.
                        do { _ = try transferFor(draft) } catch { continue }
                        await schedule(draft.id)
                    }
                }
            }
        } catch { lastError = error.localizedDescription }
    }
    public func login(email: String, password: String) async {
        isBusy = true; defer { isBusy = false }
        do {
            let data = try await request("api/collections/users/auth-with-password", method: "POST", body: ["identity": .string(email), "password": .string(password)], authenticated: false)
            let fields = try JSONDecoder().decode([String: JSONValue].self, from: data)
            guard let next = fields["token"]?.string else { throw OwnerError.message("로그인 응답을 확인하지 못했어.") }
            token = next
            do { _ = try await request("api/cwk/mobile/capabilities"); try keychain?.save(next) }
            catch { token = nil; throw error }
            isAuthenticated = true; accountEmail = email; lastError = nil
        } catch { lastError = error.localizedDescription }
    }
    public func logout() {
        do { try keychain?.clear(); token = nil; isAuthenticated = false; accountEmail = ""; Task { await transfer?.cancelAll(); for t in restored.values { await t.cancelAll() } } }
        catch { lastError = error.localizedDescription }
    }
    private func refreshToken() async throws {
        let data = try await request("api/collections/users/auth-refresh", method: "POST")
        let fields = try JSONDecoder().decode([String: JSONValue].self, from: data)
        guard let next = fields["token"]?.string else { throw OwnerError.message("로그인을 다시 해 줘.") }
        token = next; try keychain?.save(next)
    }
    private func reload() throws {
        guard let repository else { return }
        drafts = try repository.loadAll()
        unreadableDraftIDs = repository.unreadableDraftIDs
        if !unreadableDraftIDs.isEmpty {
            lastError = "초안 \(unreadableDraftIDs.count)개를 읽지 못했어. 원본 사진은 보관돼 있고 나머지 초안은 계속 사용할 수 있어."
        }
    }
    /// Update only the successfully persisted draft. Full disk scans belong to external-state refresh.
    private func upsert(_ draft: LocalDraft) {
        var next = drafts
        if let index = next.firstIndex(where: { $0.id == draft.id }) { next[index] = draft }
        else { next.append(draft) }
        next.sort { $0.updatedAt > $1.updatedAt }
        drafts = next
        unreadableDraftIDs.removeAll { $0 == draft.id }
    }
    public func createDraft() -> LocalDraft? {
        do { guard let repository else { throw OwnerError.message("공유 저장소가 준비되지 않았어.") }; var draft = LocalDraft(); draft.uploadSessionIdentifier = transfer?.identifier; try repository.save(draft); upsert(draft); return draft }
        catch { lastError = error.localizedDescription; return nil }
    }
    public func saveDraft(_ draft: LocalDraft) throws {
        guard let repository else { throw OwnerError.message("공유 저장소가 준비되지 않았어.") }
        if let old = try? repository.read(draft.id) {
            _ = try transferFor(old)
            if old.hasSubmitted { throw OwnerError.message("전송한 초안은 수정할 수 없어. 게시물에서 다시 편집해 줘.") }
        }
        var copy = draft; copy.updatedAt = Date(); try repository.save(copy); upsert(copy)
    }
    public func deleteDraft(_ draft: LocalDraft) throws {
        _ = try transferFor(draft)
        guard [.editing, .failed, .published].contains(draft.state) else { throw OwnerError.message("전송 중에는 초안을 지울 수 없어.") }
        try repository?.delete(draft.id); drafts.removeAll { $0.id == draft.id }; unreadableDraftIDs.removeAll { $0 == draft.id }
    }
    public func fileURL(for draftID: UUID, filename: String) -> URL? { repository?.file(draftID, filename) }
    public func siteURL(for recordID: String) -> URL? { environment.flatMap { URL(string: "/#record/\(recordID)", relativeTo: $0.baseURL) } }
    public func importPhoto(from provider: NSItemProvider, into draftID: UUID) async {
        await importing(draftID) { directory in try await PhotoImporter.importProvider(provider, directory: directory) }
    }
    public func importPhoto(from url: URL, into draftID: UUID) async {
        await importing(draftID) { directory in try await PhotoImporter.importFile(url, directory: directory) }
    }
    private func importing(_ id: UUID, operation: (URL) async throws -> LocalPhoto) async {
        guard let repository else { return }; isBusy = true; defer { isBusy = false }
        do {
            let before = try repository.read(id)
            _ = try transferFor(before)
            guard before.photos.count < 100 else { throw OwnerError.message("사진은 글 하나에 최대 100장까지 추가할 수 있어.") }
            guard !before.hasSubmitted else { throw OwnerError.message("새 초안에 사진을 추가해 줘.") }
            let photo = try await operation(repository.directory(id))
            var draft = try repository.read(id)
            guard !draft.hasSubmitted, draft.photos.count < 100 else {
                for filename in [photo.originalFilename, photo.displayFilename, photo.thumbnailFilename] { try? FileManager.default.removeItem(at: repository.file(id, filename)) }
                throw OwnerError.message("초안의 상태가 바뀌었어. 새 초안에 사진을 추가해 줘.")
            }
            draft.photos.append(photo); lastError = nil; draft.updatedAt = Date(); try repository.save(draft); upsert(draft)
        } catch { lastError = error.localizedDescription }
    }
    public func publish(_ draftID: UUID) async {
        do {
            guard isAuthenticated, let repository else { throw OwnerError.message("먼저 OWNER 로그인을 해 줘.") }
            var d = try repository.read(draftID)
            _ = try transferFor(d)
            var existingCount = 0
            if case .array(let existing) = d.record?.fields["attachments"] { existingCount = existing.count }
            guard d.body.utf8.count <= 500_000 else { throw OwnerError.message("본문이 너무 길어. 조금 줄여 줘.") }
            guard existingCount + d.photos.count <= 100 else { throw OwnerError.message("사진과 첨부는 합쳐서 100개까지 게시할 수 있어.") }
            for photo in d.photos {
                for name in [photo.originalFilename, photo.displayFilename] {
                    let size = try repository.file(draftID, name).resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    guard size > 0, size <= 64 * 1024 * 1024 else { throw OwnerError.message("사진 한 장은 64MB 이하여야 해.") }
                }
            }
            guard ["posts", "daily", "nasajab", "projects"].contains(d.category) else { throw OwnerError.message("분류를 선택해 줘.") }
            let hasExistingAttachments: Bool
            if case .array(let attachments) = d.record?.fields["attachments"] { hasExistingAttachments = !attachments.isEmpty } else { hasExistingAttachments = false }
            guard !d.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !d.photos.isEmpty || hasExistingAttachments else { throw OwnerError.message("사진이나 글을 추가해 줘.") }
            d.hasSubmitted = true
            if d.recordID != nil, d.record == nil { d.state = .verifying } else { d.state = .preparing }
             d.error = nil; try repository.save(d); upsert(d); await schedule(draftID)
        } catch { lastError = error.localizedDescription }
    }
    public func retry(_ draftID: UUID) async { await publish(draftID) }
    public func loadRecords() async {
        do { let data = try await request("api/cwk/records-v2?status=published&perPage=50"); struct Page: Decodable { let items: [RecordDocument] }; records = try JSONDecoder().decode(Page.self, from: data).items }
        catch { lastError = error.localizedDescription }
    }
    public func editRecord(_ record: RecordDocument) -> LocalDraft? {
        do {
            guard let repository else { throw OwnerError.message("공유 저장소가 준비되지 않았어.") }
            var d = LocalDraft(); d.uploadSessionIdentifier = transfer?.identifier; d.body = record.body; d.category = record.category; d.record = record; d.recordID = record.id
            try repository.save(d); upsert(d); return d
        } catch { lastError = error.localizedDescription; return nil }
    }
    private func transferFor(_ draft: LocalDraft) throws -> BackgroundTransfer {
        guard let primary = transfer, let repository, let environment else { throw OwnerError.message("전송 준비가 되지 않았어.") }
        let identifier = draft.uploadSessionIdentifier ?? "com.coldwaterkim.owner.uploads"
        if identifier == primary.identifier { return primary }
        if let existing = restored[identifier] { return existing }
        guard !isExtension else { throw OwnerError.message("이 초안은 앱에서 전송을 계속해 줘.") }
        leases[identifier] = try SessionLease(root: repository.root, identifier: identifier)
        let recovered = makeTransfer(identifier, group: environment.appGroup)
        restored[identifier] = recovered
        return recovered
    }
    private func schedule(_ id: UUID) async {
        guard !scheduling.contains(id), let repository, let environment else { return }
        guard let token else { fail(id, "OWNER 로그인이 필요해. 초안과 전송한 사진은 보관돼 있어."); return }
        scheduling.insert(id); defer { scheduling.remove(id) }
        do {
            var d = try repository.read(id)
            let transfer = try transferFor(d)
            if d.state == .verifying, let recordID = d.recordID { try await verify(id, recordID: recordID); return }
            let active = await transfer.tasks()
            let names = Set(active.compactMap(\.taskDescription))
            if names.contains(where: { $0.hasPrefix(id.uuidString + "/") }) { return }
            if let photo = d.photos.first(where: { $0.mediaID == nil }) {
                d.state = .uploading; try repository.save(d); upsert(d)
                let boundary = "cwk-" + photo.id.uuidString
                let body = repository.file(id, "upload-\(photo.id).multipart")
                let display = repository.file(id, photo.displayFilename), original = repository.file(id, photo.originalFilename)
                try await Task.detached(priority: .utility) { try MultipartFile.write(to: body, requestID: photo.id.uuidString.lowercased(), display: display, original: original, boundary: boundary) }.value
                var req = URLRequest(url: environment.baseURL.appendingPathComponent("api/cwk/mobile/media")); req.httpMethod = "POST"; req.setValue(token, forHTTPHeaderField: "Authorization"); req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                transfer.enqueue(request: req, file: body, description: id.uuidString + "/" + photo.id.uuidString)
            } else {
                d.state = .publishing; try repository.save(d); upsert(d)
                var fields = d.record?.fields ?? ["schemaVersion": .number(1), "embeds": .array([]), "recordDate": .string(Self.dateString(d.createdAt))]
                fields["body"] = .string(d.body); fields["category"] = .string(d.category); fields["status"] = .string("published")
                var attachments: [JSONValue] = []; if case .array(let existing) = fields["attachments"] { attachments = existing }
                attachments += d.photos.map { p in .object(["id": .string(p.id.uuidString), "mediaId": .string(p.mediaID ?? ""), "url": .string(p.mediaURL ?? ""), "name": .string(p.displayName), "mime": .string("image/jpeg"), "kind": .string("image"), "crop": .null, "comment": .string(p.comment)]) }
                fields["attachments"] = .array(attachments)
                if d.record == nil { fields["clientRequestId"] = .string(d.clientRequestId) }
                let file = repository.file(id, "publish.json"); try JSONEncoder().encode(fields).write(to: file, options: .atomic)
                let path = "api/cwk/records-v2" + (d.record.map { "/" + $0.id } ?? "")
                var req = URLRequest(url: environment.baseURL.appendingPathComponent(path)); req.httpMethod = d.record == nil ? "POST" : "PUT"; req.setValue(token, forHTTPHeaderField: "Authorization"); req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                transfer.enqueue(request: req, file: file, description: id.uuidString + "/publish")
            }
        } catch { fail(id, error.localizedDescription) }
    }
    private func completed(_ result: BackgroundTransfer.Result) async {
        let parts = result.description.split(separator: "/").map(String.init)
        guard parts.count == 2, let id = UUID(uuidString: parts[0]), let repository else { return }
        do {
            if token == nil { token = try keychain?.token(); isAuthenticated = token != nil }
            guard result.error == nil else { throw OwnerError.message("전송이 중단됐어. 초안은 보관돼 있어. 다시 시도해 줘.") }
            if result.status == 409, parts[1] == "publish", let recordID = try repository.read(id).recordID {
                try await verify(id, recordID: recordID); return
            }
            guard (200...299).contains(result.status) else {
                if result.status == 401 || result.status == 403 { isAuthenticated = false }
                throw serverError(result.status)
            }
            var d = try repository.read(id)
            if parts[1] == "publish" {
                let record = try JSONDecoder().decode(RecordDocument.self, from: result.data)
                guard !record.id.isEmpty else { throw OwnerError.message("게시 확인 응답이 올바르지 않아.") }
                d.recordID = record.id; d.state = .verifying; try repository.save(d); upsert(d); try await verify(id, recordID: record.id)
            } else {
                struct Media: Decodable { let id: String; let collectionId: String; let file: String }
                let media = try JSONDecoder().decode(Media.self, from: result.data)
                guard let index = d.photos.firstIndex(where: { $0.id.uuidString == parts[1] }), let base = environment?.baseURL else { throw OwnerError.message("전송한 사진의 초안을 찾지 못했어.") }
                d.photos[index].mediaID = media.id; d.photos[index].mediaURL = base.appendingPathComponent("api/files/\(media.collectionId)/\(media.id)/\(media.file)").absoluteString
                try repository.save(d); upsert(d); try? FileManager.default.removeItem(at: repository.file(id, "upload-\(parts[1]).multipart")); await schedule(id)
            }
        } catch { fail(id, error.localizedDescription) }
    }
    private func verify(_ id: UUID, recordID: String) async throws {
        guard let repository else { return }
        let data = try await request("api/cwk/records-v2/" + recordID)
        let record = try JSONDecoder().decode(RecordDocument.self, from: data)
        var d = try repository.read(id)
        guard record.id == recordID, record.body == d.body, record.category == d.category, record.fields["status"]?.string == "published" else { throw OwnerError.message("서버에 저장된 글이 초안과 달라. 웹에서 확인해 줘.") }
        let attachmentIDs: [String]
        if case .array(let attachments) = record.fields["attachments"] {
            attachmentIDs = attachments.compactMap { if case .object(let fields) = $0 { return fields["mediaId"]?.string }; return nil }
        } else { attachmentIDs = [] }
        var expectedIDs: [String] = []
        if case .array(let existing) = d.record?.fields["attachments"] { expectedIDs = existing.compactMap { if case .object(let fields) = $0 { return fields["mediaId"]?.string }; return nil } }
        expectedIDs += d.photos.compactMap(\.mediaID)
        guard attachmentIDs == expectedIDs else { throw OwnerError.message("게시된 글의 사진을 모두 확인하지 못했어.") }
        d.state = .published; d.error = nil; d.recordID = record.id; d.updatedAt = Date(); try repository.save(d); upsert(d); progress[id] = 1
    }
    private func fail(_ id: UUID, _ message: String) { do { if var d = try repository?.read(id) { d.state = .failed; d.error = message; try repository?.save(d); upsert(d) } } catch { lastError = error.localizedDescription }; lastError = message }
    private func request(_ path: String, method: String = "GET", body: [String: JSONValue]? = nil, authenticated: Bool = true) async throws -> Data {
        guard let environment, let url = URL(string: path, relativeTo: environment.baseURL.appendingPathComponent("/")) else { throw OwnerError.message("서버 주소가 없어.") }
        var req = URLRequest(url: url); req.httpMethod = method; req.timeoutInterval = 30
        if authenticated { guard let token else { throw OwnerError.message("로그인이 필요해.") }; req.setValue(token, forHTTPHeaderField: "Authorization") }
        if let body { req.httpBody = try JSONEncoder().encode(body); req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(status) else { if status == 401 { isAuthenticated = false }; throw serverError(status) }
        return data
    }
    private func serverError(_ status: Int) -> OwnerError {
        switch status {
        case 401, 403: return .message("OWNER 로그인을 다시 확인해 줘. 초안은 보관돼 있어.")
        case 409: return .message("웹에서 수정됐거나 같은 요청의 내용이 달라졌어. 게시물을 새로 불러와 확인해 줘.")
        case 413: return .message("사진 크기가 서버 한도를 넘었어.")
        default: return .message("서버가 요청을 완료하지 못했어 (\(status)). 잠시 후 다시 시도해 줘.")
        }
    }
    private static func dateString(_ date: Date) -> String { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: date) }
}
