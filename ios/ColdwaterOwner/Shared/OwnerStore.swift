import Foundation
import Combine
import UIKit

@MainActor public final class OwnerStore: ObservableObject {
    @Published public private(set) var drafts: [LocalDraft] = []
    @Published public private(set) var isAuthenticated = false
    @Published public private(set) var accountEmail = ""
    @Published public var lastError: String?
    @Published public private(set) var isBusy = false
    @Published public private(set) var progress: [UUID: Double] = [:]
    @Published public private(set) var records: [RecordDocument] = []
    private var environment: OwnerEnvironment?
    private var repository: DraftRepository?
    private var keychain: OwnerKeychain?
    private var transfer: BackgroundTransfer?
    private var restored: [String: BackgroundTransfer] = [:]
    private var token: String?
    private var scheduling: Set<UUID> = []
    public init(sessionIdentifier: String = "com.coldwaterkim.owner.uploads") {
        do {
            let e = try OwnerEnvironment(); environment = e
            repository = try DraftRepository(appGroup: e.appGroup); keychain = OwnerKeychain(group: e.keychainGroup)
            transfer = makeTransfer(sessionIdentifier, group: e.appGroup)
        } catch { lastError = error.localizedDescription }
    }
    private func makeTransfer(_ identifier: String, group: String) -> BackgroundTransfer {
        let t = BackgroundTransfer(identifier: identifier, group: group)
        t.onComplete = { [weak self] result in await self?.completed(result) }
        t.onProgress = { [weak self] description, value in if let id = UUID(uuidString: String(description.split(separator: "/").first ?? "")) { self?.progress[id] = value } }
        return t
    }
    public func restoreBackgroundSession(identifier: String, completionHandler: @escaping () -> Void) {
        guard let e = environment else { completionHandler(); return }
        let t: BackgroundTransfer
        if transfer?.identifier == identifier { t = transfer! }
        else if let existing = restored[identifier] { t = existing }
        else { t = makeTransfer(identifier, group: e.appGroup); restored[identifier] = t }
        t.finishedEvents = completionHandler
        Task { _ = await t.tasks() }
    }
    public var publishedRecords: [RecordDocument] { records }
    public func refreshPublished() async { await loadRecords() }
    public func bootstrap() async {
        do {
            if transfer?.identifier == "com.coldwaterkim.owner.uploads", let e = environment, restored["com.coldwaterkim.owner.share.uploads"] == nil {
                restored["com.coldwaterkim.owner.share.uploads"] = makeTransfer("com.coldwaterkim.owner.share.uploads", group: e.appGroup)
            }
            try reload(); token = try keychain?.token(); isAuthenticated = token != nil
            if isAuthenticated {
                do { try await refreshToken() } catch { lastError = error.localizedDescription }
                for draft in drafts where [.preparing, .uploading, .publishing, .verifying].contains(draft.state) { await schedule(draft.id) }
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
    private func reload() throws { if let repository { drafts = try repository.loadAll() } }
    public func createDraft() -> LocalDraft? {
        do { guard let repository else { throw OwnerError.message("공유 저장소가 준비되지 않았어.") }; let draft = LocalDraft(); try repository.save(draft); try reload(); return draft }
        catch { lastError = error.localizedDescription; return nil }
    }
    public func saveDraft(_ draft: LocalDraft) throws {
        guard let repository else { throw OwnerError.message("공유 저장소가 준비되지 않았어.") }
        if let old = try? repository.read(draft.id), old.hasSubmitted { throw OwnerError.message("전송한 초안은 수정할 수 없어. 게시물에서 다시 편집해 줘.") }
        var copy = draft; copy.updatedAt = Date(); try repository.save(copy); try reload()
    }
    public func deleteDraft(_ draft: LocalDraft) throws {
        guard [.editing, .failed, .published].contains(draft.state) else { throw OwnerError.message("전송 중에는 초안을 지울 수 없어.") }
        try repository?.delete(draft.id); try reload()
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
            guard !before.hasSubmitted else { throw OwnerError.message("새 초안에 사진을 추가해 줘.") }
            let photo = try await operation(repository.directory(id))
            var draft = try repository.read(id); draft.photos.append(photo); lastError = nil; draft.updatedAt = Date(); try repository.save(draft); try reload()
        } catch { lastError = error.localizedDescription }
    }
    public func publish(_ draftID: UUID) async {
        do {
            guard isAuthenticated, let repository else { throw OwnerError.message("먼저 OWNER 로그인을 해 줘.") }
            var d = try repository.read(draftID)
            guard ["posts", "daily", "nasajab", "projects"].contains(d.category) else { throw OwnerError.message("분류를 선택해 줘.") }
            let hasExistingAttachments: Bool
            if case .array(let attachments) = d.record?.fields["attachments"] { hasExistingAttachments = !attachments.isEmpty } else { hasExistingAttachments = false }
            guard !d.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !d.photos.isEmpty || hasExistingAttachments else { throw OwnerError.message("사진이나 글을 추가해 줘.") }
            d.hasSubmitted = true
            if d.recordID != nil, d.record == nil { d.state = .verifying } else { d.state = .preparing }
             d.error = nil; try repository.save(d); try reload(); await schedule(draftID)
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
            var d = LocalDraft(); d.body = record.body; d.category = record.category; d.record = record; d.recordID = record.id
            try repository.save(d); try reload(); return d
        } catch { lastError = error.localizedDescription; return nil }
    }
    private func schedule(_ id: UUID) async {
        guard !scheduling.contains(id), let repository, let transfer, let environment, let token else { return }
        scheduling.insert(id); defer { scheduling.remove(id) }
        do {
            var d = try repository.read(id)
            if d.state == .verifying, let recordID = d.recordID { try await verify(id, recordID: recordID); return }
            var active = await transfer.tasks()
            for t in restored.values { active += await t.tasks() }
            let names = Set(active.compactMap(\.taskDescription))
            if names.contains(where: { $0.hasPrefix(id.uuidString + "/") }) { return }
            if let photo = d.photos.first(where: { $0.mediaID == nil }) {
                d.state = .uploading; try repository.save(d); try reload()
                let boundary = "cwk-" + photo.id.uuidString
                let body = repository.file(id, "upload-\(photo.id).multipart")
                let display = repository.file(id, photo.displayFilename), original = repository.file(id, photo.originalFilename)
                try await Task.detached(priority: .utility) { try MultipartFile.write(to: body, requestID: photo.id.uuidString.lowercased(), display: display, original: original, boundary: boundary) }.value
                var req = URLRequest(url: environment.baseURL.appendingPathComponent("api/cwk/mobile/media")); req.httpMethod = "POST"; req.setValue(token, forHTTPHeaderField: "Authorization"); req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                transfer.enqueue(request: req, file: body, description: id.uuidString + "/" + photo.id.uuidString)
            } else {
                d.state = .publishing; try repository.save(d); try reload()
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
            guard result.error == nil else { throw OwnerError.message("전송이 중단됐어. 초안은 보관돼 있어. 다시 시도해 줘.") }
            if result.status == 409, parts[1] == "publish", let recordID = try repository.read(id).recordID {
                try await verify(id, recordID: recordID); return
            }
            guard (200...299).contains(result.status) else { throw serverError(result.status) }
            var d = try repository.read(id)
            if parts[1] == "publish" {
                let record = try JSONDecoder().decode(RecordDocument.self, from: result.data)
                guard !record.id.isEmpty else { throw OwnerError.message("게시 확인 응답이 올바르지 않아.") }
                d.recordID = record.id; d.state = .verifying; try repository.save(d); try reload(); try await verify(id, recordID: record.id)
            } else {
                struct Media: Decodable { let id: String; let collectionId: String; let file: String }
                let media = try JSONDecoder().decode(Media.self, from: result.data)
                guard let index = d.photos.firstIndex(where: { $0.id.uuidString == parts[1] }), let base = environment?.baseURL else { throw OwnerError.message("전송한 사진의 초안을 찾지 못했어.") }
                d.photos[index].mediaID = media.id; d.photos[index].mediaURL = base.appendingPathComponent("api/files/\(media.collectionId)/\(media.id)/\(media.file)").absoluteString
                try repository.save(d); try? FileManager.default.removeItem(at: repository.file(id, "upload-\(parts[1]).multipart")); try reload(); await schedule(id)
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
        d.state = .published; d.error = nil; d.recordID = record.id; d.updatedAt = Date(); try repository.save(d); try reload(); progress[id] = 1
    }
    private func fail(_ id: UUID, _ message: String) { do { if var d = try repository?.read(id) { d.state = .failed; d.error = message; try repository?.save(d); try reload() } } catch { lastError = error.localizedDescription }; lastError = message }
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
