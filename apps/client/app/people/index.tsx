import { Redirect } from 'expo-router';

// People is launched from the More sheet. Keep it inside the tab navigator so
// the persistent tab bar is available as the exit affordance.
export default function PeopleRedirect() {
  return <Redirect href="/(tabs)/contacts" />;
}
