import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ONBOARDING_COMPLETED_KEY, ONBOARDING_PENDING_KEY, ONBOARDING_STEPS, type OnboardingStep } from '@/lib/onboarding';
import { useTheme } from '@/contexts/ThemeContext';

type OnboardingTutorialProps = {
  visible: boolean;
  stepIndex: number;
  onStepChange: (index: number) => void;
  onAction: (step: OnboardingStep) => void;
  onComplete: () => void;
  onSkip: () => void;
};

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, '1');
  await AsyncStorage.removeItem(ONBOARDING_PENDING_KEY);
}

export function OnboardingTutorial({
  visible,
  stepIndex,
  onStepChange,
  onAction,
  onComplete,
  onSkip,
}: OnboardingTutorialProps) {
  const { colors } = useTheme();
  const step = ONBOARDING_STEPS[stepIndex];
  const isLast = stepIndex >= ONBOARDING_STEPS.length - 1;

  if (!step) return null;

  const isFirst = stepIndex === 0;
  const isFinishStep = step.action === 'finish';

  const handlePrimary = () => {
    if (step.action === 'finish') {
      void markOnboardingComplete();
      onComplete();
      return;
    }
    if (step.action) {
      onAction(step);
      return;
    }
    if (isLast) {
      void markOnboardingComplete();
      onComplete();
    } else {
      onStepChange(stepIndex + 1);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.progressRow}>
            {ONBOARDING_STEPS.map((s, i) => (
              <View
                key={s.id}
                style={[
                  styles.dot,
                  { backgroundColor: i <= stepIndex ? colors.accent : colors.surfaceBorder },
                ]}
              />
            ))}
          </View>

          <Text style={[styles.stepLabel, { color: colors.accent }]}>
            Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{step.body}</Text>

          <Pressable
            onPress={handlePrimary}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: colors.onAccent }]}>
              {step.actionLabel ?? (isLast ? 'Done' : 'Next')}
            </Text>
          </Pressable>

          {step.action && !isFinishStep ? (
            <Pressable onPress={() => onStepChange(Math.min(stepIndex + 1, ONBOARDING_STEPS.length - 1))}>
              <Text style={[styles.secondaryBtn, { color: colors.textSecondary }]}>Skip this step</Text>
            </Pressable>
          ) : null}

          {isFirst ? (
            <Pressable
              onPress={() => {
                void markOnboardingComplete();
                onSkip();
              }}
              style={styles.skip}
            >
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Skip tour</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export function GuideButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.guideBtn, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityLabel="Show guide"
    >
      <Ionicons name="help-circle-outline" size={26} color={colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 24, gap: 12 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  stepLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, marginBottom: 8 },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: { textAlign: 'center', fontSize: 14, marginTop: 8 },
  skip: { alignItems: 'center', paddingTop: 12 },
  guideBtn: { padding: 4 },
});
