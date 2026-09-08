# Customer mobile application

Hebrew RTL Expo application. Run `corepack pnpm --filter @coffix/mobile start`
from the repository root. Local API/payment/OTP providers remain fake by default.
See [local Android setup](../docs/README.md).

## Notifications and native builds

The inbox, unread badges, profile and saved addresses work without a push provider.
The OS permission prompt runs after authentication. A denied permission displays
an explanation and a link to device settings; there is no notification opt-out
setting in the application.

Native builds use `@react-native-firebase/app` and `messaging` to obtain FCM tokens
on both iOS and Android. Expo Go shows an explanatory unavailable state.
Expo's native iOS token is an APNs token and must not be registered with this
backend's FCM adapter. See [Expo token types](https://docs.expo.dev/push-notifications/sending-notifications-custom/)
and [React Native Firebase Expo setup](https://rnfirebase.io/#installation-for-expo-projects).

For a Firebase test project:

1. Register `com.coffix.mobile` for Android and iOS in that project. Supply the
   downloaded client configuration through `FIREBASE_ANDROID_CONFIG` and
   `FIREBASE_IOS_CONFIG` (absolute file paths), as described in `.env.example`.
   The configuration files are ignored. Never put server credentials in the app.
2. Configure the project's APNs authentication and matching Apple signing
   capabilities. `app.config.ts` configures Firebase plugins, dynamic iOS
   frameworks, push entitlement and the remote-notification background mode.
   The entitlement defaults to development; release signing must use production.
3. Build the native app with `corepack pnpm --filter @coffix/mobile android` or
   `ios` on a host with the respective SDK. Expo Go does not contain Firebase's
   native modules. Firebase auto initialization is disabled until the app asks
   for a token after login.
4. Only when deliberately testing real delivery, configure the backend FCM
   adapter with that test project's credentials. Default local tests must stay
   on the fake push provider.

Tokens are registered using captured session credentials. Logout stops listeners,
waits for in-flight registration, deactivates this device, and deletes its native
FCM token before revoking the session. Definitively rejected tokens are deactivated
by the backend. The worker checks that a queued delivery still belongs to the
active token's owner before attempting it. A push already handed to FCM cannot be
recalled; notification taps therefore recheck ownership through the API.
Network/OS failures can delay remote cleanup; local credentials and drafts are
still cleared. A subsequent registration associates the device with the current
account. Push payloads provide only notification IDs for invalidation/navigation;
the inbox and related order/service are loaded from authenticated API endpoints.

## Quality checks

```sh
corepack pnpm --filter @coffix/mobile test
corepack pnpm --filter @coffix/mobile typecheck
corepack pnpm --filter @coffix/mobile lint
corepack pnpm --filter @coffix/mobile exec expo export --platform all --output-dir /tmp/coffix-mobile-export
```

The 21 handoff screens map to these routes and automated behavior suites. The
service stepper includes all intake steps; order and service payments also have
dedicated screens. New account screens use the shared palette, type, spacing,
RTL reading order, scalable text, and reduced-motion-aware buttons/stacks.

| Handoff screen | Route/equivalent | Test coverage under `tests/` |
|---|---|---|
| Splash | `(auth)/index` | `auth/session` |
| Welcome | `(auth)/welcome` | `auth/landing` |
| Phone | `(auth)/phone` | `auth/phone` |
| OTP | `(auth)/otp` | `auth/otp` |
| Editorial home | `(tabs)/(home)` | `catalog/home` |
| Categories | `(shop)/categories` | `catalog/categories` |
| Product list | `(shop)/products/[categoryId]` | `catalog/productList`, `productSearch` |
| Product detail | `(shop)/product/[productId]` | `catalog/productDetail` |
| Cart | `(shop)/cart` | `cart/cart`, `conflict`, `expiration` |
| Checkout | `(shop)/checkout` | `checkout/address`, `payment` |
| Order confirmation | `(shop)/confirmation` | `checkout/confirmation` |
| Machines | `(service)/index` | `machines/list` |
| Machine detail | `(service)/machines/[machineId]` | `machines/detail` |
| Register machine | `(service)/register` | `machines/register`, `upload` |
| Service intake | `(service)/request/*` | `service/intake`, `intakeScreens`, `navigation/service` |
| Service detail/payment | `(service)/requests/[requestId]` | `service/status`, `quote`, `paymentScreen`, `serviceProgress` |
| Service confirmation | `(service)/request/confirmation` | `service/intakeScreens`, `navigation/service` |
| Orders | `(orders)/index` | `orders/list` |
| Order detail | `(orders)/[orderId]` | `orders/detail` |
| Notifications | `/notifications` | `notifications/notifications`, `push`, `visual/criticalScreens` |
| Profile | `(profile)/index`, `(profile)/addresses` | `profile/profile`, `visual/criticalScreens` |

Profile setup requires a full name, accepts an optional email, and displays the
verified phone read-only. The root navigator withholds its screens and push
registration until `/users/me` confirms completion, including after restarts and
deep links. Existing named customers can continue immediately. Apply backend
migration `0015_customer_profile` before using this build.

The profile General section contains FAQ, Contact and Settings. Configure the
backend `SHOP_PHONE` and `SHOP_WHATSAPP` as international numbers (including `+`),
`SHOP_HOURS` as customer-facing Hebrew text, and `SHOP_ADDRESS_JSON` using
`street`, `building`, `city`, `postal_code` and `country`. Set
`PRIVACY_POLICY_URL` and `SERVICE_TERMS_URL` to the shop's published HTTPS pages.
Unset optional values display explanatory copy and omit unavailable actions.
These values are returned by the authenticated `/api/v1/app-info` endpoint;
internal fields in the address configuration are excluded. There is no in-app
notification opt-out; Settings shows device permission status and opens OS settings.

Automated profile follow-up coverage: `profile/personal` (validation, failed saves,
server-confirmed completion and account switching), `navigation/profile` (cold
deep links and route replacement while incomplete), `profile/general` (contact,
policy links and missing configuration). Include the new personal-details and
General screens in the native review below.

The task 24 native acceptance gate remains a manual device check: all 21 screens
at normal and enlarged text sizes on iOS and Android; VoiceOver/TalkBack traversal;
reduced motion and Back gestures; foreground/background/cold-start push; denial
and settings recovery; invalid tokens; logout/login with another account. Browser
captures and React Native tree assertions do not establish native layout or
screen-reader correctness. Firebase client files, signing and a device are needed
for real push delivery. Do not mark this gate passed based on exported bundles.
