#import "ClaireCompanion.h"

#import <AppKit/AppKit.h>
#import <Security/Security.h>
#import <UserNotifications/UserNotifications.h>
#import <WebKit/WebKit.h>
#if __has_include(<sqlcipher/sqlite3.h>)
#import <sqlcipher/sqlite3.h>
#define CLAIRE_HAS_SQLCIPHER 1
#else
#import <sqlite3.h>
#define CLAIRE_HAS_SQLCIPHER 0
#endif

@class ClaireCompanion;

@interface ClaireCompanion (InstagramPrivate)
+ (void)requestJSON:(NSString *)urlString method:(NSString *)method headers:(NSDictionary<NSString *, NSString *> *)headers body:(id)body completion:(void (^)(NSDictionary * _Nullable payload, NSInteger statusCode, NSError * _Nullable error))completion;
+ (void)requestBinary:(NSString *)urlString headers:(NSDictionary<NSString *, NSString *> *)headers data:(NSData *)data completion:(void (^)(NSInteger statusCode, NSError * _Nullable error))completion;
+ (NSString *)apiURL:(NSString *)base path:(NSString *)path;
@end

@interface ClaireInstagramLoginController : NSObject <WKNavigationDelegate, NSWindowDelegate>
@property (nonatomic, copy) NSString *apiURL;
@property (nonatomic, copy) NSString *accessToken;
@property (nonatomic, copy) NSString *sessionId;
@property (nonatomic, copy) NSString *loginId;
@property (nonatomic, copy) NSString *stepId;
@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSTimer *cookieTimer;
@property (nonatomic, copy) RCTPromiseResolveBlock resolve;
@property (nonatomic, copy) RCTPromiseRejectBlock reject;
@property (nonatomic) BOOL finished;
@property (nonatomic) BOOL submitting;
- (instancetype)initWithAPIURL:(NSString *)apiURL accessToken:(NSString *)accessToken sessionId:(NSString *)sessionId loginId:(NSString *)loginId stepId:(NSString *)stepId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
- (void)present;
@end

static NSMutableSet<ClaireInstagramLoginController *> *ClaireInstagramLogins(void)
{
  static NSMutableSet<ClaireInstagramLoginController *> *logins;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ logins = [NSMutableSet set]; });
  return logins;
}

static NSString *ClaireStringFromDecodedMessageObject(id decoded)
{
  if ([decoded isKindOfClass:NSAttributedString.class]) return [(NSAttributedString *)decoded string] ?: @"";
  if ([decoded isKindOfClass:NSString.class]) return (NSString *)decoded;
  if ([decoded isKindOfClass:NSDictionary.class]) {
    for (id value in [(NSDictionary *)decoded allValues]) {
      NSString *candidate = ClaireStringFromDecodedMessageObject(value);
      if (candidate.length) return candidate;
    }
  }
  if ([decoded isKindOfClass:NSArray.class] || [decoded isKindOfClass:NSSet.class]) {
    for (id value in decoded) {
      NSString *candidate = ClaireStringFromDecodedMessageObject(value);
      if (candidate.length) return candidate;
    }
  }
  // Some Messages releases archive a private attributed-string wrapper. Avoid
  // linking private frameworks, but accept the public string selector it exposes.
  if ([decoded respondsToSelector:@selector(string)]) {
    id value = [decoded valueForKey:@"string"];
    if ([value isKindOfClass:NSString.class]) return value;
  }
  return @"";
}

static NSString *ClaireDecodeAttributedBody(const void *bytes, int length)
{
  if (bytes == NULL || length <= 0) return @"";
  NSData *data = [NSData dataWithBytes:bytes length:(NSUInteger)length];
  @try {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    id decoded = [NSUnarchiver unarchiveObjectWithData:data];
#pragma clang diagnostic pop
    NSString *content = ClaireStringFromDecodedMessageObject(decoded);
    if (content.length) return content;
  } @catch (__unused NSException *exception) {
    // Some Messages versions use a keyed archive instead of typedstream.
  }
  @try {
    NSSet *classes = [NSSet setWithObjects:NSAttributedString.class, NSMutableAttributedString.class, NSString.class, NSMutableString.class, NSDictionary.class, NSArray.class, NSNumber.class, NSColor.class, NSFont.class, nil];
    NSError *error = nil;
    id decoded = [NSKeyedUnarchiver unarchivedObjectOfClasses:classes fromData:data error:&error];
    NSString *content = ClaireStringFromDecodedMessageObject(decoded);
    if (content.length) return content;
  } @catch (__unused NSException *exception) {}

  // Legacy and current Messages typedstreams both delimit the plain string
  // with SOH/plus (01 2b) and SSA/index (86 84). Foundation can refuse the
  // full private attributed-string graph even though the text run is valid,
  // so extract only that documented typedstream segment as a final fallback.
  const uint8_t *buffer = (const uint8_t *)bytes;
  NSInteger start = NSNotFound;
  NSInteger end = NSNotFound;
  for (NSInteger index = 0; index + 1 < length; index += 1) {
    if (buffer[index] == 0x01 && buffer[index + 1] == 0x2b) { start = index + 2; break; }
  }
  if (start != NSNotFound) {
    for (NSInteger index = start + 1; index + 1 < length; index += 1) {
      if (buffer[index] == 0x86 && buffer[index + 1] == 0x84) { end = index; break; }
    }
  }
  if (start != NSNotFound && end != NSNotFound && end > start) {
    // The first byte is the typedstream string-length marker. A few older
    // archives use three prefix bytes, so try both layouts without logging or
    // exposing the underlying message body.
    for (NSNumber *offsetValue in @[ @1, @3 ]) {
      NSInteger offset = offsetValue.integerValue;
      if (start + offset >= end) continue;
      NSString *content = [[NSString alloc] initWithBytes:buffer + start + offset
                                                   length:(NSUInteger)(end - start - offset)
                                                 encoding:NSUTF8StringEncoding];
      if (content.length) return content;
    }
  }
  return @"";
}

@implementation ClaireInstagramLoginController

- (instancetype)initWithAPIURL:(NSString *)apiURL accessToken:(NSString *)accessToken sessionId:(NSString *)sessionId loginId:(NSString *)loginId stepId:(NSString *)stepId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  self = [super init];
  if (self) {
    _apiURL = [apiURL copy]; _accessToken = [accessToken copy]; _sessionId = [sessionId copy];
    _loginId = [loginId copy]; _stepId = [stepId copy]; _resolve = [resolve copy]; _reject = [reject copy];
  }
  return self;
}

