import CryptoKit
import ExpoModulesCore
import UIKit

public class ProfileAvatarMaskerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ProfileAvatarMasker")

    // NativeTabs renders supplied image sources as-is. Preparing the image here
    // preserves its Liquid Glass host while giving the avatar the same circular
    // treatment used by the rest of the app.
    AsyncFunction("createMaskedAvatar") { (sourceURL: String) throws -> String in
      guard let url = URL(string: sourceURL) else {
        throw ProfileAvatarMaskerError.invalidURL
      }

      let destination = try self.destinationURL(for: sourceURL)
      if FileManager.default.fileExists(atPath: destination.path) {
        return destination.absoluteString
      }

      let data = try Data(contentsOf: url)
      guard let image = UIImage(data: data), let rendered = self.render(image), let png = rendered.pngData() else {
        throw ProfileAvatarMaskerError.invalidImage
      }

      try png.write(to: destination, options: .atomic)
      return destination.absoluteString
    }
  }

  private func destinationURL(for sourceURL: String) throws -> URL {
    // Include the visual treatment in the cache key so a styling update never
    // reuses an older generated tab icon.
    let cacheKey = "profile-tab-avatar-v7:\(sourceURL)"
    let hash = SHA256.hash(data: Data(cacheKey.utf8)).map { String(format: "%02x", $0) }.joined()
    let directory = try FileManager.default.url(
      for: .cachesDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    ).appendingPathComponent("profile-avatar-masker", isDirectory: true)

    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory.appendingPathComponent("\(hash).png")
  }

  private func render(_ image: UIImage) -> UIImage? {
    // Native tab icons are 24 points. A 24-point result avoids the oversized
    // intrinsic dimensions that an unprocessed remote photo supplies.
    let size = CGSize(width: 24, height: 24)
    // SF Symbols leave optical whitespace inside their icon canvas. Matching
    // that footprint keeps the photo from reading larger than neighboring tabs.
    let avatarRect = CGRect(x: 8, y: 8, width: 8, height: 8)
    let borderWidth: CGFloat = 0.6
    let renderer = UIGraphicsImageRenderer(size: size)

    return renderer.image { context in
      let imageSize = image.size
      guard imageSize.width > 0, imageSize.height > 0 else { return }

      let scale = max(avatarRect.width / imageSize.width, avatarRect.height / imageSize.height)
      let drawSize = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
      let drawRect = CGRect(
        x: avatarRect.midX - drawSize.width / 2,
        y: avatarRect.midY - drawSize.height / 2,
        width: drawSize.width,
        height: drawSize.height
      )

      context.cgContext.saveGState()
      UIBezierPath(ovalIn: avatarRect.insetBy(dx: borderWidth / 2, dy: borderWidth / 2)).addClip()
      image.draw(in: drawRect)
      context.cgContext.restoreGState()

      // WhatsApp-style profile glyph: an ink outline around the photo and a
      // compact presence dot. The system still draws the selected glass pill.
      UIColor(red: 16 / 255, green: 18 / 255, blue: 15 / 255, alpha: 1).setStroke()
      let border = UIBezierPath(ovalIn: avatarRect.insetBy(dx: borderWidth / 2, dy: borderWidth / 2))
      border.lineWidth = borderWidth
      border.stroke()

      let dotCenter = CGPoint(x: 15.35, y: 8.65)
      let dotBorderRadius: CGFloat = 1.35
      let dotRadius: CGFloat = 0.85
      UIColor(red: 1, green: 0.99, blue: 0.95, alpha: 1).setFill()
      UIBezierPath(
        ovalIn: CGRect(
          x: dotCenter.x - dotBorderRadius,
          y: dotCenter.y - dotBorderRadius,
          width: dotBorderRadius * 2,
          height: dotBorderRadius * 2
        )
      ).fill()
      UIColor(red: 223 / 255, green: 1, blue: 100 / 255, alpha: 1).setFill()
      UIBezierPath(
        ovalIn: CGRect(
          x: dotCenter.x - dotRadius,
          y: dotCenter.y - dotRadius,
          width: dotRadius * 2,
          height: dotRadius * 2
        )
      ).fill()
    }
  }
}

private enum ProfileAvatarMaskerError: Error {
  case invalidURL
  case invalidImage
}
