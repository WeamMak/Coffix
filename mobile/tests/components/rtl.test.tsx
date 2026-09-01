import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { BottomTabs, TAB_ITEMS } from '../../src/components/BottomTabs';
import { Button } from '../../src/components/Button';
import { IconButton } from '../../src/components/IconButton';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';

describe('Hebrew RTL primitives', () => {
  it('renders scalable, direction-aware text', async () => {
    await render(<Text variant="body">טקסט לדוגמה</Text>);

    expect(screen.getByText('טקסט לדוגמה')).toHaveProp('allowFontScaling', true);
    expect(screen.getByText('טקסט לדוגמה')).toHaveProp('maxFontSizeMultiplier', 2);
    expect(screen.getByText('טקסט לדוגמה')).toHaveStyle({ textAlign: 'left' });
  });

  it('exposes accessible enabled and disabled buttons', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button onPress={onPress}>המשך</Button>);

    await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(
      <Button disabled onPress={onPress}>
        לא זמין
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'לא זמין' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'לא זמין' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('labels inputs and supports isolated LTR values', async () => {
    await render(
      <Input
        direction="ltr"
        label="מספר טלפון"
        onChangeText={jest.fn()}
        value="050-0000000"
      />,
    );

    const input = screen.getByLabelText('מספר טלפון');
    expect(input).toHaveProp('allowFontScaling', true);
    expect(input).toHaveProp('maxFontSizeMultiplier', 2);
    expect(input).toHaveStyle({ writingDirection: 'ltr' });
  });

  it('uses logical content padding and accessible icon targets', async () => {
    await render(
      <Screen testID="screen">
        <IconButton accessibilityLabel="חזרה" icon={<View />} onPress={jest.fn()} />
      </Screen>,
    );

    expect(screen.getByTestId('screen')).toHaveStyle({
      paddingStart: 20,
      paddingEnd: 20,
    });
    expect(screen.getByRole('button', { name: 'חזרה' })).toHaveStyle({
      minWidth: 44,
      minHeight: 44,
    });
  });
});

describe('five-tab contract', () => {
  it('keeps the approved RTL labels and independent stack routes', () => {
    expect(TAB_ITEMS.map(({ label }) => label)).toEqual([
      'בית',
      'חנות',
      'שירות',
      'הזמנות',
      'פרופיל',
    ]);
    expect(TAB_ITEMS.map(({ route }) => route)).toEqual([
      '(home)',
      '(shop)',
      '(service)',
      '(orders)',
      '(profile)',
    ]);
  });

  it('exposes tab roles, selection, and activation', async () => {
    const onSelect = jest.fn();
    await render(<BottomTabs activeKey="home" onSelect={onSelect} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      'בית',
      'חנות',
      'שירות',
      'הזמנות',
      'פרופיל',
    ]);
    expect(screen.getByRole('tab', { name: 'בית' })).toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: 'שירות' }));
    expect(onSelect).toHaveBeenCalledWith('service');
  });
});
