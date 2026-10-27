# End-to-end tests

[Maestro](https://docs.maestro.dev) goes through the app as a user would, on a release build that calls a real API: `account.yaml` creates an account, checks the account the API returns, sets a display name, signs out and in, and deletes the account. A step fails when the app can't do what a user would, such as when it signs in but can't load the account.

To run it on an Android emulator:

1. Start the API with its database (`pnpm dev`, or `pnpm start` after `pnpm build`), with sign-in that needs no confirmed email.
2. Build the app against it. The emulator reaches your computer at `10.0.2.2`; the iOS simulator at `localhost`. A plain-HTTP address is allowed only in such a build (`app.config.ts`):

   ```sh
   cd apps/mobile
   EXPO_PUBLIC_API_URL=http://10.0.2.2:3001 pnpm exec expo prebuild --platform android
   (cd android && ./gradlew assembleRelease)
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

   With a website, use its address, port 3000, which forwards the API's routes.

3. Run the flow with the app's id, from `android/app/build.gradle`'s `applicationId`:

   ```sh
   maestro test -e APP_ID=com.example.yourapp e2e
   ```

The flow deletes the account it creates, so it can run again. `-e EMAIL=...` and `-e PASSWORD=...` change the account it uses.