- (void)present
{
  WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
  // The panel is deliberately ephemeral: Instagram session cookies are used
  // only to complete the current bridge login and are not retained by Claire.
  configuration.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
  self.webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 720, 760) configuration:configuration];
  self.webView.navigationDelegate = self;
  self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 720, 760)
                                             styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable)
                                               backing:NSBackingStoreBuffered
                                                 defer:NO];
  self.window.title = @"Connect Instagram to Claire";
  self.window.contentView = self.webView;
  self.window.delegate = self;
  [self.window center];
  [self.window makeKeyAndOrderFront:nil];
  __weak ClaireInstagramLoginController *weakSelf = self;
  self.cookieTimer = [NSTimer scheduledTimerWithTimeInterval:1.5 repeats:YES block:^(NSTimer *timer) {
    [weakSelf checkForAuthenticatedCookies];
  }];
  NSURL *url = [NSURL URLWithString:@"https://www.instagram.com/accounts/login/"];
  [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation
{
  [self checkForAuthenticatedCookies];
}

- (void)checkForAuthenticatedCookies
{
  if (self.finished || self.submitting) return;
  [self.webView.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray<NSHTTPCookie *> *cookies) {
    NSMutableDictionary<NSString *, NSString *> *values = [NSMutableDictionary dictionary];
    NSSet<NSString *> *names = [NSSet setWithArray:@[ @"sessionid", @"csrftoken", @"mid", @"ig_did", @"ds_user_id" ]];
    for (NSHTTPCookie *cookie in cookies) {
      if ([names containsObject:cookie.name] && [cookie.domain hasSuffix:@"instagram.com"]) values[cookie.name] = cookie.value;
    }
    if (values[@"sessionid"].length == 0 || self.finished || self.submitting) return;
    self.submitting = YES;
    NSDictionary *headers = @{ @"Authorization": [NSString stringWithFormat:@"Bearer %@", self.accessToken] };
    NSDictionary *body = @{ @"sessionId": self.sessionId, @"loginId": self.loginId, @"stepId": self.stepId, @"cookies": values };
    [ClaireCompanion requestJSON:[ClaireCompanion apiURL:self.apiURL path:@"/platforms/instagram/login/submit"] method:@"POST" headers:headers body:body completion:^(NSDictionary *payload, NSInteger statusCode, NSError *requestError) {
      if (requestError != nil) { [self finishWithError:requestError]; return; }
      if (![payload[@"success"] boolValue]) { [self finishWithError:[NSError errorWithDomain:@"ClaireInstagramLogin" code:2 userInfo:@{ NSLocalizedDescriptionKey: @"Instagram did not complete the bridge connection." }]]; return; }
      [[NSUserDefaults standardUserDefaults] setBool:YES forKey:@"ClaireInstagramDesktopConnected"];
      [self finishWithResult:@{ @"status": @"connected", @"userLoginId": payload[@"userLoginId"] ?: @"" }];
    }];
  }];
}

- (void)windowWillClose:(NSNotification *)notification
{
  if (!self.finished) [self finishWithError:[NSError errorWithDomain:@"ClaireInstagramLogin" code:1 userInfo:@{ NSLocalizedDescriptionKey: @"Instagram connection was cancelled." }]];
}

- (void)finishWithResult:(NSDictionary *)result
{
  if (self.finished) return;
  self.finished = YES;
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.cookieTimer invalidate];
    self.cookieTimer = nil;
    [self.webView stopLoading];
    self.webView.navigationDelegate = nil;
    self.window.delegate = nil;
    // Do not close and release a WebKit-backed window while AppKit is still
    // committing the navigation/OTP transition. On macOS 26 that can release
    // _NSWindowTransformAnimation twice and crash in objc_release. Hide now,
    // then detach and release the window on a later run-loop transaction.
    [self.window orderOut:nil];
    RCTPromiseResolveBlock resolve = [self.resolve copy];
    self.resolve = nil;
    self.reject = nil;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.35 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      self.window.contentView = nil;
      self.webView = nil;
      self.window = nil;
      [ClaireInstagramLogins() removeObject:self];
      if (resolve) resolve(result);
    });
  });
}

- (void)finishWithError:(NSError *)error
{
  if (self.finished) return;
  self.finished = YES;
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.cookieTimer invalidate];
    self.cookieTimer = nil;
    [self.webView stopLoading];
    self.webView.navigationDelegate = nil;
    self.window.delegate = nil;
    [self.window orderOut:nil];
    RCTPromiseRejectBlock reject = [self.reject copy];
    self.resolve = nil;
    self.reject = nil;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.35 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      self.window.contentView = nil;
      self.webView = nil;
      self.window = nil;
      [ClaireInstagramLogins() removeObject:self];
      if (reject) reject(@"instagram_connection_failed", error.localizedDescription, error);
    });
  });
}

@end

@implementation ClaireCompanion
{
  id _desktopShortcutMonitor;
  id _desktopCommandObserver;
  id _notificationResponseObserver;
  id _notificationTokenObserver;
  BOOL _hasDesktopShortcutListeners;
}

static NSString *const ClaireDeviceKeyTag = @"com.claire.desktop.device-signing-key";
// Keep credentials with different UX and retention rules in separate Keychain
// services. Older builds put all three in the companion service, which made a
// background cache/status read capable of triggering an alarming Keychain
// prompt on every launch.
static NSString *const ClaireDeviceCredentialService = @"com.claire.desktop.companion";
static NSString *const ClaireAppAuthCredentialService = @"com.claire.desktop.auth";
static NSString *const ClaireCacheKeyService = @"com.claire.desktop.cache";

static NSString *ClaireCacheAccount(NSString *userId) { return [@"desktop.cache.key." stringByAppendingString:userId ?: @""]; }

static NSString *ClaireCachePath(NSString *userId)
{
  NSURL *directory = [[[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask] firstObject];
  directory = [directory URLByAppendingPathComponent:@"Claire/Cache" isDirectory:YES];
  [[NSFileManager defaultManager] createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];
  return [[directory URLByAppendingPathComponent:[NSString stringWithFormat:@"%@.sqlite", userId ?: @""]] path];
}

static NSString *ClaireRandomDatabaseKey(void)
{
  uint8_t bytes[32];
  if (SecRandomCopyBytes(kSecRandomDefault, sizeof(bytes), bytes) != errSecSuccess) return nil;
  NSMutableString *result = [NSMutableString stringWithCapacity:64];
  for (NSUInteger index = 0; index < sizeof(bytes); index += 1) [result appendFormat:@"%02x", bytes[index]];
  return result;
}

+ (BOOL)storeKeychainValue:(NSString *)value
                   account:(NSString *)account
                   service:(NSString *)service
                     error:(NSError **)error
{
  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
  NSDictionary *query = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: account,
  };
  OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)@{ (__bridge id)kSecValueData: data });
  if (status == errSecItemNotFound) {
    NSMutableDictionary *insert = [query mutableCopy];
    insert[(__bridge id)kSecValueData] = data;
    insert[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
    status = SecItemAdd((__bridge CFDictionaryRef)insert, NULL);
  }
  if (status != errSecSuccess && error) *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status userInfo:nil];
  return status == errSecSuccess;
}

+ (NSString *)keychainValueForAccount:(NSString *)account
                              service:(NSString *)service
                     allowInteraction:(BOOL)allowInteraction
                                error:(NSError **)error
{
  NSMutableDictionary *query = [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: account,
    (__bridge id)kSecReturnData: @YES,
  } mutableCopy];
  // Background startup, sync and cache reads must never put a password dialog
  // in front of the workspace. A user-initiated companion setup may opt in to
  // interaction to recover an existing credential instead.
  if (!allowInteraction) query[(__bridge id)kSecUseAuthenticationUI] = (__bridge id)kSecUseAuthenticationUIFail;
  CFTypeRef value = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &value);
  if (status == errSecItemNotFound) return nil;
  if (status != errSecSuccess || value == NULL) {
    if (error) *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status userInfo:nil];
    return nil;
  }
  NSData *data = CFBridgingRelease(value);
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

+ (BOOL)isJavaScriptAccessibleKeychainAccount:(NSString *)account
{
  // App-auth state is intentionally available to the Supabase JS client so it
  // can refresh a signed-in session. Companion credentials and device keys are
  // deliberately absent from this small allowlist and remain native-only.
  static NSSet<NSString *> *allowedAccounts;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    allowedAccounts = [NSSet setWithArray:@[
      @"supabase.session.claire-desktop",
      @"companion.imessage.cursor",
      @"companion.imessage.initial_sync_complete",
      @"companion.imessage.decoder_version",
    ]];
  });
  return [allowedAccounts containsObject:account];
}

