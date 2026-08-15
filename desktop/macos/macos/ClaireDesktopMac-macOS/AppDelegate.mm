#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@interface AppDelegate () <NSWindowDelegate>
@property (nonatomic, strong) NSWindow *compactChatWindow;
@property (nonatomic, strong) id compactChatObserver;
- (NSDictionary *)runtimeConfig;
- (void)handleURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"ClaireDesktopMac";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{ @"runtimeConfig": [self runtimeConfig] };
  self.dependencyProvider = [RCTAppDependencyProvider new];
  [UNUserNotificationCenter currentNotificationCenter].delegate = self;
  [[NSAppleEventManager sharedAppleEventManager] setEventHandler:self
                                                   andSelector:@selector(handleURLEvent:withReplyEvent:)
                                                 forEventClass:kInternetEventClass
                                                 andEventID:kAEGetURL];

  [super applicationDidFinishLaunching:notification];
  // Render Claire's workspace into the titlebar while retaining the native
  // traffic-light controls. React Native macOS owns the draggable region via
  // mouseDownCanMoveWindow, so the rest of the workspace remains interactive.
  self.window.title = @"Claire";
  self.window.titleVisibility = NSWindowTitleHidden;
  self.window.titlebarAppearsTransparent = YES;
  self.window.styleMask |= NSWindowStyleMaskFullSizeContentView;
  self.window.movableByWindowBackground = NO;
  [self installDesktopCommandMenu];
  __weak __typeof__(self) weakSelf = self;
  self.compactChatObserver = [[NSNotificationCenter defaultCenter] addObserverForName:@"ClaireOpenCompactChat" object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *notification) {
    [weakSelf openCompactChatForConversationId:notification.userInfo[@"conversationId"]];
  }];
}

- (void)application:(NSApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  const unsigned char *bytes = (const unsigned char *)deviceToken.bytes;
  NSMutableString *token = [NSMutableString stringWithCapacity:deviceToken.length * 2];
  for (NSUInteger index = 0; index < deviceToken.length; index++) [token appendFormat:@"%02x", bytes[index]];
  [[NSUserDefaults standardUserDefaults] setObject:token forKey:@"ClaireNotificationDeviceToken"];
  [[NSNotificationCenter defaultCenter] postNotificationName:@"ClaireNotificationTokenChanged" object:self userInfo:@{ @"token": token }];
}

