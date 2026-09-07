import SwiftUI
import UIKit

@MainActor
final class OwnerAppDelegate: NSObject, UIApplicationDelegate {
    let store = OwnerStore()
    func application(_ application: UIApplication,
                     handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        store.restoreBackgroundSession(identifier: identifier, completionHandler: completionHandler)
    }
}

@main
struct ColdwaterOwnerApp: App {
    @UIApplicationDelegateAdaptor(OwnerAppDelegate.self) private var delegate
    var body: some Scene {
        WindowGroup { OwnerRootView(store: delegate.store) }
    }
}
