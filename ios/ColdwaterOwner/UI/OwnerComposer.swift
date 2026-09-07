import SwiftUI
import PhotosUI
import CoreTransferable
import UniformTypeIdentifiers

private struct ImportedPhotoFile: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let copy = directory.appendingPathComponent(received.file.lastPathComponent)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return ImportedPhotoFile(url: copy)
        }
    }
}

@MainActor
struct OwnerComposer: View {
    @ObservedObject var store: OwnerStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var draft: LocalDraft
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var importing = false
    @State private var submitting = false
    @State private var saveTask: Task<Void, Never>?
    @State private var localError: String?

    init(store: OwnerStore, draft: LocalDraft) {
        self.store = store
        _draft = State(initialValue: draft)
    }
    private var editable: Bool { draft.state == .editing && !importing && !submitting }
    private var canPublish: Bool {
        editable && !draft.category.isEmpty && store.isAuthenticated &&
        (!draft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !draft.photos.isEmpty || hasExistingAttachments)
    }
    private var hasExistingAttachments: Bool {
        if case .array(let attachments) = draft.record?.fields["attachments"] { return !attachments.isEmpty }
        return false
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("지금 남기고 싶은 이야기…", text: $draft.body, axis: .vertical)
                        .lineLimit(5...20)
                        .font(.body)
                        .accessibilityIdentifier("compose.body")
                    OwnerCategoryPicker(category: $draft.category)
                } header: { Text("나의 기록") }
                .disabled(!editable)
                if draft.record != nil {
                    Section {
                        Text("기존 사진과 크롭은 그대로 보존돼. 여기서는 본문·분류를 수정하고 새 사진을 추가할 수 있어.").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section {
                    ForEach($draft.photos) { $photo in
                        HStack(alignment: .top, spacing: 12) {
                            LocalPhotoThumbnail(url: store.fileURL(for: draft.id, filename: photo.thumbnailFilename))
                                .frame(width: 72, height: 86).clipShape(RoundedRectangle(cornerRadius: 10))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 8) {
                                Text(photo.displayName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                TextField("이 사진에 한마디", text: $photo.comment, axis: .vertical)
                                    .lineLimit(2...5)
                                    .accessibilityLabel("사진 설명 \(photo.displayName)")
                            }
                        }
                    }
                    .onMove { from, to in draft.photos.move(fromOffsets: from, toOffset: to); scheduleSave() }
                    .onDelete { offsets in draft.photos.remove(atOffsets: offsets); scheduleSave() }
                    .disabled(!editable)
                    PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 30,
                                 selectionBehavior: .ordered, matching: .images,
                                 preferredItemEncoding: .current) {
                        Label(importing ? "사진을 준비하고 있어…" : "사진 추가", systemImage: "photo.on.rectangle.angled")
                    }
                    .disabled(!editable)
                    .accessibilityIdentifier("compose.photos")
                } header: {
                    HStack {
                        Text("사진 \(draft.photos.count)장")
                        Spacer()
                        if !draft.photos.isEmpty { EditButton().disabled(!editable) }
                    }
                } footer: {
                    Text("사진과 글은 이 기기에 자동 저장돼. 게시를 누르면 기존 웹사이트에 올라가.")
                }
                if let localError {
                    Section { Label(localError, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
                }
                if draft.state != .editing {
                    Section { DraftStatusView(draft: draft) }
                }
                if !store.isAuthenticated {
                    Section { Text("설정에서 OWNER 로그인하면 게시할 수 있어. 초안은 먼저 써도 돼.").foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("기록 남기기")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { if !editable || flush() { dismiss() } }
                        .disabled(importing || submitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("게시") {
                        guard flush() else { return }
                        submitting = true
                        Task {
                            await store.publish(draft.id)
                            submitting = false
                            if let saved = store.drafts.first(where: { $0.id == draft.id }) {
                                draft = saved
                                if saved.state != .editing && saved.state != .failed { dismiss() }
                                else { localError = saved.error ?? store.lastError }
                            }
                        }
                    }
                    .fontWeight(.semibold).disabled(!canPublish)
                    .accessibilityIdentifier("compose.publish")
                }
            }
            .onChange(of: draft.body) { _, _ in scheduleSave() }
            .onChange(of: draft.category) { _, _ in scheduleSave() }
            .onChange(of: draft.photos.map(\.comment)) { _, _ in scheduleSave() }
            .onChange(of: selectedPhotos) { _, items in
                guard !items.isEmpty else { return }
                Task { await importPhotos(items) }
            }
            .onChange(of: scenePhase) { _, phase in if phase != .active && editable { _ = flush() } }
            .onDisappear { saveTask?.cancel(); if editable { _ = flush() } }
            .interactiveDismissDisabled(importing || submitting || localError != nil)
        }
        .tint(OwnerStyle.blue)
    }
    private func scheduleSave() {
        guard editable else { return }
        saveTask?.cancel()
        saveTask = Task { @MainActor in
            do { try await Task.sleep(for: .milliseconds(350)); _ = flush() }
            catch { }
        }
    }
    @discardableResult private func flush() -> Bool {
        saveTask?.cancel()
        guard draft.state == .editing else { return true }
        do { try store.saveDraft(draft); localError = nil; return true }
        catch { localError = error.localizedDescription; return false }
    }
    private func importPhotos(_ items: [PhotosPickerItem]) async {
        guard flush() else { return }
        importing = true
        defer { importing = false; selectedPhotos = [] }
        for item in items {
            do {
                guard let file = try await item.loadTransferable(type: ImportedPhotoFile.self) else {
                    throw OwnerError.message("사진을 불러오지 못했어. 다시 선택해 줘.")
                }
                defer { try? FileManager.default.removeItem(at: file.url.deletingLastPathComponent()) }
                await store.importPhoto(from: file.url, into: draft.id)
                if let error = store.lastError { localError = error }
            } catch { localError = error.localizedDescription }
        }
        if let saved = store.drafts.first(where: { $0.id == draft.id }) { draft = saved }
    }
}

struct DraftStatusView: View {
    let draft: LocalDraft
    private var status: (String, String) {
        switch draft.state {
        case .editing: return ("임시 저장", "square.and.pencil")
        case .preparing: return ("게시 준비 중", "clock")
        case .uploading: return ("사진 전송 중 · 아직 공개되지 않았어", "arrow.up.circle")
        case .publishing: return ("웹사이트에 게시 중", "arrow.up.circle")
        case .verifying: return ("웹사이트 반영 확인 중", "clock.badge.checkmark")
        case .published: return ("웹사이트 반영 완료", "checkmark.circle.fill")
        case .failed: return ("확인이 필요해", "exclamationmark.circle")
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(status.0, systemImage: status.1)
                .foregroundStyle(draft.state == .failed ? .red : OwnerStyle.blue)
                .font(.subheadline)
            if let error = draft.error { Text(error).font(.caption).foregroundStyle(.secondary) }
        }
        .accessibilityIdentifier("draft.status.\(draft.state.rawValue)")
    }
}