- (void)application:(NSApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  [[NSUserDefaults standardUserDefaults] setObject:error.localizedDescription ?: @"Registration failed" forKey:@"ClaireNotificationRegistrationError"];
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
 didReceiveNotificationResponse:(UNNotificationResponse *)response
          withCompletionHandler:(void (^)(void))completionHandler
{
  NSDictionary *userInfo = response.notification.request.content.userInfo ?: @{};
  NSString *chatId = [userInfo[@"chatId"] isKindOfClass:NSString.class] ? userInfo[@"chatId"] : nil;
  NSString *messageId = [userInfo[@"messageId"] isKindOfClass:NSString.class] ? userInfo[@"messageId"] : nil;
  if (chatId.length > 0) {
    NSDictionary *payload = @{ @"chatId": chatId, @"messageId": messageId ?: @"" };
    [[NSUserDefaults standardUserDefaults] setObject:payload forKey:@"ClairePendingNotificationResponse"];
    [[NSNotificationCenter defaultCenter] postNotificationName:@"ClaireNotificationResponse" object:self userInfo:payload];
    [NSApp activateIgnoringOtherApps:YES];
  }
  completionHandler();
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
{
  completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound | UNNotificationPresentationOptionBadge);
}

- (void)dealloc
{
  if (_compactChatObserver != nil) [[NSNotificationCenter defaultCenter] removeObserver:_compactChatObserver];
}

- (void)handleURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent
{
  // Do not print the URL: OAuth codes and tokens must never enter logs. These
  // flags are enough to tell whether macOS handed the callback to the app.
  NSString *rawURL = [event paramDescriptorForKeyword:keyDirectObject].stringValue ?: @"";
  NSURLComponents *components = [NSURLComponents componentsWithString:rawURL];
  NSLog(@"[Claire Desktop] Received URL callback scheme=%@ host=%@ path=%@ query=%@ fragment=%@",
        components.scheme ?: @"", components.host ?: @"", components.path ?: @"",
        components.query.length > 0 ? @"present" : @"none",
        components.fragment.length > 0 ? @"present" : @"none");
  [RCTLinkingManager getUrlEventHandler:event withReplyEvent:replyEvent];
}

- (void)installDesktopCommandMenu
{
  NSMenu *mainMenu = NSApp.mainMenu;
  if (mainMenu == nil || [mainMenu itemWithTitle:@"Navigate"] != nil) return;
  NSMenu *navigateMenu = [[NSMenu alloc] initWithTitle:@"Navigate"];
  NSMenuItem *navigateItem = [[NSMenuItem alloc] initWithTitle:@"Navigate" action:nil keyEquivalent:@""];
  navigateItem.submenu = navigateMenu;
  NSArray<NSArray<NSString *> *> *commands = @[
    @[ @"Home", @"home", @"1" ],
    @[ @"Inbox", @"inbox", @"2" ],
    @[ @"Promises", @"promises", @"3" ],
    @[ @"People", @"people", @"4" ],
    @[ @"Ask Claire", @"search", @"k" ],
    @[ @"New message", @"compose", @"n" ],
    @[ @"Open compact chat", @"compact", @"m" ],
    @[ @"Settings", @"settings", @"," ],
  ];
  for (NSArray<NSString *> *command in commands) {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:command[0] action:@selector(performDesktopCommand:) keyEquivalent:command[2]];
    item.target = self;
    item.representedObject = command[1];
    item.keyEquivalentModifierMask = [command[1] isEqualToString:@"compact"] ? (NSEventModifierFlagCommand | NSEventModifierFlagShift) : NSEventModifierFlagCommand;
    [navigateMenu addItem:item];
  }
  NSUInteger insertionIndex = MIN((NSUInteger)1, mainMenu.numberOfItems);
  [mainMenu insertItem:navigateItem atIndex:insertionIndex];
}

- (void)openCompactChatForConversationId:(NSString *)conversationId
{
  if (self.compactChatWindow != nil) {
    [self.compactChatWindow close];
    self.compactChatWindow = nil;
  }
  NSDictionary *initialProperties = @{ @"compactWindow": @YES, @"initialConversationId": conversationId ?: @"", @"runtimeConfig": [self runtimeConfig] };
  NSView *rootView = (NSView *)[[self rootViewFactory] viewWithModuleName:self.moduleName initialProperties:initialProperties];
  NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 480, 680)
                                                   styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable | NSWindowStyleMaskMiniaturizable)
                                                     backing:NSBackingStoreBuffered
                                                       defer:NO];
  window.title = @"Claire chat";
  window.minSize = NSMakeSize(360, 460);
  window.contentView = rootView;
  window.delegate = self;
  [window center];
  [window makeKeyAndOrderFront:nil];
  self.compactChatWindow = window;
}

- (void)windowWillClose:(NSNotification *)notification
{
  if (notification.object == self.compactChatWindow) self.compactChatWindow = nil;
}

- (NSDictionary *)runtimeConfig
{
  NSDictionary *info = NSBundle.mainBundle.infoDictionary;
  NSString *(^stringValue)(NSString *) = ^NSString *(NSString *key) {
    id value = info[key];
    return [value isKindOfClass:NSString.class] ? value : @"";
  };
  return @{
    @"apiUrl": stringValue(@"ClaireAPIURL"),
    @"supabaseUrl": stringValue(@"ClaireSupabaseURL"),
    @"supabaseAnonKey": stringValue(@"ClaireSupabaseAnonKey"),
  };
}

- (void)performDesktopCommand:(NSMenuItem *)sender
{
  NSString *command = [sender.representedObject isKindOfClass:NSString.class] ? sender.representedObject : nil;
  if (command.length == 0) return;
  [[NSNotificationCenter defaultCenter] postNotificationName:@"ClaireDesktopCommand" object:self userInfo:@{ @"command": command }];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
#ifdef RN_FABRIC_ENABLED
  return true;
#else
  return false;
#endif
}

@end
