#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@interface AppDelegate () <NSWindowDelegate, NSMenuDelegate>
@property (nonatomic, strong) NSWindow *compactChatWindow;
@property (nonatomic, strong) id compactChatObserver;
@property (nonatomic, strong) NSStatusItem *connectionStatusItem;
@property (nonatomic, strong) NSMenuItem *iMessageStatusMenuItem;
@property (nonatomic, strong) NSMenuItem *instagramStatusMenuItem;
- (NSDictionary *)runtimeConfig;
- (void)handleURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent;
- (void)positionTrafficLights:(NSNotification *)notification;
- (void)installConnectionStatusItem;
- (void)openConnectionSettingsFromMenu:(id)sender;
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
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(positionTrafficLights:)
                                               name:NSWindowDidResizeNotification
                                             object:self.window];
  dispatch_async(dispatch_get_main_queue(), ^{
    [self positionTrafficLights:nil];
  });
  [self installDesktopCommandMenu];
  [self installConnectionStatusItem];
  __weak __typeof__(self) weakSelf = self;
  self.compactChatObserver = [[NSNotificationCenter defaultCenter] addObserverForName:@"ClaireOpenCompactChat" object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *notification) {
    [weakSelf openCompactChatForConversationId:notification.userInfo[@"conversationId"]];
  }];
}

- (void)installConnectionStatusItem
{
  self.connectionStatusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSSquareStatusItemLength];
  NSImage *image = [NSImage imageWithSystemSymbolName:@"bubble.left.and.bubble.right.fill" accessibilityDescription:@"Claire desktop connections"];
  [image setTemplate:YES];
  self.connectionStatusItem.button.image = image;
  self.connectionStatusItem.button.toolTip = @"Claire desktop connections";

  NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Claire desktop connections"];
  menu.delegate = self;
  NSMenuItem *heading = [[NSMenuItem alloc] initWithTitle:@"Desktop connections" action:nil keyEquivalent:@""];
  heading.enabled = NO;
  [menu addItem:heading];
  self.iMessageStatusMenuItem = [[NSMenuItem alloc] initWithTitle:@"iMessage — Checking…" action:nil keyEquivalent:@""];
  self.iMessageStatusMenuItem.enabled = NO;
  [menu addItem:self.iMessageStatusMenuItem];
  self.instagramStatusMenuItem = [[NSMenuItem alloc] initWithTitle:@"Instagram — Not connected" action:nil keyEquivalent:@""];
  self.instagramStatusMenuItem.enabled = NO;
  [menu addItem:self.instagramStatusMenuItem];
  [menu addItem:NSMenuItem.separatorItem];
  NSMenuItem *openConnections = [[NSMenuItem alloc] initWithTitle:@"Open Connection Settings…" action:@selector(openConnectionSettingsFromMenu:) keyEquivalent:@""];
  openConnections.target = self;
  [menu addItem:openConnections];
  NSMenuItem *showClaire = [[NSMenuItem alloc] initWithTitle:@"Show Claire" action:@selector(showClaireFromMenu:) keyEquivalent:@""];
  showClaire.target = self;
  [menu addItem:showClaire];
  self.connectionStatusItem.menu = menu;
}

- (void)menuNeedsUpdate:(NSMenu *)menu
{
  NSString *messagesPath = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Messages/chat.db"];
  BOOL messagesReadable = [[NSFileManager defaultManager] isReadableFileAtPath:messagesPath];
  self.iMessageStatusMenuItem.title = messagesReadable ? @"iMessage — Syncing on this Mac" : @"iMessage — Needs Full Disk Access";
  BOOL instagramConnected = [[NSUserDefaults standardUserDefaults] boolForKey:@"ClaireInstagramDesktopConnected"];
  self.instagramStatusMenuItem.title = instagramConnected ? @"Instagram — Connected" : @"Instagram — Not connected";
}

- (void)showClaireFromMenu:(id)sender
{
  [NSApp activateIgnoringOtherApps:YES];
  [self.window makeKeyAndOrderFront:nil];
}

- (void)openConnectionSettingsFromMenu:(id)sender
{
  [self showClaireFromMenu:sender];
  [[NSNotificationCenter defaultCenter] postNotificationName:@"ClaireDesktopCommand" object:self userInfo:@{ @"command": @"settings" }];
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
  [[NSNotificationCenter defaultCenter] removeObserver:self name:NSWindowDidResizeNotification object:self.window];
}

- (void)positionTrafficLights:(NSNotification *)notification
{
  // Standard window controls belong to AppKit, not the React view hierarchy.
  // Position them inside the transparent title-bar's native control container
  // so they remain fully visible regardless of the compact rail width.
  NSButton *closeButton = [self.window standardWindowButton:NSWindowCloseButton];
  NSButton *minimizeButton = [self.window standardWindowButton:NSWindowMiniaturizeButton];
  NSButton *zoomButton = [self.window standardWindowButton:NSWindowZoomButton];
  NSView *container = closeButton.superview;
  if (container == nil || minimizeButton == nil || zoomButton == nil) return;

  // Keep Apple's genuine traffic-light controls, but use a compact group so
  // the collapsed Claire rail need not grow wider than the controls.
  const CGFloat leading = 14.0;
  const CGFloat gap = 6.0;
  const CGFloat topInset = 12.0;
  const CGFloat y = NSHeight(container.bounds) - NSHeight(closeButton.frame) - topInset;
  CGFloat x = leading;
  for (NSButton *button in @[closeButton, minimizeButton, zoomButton]) {
    NSRect frame = button.frame;
    frame.origin = NSMakePoint(x, y);
    button.frame = frame;
    x += NSWidth(frame) + gap;
  }
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
    @[ @"Loops", @"loops", @"3" ],
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
