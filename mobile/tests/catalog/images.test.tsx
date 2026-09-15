import { fireEvent, render, screen } from '@testing-library/react-native';
import { CatalogPhoto, CategoryIcon } from '../../src/features/catalog/CategoryIcon';
import { MachineModelImage } from '../../src/features/machines/MachineModelImage';

it('falls back after a failed photo and retries a refreshed URL', async () => {
  const { rerender } = await render(<CatalogPhoto url="https://media.test/one" label="קפה" iconKey="capsule" />);
  await fireEvent(screen.getByRole('image', { name: 'קפה' }), 'error');
  expect(screen.getByTestId('category-icon-capsule')).toBeOnTheScreen();
  await rerender(<CatalogPhoto url="https://media.test/two" label="קפה" iconKey="capsule" />);
  expect(screen.getByRole('image', { name: 'קפה' })).toHaveProp('source', { uri: 'https://media.test/two' });
  await rerender(<CatalogPhoto label="קפה" iconKey="capsule" />);
  expect(screen.getByTestId('category-icon-capsule')).toBeOnTheScreen();
});

it.each(['coffee', 'coffee-bean', 'capsule', 'settings', 'sparkles', 'wrench', 'unknown'])('renders the explicit %s vector', async (key) => {
  await render(<CategoryIcon iconKey={key} label="שם שאינו בוחר סמל" />);
  expect(screen.getByTestId(`category-icon-${key === 'unknown' ? 'generic' : key}`)).toBeOnTheScreen();
});

it('shows an independent model photo and a generic machine fallback', async () => {
  const model = { manufacturer: 'Brand', model_name: 'One', image_url: 'https://media.test/model' };
  const { rerender } = await render(<MachineModelImage model={model} />);
  expect(screen.getByRole('image', { name: 'Brand One' })).toHaveProp('source', { uri: model.image_url });
  await fireEvent(screen.getByRole('image', { name: 'Brand One' }), 'error');
  expect(screen.getByTestId('machine-image-fallback')).toBeOnTheScreen();
  await rerender(<MachineModelImage model={{ ...model, image_url: 'https://media.test/replaced' }} />);
  expect(screen.getByRole('image', { name: 'Brand One' })).toHaveProp('source', { uri: 'https://media.test/replaced' });
  await rerender(<MachineModelImage model={{ ...model, image_url: null }} />);
  expect(screen.getByTestId('machine-image-fallback')).toBeOnTheScreen();
});