+ (void)requestJSON:(NSString *)urlString
              method:(NSString *)method
             headers:(NSDictionary<NSString *, NSString *> *)headers
                body:(id)body
          completion:(void (^)(NSDictionary * _Nullable payload, NSInteger statusCode, NSError * _Nullable error))completion
{
  NSURL *url = [NSURL URLWithString:urlString];
  if (url == nil) {
    completion(nil, 0, [NSError errorWithDomain:@"ClaireCompanion" code:1 userInfo:@{ NSLocalizedDescriptionKey: @"The Claire API URL is invalid." }]);
    return;
  }
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = method;
  [headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString *value, BOOL *stop) {
    [request setValue:value forHTTPHeaderField:key];
  }];
  if (body != nil) {
    NSError *encodeError = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:body options:0 error:&encodeError];
    if (data == nil) { completion(nil, 0, encodeError); return; }
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    request.HTTPBody = data;
  }
  [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *requestError) {
    NSHTTPURLResponse *http = [response isKindOfClass:NSHTTPURLResponse.class] ? (NSHTTPURLResponse *)response : nil;
    NSDictionary *payload = nil;
    if (data.length) {
      id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      if ([parsed isKindOfClass:NSDictionary.class]) payload = parsed;
    }
    if (requestError != nil) { completion(nil, http.statusCode, requestError); return; }
    if (http.statusCode < 200 || http.statusCode >= 300) {
      NSString *message = [payload[@"error"] isKindOfClass:NSString.class] ? payload[@"error"] : [NSString stringWithFormat:@"Claire companion request failed (%ld).", (long)http.statusCode];
      completion(payload, http.statusCode, [NSError errorWithDomain:@"ClaireCompanion" code:http.statusCode userInfo:@{ NSLocalizedDescriptionKey: message }]);
      return;
    }
    completion(payload ?: @{}, http.statusCode, nil);
  }] resume];
}

+ (void)requestBinary:(NSString *)urlString
               headers:(NSDictionary<NSString *, NSString *> *)headers
                  data:(NSData *)data
            completion:(void (^)(NSInteger statusCode, NSError * _Nullable error))completion
{
  NSURL *url = [NSURL URLWithString:urlString];
  if (url == nil) {
    completion(0, [NSError errorWithDomain:@"ClaireCompanion" code:1 userInfo:@{ NSLocalizedDescriptionKey: @"The Claire API URL is invalid." }]);
    return;
  }
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"POST";
  [request setValue:@"application/octet-stream" forHTTPHeaderField:@"Content-Type"];
  [headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString *value, BOOL *stop) {
    [request setValue:value forHTTPHeaderField:key];
  }];
  [[[NSURLSession sharedSession] uploadTaskWithRequest:request fromData:data completionHandler:^(NSData *responseData, NSURLResponse *response, NSError *requestError) {
    NSHTTPURLResponse *http = [response isKindOfClass:NSHTTPURLResponse.class] ? (NSHTTPURLResponse *)response : nil;
    if (requestError != nil) { completion(http.statusCode, requestError); return; }
    if (http.statusCode < 200 || http.statusCode >= 300) {
      completion(http.statusCode, [NSError errorWithDomain:@"ClaireCompanion" code:http.statusCode userInfo:@{ NSLocalizedDescriptionKey: [NSString stringWithFormat:@"Claire companion media upload failed (%ld).", (long)http.statusCode] }]);
      return;
    }
    completion(http.statusCode, nil);
  }] resume];
}

+ (NSString *)apiURL:(NSString *)base path:(NSString *)path
{
  NSString *trimmed = [base stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  while ([trimmed hasSuffix:@"/"]) trimmed = [trimmed substringToIndex:trimmed.length - 1];
  return [trimmed stringByAppendingString:path];
}

+ (SecKeyRef)devicePrivateKey:(NSError **)error
{
  NSData *tag = [ClaireDeviceKeyTag dataUsingEncoding:NSUTF8StringEncoding];
  NSDictionary *lookup = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassKey,
    (__bridge id)kSecAttrApplicationTag: tag,
    (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
    (__bridge id)kSecAttrKeyClass: (__bridge id)kSecAttrKeyClassPrivate,
    (__bridge id)kSecReturnRef: @YES,
  };
  SecKeyRef key = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)lookup, (CFTypeRef *)&key);
  if (status == errSecSuccess && key != NULL) return key;
  if (status != errSecItemNotFound) {
    if (error) *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status userInfo:nil];
    return NULL;
  }

  NSDictionary *privateAttributes = @{
    (__bridge id)kSecAttrIsPermanent: @YES,
    (__bridge id)kSecAttrApplicationTag: tag,
  };
  NSDictionary *attributes = @{
    (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
    (__bridge id)kSecAttrKeySizeInBits: @256,
    (__bridge id)kSecPrivateKeyAttrs: privateAttributes,
  };
  CFErrorRef createError = NULL;
  key = SecKeyCreateRandomKey((__bridge CFDictionaryRef)attributes, &createError);
  if (key == NULL && error) *error = CFBridgingRelease(createError);
  return key;
}

+ (NSString *)devicePublicKey:(NSError **)error
{
  SecKeyRef privateKey = [ClaireCompanion devicePrivateKey:error];
  if (privateKey == NULL) return nil;
  SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
  CFErrorRef exportError = NULL;
  CFDataRef publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &exportError);
  CFRelease(publicKey);
  CFRelease(privateKey);
  if (publicKeyData == NULL) {
    if (error) *error = CFBridgingRelease(exportError);
    return nil;
  }
  NSData *data = CFBridgingRelease(publicKeyData);
  return [data base64EncodedStringWithOptions:0];
}

RCT_EXPORT_MODULE(ClaireCompanion)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSDictionary *)constantsToExport
{
  NSDictionary *info = NSBundle.mainBundle.infoDictionary;
  NSString *(^stringValue)(NSString *) = ^NSString *(NSString *key) {
    id value = info[key];
    return [value isKindOfClass:NSString.class] ? value : @"";
  };
  return @{ @"runtimeConfig": @{
    @"apiUrl": stringValue(@"ClaireAPIURL"),
    @"supabaseUrl": stringValue(@"ClaireSupabaseURL"),
    @"supabaseAnonKey": stringValue(@"ClaireSupabaseAnonKey"),
  }};
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ @"desktopCommand", @"notificationResponse", @"notificationTokenChanged" ];
}

- (void)startObserving
{
  _hasDesktopShortcutListeners = YES;
  if (_desktopCommandObserver == nil) {
    __weak __typeof__(self) weakSelf = self;
    _desktopCommandObserver = [[NSNotificationCenter defaultCenter] addObserverForName:@"ClaireDesktopCommand" object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *notification) {
      __typeof__(self) strongSelf = weakSelf;
      NSString *command = notification.userInfo[@"command"];
      if (strongSelf != nil && strongSelf->_hasDesktopShortcutListeners && command.length > 0) {
        [strongSelf sendEventWithName:@"desktopCommand" body:@{ @"command": command }];
      }
    }];
  }
  if (_notificationResponseObserver == nil) {
    __weak __typeof__(self) weakSelf = self;
    _notificationResponseObserver = [[NSNotificationCenter defaultCenter] addObserverForName:@"ClaireNotificationResponse" object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *notification) {
      __typeof__(self) strongSelf = weakSelf;
      if (strongSelf != nil && strongSelf->_hasDesktopShortcutListeners) [strongSelf sendEventWithName:@"notificationResponse" body:notification.userInfo ?: @{}];
    }];
  }
  if (_notificationTokenObserver == nil) {
    __weak __typeof__(self) weakSelf = self;
    _notificationTokenObserver = [[NSNotificationCenter defaultCenter] addObserverForName:@"ClaireNotificationTokenChanged" object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *notification) {
      __typeof__(self) strongSelf = weakSelf;
      if (strongSelf != nil && strongSelf->_hasDesktopShortcutListeners) [strongSelf sendEventWithName:@"notificationTokenChanged" body:notification.userInfo ?: @{}];
    }];
  }
  if (_desktopShortcutMonitor != nil) return;
  __weak __typeof__(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __typeof__(self) strongSelf = weakSelf;
    if (strongSelf == nil || strongSelf->_desktopShortcutMonitor != nil) return;
    strongSelf->_desktopShortcutMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent * _Nullable(NSEvent *event) {
      if ((event.modifierFlags & NSEventModifierFlagCommand) == 0 || !strongSelf->_hasDesktopShortcutListeners) return event;
      NSString *key = event.charactersIgnoringModifiers.lowercaseString;
      NSString *command = nil;
      if ([key isEqualToString:@"1"]) command = @"home";
      else if ([key isEqualToString:@"2"]) command = @"inbox";
      else if ([key isEqualToString:@"3"]) command = @"loops";
      else if ([key isEqualToString:@"4"]) command = @"people";
      else if ([key isEqualToString:@"k"]) command = @"search";
      else if ([key isEqualToString:@"n"]) command = @"compose";
      else if ([key isEqualToString:@"m"] && (event.modifierFlags & NSEventModifierFlagShift) != 0) command = @"compact";
      else if ([key isEqualToString:@","]) command = @"settings";
      if (command == nil) return event;
      [strongSelf sendEventWithName:@"desktopCommand" body:@{ @"command": command }];
      return nil;
    }];
  });
}

