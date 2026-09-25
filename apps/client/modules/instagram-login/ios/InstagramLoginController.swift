import UIKit
import WebKit

private enum ClaireLoginStyle {
  static let ink = UIColor(red: 16/255, green: 18/255, blue: 15/255, alpha: 1)
  static let cream = UIColor(red: 244/255, green: 241/255, blue: 234/255, alpha: 1)
  static let paper = UIColor(red: 255/255, green: 253/255, blue: 248/255, alpha: 1)
  static let muted = UIColor(red: 98/255, green: 99/255, blue: 93/255, alpha: 1)
  static let border = UIColor(red: 223/255, green: 220/255, blue: 211/255, alpha: 1)
  static let lime = UIColor(red: 223/255, green: 255/255, blue: 100/255, alpha: 1)
  static let error = UIColor(red: 169/255, green: 43/255, blue: 59/255, alpha: 1)

  static func font(_ size: CGFloat, bold: Bool = false) -> UIFont {
    let fallback = bold ? UIFont.systemFont(ofSize: size, weight: .bold) : UIFont.systemFont(ofSize: size)
    let named = UIFont(name: bold ? "PublicSans-Bold" : "PublicSans-Regular", size: size) ?? fallback
    return UIFontMetrics(forTextStyle: .body).scaledFont(for: named)
  }
}

private final class InstagramLoginMark: UIView {
  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = UIColor(red: 214/255, green: 41/255, blue: 118/255, alpha: 1)
    layer.cornerRadius = 17
    layer.masksToBounds = true
    isAccessibilityElement = false
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func draw(_ rect: CGRect) {
    ClaireLoginStyle.paper.setStroke()
    let camera = UIBezierPath(roundedRect: CGRect(x: 11, y: 11, width: 32, height: 32), cornerRadius: 9)
    camera.lineWidth = 3.5
    camera.stroke()
    let lens = UIBezierPath(ovalIn: CGRect(x: 20, y: 20, width: 14, height: 14))
    lens.lineWidth = 3.5
    lens.stroke()
    let flash = UIBezierPath(ovalIn: CGRect(x: 35, y: 16, width: 4, height: 4))
    ClaireLoginStyle.paper.setFill()
    flash.fill()
  }
}

private final class ClaireProgressView: UIView {
  private let orbit = CAShapeLayer()

  override init(frame: CGRect) {
    super.init(frame: frame)
    isAccessibilityElement = true
    accessibilityLabel = "Claire is checking your sign-in"
    accessibilityTraits = .updatesFrequently
    let tile = UIView()
    tile.translatesAutoresizingMaskIntoConstraints = false
    tile.backgroundColor = ClaireLoginStyle.lime
    tile.layer.cornerRadius = 16
    addSubview(tile)
    NSLayoutConstraint.activate([
      tile.centerXAnchor.constraint(equalTo: centerXAnchor), tile.centerYAnchor.constraint(equalTo: centerYAnchor),
      tile.widthAnchor.constraint(equalToConstant: 52), tile.heightAnchor.constraint(equalToConstant: 52),
      heightAnchor.constraint(equalToConstant: 68),
    ])
    orbit.frame = CGRect(x: 8, y: 8, width: 36, height: 36)
    orbit.path = UIBezierPath(arcCenter: CGPoint(x: 18, y: 18), radius: 13,
                              startAngle: -.pi / 2, endAngle: .pi * 1.1, clockwise: true).cgPath
    orbit.fillColor = UIColor.clear.cgColor
    orbit.strokeColor = ClaireLoginStyle.ink.cgColor
    orbit.lineWidth = 5
    orbit.lineCap = .round
    tile.layer.addSublayer(orbit)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    orbit.removeAnimation(forKey: "claireOrbit")
    guard window != nil else { return }
    let turn = CABasicAnimation(keyPath: "transform.rotation")
    turn.fromValue = 0
    turn.toValue = CGFloat.pi * 2
    turn.duration = 1.2
    turn.repeatCount = .infinity
    orbit.add(turn, forKey: "claireOrbit")
  }
}

