import Cocoa
import UserNotifications

// Release target for Electron's bundled APNs helper. It intentionally owns no
// account credentials: Electron registers the returned device token with the
// server using the active session, and notification taps use claire://.
@main
final class ClairePushHelper: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
      if granted { DispatchQueue.main.async { NSApplication.shared.registerForRemoteNotifications() } }
    }
  }

  func application(_ application: NSApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
    let hex = token.map { String(format: "%02x", $0) }.joined()
    // A release wrapper forwards this line through its authenticated local IPC
    // channel. Keeping stdout makes the standalone helper testable as well.
    print("CLAIRE_APNS_TOKEN=\(hex)")
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let userInfo = response.notification.request.content.userInfo
    let raw = (userInfo["url"] as? String) ?? ((userInfo["data"] as? [String: Any])?["url"] as? String)
    guard let raw, let url = URL(string: raw), url.scheme == "claire" else { return }
    NSWorkspace.shared.open(url)
  }
}
