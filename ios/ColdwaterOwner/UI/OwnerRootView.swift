import SwiftUI

@MainActor
struct OwnerRootView: View {
    @ObservedObject var store: OwnerStore
    @State private var composer: LocalDraft?
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        TabView {
            NavigationStack {
                draftList(published: false)
                    .navigationTitle("나의 기록")
                    .toolbar {
                        ToolbarItem(placement: .primaryAction) {
                            Button { composer = store.createDraft() } label: {
                                Label("기록 남기기", systemImage: "square.and.pencil")
                            }.accessibilityIdentifier("drafts.compose")
                        }
                    }
            }.tabItem { Label("작성 중", systemImage: "square.and.pencil") }
            NavigationStack {
                publishedList.navigationTitle("게시한 기록")
            }.tabItem { Label("게시 완료", systemImage: "checkmark.circle") }
            NavigationStack { OwnerSettingsView(store: store) }
                .tabItem { Label("설정", systemImage: "gearshape") }
        }
        .tint(OwnerStyle.blue)
        .sheet(item: $composer) { draft in OwnerComposer(store: store, draft: draft) }
        .task { await store.bootstrap() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.bootstrap() } }
        }
    }
    @ViewBuilder private func draftList(published: Bool) -> some View {
        let records = store.drafts.filter { ($0.state == .published) == published }
        List {
            if let error = store.lastError {
                Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red).font(.subheadline) }
            }
            if records.isEmpty {
                ContentUnavailableView {
                    Label(published ? "아직 게시한 기록이 없어" : "오늘의 장면을 남겨 봐", systemImage: published ? "checkmark.circle" : "camera")
                } description: {
                    Text(published ? "이 앱에서 게시하고 웹사이트 반영을 확인한 기록이 여기에 보여." : "사진 몇 장, 짧은 이야기. 준비되면 웹사이트로 보내면 돼.")
                } actions: {
                    if !published {
                        Button("첫 기록 남기기") { composer = store.createDraft() }.buttonStyle(.borderedProminent)
                    }
                }.listRowBackground(Color.clear)
            }
            ForEach(records) { draft in
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 12) {
                        if let photo = draft.photos.first {
                            LocalPhotoThumbnail(url: store.fileURL(for: draft.id, filename: photo.thumbnailFilename))
                                .frame(width: 64, height: 72).clipShape(RoundedRectangle(cornerRadius: 9))
                        }
                        VStack(alignment: .leading, spacing: 5) {
                            Text(draft.body.isEmpty ? "사진 \(draft.photos.count)장" : draft.body)
                                .font(.body).lineLimit(3)
                            Text("\(OwnerStyle.categoryName(draft.category)) · \(draft.updatedAt.formatted(date: .abbreviated, time: .omitted))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    DraftStatusView(draft: draft)
                    if draft.state == .editing {
                        Button("이어서 쓰기") { composer = draft }
                            .accessibilityIdentifier("draft.resume")
                    } else if draft.state == .failed {
                        Button("다시 시도") { Task { await store.retry(draft.id) } }
                            .disabled(store.isBusy).accessibilityIdentifier("draft.retry")
                    }
                    if draft.state == .published, let id = draft.recordID, let url = store.siteURL(for: id) {
                        Link("웹사이트에서 보기", destination: url)
                    }
                }
                .padding(.vertical, 7)
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await store.bootstrap() }
    }
    private var publishedList: some View {
        List {
            Section("웹사이트의 기록") {
                if store.records.isEmpty {
                    Text("아래로 당겨 웹사이트의 기록을 불러와.").foregroundStyle(.secondary)
                }
                ForEach(store.records) { record in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(record.body.isEmpty ? "첨부 기록" : record.body).lineLimit(4)
                        Text(OwnerStyle.categoryName(record.category)).font(.caption).foregroundStyle(.secondary)
                        HStack {
                            if store.isAuthenticated {
                                Button("수정") { composer = store.editRecord(record) }
                                    .accessibilityIdentifier("published.edit")
                            }
                            Spacer()
                            if let url = store.siteURL(for: record.id) {
                                Link("웹에서 보기", destination: url)
                            }
                        }.buttonStyle(.borderless)
                    }.padding(.vertical, 6)
                }
            }
            Section("이 앱에서 반영 완료") {
                ForEach(store.drafts.filter { $0.state == .published }) { draft in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(draft.body.isEmpty ? "사진 기록" : draft.body).lineLimit(2)
                        DraftStatusView(draft: draft)
                        if let id = draft.recordID, let url = store.siteURL(for: id) {
                            Link("웹사이트에서 보기", destination: url)
                        }
                    }
                }
            }
            if let error = store.lastError { Text(error).foregroundStyle(.red) }
        }
        .task { await store.loadRecords() }
        .refreshable { await store.bootstrap(); await store.loadRecords() }
    }

}

@MainActor
struct OwnerSettingsView: View {
    @ObservedObject var store: OwnerStore
    @State private var email = ""
    @State private var password = ""
    @State private var loggingIn = false
    var body: some View {
        Form {
            Section {
                if store.isAuthenticated {
                    Label("OWNER 로그인됨", systemImage: "person.crop.circle.badge.checkmark")
                    Text(store.accountEmail).foregroundStyle(.secondary)
                    Button("로그아웃", role: .destructive) { store.logout(); password = "" }
                } else {
                    TextField("이메일", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("settings.email")
                    SecureField("비밀번호", text: $password).textContentType(.password)
                        .accessibilityIdentifier("settings.password")
                    Button {
                        loggingIn = true
                        Task {
                            await store.login(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
                            loggingIn = false
                            if store.isAuthenticated { password = "" }
                        }
                    } label: {
                        HStack { Text("로그인"); if loggingIn { Spacer(); ProgressView() } }
                    }
                    .disabled(loggingIn || email.isEmpty || password.isEmpty)
                    .accessibilityIdentifier("settings.login")
                }
            } header: { Text("내 웹사이트") }
            if let error = store.lastError {
                Section { Text(error).foregroundStyle(.red) }
            }
            Section("사진과 게시") {
                Text("사진 앱에서 공유 → 이 앱을 선택해도 기록을 남길 수 있어.")
                Text("전송을 시작한 기록은 완료 여부를 확인할 때까지 보관해. 앱을 직접 강제 종료하면 전송을 이어가려면 앱을 다시 열어야 할 수 있어.")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("설정")
    }
}