- (void)stopObserving
{
  _hasDesktopShortcutListeners = NO;
  if (_desktopCommandObserver != nil) {
    [[NSNotificationCenter defaultCenter] removeObserver:_desktopCommandObserver];
    _desktopCommandObserver = nil;
  }
  if (_notificationResponseObserver != nil) { [[NSNotificationCenter defaultCenter] removeObserver:_notificationResponseObserver]; _notificationResponseObserver = nil; }
  if (_notificationTokenObserver != nil) { [[NSNotificationCenter defaultCenter] removeObserver:_notificationTokenObserver]; _notificationTokenObserver = nil; }
  if (_desktopShortcutMonitor != nil) {
    id monitor = _desktopShortcutMonitor;
    _desktopShortcutMonitor = nil;
    dispatch_async(dispatch_get_main_queue(), ^{ [NSEvent removeMonitor:monitor]; });
  }
}

- (void)invalidate
{
  [self stopObserving];
  [super invalidate];
}

RCT_REMAP_METHOD(getStatus,
                 getStatusWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *messagesPath = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Messages/chat.db"];
  BOOL canReadMessages = [[NSFileManager defaultManager] isReadableFileAtPath:messagesPath];
  NSError *credentialError = nil;
  NSString *deviceId = [ClaireCompanion keychainValueForAccount:@"companion.device.id" service:ClaireDeviceCredentialService allowInteraction:NO error:&credentialError];
  NSString *credential = [ClaireCompanion keychainValueForAccount:@"companion.device.credential" service:ClaireDeviceCredentialService allowInteraction:NO error:&credentialError];
  BOOL enrolled = deviceId.length > 0 && credential.length > 0;

  resolve(@{
    @"health": canReadMessages && enrolled ? @"healthy" : @"needs_setup",
    @"host": @"macos",
    @"iMessagePermissionState": canReadMessages ? @"ready" : @"needs_access",
    @"detail": !canReadMessages
      ? @"Grant Full Disk Access before Claire can inspect iMessage readiness on this Mac."
      : (enrolled
        ? @"Messages history and this Mac companion are ready to sync."
        : @"Messages history is available. Sign in to enrol this Mac companion and start iMessage sync."),
  });
}

RCT_REMAP_METHOD(getDesktopPreference,
                 getDesktopPreferenceWithKey:(NSString *)key
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![key hasPrefix:@"workspace."]) {
    reject(@"invalid_desktop_preference", @"Unsupported desktop preference key.", nil);
    return;
  }
  NSString *value = [[NSUserDefaults standardUserDefaults] stringForKey:[@"com.claire.desktop." stringByAppendingString:key]];
  resolve(value ?: (id)kCFNull);
}

RCT_REMAP_METHOD(setDesktopPreference,
                 setDesktopPreferenceWithKey:(NSString *)key
                 value:(NSString *)value
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![key hasPrefix:@"workspace."]) {
    reject(@"invalid_desktop_preference", @"Unsupported desktop preference key.", nil);
    return;
  }
  [[NSUserDefaults standardUserDefaults] setObject:value ?: @"" forKey:[@"com.claire.desktop." stringByAppendingString:key]];
  resolve(@YES);
}

RCT_REMAP_METHOD(readEncryptedCache,
                 readEncryptedCacheForUser:(NSString *)userId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
#if !CLAIRE_HAS_SQLCIPHER
  reject(@"encrypted_cache_unavailable", @"This Claire build does not include SQLCipher yet. Run pod install before using the encrypted desktop cache.", nil);
  return;
#else
  if (userId.length == 0) { reject(@"encrypted_cache_invalid_user", @"A signed-in user is required for the encrypted cache.", nil); return; }
  NSError *keyError = nil;
  NSString *account = ClaireCacheAccount(userId);
  NSString *key = [ClaireCompanion keychainValueForAccount:account service:ClaireCacheKeyService allowInteraction:NO error:&keyError];
  if (key.length == 0 && keyError == nil) { resolve((id)kCFNull); return; }
  if (keyError != nil) { reject(@"encrypted_cache_key_read_failed", @"Unable to read the desktop cache key.", keyError); return; }
  sqlite3 *database = NULL;
  if (sqlite3_open_v2(ClaireCachePath(userId).UTF8String, &database, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, NULL) != SQLITE_OK) { reject(@"encrypted_cache_open_failed", @"Unable to open the encrypted desktop cache.", nil); if (database) sqlite3_close(database); return; }
  if (sqlite3_key(database, key.UTF8String, (int)key.length) != SQLITE_OK || sqlite3_exec(database, "CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), payload BLOB NOT NULL, updated_at TEXT NOT NULL)", NULL, NULL, NULL) != SQLITE_OK) { sqlite3_close(database); reject(@"encrypted_cache_open_failed", @"Unable to unlock the encrypted desktop cache.", nil); return; }
  sqlite3_stmt *statement = NULL;
  NSString *payload = nil;
  if (sqlite3_prepare_v2(database, "SELECT payload FROM snapshot WHERE id = 1", -1, &statement, NULL) == SQLITE_OK && sqlite3_step(statement) == SQLITE_ROW) {
    const void *bytes = sqlite3_column_blob(statement, 0);
    int length = sqlite3_column_bytes(statement, 0);
    payload = bytes && length > 0 ? [[NSString alloc] initWithBytes:bytes length:(NSUInteger)length encoding:NSUTF8StringEncoding] : nil;
  }
  if (statement) sqlite3_finalize(statement);
  sqlite3_close(database);
  resolve(payload ?: (id)kCFNull);
#endif
}

