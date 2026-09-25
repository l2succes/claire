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

    View(InstagramLoginHostView.self) {
      Prop("apiURL") { (view: InstagramLoginHostView, value: String) in
        view.apiURL = value
        view.startIfReady()
      }
      Prop("accessToken") { (view: InstagramLoginHostView, value: String) in
        view.accessToken = value
        view.startIfReady()
      }
      Prop("cancelRequested") { (view: InstagramLoginHostView, value: Bool) in
        if value { view.cancelLogin() }
      }
      Events("onResult")
    }
  }
}

@MainActor
public final class InstagramLoginHostView: ExpoView {
  let onResult = EventDispatcher()
  var apiURL: String?
  var accessToken: String?
  private var controller: InstagramLoginController?
  private var hasReportedResult = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = UIColor(red: 244/255, green: 241/255, blue: 234/255, alpha: 1)
    clipsToBounds = true
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    startIfReady()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    controller?.view.frame = bounds
  }

  func startIfReady() {
    guard window != nil, controller == nil, !hasReportedResult,
          let apiURL, let accessToken, !accessToken.isEmpty,
          let baseURL = URL(string: apiURL), InstagramLoginAPI.validBaseURL(baseURL) else { return }

    let login = InstagramLoginController(api: InstagramLoginAPI(baseURL: baseURL, token: accessToken), embedded: true) { [weak self] result in
      guard let self, !self.hasReportedResult else { return }
      self.hasReportedResult = true
      self.onResult(result)
    }
    controller = login
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let parent = next as? UIViewController {
        parent.addChild(login)
        login.view.frame = bounds
        login.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(login.view)
        login.didMove(toParent: parent)
        return
      }
      responder = next
    }
    // The host route is still mounting. Try again when it joins a window.
    controller = nil
  }

  func cancelLogin() {
    if let controller { controller.cancelLogin() }
    else if !hasReportedResult {
      hasReportedResult = true
      onResult(["success": false, "cancelled": true])
    }
  }
}
