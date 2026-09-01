# OTP Explicit Submission Design

## Context

The OTP screen currently verifies the code as soon as the sixth digit is entered, while the verification button is anchored at the bottom of the screen. The approved interaction requires deliberate submission and keeps the primary action next to the code entry controls.

## Interaction

- Entering digits continues to advance focus across the six code boxes.
- Entering the sixth digit does not call the verification API and does not navigate.
- The `אימות והמשך` button remains disabled until all six boxes contain a digit.
- Pressing the enabled button submits the six-digit code through the existing authentication flow.
- A successful response stores the session and navigates to the authenticated home route.
- A failed response keeps the user on the OTP screen and shows the existing reviewed Hebrew error message.

## Layout

The vertical order inside the OTP content area is:

1. Six code boxes.
2. `אימות והמשך` verification button.
3. Resend timer/action.
4. Verification or resend error feedback, when present.

The verification button is full width within the content area and is no longer anchored to the bottom of the screen. Existing RTL digit handling, keyboard behavior, resend timing, and the circular right-pointing back button remain unchanged.

## Test Boundary

React Native component tests exercise the public OTP screen interaction:

- Filling all six boxes does not call the verification endpoint or navigate.
- The completed code enables the verification button.
- Pressing the verification button calls the endpoint once with the entered phone and code, persists returned tokens, and navigates on success.
- The verification button is rendered within the same OTP content section immediately after the code boxes and before the resend control.

## Scope

This change only adjusts OTP submission timing, button placement, and their regression tests. It does not change the backend contract, token storage, route destinations, resend behavior, or other authentication screens.