RCT_REMAP_METHOD(writeEncryptedCache,
                 writeEncryptedCacheForUser:(NSString *)userId
                 payload:(NSString *)payload
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
#if !CLAIRE_HAS_SQLCIPHER
  reject(@"encrypted_cache_unavailable", @"This Claire build does not include SQLCipher yet. Run pod install before using the encrypted desktop cache.", nil);
  return;
#else
  if (userId.length == 0 || payload.length == 0) { reject(@"encrypted_cache_invalid_payload", @"A cache user and payload are required.", nil); return; }
  NSError *keyError = nil;
  NSString *account = ClaireCacheAccount(userId);
  NSString *key = [ClaireCompanion keychainValueForAccount:account service:ClaireCacheKeyService allowInteraction:NO error:&keyError];
  if (key.length == 0 && keyError == nil) {
    key = ClaireRandomDatabaseKey();
    if (key.length == 0 || ![ClaireCompanion storeKeychainValue:key account:account service:ClaireCacheKeyService error:&keyError]) { reject(@"encrypted_cache_key_write_failed", @"Unable to secure the desktop cache key.", keyError); return; }
  }
  if (keyError != nil) { reject(@"encrypted_cache_key_read_failed", @"Unable to read the desktop cache key.", keyError); return; }
  sqlite3 *database = NULL;
  if (sqlite3_open_v2(ClaireCachePath(userId).UTF8String, &database, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, NULL) != SQLITE_OK) { reject(@"encrypted_cache_open_failed", @"Unable to open the encrypted desktop cache.", nil); if (database) sqlite3_close(database); return; }
  int unlock = sqlite3_key(database, key.UTF8String, (int)key.length);
  int schema = sqlite3_exec(database, "CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), payload BLOB NOT NULL, updated_at TEXT NOT NULL)", NULL, NULL, NULL);
  sqlite3_stmt *statement = NULL;
  int prepared = unlock == SQLITE_OK && schema == SQLITE_OK ? sqlite3_prepare_v2(database, "INSERT INTO snapshot(id, payload, updated_at) VALUES(1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at", -1, &statement, NULL) : SQLITE_ERROR;
  int written = SQLITE_ERROR;
  if (prepared == SQLITE_OK) { sqlite3_bind_blob(statement, 1, payload.UTF8String, (int)[payload lengthOfBytesUsingEncoding:NSUTF8StringEncoding], SQLITE_TRANSIENT); written = sqlite3_step(statement); }
  if (statement) sqlite3_finalize(statement);
  sqlite3_close(database);
  if (written != SQLITE_DONE) { reject(@"encrypted_cache_write_failed", @"Unable to write the encrypted desktop cache.", nil); return; }
  resolve(@YES);
#endif
}

RCT_REMAP_METHOD(clearEncryptedCache,
                 clearEncryptedCacheForUser:(NSString *)userId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (userId.length == 0) { resolve(@YES); return; }
  NSString *cachePath = ClaireCachePath(userId);
  [[NSFileManager defaultManager] removeItemAtPath:cachePath error:nil];
  [[NSFileManager defaultManager] removeItemAtPath:[cachePath stringByAppendingString:@"-wal"] error:nil];
  [[NSFileManager defaultManager] removeItemAtPath:[cachePath stringByAppendingString:@"-shm"] error:nil];
  NSDictionary *query = @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword, (__bridge id)kSecAttrService: ClaireCacheKeyService, (__bridge id)kSecAttrAccount: ClaireCacheAccount(userId) };
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
  if (status != errSecSuccess && status != errSecItemNotFound) { reject(@"encrypted_cache_clear_failed", @"Unable to clear the encrypted desktop cache.", nil); return; }
  resolve(@YES);
}

RCT_REMAP_METHOD(getEncryptedCacheInfo,
                 getEncryptedCacheInfoForUser:(NSString *)userId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:ClaireCachePath(userId) error:nil];
  NSNumber *bytes = attributes[NSFileSize] ?: @0;
  NSDate *updatedAt = attributes[NSFileModificationDate];
  NSString *isoTimestamp = nil;
  if (updatedAt) {
    if (@available(macOS 10.12, *)) isoTimestamp = [[NSISO8601DateFormatter new] stringFromDate:updatedAt];
  }
  resolve(@{ @"bytes": bytes, @"updatedAt": isoTimestamp ?: (id)kCFNull });
}

RCT_REMAP_METHOD(openCompactChatWindow,
                 openCompactChatWindowForConversation:(NSString *)conversationId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [[NSNotificationCenter defaultCenter] postNotificationName:@"ClaireOpenCompactChat" object:self userInfo:@{ @"conversationId": conversationId ?: @"" }];
  resolve(@YES);
}

RCT_REMAP_METHOD(setDockBadge,
                 setDockBadgeWithUnreadCount:(nonnull NSNumber *)unreadCount
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSInteger count = MAX(0, unreadCount.integerValue);
    NSApp.dockTile.badgeLabel = count > 0 ? [NSString stringWithFormat:@"%ld", (long)count] : nil;
    resolve(@YES);
  });
}

RCT_REMAP_METHOD(connectInstagram,
                 connectInstagramAt:(NSString *)apiURL
                 accessToken:(NSString *)accessToken
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (apiURL.length == 0 || accessToken.length == 0) {
    reject(@"instagram_connection_invalid", @"Claire sign-in is required before connecting Instagram.", nil);
    return;
  }
  NSDictionary *headers = @{ @"Authorization": [NSString stringWithFormat:@"Bearer %@", accessToken] };
  [ClaireCompanion requestJSON:[ClaireCompanion apiURL:apiURL path:@"/platforms/instagram/login/start"] method:@"POST" headers:headers body:@{ @"client": @"native" } completion:^(NSDictionary *payload, NSInteger statusCode, NSError *requestError) {
    if (requestError != nil) { reject(@"instagram_connection_start_failed", requestError.localizedDescription, requestError); return; }
    NSString *sessionId = [payload[@"sessionId"] isKindOfClass:NSString.class] ? payload[@"sessionId"] : nil;
    NSString *loginId = [payload[@"loginId"] isKindOfClass:NSString.class] ? payload[@"loginId"] : nil;
    NSString *stepId = [payload[@"stepId"] isKindOfClass:NSString.class] ? payload[@"stepId"] : nil;
    if (sessionId.length == 0 || loginId.length == 0 || stepId.length == 0) {
      reject(@"instagram_connection_invalid", @"The Instagram bridge did not return a usable login session.", nil);
      return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      ClaireInstagramLoginController *controller = [[ClaireInstagramLoginController alloc] initWithAPIURL:apiURL accessToken:accessToken sessionId:sessionId loginId:loginId stepId:stepId resolve:resolve reject:reject];
      [ClaireInstagramLogins() addObject:controller];
      [controller present];
    });
  }];
}

RCT_REMAP_METHOD(openSystemSettings,
                 openSystemSettings:(NSString *)permission
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary<NSString *, NSString *> *privacyAnchors = @{
    @"full_disk_access": @"Privacy_AllFiles",
    @"accessibility": @"Privacy_Accessibility",
    @"contacts": @"Privacy_Contacts",
    @"automation": @"Privacy_Automation",
  };
  NSString *anchor = privacyAnchors[permission];
  if (anchor == nil) {
    reject(@"invalid_permission", @"Unsupported macOS privacy permission.", nil);
    return;
  }

  NSString *urlString = [NSString stringWithFormat:@"x-apple.systempreferences:com.apple.preference.security?%@", anchor];
  NSURL *url = [NSURL URLWithString:urlString];
  if (url != nil && [[NSWorkspace sharedWorkspace] openURL:url]) {
    resolve(nil);
  } else {
    reject(@"settings_unavailable", @"Unable to open macOS System Settings.", nil);
  }
}

RCT_REMAP_METHOD(getOrCreateDeviceIdentity,
                 getOrCreateDeviceIdentityWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *keyError = nil;
  NSString *publicKey = [ClaireCompanion devicePublicKey:&keyError];
  if (publicKey == nil) {
    reject(@"device_key_unavailable", @"Unable to create the secure Mac device identity.", keyError);
    return;
  }
  resolve(@{ @"publicKey": publicKey });
}