@MainActor
final class InstagramLoginController: UIViewController, WKNavigationDelegate, WKHTTPCookieStoreObserver {
  private let api: InstagramLoginAPI
  private let completion: ([String: Any]) -> Void
  private let embedded: Bool
  private let stack = UIStackView()
  private var message = UILabel()
  private var fields: [String: UITextField] = [:]
  private var selections: [String: String] = [:]
  private var snapshot: [String: Any] = [:]
  private var browser: WKWebView?
  private var cookieSpec: [String: Any]?
  private var task: Task<Void, Never>?
  private var finished = false
  private var busy = false
  private var cancelRequested = false
  private var credentialRequestInFlight = false
  private var retryNeedsNewAttempt = false
  private var autoAdvancedSingleChoice = false
  private var preservedUsername: String?
  private weak var credentialErrorLabel: UILabel?
  private weak var submitButton: UIButton?
  private let privacyCover = UIView()
  private let loadingOverlay = UIView()
  private let loadingLabel = UILabel()

  init(api: InstagramLoginAPI, embedded: Bool = false, completion: @escaping ([String: Any]) -> Void) {
    self.api = api; self.embedded = embedded; self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = ClaireLoginStyle.cream
    if !embedded {
      title = "Claire"
      isModalInPresentation = true
      let appearance = UINavigationBarAppearance()
      appearance.configureWithOpaqueBackground()
      appearance.backgroundColor = ClaireLoginStyle.cream
      appearance.shadowColor = .clear
      appearance.titleTextAttributes = [.foregroundColor: ClaireLoginStyle.ink, .font: ClaireLoginStyle.font(17, bold: true)]
      navigationController?.navigationBar.standardAppearance = appearance
      navigationController?.navigationBar.scrollEdgeAppearance = appearance
      navigationController?.navigationBar.tintColor = ClaireLoginStyle.ink
      navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Cancel", style: .plain, target: self, action: #selector(cancelLogin))
    }
    let scroll = UIScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(scroll)
    stack.axis = .vertical; stack.spacing = 16; stack.translatesAutoresizingMaskIntoConstraints = false
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
    loadingOverlay.translatesAutoresizingMaskIntoConstraints = false
    loadingOverlay.backgroundColor = ClaireLoginStyle.cream.withAlphaComponent(0.78)
    loadingOverlay.isHidden = true
    view.addSubview(loadingOverlay)
    let loadingContent = UIStackView()
    loadingContent.axis = .vertical
    loadingContent.alignment = .center
    loadingContent.spacing = 14
    loadingContent.translatesAutoresizingMaskIntoConstraints = false
    loadingContent.addArrangedSubview(ClaireProgressView())
    loadingLabel.font = ClaireLoginStyle.font(15, bold: true)
    loadingLabel.textColor = ClaireLoginStyle.ink
    loadingLabel.textAlignment = .center
    loadingContent.addArrangedSubview(loadingLabel)
    loadingOverlay.addSubview(loadingContent)
    NSLayoutConstraint.activate([
      loadingOverlay.topAnchor.constraint(equalTo: view.topAnchor),
      loadingOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      loadingOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      loadingOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      loadingContent.centerXAnchor.constraint(equalTo: loadingOverlay.centerXAnchor),
      loadingContent.centerYAnchor.constraint(equalTo: loadingOverlay.centerYAnchor),
      loadingContent.leadingAnchor.constraint(greaterThanOrEqualTo: loadingOverlay.leadingAnchor, constant: 24),
      loadingContent.trailingAnchor.constraint(lessThanOrEqualTo: loadingOverlay.trailingAnchor, constant: -24)
    ])
    privacyCover.backgroundColor = ClaireLoginStyle.cream
    NotificationCenter.default.addObserver(self, selector: #selector(hidePrivateContent), name: UIApplication.willResignActiveNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(showPrivateContent), name: UIApplication.didBecomeActiveNotification, object: nil)
    begin()
  }
  @objc private func hidePrivateContent() {
    guard let container = embedded ? view : navigationController?.view else { return }
    privacyCover.frame = container.bounds; privacyCover.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(privacyCover)
  }
  @objc private func showPrivateContent() { privacyCover.removeFromSuperview() }
  private func clearContent(_ text: String, title: String = "Sign in to Instagram") {
    fields.values.forEach { $0.text = nil }; fields.removeAll(); selections.removeAll(); closeBrowser()
    credentialErrorLabel = nil; submitButton = nil
    stack.arrangedSubviews.forEach { stack.removeArrangedSubview($0); $0.removeFromSuperview() }
    let mark = InstagramLoginMark()
    mark.widthAnchor.constraint(equalToConstant: 54).isActive = true
    mark.heightAnchor.constraint(equalToConstant: 54).isActive = true
    let markRow = UIView()
    markRow.heightAnchor.constraint(equalToConstant: 54).isActive = true
    mark.translatesAutoresizingMaskIntoConstraints = false
    markRow.addSubview(mark)
    NSLayoutConstraint.activate([
      mark.leadingAnchor.constraint(equalTo: markRow.leadingAnchor),
      mark.topAnchor.constraint(equalTo: markRow.topAnchor)
    ])
    stack.addArrangedSubview(markRow)

    let heading = UILabel()
    heading.text = title; heading.numberOfLines = 0
    heading.font = ClaireLoginStyle.font(28, bold: true); heading.textColor = ClaireLoginStyle.ink
    heading.adjustsFontForContentSizeCategory = true
    stack.addArrangedSubview(heading)
    message = UILabel()
    message.numberOfLines = 0
    message.font = ClaireLoginStyle.font(15)
    message.textColor = ClaireLoginStyle.muted
    message.adjustsFontForContentSizeCategory = true
    message.text = text
    message.isHidden = text.isEmpty
    stack.addArrangedSubview(message)
  }
  @discardableResult private func button(_ title: String, action: @escaping () -> Void) -> UIButton {
    let button = UIButton(type: .system)
    var config = UIButton.Configuration.filled()
    config.title = title; config.cornerStyle = .large
    config.baseBackgroundColor = ClaireLoginStyle.ink; config.baseForegroundColor = ClaireLoginStyle.paper
    config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 18, bottom: 14, trailing: 18)
    config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
      var updated = attributes; updated.font = ClaireLoginStyle.font(16, bold: true); return updated
    }
    button.configuration = config
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 54).isActive = true
    button.addAction(UIAction { _ in action() }, for: .touchUpInside); stack.addArrangedSubview(button)
    return button
  }
  private func showWorking(_ title: String) {
    loadingLabel.text = title
    loadingOverlay.isHidden = false
    view.bringSubviewToFront(loadingOverlay)
  }
  private func begin() {
    autoAdvancedSingleChoice = false
    clearContent("", title: "Sign in to Instagram")
    showWorking("Opening Instagram…"); busy = true
    task = Task {
      do {
        snapshot = try await api.request("start", body: [:]); busy = false
        if cancelRequested { cancelLogin(); return }; render()
      } catch { busy = false; showFailure(error) }
    }
  }
  private func render() {
    guard !finished else { return }
    let wasCheckingCredentials = credentialRequestInFlight
    if snapshot["status"] as? String == "connected" {
      loadingOverlay.isHidden = true
      credentialRequestInFlight = false
      clearContent("Your connection is active. Conversations may appear gradually while Instagram syncs.", title: "Instagram connected")
      navigationItem.leftBarButtonItem = nil
      button("Done") { [weak self] in
        guard let self else { return }; finish(["success": true, "sessionId": snapshot["sessionId"] as? String ?? ""])
      }; return
    }
    guard let step = snapshot["step"] as? [String: Any], let type = step["type"] as? String else {
      showFailure(InstagramLoginFailure(message: "Instagram returned an unsupported sign-in step.")); return
    }
    if snapshot["status"] as? String == "working" {
      if wasCheckingCredentials { setCredentialSubmitting(true) }
      else { showWorking("Checking with Instagram…") }
      poll(); return
    }
    loadingOverlay.isHidden = true
    credentialRequestInFlight = false
    let specs = (step["user_input"] as? [String: Any])?["fields"] as? [[String: Any]]
    let credentialForm = specs?.contains(where: { $0["type"] as? String == "password" }) == true
    let singleConfirmation = specs?.count == 1
      && specs?.first?["type"] as? String == "select"
      && (specs?.first?["options"] as? [String])?.count == 1
    if singleConfirmation, !autoAdvancedSingleChoice,
       let id = specs?.first?["id"] as? String,
       let option = (specs?.first?["options"] as? [String])?.first {
      autoAdvancedSingleChoice = true
      advance([id: option])
      return
    }
    let instructions = (step["instructions"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    clearContent(credentialForm ? "" : (instructions?.isEmpty == false ? instructions! : singleConfirmation ? "Continue to Instagram verification." : "Choose how to verify your account."),
                 title: credentialForm ? "Sign in to Instagram" : "Verify your account")
    switch type {
    case "user_input":
      guard let specs else { return }
      for spec in specs {
        guard let id = spec["id"] as? String, let type = spec["type"] as? String else { continue }
        let name = spec["name"] as? String ?? id
        if type == "select", let options = spec["options"] as? [String], options.count == 1 {
          selections[id] = options[0]
        } else if type == "select", let options = spec["options"] as? [String], !options.isEmpty {
          let group = UIStackView()
          group.axis = .vertical
          group.spacing = 9
          let label = UILabel()
          label.text = name
          label.font = ClaireLoginStyle.font(13, bold: true)
          label.textColor = ClaireLoginStyle.ink
          group.addArrangedSubview(label)
          let choices = UIStackView()
          choices.axis = .vertical
          choices.spacing = 8
          group.addArrangedSubview(choices)
          for option in options {
            let choice = UIButton(type: .system)
            choice.setTitle(option, for: .normal)
            choice.contentHorizontalAlignment = .leading
            choice.tintColor = ClaireLoginStyle.ink
            choice.backgroundColor = ClaireLoginStyle.paper
            choice.layer.cornerRadius = 13
            choice.layer.borderWidth = 1
            choice.layer.borderColor = ClaireLoginStyle.border.cgColor
            choice.contentEdgeInsets = UIEdgeInsets(top: 0, left: 14, bottom: 0, right: 14)
            choice.heightAnchor.constraint(greaterThanOrEqualToConstant: 52).isActive = true
            choice.addAction(UIAction { [weak self, weak choices] _ in
              self?.selections[id] = option
              for case let button as UIButton in choices?.arrangedSubviews ?? [] {
                let selected = button === choice
                button.backgroundColor = selected ? ClaireLoginStyle.lime : ClaireLoginStyle.paper
                button.layer.borderColor = (selected ? ClaireLoginStyle.ink : ClaireLoginStyle.border).cgColor
                button.accessibilityTraits = selected ? [.button, .selected] : .button
              }
            }, for: .touchUpInside)
            choices.addArrangedSubview(choice)
          }
          stack.addArrangedSubview(group)
        } else {
          let field = UITextField(); field.borderStyle = .none; field.placeholder = name; field.accessibilityLabel = name
          field.font = ClaireLoginStyle.font(16); field.adjustsFontForContentSizeCategory = true
          field.textColor = ClaireLoginStyle.ink; field.backgroundColor = ClaireLoginStyle.paper
          field.layer.cornerRadius = 13; field.layer.borderWidth = 1; field.layer.borderColor = ClaireLoginStyle.border.cgColor
          let inset = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 1))
          field.leftView = inset; field.leftViewMode = .always
          field.autocapitalizationType = .none; field.autocorrectionType = .no; field.isSecureTextEntry = type == "password"
          if type == "password" { field.textContentType = .password }
          else if type == "username" || type == "email" {
            field.textContentType = .username
            field.text = preservedUsername
          }
          else if type == "2fa_code" { field.textContentType = .oneTimeCode }
          field.heightAnchor.constraint(greaterThanOrEqualToConstant: 54).isActive = true
          fields[id] = field
          let group = UIStackView(); group.axis = .vertical; group.spacing = 7
          let label = UILabel(); label.text = name; label.font = ClaireLoginStyle.font(13, bold: true)
          label.textColor = ClaireLoginStyle.ink; group.addArrangedSubview(label); group.addArrangedSubview(field)
          stack.addArrangedSubview(group)
        }
      }
      if credentialForm {
        let errorLabel = UILabel()
        errorLabel.numberOfLines = 0
        errorLabel.font = ClaireLoginStyle.font(13)
        errorLabel.textColor = ClaireLoginStyle.error
        errorLabel.isHidden = !wasCheckingCredentials
        errorLabel.text = wasCheckingCredentials ? "That email or password wasn't accepted. Check both and try again." : nil
        errorLabel.accessibilityTraits = .updatesFrequently
        stack.addArrangedSubview(errorLabel)
        credentialErrorLabel = errorLabel
        // A returned form is still a live bridge step; only a failed request
        // needs a fresh attempt before the next submission.
        retryNeedsNewAttempt = false
      } else {
        retryNeedsNewAttempt = false
      }
      submitButton = button(singleConfirmation ? "Continue with Instagram" : "Continue") { [weak self] in self?.submitFields() }
      let note = UILabel(); note.numberOfLines = 0; note.font = ClaireLoginStyle.font(12); note.textColor = ClaireLoginStyle.muted
      note.text = credentialForm
        ? "Instagram may offer SMS or another verification method next. Your password isn’t saved in Claire."
        : "Verification codes aren’t saved in Claire."
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
      if credentialErrorLabel != nil {
        showInlineError("Enter your email or username and password.")
      } else {
        message.text = "Complete all fields and choose any requested option."
        message.isHidden = false
      }
      return
    }
    let isCredentials = specs?.contains(where: { $0["type"] as? String == "password" }) == true
    if isCredentials, let username = specs?.first(where: {
      ["username", "email"].contains($0["type"] as? String ?? "")
    })?["id"] as? String {
      preservedUsername = values[username]
    }
    if isCredentials && retryNeedsNewAttempt { restartAndAdvance(values); return }
    advance(values, credentials: isCredentials)
  }
  private func setCredentialSubmitting(_ submitting: Bool) {
    fields.values.forEach { $0.isEnabled = !submitting }
    submitButton?.isEnabled = !submitting
    if var configuration = submitButton?.configuration {
      configuration.title = submitting ? "Checking…" : "Continue"
      submitButton?.configuration = configuration
    }
    loadingOverlay.isHidden = !submitting
    if submitting { showWorking("Checking with Instagram…") }
    if submitting { credentialErrorLabel?.isHidden = true }
  }
  private func showInlineError(_ text: String) {
    credentialErrorLabel?.text = text
    credentialErrorLabel?.isHidden = false
    UIAccessibility.post(notification: .announcement, argument: text)
  }
  private func showCredentialError() {
    busy = false
    if cancelRequested { cancelLogin(); return }
    loadingOverlay.isHidden = true
    credentialRequestInFlight = false
    retryNeedsNewAttempt = true
    setCredentialSubmitting(false)
    let specs = ((snapshot["step"] as? [String: Any])?["user_input"] as? [String: Any])?["fields"] as? [[String: Any]] ?? []
    for spec in specs where spec["type"] as? String == "password" {
      if let id = spec["id"] as? String { fields[id]?.text = nil }
    }
    showInlineError("Instagram couldn't sign you in. Check your details and try again.")
  }
  private func restartAndAdvance(_ input: [String: String]) {
    guard !busy else { return }
    busy = true
    credentialRequestInFlight = true
    setCredentialSubmitting(true)
    view.endEditing(true)
    task = Task {
      do {
        let fresh = try await api.request("start", body: [:])
        snapshot = fresh
        if cancelRequested {
          busy = false
          cancelLogin()
          return
        }
        let step = fresh["step"] as? [String: Any]
        let specs = (step?["user_input"] as? [String: Any])?["fields"] as? [[String: Any]] ?? []
        let newIDs = Set(specs.compactMap { $0["id"] as? String })
        guard step?["type"] as? String == "user_input", newIDs == Set(input.keys) else {
          busy = false
          credentialRequestInFlight = false
          render()
          return
        }
        busy = false
        retryNeedsNewAttempt = false
        advance(input, credentials: true)
      } catch { showCredentialError() }
    }
  }
  private func advance(_ input: [String: String]?, credentials: Bool = false) {
    guard !busy, let id = snapshot["attemptId"] as? String, let revision = snapshot["revision"] as? Int else { return }
    busy = true
    credentialRequestInFlight = credentials
    if credentials { setCredentialSubmitting(true) }
    else { showWorking("Checking with Instagram…") }
    view.endEditing(true)
    var body: [String: Any] = ["revision": revision]; if let input { body["input"] = input }
    task = Task {
      do {
        snapshot = try await api.request(id + "/advance", body: body); body.removeAll(); busy = false
        if cancelRequested { cancelLogin(); return }; render()
      } catch {
        body.removeAll(); busy = false
        // A lost response is recovered without replaying the password or code.
        if error is URLError { poll() }
        else if credentials { showCredentialError() }
        else { showFailure(error) }
      }
    }
  }
  private func poll() {
    guard let id = snapshot["attemptId"] as? String else { return }; busy = true
    task = Task {
      do {
        try await Task.sleep(nanoseconds: 1_000_000_000); snapshot = try await api.request(id); busy = false
        if cancelRequested { cancelLogin(); return }; render()
      } catch {
        busy = false
        if credentialRequestInFlight { showCredentialError() }
        else { showFailure(error) }
      }
    }
  }
  @objc func cancelLogin() {
    if busy {
      cancelRequested = true
      if !loadingOverlay.isHidden { loadingLabel.text = "Finishing this step…" }
      return
    }
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
    guard !finished else { return }; if cancelRequested { cancelLogin(); return }
    loadingOverlay.isHidden = true
    clearContent((error as? InstagramLoginFailure)?.message ?? "The connection was interrupted. Check your internet connection and try again.", title: "Sign-in needs another try")
    button("Start again") { [weak self] in self?.begin() }
  }
  private func finish(_ result: [String: Any]) {
    guard !finished else { return }; finished = true; task?.cancel(); task = nil; clearContent(""); snapshot.removeAll()
    NotificationCenter.default.removeObserver(self); api.close()
    if embedded { completion(result) }
    else { dismiss(animated: true) { self.completion(result) } }
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
