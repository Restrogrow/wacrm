import AsyncStorage from '@react-native-async-storage/async-storage';

/** Same key the root layout's Gate reads. */
export const ONBOARDING_KEY = 'rg.onboarding.done.v1';

export async function markOnboardingDone() {
  await AsyncStorage.setItem(ONBOARDING_KEY, '1');
}
