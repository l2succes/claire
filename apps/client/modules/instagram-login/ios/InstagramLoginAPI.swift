import Foundation

struct InstagramLoginFailure: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

// Ephemeral native networking: no JS fetch instrumentation, cookie jar, cache or credential storage.
final class InstagramLoginAPI: NSObject, URLSessionTaskDelegate {
  let baseURL: URL
  private var token: String
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = nil
    config.urlCache = nil
    config.urlCredentialStorage = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 110
    config.timeoutIntervalForResource = 120
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  init(baseURL: URL, token: String) { self.baseURL = baseURL; self.token = token }

  static func validBaseURL(_ url: URL) -> Bool {
    guard url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.host != nil else { return false }
    if url.scheme == "https" { return true }
    #if DEBUG
    return url.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(url.host ?? "")
    #else
    return false
    #endif
  }

  func request(_ path: String, body: [String: Any]? = nil) async throws -> [String: Any] {
    let url = baseURL.appendingPathComponent("platforms/instagram/mobile-login/" + path)
    var request = URLRequest(url: url)
    request.httpMethod = body == nil ? "GET" : "POST"
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
    let (data, response) = try await session.data(for: request)
    guard data.count < 256_000, let response = response as? HTTPURLResponse,
          let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw InstagramLoginFailure(message: "Instagram sign-in returned an unreadable response.")
    }
    guard (200..<300).contains(response.statusCode) else {
      // Only the dedicated API's curated message is shown. Never expose raw response data to React.
      throw InstagramLoginFailure(message: (json["error"] as? String) ?? "Instagram sign-in is unavailable. Try again later.")
    }
    return json
  }

  func close() { token = ""; session.invalidateAndCancel() }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    // No redirect can forward Claire's bearer token to another origin.
    completionHandler(nil)
  }
}
