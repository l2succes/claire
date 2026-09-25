#import <React/RCTViewManager.h>
#import <AVKit/AVKit.h>

@interface ClaireMediaPlayerView : NSView
@property (nonatomic, copy) NSString *source;
@property (nonatomic, strong) AVPlayerView *playerView;
@end

@implementation ClaireMediaPlayerView

- (instancetype)initWithFrame:(NSRect)frame
{
  if ((self = [super initWithFrame:frame])) {
    _playerView = [[AVPlayerView alloc] initWithFrame:self.bounds];
    _playerView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _playerView.controlsStyle = AVPlayerViewControlsStyleFloating;
    _playerView.videoGravity = AVLayerVideoGravityResizeAspect;
    [self addSubview:_playerView];
  }
  return self;
}

- (void)setSource:(NSString *)source
{
  if ((_source == source) || [_source isEqualToString:source]) return;
  _source = [source copy];
  NSURL *url = [source hasPrefix:@"file://"] ? [NSURL URLWithString:source] : [NSURL URLWithString:source];
  self.playerView.player = url ? [AVPlayer playerWithURL:url] : nil;
}

- (void)removeFromSuperview
{
  [self.playerView.player pause];
  self.playerView.player = nil;
  [super removeFromSuperview];
}

@end

@interface ClaireMediaPlayerManager : RCTViewManager
@end

@implementation ClaireMediaPlayerManager
RCT_EXPORT_MODULE(ClaireMediaPlayer)
RCT_EXPORT_VIEW_PROPERTY(source, NSString)

- (NSView *)view
{
  return [[ClaireMediaPlayerView alloc] initWithFrame:NSZeroRect];
}
@end
