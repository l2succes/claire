# Google OAuth Setup for Claire

This guide explains how to set up Google OAuth authentication with Supabase for the Claire app.

## Prerequisites

- A Google Cloud Console account
- Access to your Supabase project dashboard
- The Claire app running locally

## Step 1: Set up Google OAuth in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)

2. Create a new project or select an existing one

3. Enable the Google+ API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click on it and press "Enable"

4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - If prompted, configure the OAuth consent screen first:
     - Choose "External" for user type
     - Fill in the required fields (app name, support email, etc.)
     - Add your email to test users
     - Save and continue

5. Create OAuth client ID:
   - Application type: "Web application"
   - Name: "Claire Supabase Auth"
   - Authorized JavaScript origins:
     - Add: `https://khhvrwomoghmwhfxlnky.supabase.co` (your Supabase URL)
   - Authorized redirect URIs:
     - Add: `https://khhvrwomoghmwhfxlnky.supabase.co/auth/v1/callback`
   - Click "Create"

6. Copy the Client ID and Client Secret

## Step 2: Configure Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com/)

2. Navigate to Authentication → Providers

3. Find Google in the list and enable it

4. Enter the OAuth credentials:
   - Client ID: (paste from Google Cloud Console)
   - Client Secret: (paste from Google Cloud Console)

5. Configure redirect URLs:
   - Site URL: `claire://auth/callback` (for mobile app)
   - Additional redirect URLs:
     - `http://localhost:3000` (for development)
     - `claire://auth/callback` (for mobile deep linking)
     - `exp://192.168.68.100:8081` (for Expo development - replace with your IP)

6. Save the configuration

## Step 3: Test the Integration

### In Development (Expo Go)

1. Start the app:
   ```bash
   cd client
   bun run ios
   ```

2. Navigate to the Sign In or Sign Up screen

3. Click "Sign in with Google"

4. The browser should open with Google's login page

5. After successful authentication, you'll be redirected back to the app

### Important URLs

- **Redirect URI in app**: `claire://auth/callback`
- **Supabase callback**: `https://khhvrwomoghmwhfxlnky.supabase.co/auth/v1/callback`
- **Development redirect**: `exp://192.168.68.100:8081/auth/callback` (replace IP with yours)

## Step 4: Production Setup

For production, you'll need to:

1. Update the OAuth consent screen in Google Cloud Console to "Published" status
2. Add your production domain to authorized origins and redirect URIs
3. Update Supabase redirect URLs with your production URLs
4. Configure proper deep linking in your mobile app

## Troubleshooting

### "Redirect URI mismatch" error
- Ensure the redirect URI in your app matches exactly what's configured in Google Cloud Console
- Check that your Supabase URL is correctly added to authorized JavaScript origins

### "User cancelled login" message
- This is normal if the user closes the browser without completing authentication
- No action needed

### Deep link not working
- Ensure your app.json has the correct scheme configured (`claire`)
- For iOS, you may need to configure associated domains
- For Android, ensure the intent filter is properly configured

### Token not found after redirect
- Check that the redirect URL includes the hash fragment with tokens
- Verify the URL parsing logic in `googleAuth.ts`

## Security Notes

- Never commit your Google Client Secret to version control
- Use environment variables for sensitive credentials
- In production, restrict the OAuth client to specific domains
- Regularly rotate your client secret

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Expo AuthSession Documentation](https://docs.expo.dev/versions/latest/sdk/auth-session/)