RCT_REMAP_METHOD(enrolMacCompanion,
                 enrolMacCompanionAt:(NSString *)apiURL
                 accessToken:(NSString *)accessToken
                 userId:(NSString *)userId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSLog(@"[ClaireCompanion] Starting companion enrollment for user %@", userId);
  NSError *existingCredentialError = nil;
  // Enrollment was explicitly selected by the user, so macOS may ask once to
  // unlock an older companion credential. Normal app startup never does this.
  NSString *existingDeviceId = [ClaireCompanion keychainValueForAccount:@"companion.device.id" service:ClaireDeviceCredentialService allowInteraction:YES error:&existingCredentialError];
  NSString *existingCredential = [ClaireCompanion keychainValueForAccount:@"companion.device.credential" service:ClaireDeviceCredentialService allowInteraction:YES error:&existingCredentialError];
  NSString *existingUserId = [ClaireCompanion keychainValueForAccount:@"companion.device.user_id" service:ClaireDeviceCredentialService allowInteraction:YES error:&existingCredentialError];
  if (existingDeviceId.length > 0 && existingCredential.length > 0 && [existingUserId isEqualToString:userId]) {
    NSLog(@"[ClaireCompanion] Reusing enrolled companion device %@", existingDeviceId);
    resolve(@{ @"deviceId": existingDeviceId });
    return;
  }
  NSError *keyError = nil;
  NSString *publicKey = [ClaireCompanion devicePublicKey:&keyError];
  if (publicKey == nil) {
    reject(@"device_key_unavailable", @"Unable to create the secure Mac device identity.", keyError);
    return;
  }
  NSDictionary *headers = @{ @"Authorization": [NSString stringWithFormat:@"Bearer %@", accessToken] };
  NSDictionary *body = @{
    @"displayName": @"Claire Desktop on Mac",
    @"hostPlatform": @"macos",
    @"publicKey": publicKey,
    @"capabilities": @[ @"desktop_client", @"imessage_host", @"instagram_auth_host" ],
  };
  [ClaireCompanion requestJSON:[ClaireCompanion apiURL:apiURL path:@"/devices"] method:@"POST" headers:headers body:body completion:^(NSDictionary *payload, NSInteger statusCode, NSError *requestError) {
    if (requestError != nil) {
      NSLog(@"[ClaireCompanion] Enrollment request failed (HTTP %ld): %@", (long)statusCode, requestError.localizedDescription);
      reject(@"device_enrolment_failed", requestError.localizedDescription, requestError);
      return;
    }
    NSDictionary *device = [payload[@"device"] isKindOfClass:NSDictionary.class] ? payload[@"device"] : nil;
    NSString *deviceId = [device[@"id"] isKindOfClass:NSString.class] ? device[@"id"] : nil;
    NSString *credential = [payload[@"credential"] isKindOfClass:NSString.class] ? payload[@"credential"] : nil;
    if (deviceId.length == 0 || credential.length == 0) {
      reject(@"device_enrolment_invalid", @"Claire did not return a companion credential.", nil);
      return;
    }
    NSError *storeError = nil;
    BOOL stored = [ClaireCompanion storeKeychainValue:deviceId account:@"companion.device.id" service:ClaireDeviceCredentialService error:&storeError]
      && [ClaireCompanion storeKeychainValue:credential account:@"companion.device.credential" service:ClaireDeviceCredentialService error:&storeError]
      && [ClaireCompanion storeKeychainValue:userId account:@"companion.device.user_id" service:ClaireDeviceCredentialService error:&storeError];
    if (!stored) {
      NSLog(@"[ClaireCompanion] Enrollment succeeded but Keychain storage failed: %@", storeError.localizedDescription);
      reject(@"device_credential_store_failed", @"Unable to store the companion credential in Keychain.", storeError);
      return;
    }
    NSLog(@"[ClaireCompanion] Companion enrollment completed for device %@", deviceId);
    resolve(@{ @"deviceId": deviceId });
  }];
}

RCT_REMAP_METHOD(heartbeatMacCompanion,
                 heartbeatMacCompanionAt:(NSString *)apiURL
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *keychainError = nil;
  NSString *deviceId = [ClaireCompanion keychainValueForAccount:@"companion.device.id" service:ClaireDeviceCredentialService allowInteraction:NO error:&keychainError];
  NSString *credential = [ClaireCompanion keychainValueForAccount:@"companion.device.credential" service:ClaireDeviceCredentialService allowInteraction:NO error:&keychainError];
  if (deviceId.length == 0 || credential.length == 0) { reject(@"device_not_enrolled", @"This Mac companion must be enrolled again.", keychainError); return; }
  NSDictionary *headers = @{ @"X-Claire-Device-Token": credential };
  [ClaireCompanion requestJSON:[ClaireCompanion apiURL:apiURL path:[NSString stringWithFormat:@"/devices/%@/heartbeat", deviceId]] method:@"POST" headers:headers body:nil completion:^(NSDictionary *payload, NSInteger statusCode, NSError *requestError) {
    if (requestError != nil) { reject(@"device_heartbeat_failed", requestError.localizedDescription, requestError); return; }
    resolve(@YES);
  }];
}

RCT_REMAP_METHOD(resetMacCompanion,
                 resetMacCompanionWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *idQuery = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: ClaireDeviceCredentialService,
    (__bridge id)kSecAttrAccount: @"companion.device.id",
  };
  NSDictionary *credentialQuery = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: ClaireDeviceCredentialService,
    (__bridge id)kSecAttrAccount: @"companion.device.credential",
  };
  NSDictionary *userQuery = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: ClaireDeviceCredentialService,
    (__bridge id)kSecAttrAccount: @"companion.device.user_id",
  };
  OSStatus idStatus = SecItemDelete((__bridge CFDictionaryRef)idQuery);
  OSStatus credentialStatus = SecItemDelete((__bridge CFDictionaryRef)credentialQuery);
  OSStatus userStatus = SecItemDelete((__bridge CFDictionaryRef)userQuery);
  BOOL idDeleted = idStatus == errSecSuccess || idStatus == errSecItemNotFound;
  BOOL credentialDeleted = credentialStatus == errSecSuccess || credentialStatus == errSecItemNotFound;
  BOOL userDeleted = userStatus == errSecSuccess || userStatus == errSecItemNotFound;
  if (!idDeleted || !credentialDeleted || !userDeleted) {
    OSStatus failure = !idDeleted ? idStatus : (!credentialDeleted ? credentialStatus : userStatus);
    reject(@"device_reset_failed", @"Unable to reset the Mac companion credential.", [NSError errorWithDomain:NSOSStatusErrorDomain code:failure userInfo:nil]);
    return;
  }
  resolve(@YES);
}

RCT_REMAP_METHOD(ingestIMessageEvents,
                 ingestIMessageEventsAt:(NSString *)apiURL
                 messages:(NSArray<NSDictionary *> *)messages
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *keychainError = nil;
  NSString *deviceId = [ClaireCompanion keychainValueForAccount:@"companion.device.id" service:ClaireDeviceCredentialService allowInteraction:NO error:&keychainError];
  NSString *credential = [ClaireCompanion keychainValueForAccount:@"companion.device.credential" service:ClaireDeviceCredentialService allowInteraction:NO error:&keychainError];
  if (deviceId.length == 0 || credential.length == 0) { reject(@"device_not_enrolled", @"This Mac companion must be enrolled again.", keychainError); return; }
  NSDictionary *headers = @{ @"X-Claire-Device-Token": credential };
  [ClaireCompanion requestJSON:[ClaireCompanion apiURL:apiURL path:[NSString stringWithFormat:@"/devices/%@/events", deviceId]] method:@"POST" headers:headers body:@{ @"messages": messages } completion:^(NSDictionary *payload, NSInteger statusCode, NSError *requestError) {
    if (requestError != nil) { reject(@"imessage_ingestion_failed", requestError.localizedDescription, requestError); return; }
    resolve(@YES);
  }];
}

RCT_REMAP_METHOD(getRuntimeConfig,
                 getRuntimeConfigWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSLog(@"[Claire Desktop] Resolving runtime configuration through the native module");
  NSDictionary *info = NSBundle.mainBundle.infoDictionary;
  NSString *(^stringValue)(NSString *) = ^NSString *(NSString *key) {
    id value = info[key];
    return [value isKindOfClass:NSString.class] ? value : @"";
  };
  resolve(@{
    @"apiUrl": stringValue(@"ClaireAPIURL"),
    @"supabaseUrl": stringValue(@"ClaireSupabaseURL"),
    @"supabaseAnonKey": stringValue(@"ClaireSupabaseAnonKey"),
  });
}

