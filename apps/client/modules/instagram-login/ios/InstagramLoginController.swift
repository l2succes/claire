import UIKit
import WebKit

@MainActor
final class InstagramLoginController: UIViewController, WKNavigationDelegate, WKHTTPCookieStoreObserver {
  private let api: InstagramLoginAPI
  private let completion: ([String: Any]) -> Void
  private let stack = UIStackView()
  private let message = UILabel()
  private var fields: [String: UITextField] = [:]
  private var selections: [String: String] = [:]
  private var snapshot: [String: Any] = [:]
  private var browser: WKWebView?
  private var cookieSpec: [String: Any]?
  private var task: Task<Void, Never>?
  private var finished = false
  private var busy = false
  private var cancelRequested = false
  private let privacyCover = UIView()

  init(api: InstagramLoginAPI, completion: @escaping ([String: Any]) -> Void) {
    self.api = api; self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "Connect Instagram"; view.backgroundColor = .systemBackground; isModalInPresentation = true
    navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Cancel", style: .plain, target: self, action: #selector(cancel))
    let scroll = UIScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(scroll)
    stack.axis = .vertical; stack.spacing = 18; stack.translatesAutoresizingMaskIntoConstraints = false
    scroll.addSubview(stack)
    NSLayoutConstraint.activate([
      scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
      stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48)
    ])
    message.numberOfLines = 0; message.font = .preferredFont(forTextStyle: .body); message.adjustsFontForContentSizeCategory = true
    privacyCover.backgroundColor = .systemBackground
    NotificationCenter.default.addObserver(self, selector: #selector(hidePrivateContent), name: UIApplication.willResignActiveNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(showPrivateContent), name: UIApplication.didBecomeActiveNotification, object: nil)
    begin()
  }
  @objc private func hidePrivateContent() {
    guard let container = navigationController?.view else { return }
    privacyCover.frame = container.bounds; privacyCover.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(privacyCover)
  }
  @objc private func showPrivateContent() { privacyCover.removeFromSuperview() }
  private func clearContent(_ text: String) {
    fields.values.forEach { $0.text = nil }; fields.removeAll(); selections.removeAll(); closeBrowser()
    stack.arrangedSubviews.forEach { stack.removeArrangedSubview($0); $0.removeFromSuperview() }
    message.text = text; stack.addArrangedSubview(message)
  }
  private func button(_ title: String, action: @escaping () -> Void) {
    let button = UIButton(type: .system)
    var config = UIButton.Configuration.filled(); config.title = title; config.cornerStyle = .medium; button.configuration = config
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 50).isActive = true
    button.addAction(UIAction { _ in action() }, for: .touchUpInside); stack.addArrangedSubview(button)
  }
  private func begin() {
    clearContent("Preparing Instagram sign-in…"); busy = true
    task = Task {
      do {
        snapshot = try await api.request("start", body: [:]); busy = false
        if cancelRequested { cancel(); return }; render()
      } catch { busy = false; showFailure(error) }
    }
  }
  private func render() {
    guard !finished else { return }
    if snapshot["status"] as? String == "connected" {
      clearContent("Instagram is connected. Your conversations will appear as they sync."); navigationItem.leftBarButtonItem = nil
      button("Done") { [weak self] in
        guard let self else { return }; finish(["success": true, "sessionId": snapshot["sessionId"] as? String ?? ""])
      }; return
    }
    guard let step = snapshot["step"] as? [String: Any], let type = step["type"] as? String else {
      showFailure(InstagramLoginFailure(message: "Instagram returned an unsupported sign-in step.")); return
    }
    clearContent(step["instructions"] as? String ?? "Continue signing in to Instagram.")
    if snapshot["status"] as? String == "working" { poll(); return }
    switch type {
    case "user_input":
      guard let params = step["user_input"] as? [String: Any], let specs = params["fields"] as? [[String: Any]] else { return }
      for spec in specs {
        guard let id = spec["id"] as? String, let type = spec["type"] as? String else { continue }
        let name = spec["name"] as? String ?? id
        if type == "select", let options = spec["options"] as? [String], !options.isEmpty {
          let chooser = UIButton(type: .system); chooser.setTitle("Choose \(name)", for: .normal); chooser.showsMenuAsPrimaryAction = true
          chooser.menu = UIMenu(children: options.map { option in
            UIAction(title: option) { [weak self, weak chooser] _ in self?.selections[id] = option; chooser?.setTitle(option, for: .normal) }
          })
          chooser.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true; stack.addArrangedSubview(chooser)
        } else {
          let field = UITextField(); field.borderStyle = .roundedRect; field.placeholder = name; field.accessibilityLabel = name
          field.font = .preferredFont(forTextStyle: .body); field.adjustsFontForContentSizeCategory = true
          field.autocapitalizationType = .none; field.autocorrectionType = .no; field.isSecureTextEntry = type == "password"
          if type == "password" { field.textContentType = .password }
          else if type == "username" || type == "email" { field.textContentType = .username }
          else if type == "2fa_code" { field.textContentType = .oneTimeCode }
          field.heightAnchor.constraint(greaterThanOrEqualToConstant: 50).isActive = true; fields[id] = field; stack.addArrangedSubview(field)
        }
      }
      button("Continue") { [weak self] in self?.submitFields() }
      let note = UILabel(); note.numberOfLines = 0; note.font = .preferredFont(forTextStyle: .footnote); note.textColor = .secondaryLabel
      note.text = "Claire securely passes this sign-in to its Instagram bridge. Your password and verification code are not saved in the app."
      stack.addArrangedSubview(note)
    case "display_and_wait": advance(nil)
    case "cookies": if let spec = step["cookies"] as? [String: Any] { openBrowser(spec) }
    default: showFailure(InstagramLoginFailure(message: "This Instagram verification method is not supported yet."))
    }
  }
  private func submitFields() {
    var values = selections; for (id, field) in fields { values[id] = field.text ?? "" }
    let specs = ((snapshot["step"] as? [String: Any])?["user_input"] as? [String: Any])?["fields"] as? [[String: Any]]
    guard values.count == specs?.count, values.values.allSatisfy({ !$0.isEmpty }) else {
      message.text = "Complete all fields and choose any requested option."; return
    }; advance(values)
  }
  private func advance(_ input: [String: String]?) {
    guard !busy, let id = snapshot["attemptId"] as? String, let revision = snapshot["revision"] as? Int else { return }
    busy = true; clearContent("Waiting for Instagram…"); view.endEditing(true)
    var body: [String: Any] = ["revision": revision]; if let input { body["input"] = input }
    task = Task {
      do {
        snapshot = try await api.request(id + "/advance", body: body); body.removeAll(); busy = false
        if cancelRequested { cancel(); return }; render()
      } catch {
        body.removeAll(); busy = false
        // A lost response is recovered without replaying the password or code.
        if error is URLError { poll() } else { showFailure(error) }
      }
    }
  }
  private func poll() {
    guard let id = snapshot["attemptId"] as? String else { return }; busy = true
    task = Task {
      do {
        try await Task.sleep(nanoseconds: 1_000_000_000); snapshot = try await api.request(id); busy = false
        if cancelRequested { cancel(); return }; render()
      } catch { busy = false; showFailure(error) }
    }
  }
  @objc private func cancel() {
    if busy { cancelRequested = true; message.text = "Finishing the current request before closing…"; return }
    task?.cancel()
    if snapshot["status"] as? String == "connected" {
      finish(["success": true, "sessionId": snapshot["sessionId"] as? String ?? ""]); return
    }
    busy = true
    task = Task {
      if let id = snapshot["attemptId"] as? String { _ = try? await api.request(id + "/cancel", body: [:]) }
      finish(["success": false, "cancelled": true])
    }
  }
  private func showFailure(_ error: Error) {
    guard !finished else { return }; if cancelRequested { cancel(); return }
    clearContent((error as? InstagramLoginFailure)?.message ?? "The connection was interrupted. Check your internet connection and try again.")
    button("Start again") { [weak self] in self?.begin() }
  }
  private func finish(_ result: [String: Any]) {
    guard !finished else { return }; finished = true; task?.cancel(); task = nil; clearContent(""); snapshot.removeAll()
    NotificationCenter.default.removeObserver(self); api.close(); dismiss(animated: true) { self.completion(result) }
  }
  private static func allowedInstagramURL(_ url: URL) -> Bool {
    guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil || url.port == 443,
          let host = url.host?.lowercased() else { return false }
    return host == "instagram.com" || host.hasSuffix(".instagram.com")
  }
  private func openBrowser(_ spec: [String: Any]) {
    guard let raw = spec["url"] as? String, let url = URL(string: raw), Self.allowedInstagramURL(url) else {
      showFailure(InstagramLoginFailure(message: "Instagram returned an unsupported verification address.")); return
    }
    cookieSpec = spec
    let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
    let browser = WKWebView(frame: .zero, configuration: config); self.browser = browser; browser.navigationDelegate = self
    browser.configuration.websiteDataStore.httpCookieStore.add(self)
    browser.heightAnchor.constraint(equalToConstant: max(440, view.bounds.height * 0.65)).isActive = true
    stack.addArrangedSubview(browser); browser.load(URLRequest(url: url))
  }
  private func closeBrowser() {
    browser?.stopLoading(); browser?.configuration.websiteDataStore.httpCookieStore.remove(self)
    browser?.navigationDelegate = nil; browser?.removeFromSuperview(); browser = nil; cookieSpec = nil
  }
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
               decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if navigationAction.targetFrame?.isMainFrame != false {
      guard let url = navigationAction.request.url, Self.allowedInstagramURL(url) else { decisionHandler(.cancel); return }
    }; decisionHandler(.allow)
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { captureCookies() }
  func cookiesDidChange(in cookieStore: WKHTTPCookieStore) { captureCookies() }
  private func captureCookies() {
    guard !busy, let browser, let url = browser.url, Self.allowedInstagramURL(url), let spec = cookieSpec,
          let specs = spec["fields"] as? [[String: Any]] else { return }
    if let pattern = spec["wait_for_url_pattern"] as? String {
      guard pattern.count < 1000, let regex = try? NSRegularExpression(pattern: pattern),
            regex.firstMatch(in: url.absoluteString, range: NSRange(url.absoluteString.startIndex..., in: url.absoluteString)) != nil else { return }
    } else { guard url.path == "/" || url.path.hasPrefix("/direct/") else { return } }
    browser.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self, weak browser] cookies in
      Task { @MainActor in
        guard let self, !self.busy, self.browser === browser else { return }
        var values: [String: String] = [:]
        for field in specs {
          guard let id = field["id"] as? String, let sources = field["sources"] as? [[String: Any]] else { return }
          for source in sources {
            guard source["type"] as? String == "cookie", let name = source["name"] as? String,
                  let domain = source["cookie_domain"] as? String,
                  domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")) == "instagram.com" else { continue }
            if let cookie = cookies.first(where: {
              $0.name == name && $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")) == "instagram.com"
                && ($0.expiresDate == nil || $0.expiresDate! > Date())
            }) { values[id] = cookie.value; break }
          }
          if field["required"] as? Bool == true && (values[id]?.isEmpty ?? true) { return }
        }
        guard !values.isEmpty else { return }; self.advance(values)
      }
    }
  }
}
