import { render, screen } from '@testing-library/react-native';

import { CheckoutHeader } from '../../src/components/CheckoutHeader';

describe('RTL checkout progress', () => {
  it('renders the three steps right-to-left with equal connectors', async () => {
    await render(<CheckoutHeader activeStep={2} />);

    expect(screen.getByLabelText('שלב 1: כתובת')).toBeOnTheScreen();
    expect(screen.getByLabelText('שלב נוכחי: אמצעי תשלום')).toBeOnTheScreen();
    expect(screen.getByLabelText('שלב 3: אישור')).toBeOnTheScreen();
    expect(screen.getByTestId('checkout-steps')).toHaveStyle({
      direction: 'rtl',
      flexDirection: 'row',
    });
    expect(screen.getByTestId('checkout-connector-1')).toHaveStyle({ flex: 1 });
    expect(screen.getByTestId('checkout-connector-2')).toHaveStyle({ flex: 1 });
  });
});
