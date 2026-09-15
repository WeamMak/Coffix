import { fireEvent, render, screen } from '@testing-library/react-native';
import { CatalogPhoto, CategoryIcon } from '../../src/features/catalog/CategoryIcon';
import { MachineModelImage } from '../../src/features/machines/MachineModelImage';
import { Platform } from 'react-native';
import { resolveMediaUrl } from '../../src/api/mediaUrl';

it('loads Bianca and catalog local photos through the Android API host', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  const query = '?key=uploads%2Fbianca&expires=123&signature=abc';
  const url = `http://localhost:8000/api/v1/media/local/content${query}`;
  try {
    const { rerender } = await render(<MachineModelImage model={{ manufacturer: 'Lelit', model_name: 'Bianca V3', image_url: url }} />);
    expect(screen.getByRole('image', { name: 'Lelit Bianca V3' })).toHaveProp('source', {
      uri: `http://10.0.2.2:8000/api/v1/media/local/content${query}`,
    });
    await rerender(<CatalogPhoto url={url} label="קפה" />);
    expect(screen.getByRole('image', { name: 'קפה' })).toHaveProp('source', {
      uri: `http://10.0.2.2:8000/api/v1/media/local/content${query}`,
    });
  } finally { platform.restore(); }
});

it('preserves external signed storage URLs and unrelated local URLs', () => {
  for (const url of ['https://bucket.example/photo?signature=a%2Fb', 'http://localhost:8000/other/photo']) {
    expect(resolveMediaUrl(url)).toBe(url);
  }
});

it('uses the configured device API origin for local media', () => {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.20:8000';
  try {
    expect(resolveMediaUrl('http://localhost:8000/api/v1/media/local/content?signature=a%2Fb'))
      .toBe('http://192.168.1.20:8000/api/v1/media/local/content?signature=a%2Fb');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  }
});

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
