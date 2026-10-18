import { Redirect } from 'expo-router';

/** Any address the app does not know (an old link, a typo) goes back to the start page instead of an error screen. */
export default function NotFound() {
  return <Redirect href="/" />;
}
