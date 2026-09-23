import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

jest.mock('../components/mobile/claire-mobile', () => ({
  MobileAvatar: () => null,
  MobileState: () => null,
  SectionLabel: () => null,
}));

jest.mock('../components/claire/skeleton', () => ({ PeopleSkeleton: () => null }));

import { ComposeCloseButton, composeHeaderOptions } from '../features/inbox/compose-screen';

describe('compose header', () => {
  beforeEach(() => jest.mocked(router.back).mockClear());

  it('does not create an empty trailing glass control', () => {
    expect(composeHeaderOptions).not.toHaveProperty('headerRight');
  });

  it('uses a compact transparent close action', () => {
    const screen = render(<ComposeCloseButton />);
    const close = screen.getByTestId('compose-close');

    expect(close.props.style).toEqual(expect.objectContaining({ width: 32, height: 32 }));
    expect(close.props.style).not.toHaveProperty('backgroundColor');
    fireEvent.press(close);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
