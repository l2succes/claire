import ContactsScreen from '../(tabs)/contacts';

// The native tab bar does not expose People as a navigable tab. Render the
// directory as a stack destination when opened from Profile or More.
export default function PeopleScreen() {
  return <ContactsScreen showBack />;
}
