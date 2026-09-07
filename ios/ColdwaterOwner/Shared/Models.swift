import Foundation

/// Keeps every field returned by the server, including legacy HTML, embeds and future fields.
public enum JSONValue: Codable, Equatable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try c.decode([JSONValue].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    public var string: String? { if case .string(let s) = self { return s }; return nil }
}
public struct RecordDocument: Codable, Identifiable {
    public var fields: [String: JSONValue]
    public var id: String { fields["id"]?.string ?? "" }
    public var body: String { fields["body"]?.string ?? "" }
    public var category: String { fields["category"]?.string ?? "" }
    public init(fields: [String: JSONValue]) { self.fields = fields }
    public init(from decoder: Decoder) throws { fields = try decoder.singleValueContainer().decode([String: JSONValue].self) }
    public func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); try c.encode(fields) }
}
public enum DraftState: String, Codable { case editing, preparing, uploading, publishing, verifying, published, failed }
public struct LocalPhoto: Codable, Identifiable {
    public var id = UUID()
    public var displayFilename: String
    public var originalFilename: String
    public var thumbnailFilename: String
    public var displayName: String
    public var comment = ""
    public var mediaID: String?
    public var mediaURL: String?
}
public struct LocalDraft: Codable, Identifiable {
    public var id = UUID()
    public var body = ""
    public var category = ""
    public var photos: [LocalPhoto] = []
    public var state: DraftState = .editing
    public var error: String?
    public var recordID: String?
    public var record: RecordDocument?
    public var hasSubmitted = false
    public var clientRequestId = UUID().uuidString.lowercased()
    public var createdAt = Date()
    public var updatedAt = Date()
    public init() {}
}
public enum OwnerError: LocalizedError {
    case message(String)
    public var errorDescription: String? { switch self { case .message(let s): return s } }
}
public struct OwnerEnvironment {
    public let baseURL: URL
    public let appGroup: String
    public let keychainGroup: String
    static var isUITesting: Bool {
        #if DEBUG && targetEnvironment(simulator)
        return ProcessInfo.processInfo.environment["CWK_UI_TESTING"] == "1"
        #else
        return false
        #endif
    }
    public init(bundle: Bundle = .main) throws {
        guard let url = URL(string: bundle.object(forInfoDictionaryKey: "OwnerServerURL") as? String ?? "https://coldwaterkim.com"), url.scheme == "https", url.host != nil,
              let group = bundle.object(forInfoDictionaryKey: "AppGroupIdentifier") as? String, !group.isEmpty,
              let keychain = bundle.object(forInfoDictionaryKey: "KeychainAccessGroup") as? String, !keychain.isEmpty, !keychain.contains("$(") || Self.isUITesting else {
            throw OwnerError.message("앱의 서버·공유 저장소·서명 설정을 확인해 줘.")
        }
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.environment["CWK_UI_TESTING"] == "1",
           let raw = ProcessInfo.processInfo.environment["CWK_TEST_SERVER_URL"],
           let testURL = URL(string: raw), testURL.host == "127.0.0.1", testURL.scheme == "http" {
            baseURL = testURL
        } else { baseURL = url }
        #else
        baseURL = url
        #endif
        appGroup = group; keychainGroup = keychain
    }
}
