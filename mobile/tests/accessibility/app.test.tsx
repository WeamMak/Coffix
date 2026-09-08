import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text as NativeText } from 'react-native';
import { BottomTabs } from '../../src/components/BottomTabs';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Text } from '../../src/components/Text';
import { useStackTransitions } from '../../src/navigation/stackTransitions';

function NavigationSettings() {
  const settings = useStackTransitions();
  return <NativeText>{settings.animationEnabled ? 'motion' : 'still'}</NativeText>;
}
it('respects the OS reduced-motion setting for page slides and button feedback', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  await render(<><NavigationSettings /><Button>המשך</Button></>);
  expect(await screen.findByText('still')).toBeOnTheScreen();
  await fireEvent(screen.getByRole('button', { name: 'המשך' }), 'pressIn');
  expect(screen.getByRole('button', { name: 'המשך' })).not.toHaveStyle({ transform: [{ scale: 0.97 }] });
  await act(async () => { AccessibilityInfo.isReduceMotionEnabled(); });
});
it('keeps the Hebrew tabs in reading order with scalable text and flexible input heights', async () => {
  await render(<><BottomTabs activeKey="profile" onSelect={jest.fn()} /><Text>טקסט גדול</Text><Input label="שם" value="מאיה" /></>);
  expect(screen.getAllByRole('tab').map(tab => tab.props.accessibilityLabel)).toEqual(['בית', 'חנות', 'שירות', 'הזמנות', 'פרופיל']);
  expect(screen.getByText('טקסט גדול')).toHaveProp('allowFontScaling', true);
  expect(screen.getByLabelText('שם')).toHaveProp('allowFontScaling', true);
  expect(screen.getByRole('tab', { name: 'פרופיל' })).toBeSelected();

});
