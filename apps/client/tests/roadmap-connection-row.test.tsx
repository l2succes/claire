import { fireEvent, render } from '@testing-library/react-native';
import { RoadmapConnectionRow } from '../features/connections/roadmap-connection-row';
import type { PlatformDefinition } from '../services/platforms';

const signal: PlatformDefinition = {
  id: 'signal',
  name: 'Signal',
  mark: 'SI',
  accent: '#3A76F0',
  iconUrl: '',
  supportStatus: 'planned',
  setupSurface: 'phone',
  setupLabel: 'Planned',
  runtimeLabel: 'Future cloud bridge',
  authSummary: 'Not available yet.',
  detail: 'Request access to help prioritize this bridge.',
};

describe('RoadmapConnectionRow', () => {
  it('uses an explicit Request control instead of an ambiguous row chevron', () => {
    const onRequest = jest.fn();
    const screen = render(
      <RoadmapConnectionRow definition={signal} requested={false} onRequest={onRequest} />,
    );

    fireEvent.press(screen.getByTestId('roadmap-request-signal'));
    expect(screen.getByText('Request')).toBeTruthy();
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled Requested state after the vote is recorded', () => {
    const onRequest = jest.fn();
    const screen = render(
      <RoadmapConnectionRow definition={signal} requested onRequest={onRequest} />,
    );

    fireEvent.press(screen.getByTestId('roadmap-request-signal'));
    expect(screen.getByText('Requested')).toBeTruthy();
    expect(onRequest).not.toHaveBeenCalled();
  });
});
