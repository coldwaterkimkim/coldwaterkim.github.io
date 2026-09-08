import UIKit
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class ShareViewController: UIViewController {
    private let store = OwnerStore(sessionIdentifier: "com.coldwaterkim.owner.share.uploads")
    override func viewDidLoad() {
        super.viewDidLoad()
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        let initialText = items.compactMap { $0.attributedContentText?.string }.joined(separator: "\n")
        let host = UIHostingController(rootView: ShareComposer(store: store, providers: providers, initialText: initialText) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        })
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        host.didMove(toParent: self)
    }
}

@MainActor
private struct ShareComposer: View {
    @ObservedObject var store: OwnerStore
    let providers: [NSItemProvider]
    let initialText: String
    let complete: () -> Void
    @State private var draft: LocalDraft?
    @State private var bodyText = ""
    @State private var category = ""
    @State private var preparing = true
    @State private var saving = false
    @State private var error: String?
    @State private var loaded = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("이 장면에 남길 이야기…", text: $bodyText, axis: .vertical)
                        .lineLimit(4...10).accessibilityIdentifier("share.body")
                    OwnerCategoryPicker(category: $category)
                }
                .disabled(preparing || saving)
                Section {
                    if preparing { ProgressView("사진을 안전하게 복사하고 있어…") }
                    else if let draft {
                        Label("사진 \(draft.photos.count)장 준비됨", systemImage: "photo.on.rectangle")
                    }
                    if !store.isAuthenticated {
                        Text("먼저 초안으로 저장해 둬. 앱에서 OWNER 로그인한 뒤 게시할 수 있어.")
                            .foregroundStyle(.secondary)
                    } else {
                        Text("게시하면 기존 웹사이트에 반영돼. 전송 상태는 앱에서 확인할 수 있어.")
                            .foregroundStyle(.secondary)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section {
                    Button("초안으로 저장") { Task { await finish(publish: false) } }
                        .disabled(preparing || saving || draft == nil)
                        .accessibilityIdentifier("share.save")
                }
            }
            .navigationTitle("기록 남기기").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("게시") { Task { await finish(publish: true) } }
                        .disabled(preparing || saving || error != nil || !store.isAuthenticated || category.isEmpty || draft == nil || (bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft?.photos.isEmpty != false))
                        .accessibilityIdentifier("share.publish")
                }
            }
            .interactiveDismissDisabled(preparing || saving)
            .task { await prepare() }
        }.tint(OwnerStyle.blue)
    }
    private func prepare() async {
        guard !loaded else { return }
        loaded = true
        await store.bootstrap()
        guard let created = store.createDraft() else {
            error = store.lastError ?? "초안을 만들지 못했어. 앱에서 저장 공간을 확인해 줘."
            preparing = false
            return
        }
        draft = created
        bodyText = initialText
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                await store.importPhoto(from: provider, into: created.id)
                if let failure = store.lastError { error = failure }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                do {
                    let text: String = try await withCheckedThrowingContinuation { continuation in
                        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { value, failure in
                            if let failure { continuation.resume(throwing: failure) }
                            else if let text = value as? String { continuation.resume(returning: text) }
                            else if let data = value as? Data, let text = String(data: data, encoding: .utf8) { continuation.resume(returning: text) }
                            else { continuation.resume(returning: "") }
                        }
                    }
                    if !text.isEmpty && !bodyText.contains(text) { bodyText += (bodyText.isEmpty ? "" : "\n") + text }
                } catch { self.error = error.localizedDescription }
            }
        }
        draft = store.drafts.first { $0.id == created.id }
        preparing = false
    }
    private func finish(publish: Bool) async {
        guard var current = draft else { return }
        saving = true
        current.body = bodyText
        current.category = category
        do {
            try store.saveDraft(current)
            if publish {
                await store.publish(current.id)
                guard let scheduled = store.drafts.first(where: { $0.id == current.id }),
                      scheduled.state != .editing && scheduled.state != .failed else {
                    error = store.lastError ?? store.drafts.first(where: { $0.id == current.id })?.error ?? "전송을 예약하지 못했어. 초안은 저장돼 있어."
                    saving = false
                    return
                }
            }
            // OwnerStore.publish returns only after persistent queue scheduling.
            complete()
        } catch {
            self.error = error.localizedDescription
            saving = false
        }
    }
}
