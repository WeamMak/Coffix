import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';

describe('fixed screen chrome', () => {
  it('keeps the scrolling middle region constrained between header and footer', async () => {
    await render(
      <SafeAreaProvider initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 44 },
      }}>
        <Screen
          footer={<Text>פעולה קבועה</Text>}
          header={<Text>כותרת קבועה</Text>}
          scroll
          testID="תוכן נגלל"
        >
          <Text>תוכן</Text>
        </Screen>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('כותרת קבועה')).toBeOnTheScreen();
    expect(screen.getByText('פעולה קבועה')).toBeOnTheScreen();
    expect(screen.getByTestId('תוכן נגלל')).toHaveStyle({ flex: 1 });
  });
});
