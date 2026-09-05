import { WaitlistWelcomeEmail } from '../waitlist';

export default function WaitlistPreview() {
  return (
    <WaitlistWelcomeEmail
      siteUrl="http://localhost:3000"
      unsubscribeUrl="https://useclaire.co/api/waitlist/unsubscribe?token=preview"
    />
  );
}