RCT_REMAP_METHOD(requestNotificationPermission,
                 requestNotificationPermissionWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                        completionHandler:^(BOOL granted, NSError * _Nullable error) {
    if (error != nil) { reject(@"notification_permission_failed", error.localizedDescription, error); return; }
    if (granted) dispatch_async(dispatch_get_main_queue(), ^{ [NSApp registerForRemoteNotifications]; });
    resolve(@(granted));
  }];
}

RCT_REMAP_METHOD(getNotificationRegistration,
                 getNotificationRegistrationWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    NSString *status = @"not_determined";
    if (settings.authorizationStatus == UNAuthorizationStatusAuthorized) status = @"authorized";
    else if (settings.authorizationStatus == UNAuthorizationStatusProvisional) status = @"provisional";
    else if (settings.authorizationStatus == UNAuthorizationStatusDenied) status = @"denied";
    NSString *token = [[NSUserDefaults standardUserDefaults] stringForKey:@"ClaireNotificationDeviceToken"] ?: @"";
    NSString *error = [[NSUserDefaults standardUserDefaults] stringForKey:@"ClaireNotificationRegistrationError"] ?: @"";
    resolve(@{ @"status": status, @"token": token, @"error": error });
  }];
}

RCT_REMAP_METHOD(getPendingNotificationResponse,
                 getPendingNotificationResponseWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *payload = [[NSUserDefaults standardUserDefaults] dictionaryForKey:@"ClairePendingNotificationResponse"];
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:@"ClairePendingNotificationResponse"];
  resolve(payload ?: [NSNull null]);
}

RCT_REMAP_METHOD(showNotification,
                 showNotificationWithTitle:(NSString *)title
                 body:(NSString *)body
                 chatId:(NSString *)chatId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    if (settings.authorizationStatus != UNAuthorizationStatusAuthorized && settings.authorizationStatus != UNAuthorizationStatusProvisional) {
      resolve(@NO);
      return;
    }
    UNMutableNotificationContent *content = [UNMutableNotificationContent new];
    content.title = title.length ? title : @"Claire";
    content.body = body.length ? body : @"You have a new message.";
    content.sound = [UNNotificationSound defaultSound];
    if (chatId.length) content.userInfo = @{ @"chatId": chatId };
    UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:[NSString stringWithFormat:@"claire-message-%@", NSUUID.UUID.UUIDString] content:content trigger:nil];
    [center addNotificationRequest:request withCompletionHandler:^(NSError * _Nullable error) {
      if (error != nil) { reject(@"notification_delivery_failed", error.localizedDescription, error); return; }
      resolve(@YES);
    }];
  }];
}

RCT_REMAP_METHOD(getSecureValue,
                 getSecureValueForAccount:(NSString *)account
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![ClaireCompanion isJavaScriptAccessibleKeychainAccount:account]) { reject(@"secure_value_restricted", @"That Keychain item is not available to the React Native layer.", nil); return; }
  NSError *keychainError = nil;
  NSString *value = [ClaireCompanion keychainValueForAccount:account service:ClaireAppAuthCredentialService allowInteraction:NO error:&keychainError];
  if (keychainError != nil) { reject(@"secure_value_read_failed", @"Unable to read a Keychain value.", keychainError); return; }
  resolve(value ?: [NSNull null]);
}

RCT_REMAP_METHOD(setSecureValue,
                 setSecureValueForAccount:(NSString *)account
                 value:(NSString *)value
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![ClaireCompanion isJavaScriptAccessibleKeychainAccount:account]) { reject(@"secure_value_restricted", @"That Keychain item is not available to the React Native layer.", nil); return; }
  NSError *keychainError = nil;
  if (![ClaireCompanion storeKeychainValue:value account:account service:ClaireAppAuthCredentialService error:&keychainError]) { reject(@"secure_value_write_failed", @"Unable to write a Keychain value.", keychainError); return; }
  resolve(@YES);
}

RCT_REMAP_METHOD(removeSecureValue,
                 removeSecureValueForAccount:(NSString *)account
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![ClaireCompanion isJavaScriptAccessibleKeychainAccount:account]) { reject(@"secure_value_restricted", @"That Keychain item is not available to the React Native layer.", nil); return; }
  NSDictionary *query = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: ClaireAppAuthCredentialService,
    (__bridge id)kSecAttrAccount: account,
  };
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
  if (status != errSecSuccess && status != errSecItemNotFound) {
    NSError *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status userInfo:nil];
    reject(@"secure_value_delete_failed", @"Unable to remove a Keychain value.", error);
    return;
  }
  resolve(@YES);
}

RCT_REMAP_METHOD(fetchIMessageMessages,
                 fetchIMessageMessagesSince:(nonnull NSNumber *)cursor
                 limit:(nonnull NSNumber *)limit
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *messagesPath = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Messages/chat.db"];
  sqlite3 *database = NULL;
  int openResult = sqlite3_open_v2(messagesPath.UTF8String, &database, SQLITE_OPEN_READONLY, NULL);
  if (openResult != SQLITE_OK || database == NULL) {
    NSString *detail = database ? [NSString stringWithUTF8String:sqlite3_errmsg(database)] : @"Unknown SQLite error";
    if (database) sqlite3_close(database);
    reject(@"imessage_database_unavailable", detail, nil);
    return;
  }

  static const char *query =
    "SELECT m.ROWID, m.guid, m.text, m.attributedBody, m.date, m.is_from_me, m.is_read, m.cache_has_attachments, "
    "h.id, c.chat_identifier, c.display_name, c.group_id "
    "FROM message m "
    "LEFT JOIN handle h ON m.handle_id = h.ROWID "
    "LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id "
    "LEFT JOIN chat c ON cmj.chat_id = c.ROWID "
    "WHERE m.ROWID > ? AND c.chat_identifier IS NOT NULL "
    "ORDER BY m.ROWID ASC LIMIT ?";
  sqlite3_stmt *statement = NULL;
  int prepareResult = sqlite3_prepare_v2(database, query, -1, &statement, NULL);
  if (prepareResult != SQLITE_OK || statement == NULL) {
    NSString *detail = [NSString stringWithUTF8String:sqlite3_errmsg(database)];
    sqlite3_close(database);
    reject(@"imessage_query_failed", detail, nil);
    return;
  }
  sqlite3_bind_int64(statement, 1, cursor.longLongValue);
  sqlite3_bind_int(statement, 2, MAX(1, MIN(limit.intValue, 200)));

  NSMutableArray<NSDictionary *> *messages = [NSMutableArray array];
  const double appleEpochMilliseconds = 978307200000.0;
  while (sqlite3_step(statement) == SQLITE_ROW) {
    int64_t rowId = sqlite3_column_int64(statement, 0);
    const unsigned char *guidText = sqlite3_column_text(statement, 1);
    const unsigned char *bodyText = sqlite3_column_text(statement, 2);
    const void *attributedBody = sqlite3_column_blob(statement, 3);
    int attributedBodyLength = sqlite3_column_bytes(statement, 3);
    double date = sqlite3_column_double(statement, 4);
    BOOL fromMe = sqlite3_column_int(statement, 5) == 1;
    BOOL isRead = sqlite3_column_int(statement, 6) == 1;
    BOOL hasMedia = sqlite3_column_int(statement, 7) == 1;
    const unsigned char *handleText = sqlite3_column_text(statement, 8);
    const unsigned char *chatIdText = sqlite3_column_text(statement, 9);
    const unsigned char *chatNameText = sqlite3_column_text(statement, 10);
    BOOL isGroup = sqlite3_column_type(statement, 11) != SQLITE_NULL;

    NSString *guid = guidText ? [NSString stringWithUTF8String:(const char *)guidText] : [NSString stringWithFormat:@"imessage-%lld", rowId];
    NSString *senderId = fromMe ? @"me" : (handleText ? [NSString stringWithUTF8String:(const char *)handleText] : @"unknown");
    NSString *chatId = [NSString stringWithUTF8String:(const char *)chatIdText];
    NSString *chatName = chatNameText ? [NSString stringWithUTF8String:(const char *)chatNameText] : chatId;
    // chat.db stores nanoseconds since the Apple epoch.
    NSDate *timestamp = [NSDate dateWithTimeIntervalSince1970:(appleEpochMilliseconds + date / 1000000.0) / 1000.0];
    NSString *content = bodyText ? [NSString stringWithUTF8String:(const char *)bodyText] : ClaireDecodeAttributedBody(attributedBody, attributedBodyLength);
    [messages addObject:@{
      @"rowId": @(rowId),
      @"platformMessageId": guid,
      @"content": content ?: @"",
      // Attachment paths remain native-only. syncIMessageMedia reads and uploads
      // the bytes separately after the event row has been ingested.
      @"contentType": @"text",
      @"senderId": senderId,
      @"senderName": fromMe ? @"You" : senderId,
      @"chatId": chatId,
      @"chatType": isGroup ? @"group" : @"individual",
      @"chatName": chatName,
      @"timestampMilliseconds": @([timestamp timeIntervalSince1970] * 1000),
      @"isFromMe": @(fromMe),
      @"isRead": @(isRead),
      @"hasMedia": @(hasMedia),
    }];
  }
  sqlite3_finalize(statement);
  sqlite3_close(database);
  resolve(messages);
}

