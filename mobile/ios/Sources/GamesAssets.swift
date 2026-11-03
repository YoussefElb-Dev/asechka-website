import SwiftUI
import UIKit

/// Shared decoded artwork. No disk access during a moving frame once warmed.
enum GamesAssets {
    private static let cache: NSCache<NSString, UIImage> = {
        let value = NSCache<NSString, UIImage>()
        value.totalCostLimit = 24 * 1024 * 1024
        return value
    }()
    static func image(_ name: String) -> UIImage { load("gameplay/" + name) }
    static func cover(_ kind: GamesKind) -> UIImage { load("covers/" + kind.rawValue) }
    private static func load(_ path: String) -> UIImage {
        if let value = cache.object(forKey: path as NSString) { return value }
        guard let root = Bundle.main.url(forResource: "default", withExtension: nil),
              let value = UIImage(contentsOfFile: root.appendingPathComponent("games/\(path).png").path) else {
            preconditionFailure("Missing bundled Games artwork: \(path)")
        }
        cache.setObject(value, forKey: path as NSString, cost: Int(value.size.width * value.size.height * 4))
        return value
    }
}

struct GamesSprite: View {
    var name: String
    init(_ name: String) { self.name = name }
    var body: some View { Image(uiImage: GamesAssets.image(name)).resizable().interpolation(.high).accessibilityHidden(true) }
}
