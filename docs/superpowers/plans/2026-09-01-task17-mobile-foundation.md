# Task 17 Mobile Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neither helper is installed in Coffix, so the current agent executes these steps inline and preserves the same red-green checkpoints.

**Goal:** Build a runnable Expo mobile foundation that starts in Hebrew RTL and exposes the approved Warm & Artisanal theme, accessible primitives, and five-tab navigation contract.

**Architecture:** Expo Router owns the root, authentication, and tab navigator boundaries. Typed theme modules and controlled React Native primitives isolate design decisions from later feature screens; a development-only gallery is the only temporary route. RTL is enabled before the root navigator renders, and fonts remain behind the native splash until loaded.

**Tech Stack:** Node.js 22.13+, Expo SDK 57.0.18, React Native 0.86.3, React 19.2, TypeScript, Expo Router, Expo Font/Splash/Localization, Jest with `jest-expo`, React Native Testing Library, and Expo ESLint flat config.

## Global Constraints

- Require Node.js `>=22.13.0` across the Coffix monorepo.
- Use Expo SDK `~57.0.18`, which includes the SDK 57 Hermes/Worklets fixes released after `57.0.17`.
- Use pnpm `10.15.1` through Corepack and keep `pnpm-lock.yaml` synchronized.
- Follow `docs/spec.md`, Task 17 in `docs/plan.md`, and the approved Task 17 design specification.
- Treat `design/design_handoff_coffeeshop_mobile/` as visual reference only; never import its HTML or browser JSX into production code.
- Use only the Warm & Artisanal theme and the required labels `בית`, `חנות`, `שירות`, `הזמנות`, `פרופיל`.
- Keep authentication, API state, and business screens out of Task 17.
- Use public-behavior tests; do not snapshot component trees or assert internal style-array positions.
- Make one implementation commit with the required message `feat: establish Hebrew RTL mobile design system`; include `docs/plan.md` checkbox updates in that commit.

---

