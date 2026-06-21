import AsyncStorage from '@react-native-async-storage/async-storage';

export const PASSWORD_SETUP_REQUIRED_KEY = 'password_setup_required_v1';
export const OAUTH_NEW_ACCOUNT_KEY = 'oauth_new_account_v1';

export async function markPasswordSetupRequired(isNewAccount: boolean): Promise<void> {
  await AsyncStorage.setItem(PASSWORD_SETUP_REQUIRED_KEY, '1');
  if (isNewAccount) {
    await AsyncStorage.setItem(OAUTH_NEW_ACCOUNT_KEY, '1');
  }
}

export async function clearPasswordSetupRequired(): Promise<void> {
  await AsyncStorage.multiRemove([PASSWORD_SETUP_REQUIRED_KEY, OAUTH_NEW_ACCOUNT_KEY]);
}

export async function isPasswordSetupRequired(): Promise<boolean> {
  return (await AsyncStorage.getItem(PASSWORD_SETUP_REQUIRED_KEY)) === '1';
}

export async function wasOAuthNewAccount(): Promise<boolean> {
  return (await AsyncStorage.getItem(OAUTH_NEW_ACCOUNT_KEY)) === '1';
}
