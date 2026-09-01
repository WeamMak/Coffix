# OTP Explicit Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an explicit press on the OTP verification button and place that action immediately below the six code boxes.

**Architecture:** Keep the existing `OtpScreen` state, focus movement, authentication service call, and error handling. Change only the trigger boundary from sixth-digit entry to the existing verification button, and move that button into the OTP content flow before the resend control.

**Tech Stack:** Expo SDK 57, React Native, Expo Router, React Native Testing Library, Jest, TypeScript.

## Global Constraints

- Preserve six-box digit focus advancement and backspace behavior.
- Do not call the verification API or navigate when the sixth digit is entered.
- Keep `אימות והמשך` disabled until all six digits exist or while submission is in progress.
- Render controls in this order: code boxes, verification button, resend control, error feedback.
- Preserve the backend contract, SecureStore persistence, route destination, resend timer, RTL behavior, and circular back button.
- Add no dependencies and modify no implementation files outside the OTP screen and its component test; this plan is the only documentation addition.

---

### Task 1: Require explicit OTP confirmation and place the action inline

**Files:**
- Modify: `mobile/tests/auth/otp.test.tsx:33-89`
- Modify: `mobile/app/(auth)/otp.tsx:78-94,146-207,216-265`

**Interfaces:**
- Consumes: `useSession().signIn(phone: string, code: string): Promise<void>` and the existing `Button` public press/disabled behavior.
- Produces: An OTP screen where digit entry only updates local state and `אימות והמשך` is the sole verification trigger.

- [x] **Step 1: Replace the auto-submit expectation with an explicit-submit regression test**

Update the first OTP test so its user-visible seam proves focus behavior, no request after digit entry, accessible control order, and successful verification after the button press:

```tsx
it('advances across six boxes and submits only after confirmation', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    headers: new Headers(),
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
    }),
  } as Response);
  await render(
    <AuthSessionProvider>
      <OtpScreen />
    </AuthSessionProvider>,
  );

  const boxes = screen.getAllByLabelText(/ספרה \d מתוך 6/);
  const verifyButton = screen.getByRole('button', { name: 'אימות והמשך' });
  expect(boxes).toHaveLength(6);
  expect(verifyButton).toBeDisabled();
  expect(screen.getByRole('button', { name: 'חזרה' })).toHaveStyle({
    alignSelf: 'flex-start',
    borderRadius: 22,
    height: 44,
    width: 44,
  });
  expect(screen.queryByText('›')).not.toBeOnTheScreen();

  await fireEvent.changeText(boxes[0]!, '1');
  expect(boxes[1]).toHaveStyle({
    borderColor: '#2B1810',
    borderWidth: 1.5,
  });
  expect(boxes[2]).toHaveStyle({ borderColor: '#E5DBC9' });

  for (const [index, digit] of ['2', '3', '4', '5', '6'].entries()) {
    await fireEvent.changeText(boxes[index + 1]!, digit);
  }

  expect(verifyButton).toBeEnabled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  const contentButtons = within(screen.getByTestId('otp-content')).getAllByRole('button');
  expect(contentButtons[0]).toBe(verifyButton);
  expect(contentButtons[1]).toBe(
    screen.getByRole('button', { name: 'שליחה שוב · בעוד 01:00' }),
  );

  await fireEvent.press(verifyButton);

  await waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/auth\/otp\/verify$/),
      expect.objectContaining({
        body: JSON.stringify({ code: '123456', phone: '+972501234567' }),
        method: 'POST',
      }),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'coffix.accessToken',
      'access-token',
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'coffix.refreshToken',
      'refresh-token',
    );
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/(home)');
  });
});
```

Add `within` to the existing React Native Testing Library imports.

- [x] **Step 2: Run the focused test and verify the exact regression is red**

Run:

```bash
corepack pnpm --filter @coffix/mobile test -- otp.test.tsx
```

Expected: FAIL because filling the sixth box calls `fetch` before the verification-button press, and `אימות והמשך` is outside `otp-content`.

- [x] **Step 3: Remove the digit-entry submission side effect**

Keep digit sanitization and focus advancement in `changeDigit`, but remove its assembled-code submission block:

```tsx
const changeDigit = (index: number, value: string) => {
  const digit = value.replace(/\D/g, '').slice(-1);
  const nextDigits = [...digits];
  nextDigits[index] = digit;
  setDigits(nextDigits);

  if (digit && index < OTP_LENGTH - 1) {
    const nextIndex = index + 1;
    setFocusedIndex(nextIndex);
    inputRefs.current[nextIndex]?.focus();
  }
};
```

The existing verification button remains wired to:

```tsx
onPress={() => submit(digits.join(''))}
```

- [x] **Step 4: Move the verification button into the OTP content flow**

Add the test seam to the content view and place the full-width verification button directly after `styles.codeRow`, before the resend button:

```tsx
<View style={styles.content} testID="otp-content">
  {/* existing title, phone copy, and codeRow */}
  <Button
    disabled={digits.some((digit) => !digit) || isSubmitting}
    fullWidth
    onPress={() => submit(digits.join(''))}
    style={styles.verify}
  >
    אימות והמשך
  </Button>
  <Button
    disabled={resendSeconds > 0 || isResending}
    onPress={resend}
    size="small"
    style={styles.resend}
    tone="soft"
  >
    {resendLabel}
  </Button>
  {/* existing error feedback */}
</View>
```

Delete the old verification button rendered after the closing `styles.content` view. Add spacing that keeps the button visually attached to code entry:

```tsx
verify: {
  marginTop: spacing.xl,
},
```

- [x] **Step 5: Run the focused test and verify it is green**

Run:

```bash
corepack pnpm --filter @coffix/mobile test -- otp.test.tsx
```

Expected: PASS for explicit verification, focus advancement, button ordering, back-button styling, and resend timing.

- [x] **Step 6: Run the complete mobile verification suite**

Run:

```bash
corepack pnpm --filter @coffix/mobile test
corepack pnpm --filter @coffix/mobile typecheck
corepack pnpm --filter @coffix/mobile lint
corepack pnpm --filter @coffix/mobile exec expo export --platform android --output-dir /tmp/coffix-otp-explicit-submit
git diff --check
```

Expected: 32 or more tests pass; TypeScript, lint, Android export, and whitespace validation exit successfully.

- [x] **Step 7: Commit the focused correction**

Review and stage only the OTP screen, its test, and this approved plan:

```bash
git diff --check
git add 'mobile/app/(auth)/otp.tsx' mobile/tests/auth/otp.test.tsx
git add -f docs/superpowers/plans/2026-09-01-otp-explicit-submit.md
git commit -m "fix: require explicit OTP submission"
```
