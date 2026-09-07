import SwiftUI

// Native controls keep Dynamic Type, VoiceOver and Reduce Motion behavior.
enum OwnerStyle {
    static let paper = Color(uiColor: .systemGroupedBackground)
    static let blue = Color(red: 0.10, green: 0.27, blue: 0.78)
    static let yellow = Color(red: 1, green: 0.88, blue: 0.40)
    static let categories: [(String, String)] = [
        ("posts", "글방"), ("daily", "나으 하루"),
        ("nasajab", "나사잡"), ("projects", "프로젝트")
    ]
    static func categoryName(_ key: String) -> String {
        categories.first { $0.0 == key }?.1 ?? "분류 선택"
    }
}

struct OwnerCategoryPicker: View {
    @Binding var category: String
    var body: some View {
        Picker("분류", selection: $category) {
            Text("분류 선택").tag("")
            ForEach(OwnerStyle.categories, id: \.0) { key, title in
                Text(title).tag(key)
            }
        }
        .accessibilityIdentifier("compose.category")
    }
}

struct LocalPhotoThumbnail: View {
    let url: URL?
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(.quaternary).overlay {
                    Image(systemName: "photo").foregroundStyle(.secondary)
                }
            }
        }
        .clipped()
        .task(id: url) {
            guard let url else { image = nil; return }
            // The shared importer produces a small on-disk thumbnail.
            let loaded = await Task.detached(priority: .userInitiated) {
                UIImage(contentsOfFile: url.path)
            }.value
            guard !Task.isCancelled else { return }
            image = loaded
        }
    }
}