### Task 1: Establish the Node 22 and Expo SDK 57 workspace

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `scripts/check-local-tooling.sh`
- Modify: `.gitignore`
- Modify: `mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `mobile/app.json`
- Create: `mobile/tsconfig.json`
- Create: `mobile/eslint.config.js`
- Create: `mobile/expo-env.d.ts`

**Interfaces:**
- Consumes: root Node `>=22.13.0`, pnpm `10.15.1`, and the existing `@coffix/mobile` workspace.
- Produces: Expo Router entry point, `@/*` path alias to `mobile/src/*`, deterministic test/lint/type/config scripts, and an SDK-compatible dependency graph.

- [ ] **Step 1: Raise and validate the repository Node contract**

Set the root engine to:

```json
"engines": {
  "node": ">=22.13.0"
}
```

Change the README prerequisite to `Node.js 22.13 or newer`. Update `scripts/check-local-tooling.sh` so both its message and executable check enforce the major/minor floor:

```bash
require_command node "Node.js 22.13 or newer is required."
if command -v node >/dev/null 2>&1; then
  if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)'; then
    fail "Node.js 22.13 or newer is required."
  fi
fi
```

Run:

```bash
node --version
bash scripts/check-local-tooling.sh
```

Expected: Node reports `v22.13.0` or newer and the tooling script does not report a Node-version error.

- [ ] **Step 2: Keep generated native projects out of source control**

Add these root ignore rules:

```gitignore
mobile/android/
mobile/ios/
```

If SDK 56 native projects exist from a local `expo run:*` command, verify they are ignored and move them to a recoverable temporary directory before installing SDK 57:

```bash
git check-ignore mobile/android/build.gradle
native_backup_dir=$(mktemp -d /tmp/coffix-sdk56-native.XXXXXX)
if [[ -d mobile/android ]]; then mv mobile/android "$native_backup_dir/android"; fi
if [[ -d mobile/ios ]]; then mv mobile/ios "$native_backup_dir/ios"; fi
```

Expected: `mobile/android` and `mobile/ios` are absent from `git status`; any existing generated projects remain recoverable from the printed temporary path for the duration of the migration.

- [ ] **Step 3: Install the Expo SDK 57 baseline and compatible libraries**

Run:

```bash
corepack pnpm --filter @coffix/mobile add expo@~57.0.18
corepack pnpm --filter @coffix/mobile exec expo install --fix
corepack pnpm --filter @coffix/mobile exec expo install react react-dom react-native react-native-web expo-router expo-font expo-splash-screen expo-localization expo-status-bar expo-system-ui expo-constants expo-linking @expo/dom-webview @expo/metro-runtime react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated react-native-worklets @expo/vector-icons
corepack pnpm --filter @coffix/mobile add @expo-google-fonts/assistant @expo-google-fonts/fraunces @expo-google-fonts/noto-serif-hebrew
corepack pnpm --filter @coffix/mobile exec expo install --dev jest jest-expo @types/jest @testing-library/react-native typescript @types/react eslint eslint-config-expo
corepack pnpm --filter @coffix/mobile add --save-dev @react-native/metro-config@0.86.3
```

Expected: Expo resolves React Native `0.86.3` and native modules to SDK 57-compatible versions and updates the workspace lockfile without an engine warning.

- [ ] **Step 4: Replace the temporary scripts and configure Jest**

Set the mobile entry point and scripts to:

```json
{
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "test": "jest --runInBand",
    "lint": "expo lint",
    "typecheck": "tsc --noEmit",
    "config-check": "expo config --type public"
  },
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*))"
    ]
  }
}
```

- [ ] **Step 5: Add strict TypeScript and Expo lint configuration**

Create `mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["jest"]
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

Create `mobile/eslint.config.js`:

```js
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'coverage/*', '.expo/*']),
  expoConfig,
]);
```

Create `mobile/expo-env.d.ts`:

```ts
/// <reference types="expo/types" />
```

- [ ] **Step 6: Configure the application manifest**

Create `mobile/app.json`:

```json
{
  "expo": {
    "name": "Coffix",
    "slug": "coffix",
    "version": "0.1.0",
    "orientation": "portrait",
    "scheme": "coffix",
    "userInterfaceStyle": "light",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.coffix.mobile",
      "infoPlist": { "CFBundleDevelopmentRegion": "he" }
    },
    "android": {
      "package": "com.coffix.mobile",
      "predictiveBackGestureEnabled": false
    },
    "plugins": [
      "expo-router",
      [
        "expo-localization",
        {
          "supportsRTL": true,
          "forcesRTL": true,
          "supportedLocales": ["he"]
        }
      ],
      ["expo-splash-screen", { "backgroundColor": "#2B1810" }],
      "expo-font",
      "expo-status-bar"
    ]
  }
}
```

The splash uses the approved ink color without inventing a logo image that the handoff does not provide.

- [ ] **Step 7: Validate the workspace baseline**

Run:

```bash
corepack pnpm --filter @coffix/mobile exec expo install --check
corepack pnpm dlx expo-doctor@latest mobile
corepack pnpm --filter @coffix/mobile run config-check
```

Expected: dependencies match Expo SDK 57, Expo Doctor reports no project problems, and the public Expo configuration renders without an error.

---

### Task 2: Encode exact design tokens and RTL helpers

**Files:**
- Create: `mobile/tests/theme.test.ts`
- Create: `mobile/src/theme/colors.ts`
- Create: `mobile/src/theme/typography.ts`
- Create: `mobile/src/theme/spacing.ts`
- Create: `mobile/src/theme/radii.ts`
- Create: `mobile/src/theme/shadows.ts`
- Create: `mobile/src/theme/index.ts`
- Create: `mobile/src/platform/rtl.ts`
- Create: `mobile/src/i18n/he.ts`

**Interfaces:**
- Consumes: literal handoff values and React Native `I18nManager`.
- Produces: `colors`, `typography`, `spacing`, `radii`, `shadows`, `theme`, `logicalSpacing()`, `initializeRTL()`, `isRTL`, and `he`.

- [ ] **Step 1: Write the failing token and RTL tests**

The tests must independently assert:

```ts
expect(colors).toMatchObject({
  cream: '#FDFBF7', card: '#F5EFE6', chip: '#EADFCE', line: '#E5DBC9',
  ink: '#2B1810', ink2: '#5D4B3A', ink3: '#9A8A76', accent: '#C17A4A',
  accentDeep: '#8B4E28', accentSoft: '#F4E4D3', sage: '#7A8B5E', warn: '#C17A4A',
});
expect(typography.screenTitle).toMatchObject({ size: 22, family: 'serif', weight: '400' });
expect(spacing).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32, '4xl': 40, '5xl': 48 });
expect(logicalSpacing({ start: 16, end: 8 })).toEqual({ paddingStart: 16, paddingEnd: 8 });
expect(he.tabs).toEqual({ home: 'בית', shop: 'חנות', service: 'שירות', orders: 'הזמנות', profile: 'פרופיל' });
```

Mock `I18nManager` only at its public boundary and verify `initializeRTL()` enables and forces RTL once when `isRTL` is false and performs no mutation when it is already true.

- [ ] **Step 2: Run the focused tests and capture the intended red result**

Run:

```bash
corepack pnpm --filter @coffix/mobile test -- tests/theme.test.ts
```

Expected: FAIL because the theme, RTL, and Hebrew modules do not exist.

- [ ] **Step 3: Implement the minimal token modules**

Use readonly objects (`as const`). Typography variants use semantic family keys (`sans`, `serif`, `brand`) and numeric size/line-height values. Shadows expose iOS shadow properties and Android elevation in platform-selectable objects rather than CSS shadow strings.

Implement the RTL public functions with these signatures:

```ts
export type LogicalSpacing = { start?: number; end?: number; top?: number; bottom?: number };
export function logicalSpacing(value: LogicalSpacing): ViewStyle;
export function initializeRTL(): boolean;
export const isRTL: boolean;
```

`initializeRTL()` returns `true` when the runtime is already RTL and `false` after requesting an RTL change that will apply on the next native reload. Root rendering must check that return value.

- [ ] **Step 4: Run the focused tests to green**

Run:

```bash
corepack pnpm --filter @coffix/mobile test -- tests/theme.test.ts
```

Expected: PASS.

---

### Task 3: Build accessible native primitives

**Files:**
- Create: `mobile/tests/components/rtl.test.tsx`
- Create: `mobile/src/components/Screen.tsx`
- Create: `mobile/src/components/Text.tsx`
- Create: `mobile/src/components/Button.tsx`
- Create: `mobile/src/components/Input.tsx`
- Create: `mobile/src/components/Card.tsx`
- Create: `mobile/src/components/Pill.tsx`
- Create: `mobile/src/components/IconButton.tsx`
- Create: `mobile/src/components/BottomTabs.tsx`

**Interfaces:**
- Consumes: Task 2 tokens, Hebrew labels, logical RTL helpers, and React Native public props.
- Produces: named components and `TAB_ITEMS`; every component accepts native `style` overrides after its tokenized base style.

- [ ] **Step 1: Write the failing accessible component tests**

Cover these public behaviors:

```tsx
render(<Button onPress={onPress}>המשך</Button>);
expect(screen.getByRole('button', { name: 'המשך' })).toBeEnabled();

render(<Input label="טלפון" value="" onChangeText={jest.fn()} />);
expect(screen.getByLabelText('טלפון')).toHaveProp('allowFontScaling', true);

render(<Text variant="body">טקסט</Text>);
expect(screen.getByText('טקסט')).toHaveProp('allowFontScaling', true);
expect(screen.getByText('טקסט')).toHaveProp('maxFontSizeMultiplier', 2);

render(<BottomTabs activeKey="home" onSelect={onSelect} />);
expect(screen.getAllByRole('tab').map(tab => tab.props.accessibilityLabel)).toEqual([
  'בית', 'חנות', 'שירות', 'הזמנות', 'פרופיל',
]);
fireEvent.press(screen.getByRole('tab', { name: 'שירות' }));
expect(onSelect).toHaveBeenCalledWith('service');
```

Also assert 44-point minimum icon-button targets, selected tab state, disabled button behavior, and logical RTL layout on `Screen` and `Input`.

- [ ] **Step 2: Run the component test and capture the intended red result**

Run:

```bash
corepack pnpm --filter @coffix/mobile test -- tests/components/rtl.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement one component at a time**

Use native `Pressable`, `Text`, `TextInput`, `View`, `ScrollView`, and safe-area primitives. Keep component types narrow and public:

```ts
export type TextVariant = 'display' | 'screenTitle' | 'sectionTitle' | 'body' | 'label' | 'caption' | 'eyebrow';
export type ButtonTone = 'ink' | 'accent' | 'soft';
export type TabKey = 'home' | 'shop' | 'service' | 'orders' | 'profile';
export type TabRoute = '(home)' | '(shop)' | '(service)' | '(orders)' | '(profile)';
export type TabItem = { key: TabKey; route: TabRoute; label: string; icon: ComponentProps<typeof Feather>['name'] };
export const TAB_ITEMS: readonly TabItem[];
```

Press feedback uses `transform: [{ scale: 0.97 }]` and `opacity: 0.9`; disabled controls do not invoke callbacks. Text enables scaling with `maxFontSizeMultiplier={2}` by default. Inputs expose native accessibility labels and allow `direction="ltr"` for phone and numeric values. Avoid `React.memo` unless a measured expensive render exists.

- [ ] **Step 4: Run component and theme tests to green**

Run:

```bash
corepack pnpm --filter @coffix/mobile test -- tests/theme.test.ts tests/components/rtl.test.tsx
```

Expected: PASS.

---

### Task 4: Configure startup, fonts, navigation, and the gallery

**Files:**
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/index.tsx`
- Create: `mobile/app/gallery.tsx`
- Create: `mobile/app/(auth)/_layout.tsx`
- Create: `mobile/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `initializeRTL()`, Google font package exports, design primitives, and Expo Router.
- Produces: a startup-safe root stack, future authentication/tab boundaries, five stable tab route names, RTL push animation, instant tab changes, and a local component gallery.

- [ ] **Step 1: Add failing assertions for route configuration**

Extend `mobile/tests/components/rtl.test.tsx` to assert `TAB_ITEMS` route keys map to `(home)`, `(shop)`, `(service)`, `(orders)`, and `(profile)`, and that every registered label remains the approved Hebrew copy.

- [ ] **Step 2: Run the test and confirm the new route assertions fail**

Run:

```bash
corepack pnpm --filter @coffix/mobile test -- tests/components/rtl.test.tsx
```

Expected: FAIL because route names are not yet exposed by the tab contract.

- [ ] **Step 3: Implement root initialization**

At module scope, call `SplashScreen.preventAutoHideAsync()` and `initializeRTL()`. In `RootLayout`, load the approved Assistant, Noto Serif Hebrew, and Fraunces weights via `useFonts`. Return `null` while fonts or RTL are not ready; hide the splash after fonts succeed or report an error. Register `(auth)`, `(tabs)`, and `gallery` with headers hidden.

- [ ] **Step 4: Implement navigator shells**

Use `Stack` from `expo-router` for the auth group with `animation: 'slide_from_right'` so pushes enter from the right edge required by the RTL handoff. Use JavaScript `Tabs` from `expo-router` for the tab group because the handoff requires custom styling not guaranteed by native tabs. Configure `animation: 'none'`, no header, no lazy route-specific business code, tokenized colors, and a custom `BottomTabs` adapter.

Declare only the five future group names; do not create temporary business routes that would conflict with Tasks 19, 21, 22, and 24.

- [ ] **Step 5: Implement the development gallery**

`mobile/app/index.tsx` redirects to `/gallery` only in development and otherwise redirects to `/(auth)`. `mobile/app/gallery.tsx` redirects away when `__DEV__` is false. In development it renders every primitive with Hebrew content, default/alternate/disabled states, and the five-tab bar against the Warm & Artisanal background.

- [ ] **Step 6: Run focused tests and static checks**

Run:

```bash
corepack pnpm --filter @coffix/mobile test -- tests/theme.test.ts tests/components/rtl.test.tsx
corepack pnpm --filter @coffix/mobile run typecheck
corepack pnpm --filter @coffix/mobile run lint
corepack pnpm --filter @coffix/mobile run config-check
```

Expected: all commands pass.

---

### Task 5: Complete cross-platform verification and handoff

**Files:**
- Modify: `docs/plan.md`
- Verify: Node toolchain files, all Task 17 implementation files, and `pnpm-lock.yaml`

**Interfaces:**
- Consumes: completed Task 17 mobile foundation.
- Produces: verified Task 17 branch and the required task commit.

- [ ] **Step 1: Run the full required automated checks**

Run:

```bash
bash scripts/check-local-tooling.sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @coffix/mobile test
corepack pnpm --filter @coffix/mobile run lint
corepack pnpm --filter @coffix/mobile run typecheck
corepack pnpm --filter @coffix/mobile run config-check
corepack pnpm --filter @coffix/mobile exec expo install --check
corepack pnpm dlx expo-doctor@latest mobile
export_dir=$(mktemp -d /tmp/coffix-task17-sdk57-export.XXXXXX)
corepack pnpm --filter @coffix/mobile exec expo export --platform all --output-dir "$export_dir"
git diff --check
```

Expected: every command passes with Node `>=22.13.0`, Expo SDK 57 dependency compatibility, successful Android/iOS/web bundles, and no whitespace error.

- [ ] **Step 2: Perform the visual review**

Start Expo with:

```bash
corepack pnpm --filter @coffix/mobile start --tunnel
```

Open the gallery on the Android device first and compare palette, typography, spacing, radii, shadows, press states, RTL order, and text scaling against the handoff. On the Mac, run `corepack pnpm --filter @coffix/mobile exec expo run:ios` and repeat the comparison in the iOS Simulator; use the iPhone for a final physical-device check when a compatible Expo Go or development/TestFlight build is available. Record any unavailable target as an environmental blocker rather than silently skipping it.

- [ ] **Step 3: Update the authoritative task checklist**

Mark only Task 17 checks that were successfully completed. Do not mark device-specific visual comparison complete if the required targets were unavailable.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- .gitignore README.md package.json scripts/check-local-tooling.sh docs/plan.md mobile pnpm-lock.yaml
git diff --check
```

Expected: only the approved Node 22.13 contract, Task 17 files and planning documents, the lockfile, native ignore rules, and Task 17 checkbox updates are present.

- [ ] **Step 5: Commit the completed task**

Stage only Task 17 files and commit:

```bash
git commit -m "feat: establish Hebrew RTL mobile design system"
```

Do not push, merge, rebase, amend, tag, delete branches, or begin Task 18.
