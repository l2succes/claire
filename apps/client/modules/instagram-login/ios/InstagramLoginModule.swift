import ExpoModulesCore
import UIKit

public class InstagramLoginModule: Module {
  private var controller: InstagramLoginController?

  public func definition() -> ModuleDefinition {
    Name("InstagramLogin")
    AsyncFunction("start") { (apiURL: String, accessToken: String, promise: Promise) in
      Task { @MainActor in
      guard self.controller == nil,
            let presenter = self.appContext?.utilities?.currentViewController(),
            let baseURL = URL(string: apiURL), InstagramLoginAPI.validBaseURL(baseURL) else {
        promise.resolve(["success": false, "error": "Instagram sign-in cannot open right now."])
        return
      }
      let controller = InstagramLoginController(api: InstagramLoginAPI(baseURL: baseURL, token: accessToken)) { [weak self] result in
        self?.controller = nil
        promise.resolve(result)
      }
      self.controller = controller
      let navigation = UINavigationController(rootViewController: controller)
      // Keep Claire's Connections screen visible behind the secure native form.
      navigation.modalPresentationStyle = .pageSheet
      if let sheet = navigation.sheetPresentationController {
        sheet.detents = [.large()]
        sheet.prefersGrabberVisible = true
        sheet.preferredCornerRadius = 28
      }
      presenter.present(navigation, animated: true)
      }
    }.runOnQueue(.main)
  }
}
