# End-to-end tests

[Maestro](https://docs.maestro.dev) goes through the app as a user would, against the website and its API: `account.yaml` creates an account, checks the account the API returns, sets a display name, signs out and in, and deletes the account. A step fails when the app can't do what a user would, such as when it signs up but can't load the account.

To run it on an Android emulator:

1. Start the website and the API with their database (`pnpm dev`, or `pnpm start` after `pnpm build`), with sign-in that needs no confirmed email.
2. Build the app against the website. The emulator reaches your computer at `10.0.2.2`; the iOS simulator at `localhost`. A plain-HTTP `WEB_URL` is allowed only for those addresses (`scripts/build.mjs`):

   ```sh
   cd apps/shell
   WEB_URL=http://10.0.2.2:3000 pnpm run sync android
   (cd android && ./gradlew assembleDebug)
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

3. Run the flow with the app's id, from `capacitor.config.ts` or `android/app/build.gradle`'s `applicationId`:

   ```sh
   maestro test -e APP_ID=com.example.yourapp e2e
   ```

Each run signs up with a new address, `e2e-<time>@example.com`, so a run that stops before deleting its account doesn't block the next one. `-e PASSWORD=...` changes its password.
