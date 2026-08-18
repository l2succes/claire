import Svg, { Circle, G, Path } from 'react-native-svg';

export function ClaireMark({
  size = 22,
  color = '#10120F',
  dot = '#FFFDF8',
}: {
  size?: number;
  color?: string;
  dot?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityIgnoresInvertColors>
      <G transform="translate(64 0) scale(-1 1)">
        <Path
          d="M10 34c0-13 9-22 22-22s22 8 22 20-9 20-21 20c-10 0-17-6-17-14 0-7 5-12 12-12 6 0 10 4 10 9 0 6-4 10-10 10"
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={10} cy={34} r={4} fill={dot} />
      </G>
    </Svg>
  );
}
