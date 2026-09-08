import Foundation

/// Every task has a stable draft/photo description and file-backed body. No token is written to disk.
final class BackgroundTransfer: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
    struct Result { let description: String; let status: Int; let data: Data; let error: Error? }
    let identifier: String
    let group: String
    var onComplete: ((Result) async -> Void)?
    private var pendingCompletions = 0
    private var receivedFinishedEvents = false
    var onProgress: ((String, Double) -> Void)?
    var finishedEvents: (() -> Void)?
    private var bodies: [Int: Data] = [:]
    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.background(withIdentifier: identifier)
        if !OwnerEnvironment.isUITesting { c.sharedContainerIdentifier = group }
        c.sessionSendsLaunchEvents = true
        c.isDiscretionary = false
        c.httpMaximumConnectionsPerHost = 2
        c.timeoutIntervalForResource = 7 * 24 * 3600
        return URLSession(configuration: c, delegate: self, delegateQueue: .main)
    }()
    init(identifier: String, group: String) { self.identifier = identifier; self.group = group; super.init() }
    func tasks() async -> [URLSessionTask] { await withCheckedContinuation { continuation in session.getAllTasks { continuation.resume(returning: $0) } } }
    func enqueue(request: URLRequest, file: URL, description: String) {
        let task = session.uploadTask(with: request, fromFile: file); task.taskDescription = description; task.resume()
    }
    func cancelAll() async { for task in await tasks() { task.cancel() } }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        if (bodies[dataTask.taskIdentifier]?.count ?? 0) + data.count <= 5 * 1024 * 1024 { bodies[dataTask.taskIdentifier, default: Data()].append(data) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        onProgress?(task.taskDescription ?? "", totalBytesExpectedToSend > 0 ? Double(totalBytesSent) / Double(totalBytesExpectedToSend) : 0)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let result = Result(description: task.taskDescription ?? "", status: (task.response as? HTTPURLResponse)?.statusCode ?? 0, data: bodies.removeValue(forKey: task.taskIdentifier) ?? Data(), error: error)
        pendingCompletions += 1
        Task { @MainActor in
            await onComplete?(result)
            pendingCompletions -= 1
            finishIfReady()
        }
    }
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) { receivedFinishedEvents = true; finishIfReady() }
    private func finishIfReady() {
        guard receivedFinishedEvents, pendingCompletions == 0 else { return }
        finishedEvents?(); finishedEvents = nil; receivedFinishedEvents = false
    }
}

enum MultipartFile {
    static func write(to destination: URL, requestID: String, display: URL, original: URL, boundary: String) throws {
        FileManager.default.createFile(atPath: destination.path, contents: nil)
        let handle = try FileHandle(forWritingTo: destination); defer { try? handle.close() }
        func text(_ string: String) throws { try handle.write(contentsOf: Data(string.utf8)) }
        try text("--\(boundary)\r\nContent-Disposition: form-data; name=\"requestId\"\r\n\r\n\(requestID)\r\n")
        for (field, file, mime) in [("file", display, "image/jpeg"), ("original", original, original.pathExtension.lowercased() == "png" ? "image/png" : (["heic", "heif"].contains(original.pathExtension.lowercased()) ? "image/heic" : "image/jpeg"))] {
            try text("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"; filename=\"\(file.lastPathComponent)\"\r\nContent-Type: \(mime)\r\n\r\n")
            let input = try FileHandle(forReadingFrom: file)
            do { while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty { try handle.write(contentsOf: chunk) }; try input.close() } catch { try? input.close(); throw error }
            try text("\r\n")
        }
        try text("--\(boundary)--\r\n")
    }
}