RCT_REMAP_METHOD(syncIMessageMedia,
                 syncIMessageMediaAt:(NSString *)apiURL
                 messages:(NSArray<NSDictionary *> *)messages
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *keychainError = nil;
  NSString *deviceId = [ClaireCompanion keychainValueForAccount:@"companion.device.id" service:ClaireDeviceCredentialService allowInteraction:NO error:&keychainError];
  NSString *credential = [ClaireCompanion keychainValueForAccount:@"companion.device.credential" service:ClaireDeviceCredentialService allowInteraction:NO error:&keychainError];
  if (deviceId.length == 0 || credential.length == 0) { reject(@"device_not_enrolled", @"This Mac companion must be enrolled again.", keychainError); return; }
  if (!messages.count) { resolve(@0); return; }

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSString *messagesPath = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Messages/chat.db"];
    sqlite3 *database = NULL;
    if (sqlite3_open_v2(messagesPath.UTF8String, &database, SQLITE_OPEN_READONLY, NULL) != SQLITE_OK || database == NULL) {
      if (database) sqlite3_close(database);
      dispatch_async(dispatch_get_main_queue(), ^{ reject(@"imessage_database_unavailable", @"Unable to read the Messages attachment database.", nil); });
      return;
    }
    static const char *attachmentQuery =
      "SELECT a.filename, a.mime_type FROM attachment a "
      "INNER JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID "
      "INNER JOIN message m ON maj.message_id = m.ROWID "
      "WHERE m.guid = ? ORDER BY a.ROWID ASC LIMIT 1";
    sqlite3_stmt *statement = NULL;
    if (sqlite3_prepare_v2(database, attachmentQuery, -1, &statement, NULL) != SQLITE_OK || statement == NULL) {
      sqlite3_close(database);
      dispatch_async(dispatch_get_main_queue(), ^{ reject(@"imessage_attachment_query_failed", @"Unable to inspect Messages attachments.", nil); });
      return;
    }

    NSMutableArray<NSDictionary *> *uploads = [NSMutableArray array];
    for (NSDictionary *message in messages) {
      NSString *guid = [message[@"platformMessageId"] isKindOfClass:NSString.class] ? message[@"platformMessageId"] : nil;
      if (!guid.length) continue;
      sqlite3_reset(statement);
      sqlite3_clear_bindings(statement);
      sqlite3_bind_text(statement, 1, guid.UTF8String, -1, SQLITE_TRANSIENT);
      if (sqlite3_step(statement) != SQLITE_ROW) continue;
      const unsigned char *filenameText = sqlite3_column_text(statement, 0);
      const unsigned char *mimeText = sqlite3_column_text(statement, 1);
      if (filenameText == NULL) continue;
      NSString *filename = [NSString stringWithUTF8String:(const char *)filenameText];
      if ([filename hasPrefix:@"~/"]) filename = [NSHomeDirectory() stringByAppendingPathComponent:[filename substringFromIndex:2]];
      NSURL *fileURL = [filename hasPrefix:@"file://"] ? [NSURL URLWithString:filename] : [NSURL fileURLWithPath:filename];
      NSError *readError = nil;
      NSData *data = [NSData dataWithContentsOfURL:fileURL options:NSDataReadingMappedIfSafe error:&readError];
      if (!data.length || data.length > 25 * 1024 * 1024) continue;
      NSString *mimeType = mimeText ? [NSString stringWithUTF8String:(const char *)mimeText] : @"application/octet-stream";
      [uploads addObject:@{ @"guid": guid, @"mimeType": mimeType, @"data": data }];
    }
    sqlite3_finalize(statement);
    sqlite3_close(database);

    if (!uploads.count) { dispatch_async(dispatch_get_main_queue(), ^{ resolve(@0); }); return; }
    __block NSUInteger index = 0;
    __block NSUInteger uploaded = 0;
    __block void (^uploadNext)(void);
    __weak void (^weakUploadNext)(void);
    uploadNext = ^{
      if (index >= uploads.count) {
        dispatch_async(dispatch_get_main_queue(), ^{ resolve(@(uploaded)); });
        return;
      }
      NSDictionary *attachment = uploads[index++];
      NSString *guid = attachment[@"guid"];
      NSMutableCharacterSet *pathAllowed = [[NSCharacterSet URLPathAllowedCharacterSet] mutableCopy];
      [pathAllowed removeCharactersInString:@"/"];
      NSString *encodedGuid = [guid stringByAddingPercentEncodingWithAllowedCharacters:pathAllowed] ?: guid;
      NSString *path = [NSString stringWithFormat:@"/devices/%@/media/%@", deviceId, encodedGuid];
      NSDictionary *headers = @{ @"X-Claire-Device-Token": credential, @"X-Claire-Media-Mime-Type": attachment[@"mimeType"] };
      void (^nextUpload)(void) = weakUploadNext;
      [ClaireCompanion requestBinary:[ClaireCompanion apiURL:apiURL path:path] headers:headers data:attachment[@"data"] completion:^(NSInteger statusCode, NSError *requestError) {
        if (requestError == nil) uploaded += 1;
        if (nextUpload) nextUpload();
      }];
    };
    weakUploadNext = uploadNext;
    uploadNext();
  });
}

RCT_REMAP_METHOD(sendIMessage,
                 sendIMessageTo:(NSString *)recipient
                 text:(NSString *)text
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *handle = [[recipient componentsSeparatedByString:@";"] lastObject];
  if (handle.length == 0 || text.length == 0) {
    reject(@"imessage_invalid_recipient", @"A recipient and message are required.", nil);
    return;
  }
  NSString *(^escape)(NSString *) = ^NSString *(NSString *value) {
    NSString *escaped = [value stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
    return [escaped stringByReplacingOccurrencesOfString:@"\n" withString:@"\\n"];
  };
  NSString *scriptSource = [NSString stringWithFormat:
    @"tell application \"Messages\"\n"
     "  set targetService to first service whose service type is iMessage\n"
     "  set targetBuddy to buddy \"%@\" of targetService\n"
     "  send \"%@\" to targetBuddy\n"
     "end tell",
    escape(handle), escape(text)];
  NSAppleScript *script = [[NSAppleScript alloc] initWithSource:scriptSource];
  NSDictionary *error = nil;
  NSAppleEventDescriptor *result = [script executeAndReturnError:&error];
  if (result == nil || error != nil) {
    NSString *message = error[NSAppleScriptErrorMessage] ?: @"Messages could not send this iMessage.";
    reject(@"imessage_send_failed", message, nil);
    return;
  }
  resolve(@YES);
}

@end
