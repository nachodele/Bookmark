import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED_KEY = 'onboarding_completed_v1';
export const ONBOARDING_PENDING_KEY = 'onboarding_pending_v1';

export async function setOnboardingPending(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_PENDING_KEY, '1');
}

export async function clearOnboardingPending(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_PENDING_KEY);
}

export async function hasOnboardingPending(): Promise<boolean> {
  const pending = await AsyncStorage.getItem(ONBOARDING_PENDING_KEY);
  return pending === '1';
}

export type OnboardingStep = {
  id: string;
  title: string;
  body: string;
  action?: 'open_board' | 'open_link' | 'finish';
  actionLabel?: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Bookmark',
    body: 'Organize links into boards that match how you think — not by app or platform.\n\nThis quick tour takes under a minute.',
  },
  {
    id: 'boards',
    title: 'Create your first board',
    body: 'Boards are your categories: Recipes, Fitness, Design…\n\nCreate a few before saving links — AI uses them when you share from other apps.',
    action: 'open_board',
    actionLabel: 'Create a board',
  },
  {
    id: 'link',
    title: 'Add a link',
    body: 'Tap Add link, paste a URL, then Analyze with AI. You review board, title, and thumbnail before saving — same flow as sharing from another app.',
    action: 'open_link',
    actionLabel: 'Try Add link',
  },
  {
    id: 'share',
    title: 'Share from any app',
    body: 'On Android, tap Share → Bookmark in YouTube, Instagram, Chrome…\n\nAI reads the page and saves it to your best matching board.',
  },
  {
    id: 'done',
    title: "You're all set",
    body: 'Tap any board to browse links. Edit or move saves anytime from the link detail screen.',
    action: 'finish',
    actionLabel: 'Start using Bookmark',
  },
];
