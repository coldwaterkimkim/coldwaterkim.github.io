import Foundation
import Security
import Darwin

public final class DraftRepository {
    public let root: URL
    public init(appGroup: String) throws {
        let container: URL?
        #if DEBUG && targetEnvironment(simulator)
        if OwnerEnvironment.isUITesting {
            container = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("ExplicitUITestStorage")
        } else { container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) }
        #else
        container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
        #endif
        guard let group = container else {
            throw OwnerError.message("공유 저장소에 접근할 수 없어. App Group 서명을 확인해 줘.")
        }
        root = group.appendingPathComponent("Drafts", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: root.path)
    }
    public func directory(_ id: UUID) -> URL { root.appendingPathComponent(id.uuidString, isDirectory: true) }
    public func file(_ id: UUID, _ name: String) -> URL { directory(id).appendingPathComponent(URL(fileURLWithPath: name).lastPathComponent) }
    public func loadAll() throws -> [LocalDraft] {
        try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey]).compactMap { url in
            guard UUID(uuidString: url.lastPathComponent) != nil else { return nil }
            return try read(UUID(uuidString: url.lastPathComponent)!)
        }.sorted { $0.updatedAt > $1.updatedAt }
    }
    public func read(_ id: UUID) throws -> LocalDraft {
        let url = file(id, "draft.json")
        var coordinationError: NSError?; var result: Result<LocalDraft, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { location in
            result = Result { try JSONDecoder().decode(LocalDraft.self, from: Data(contentsOf: location)) }
        }
        if let error = coordinationError { throw error }
        guard let result else { throw OwnerError.message("초안을 읽지 못했어.") }
        return try result.get()
    }
    public func save(_ draft: LocalDraft) throws {
        try FileManager.default.createDirectory(at: directory(draft.id), withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(draft)
        var coordinationError: NSError?; var writeError: Error?
        NSFileCoordinator().coordinate(writingItemAt: file(draft.id, "draft.json"), options: .forReplacing, error: &coordinationError) { url in
            do { try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) } catch { writeError = error }
        }
        if let error = coordinationError ?? writeError as NSError? { throw error }
    }
    public func delete(_ id: UUID) throws {
        var coordinationError: NSError?; var writeError: Error?
        NSFileCoordinator().coordinate(writingItemAt: directory(id), options: .forDeleting, error: &coordinationError) { url in
            do { try FileManager.default.removeItem(at: url) } catch { writeError = error }
        }
        if let error = coordinationError ?? writeError as NSError? { throw error }
    }
}
final class OwnerKeychain {
    let group: String
    init(group: String) { self.group = group }
    var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "ColdwaterOwner", kSecAttrAccount as String: "owner-token", kSecAttrAccessGroup as String: group] }
    private var testToken: String?
    func token() throws -> String? {
        if OwnerEnvironment.isUITesting { return testToken }
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?; let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data, let token = String(data: data, encoding: .utf8) else { throw OwnerError.message("로그인 정보를 읽지 못했어. 서명 설정을 확인해 줘.") }
        return token
    }
    func save(_ token: String) throws {
        if OwnerEnvironment.isUITesting { testToken = token; return }
        let data = Data(token.utf8)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var q = query; q[kSecValueData as String] = data; q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw OwnerError.message("로그인을 안전하게 저장하지 못했어.") }; return
        }
        guard status == errSecSuccess else { throw OwnerError.message("로그인 정보를 갱신하지 못했어.") }
    }
    func clear() throws { if OwnerEnvironment.isUITesting { testToken = nil; return }; let s = SecItemDelete(query as CFDictionary); guard s == errSecSuccess || s == errSecItemNotFound else { throw OwnerError.message("로그인 정보를 지우지 못했어.") } }
}

/// Process lifetime ownership; the kernel releases the lock on suspension termination/crash.
final class SessionLease {
    private let descriptor: Int32
    init(root: URL, identifier: String) throws {
        let safe = identifier.replacingOccurrences(of: "/", with: "_")
        let url = root.appendingPathComponent("session-" + safe + ".lock")
        descriptor = open(url.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw OwnerError.message("전송 잠금을 만들지 못했어.") }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            close(descriptor)
            throw OwnerError.message("공유 화면에서 전송을 준비 중이야. 공유 화면을 닫은 뒤 다시 시도해 줘.")
        }
    }
    deinit { flock(descriptor, LOCK_UN); close(descriptor) }
}
