import { BellRing, Check, MessageCircle, Sparkles } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { colors, mobileType, radius } from '@claire/design-system';
import { ClaireMark } from '../../components/claire/mark';

/** A device-native illustration: the two kinds of useful alerts, without screenshots or fake OS chrome. */
export function NotificationArtwork() {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={{ width: '100%', height: 300, maxWidth: 390, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ position: 'absolute', width: 274, height: 274, borderRadius: 137, backgroundColor: colors.sky }} />
      <View style={{ position: 'absolute', top: 20, left: 35, width: 45, height: 45, borderRadius: 23, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
        <Sparkles size={20} color={colors.ink} strokeWidth={2.2} />
      </View>
      <View style={{ position: 'absolute', top: 44, right: 28, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.mint }} />
      <View style={{ width: 197, height: 275, borderRadius: 38, borderWidth: 3, borderColor: colors.ink, backgroundColor: colors.cream, transform: [{ rotate: '-7deg' }], boxShadow: '0 20px 38px rgba(16,18,15,0.14)' }}>
        <View style={{ alignSelf: 'center', width: 68, height: 14, borderBottomLeftRadius: 11, borderBottomRightRadius: 11, backgroundColor: colors.ink }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <View style={{ width: 74, height: 74, borderRadius: 24, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}><BellRing size={35} color={colors.ink} strokeWidth={1.8} /></View>
          <Text allowFontScaling={false} style={{ ...mobileType.label, fontWeight: '800', color: colors.ink }}>Only what matters.</Text>
        </View>
      </View>

      <View style={{ position: 'absolute', top: 92, left: 0, width: 230, gap: 7, padding: 13, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, boxShadow: '0 10px 28px rgba(16,18,15,0.12)', transform: [{ rotate: '-4deg' }] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }}><MessageCircle size={14} color={colors.ink} /></View>
          <Text allowFontScaling={false} style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>NEW MESSAGE</Text>
        </View>
        <Text allowFontScaling={false} style={{ ...mobileType.bodySmall, fontWeight: '800', color: colors.ink }}>Priya · Dinner is at 7</Text>
        <Text allowFontScaling={false} style={{ ...mobileType.label, color: colors.neutral[600] }}>The detail you needed, on time.</Text>
      </View>

      <View style={{ position: 'absolute', right: 0, bottom: 39, width: 234, gap: 7, padding: 13, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lime, boxShadow: '0 12px 28px rgba(16,18,15,0.12)', transform: [{ rotate: '4deg' }] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}><ClaireMark size={15} /></View>
          <Text allowFontScaling={false} style={{ ...mobileType.monoLabel, color: colors.ink }}>GENTLE REMINDER</Text>
        </View>
        <Text allowFontScaling={false} style={{ ...mobileType.bodySmall, fontWeight: '800', color: colors.ink }}>Send the notes to Priya</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Check size={13} color={colors.ink} /><Text allowFontScaling={false} style={{ ...mobileType.label, color: colors.ink }}>A promise you can keep.</Text></View>
      </View>
    </View>
  );
}
