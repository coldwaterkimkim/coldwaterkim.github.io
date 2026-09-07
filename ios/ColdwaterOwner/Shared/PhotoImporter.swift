import Foundation
import UIKit
import ImageIO
import UniformTypeIdentifiers

public enum PhotoImporter {
    public static func importFile(_ source: URL, directory: URL) async throws -> LocalPhoto {
        try await Task.detached(priority: .userInitiated) {
            let scoped = source.startAccessingSecurityScopedResource()
            defer { if scoped { source.stopAccessingSecurityScopedResource() } }
            guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, nil), let type = CGImageSourceGetType(imageSource) as String?,
                  [UTType.heic.identifier, UTType.heif.identifier, UTType.jpeg.identifier, UTType.png.identifier].contains(type) else {
                throw OwnerError.message("HEIC, JPEG, PNG 사진만 올릴 수 있어.")
            }
            let id = UUID(); let prefix = id.uuidString
            let suffix = UTType(type)?.preferredFilenameExtension ?? "jpg"
            let original = prefix + ".original." + suffix
            let display = prefix + ".jpg"; let thumbnail = prefix + ".thumb.jpg"
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let originalURL = directory.appendingPathComponent(original)
            try FileManager.default.copyItem(at: source, to: originalURL)
            do {
                // Only decoded pixels are encoded; no EXIF/GPS dictionary is copied to public JPEGs.
                try derivative(imageSource, at: directory.appendingPathComponent(display), maxPixel: 4096, quality: 0.90)
                try derivative(imageSource, at: directory.appendingPathComponent(thumbnail), maxPixel: 420, quality: 0.78)
            } catch {
                try? FileManager.default.removeItem(at: originalURL)
                try? FileManager.default.removeItem(at: directory.appendingPathComponent(display))
                throw error
            }
            return LocalPhoto(id: id, displayFilename: display, originalFilename: original, thumbnailFilename: thumbnail, displayName: source.lastPathComponent)
        }.value
    }
    private static func derivative(_ source: CGImageSource, at url: URL, maxPixel: Int, quality: Double) throws {
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: maxPixel, kCGImageSourceShouldCacheImmediately: true]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              let output = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { throw OwnerError.message("사진 미리보기를 만들지 못했어.") }
        CGImageDestinationAddImage(output, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(output) else { throw OwnerError.message("사진을 저장하지 못했어.") }
    }
    public static func importProvider(_ provider: NSItemProvider, directory: URL) async throws -> LocalPhoto {
        guard let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true }) else { throw OwnerError.message("사진 파일을 선택해 줘.") }
        // Provider URL is valid only within the callback. Preserve it before returning.
        let copy: URL = try await withCheckedThrowingContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
                guard let url else { continuation.resume(throwing: error ?? OwnerError.message("사진을 가져오지 못했어.")); return }
                do {
                    let staging = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(url.pathExtension)
                    try FileManager.default.copyItem(at: url, to: staging)
                    continuation.resume(returning: staging)
                } catch { continuation.resume(throwing: error) }
            }
        }
        defer { try? FileManager.default.removeItem(at: copy) }
        return try await importFile(copy, directory: directory)
    }
}
