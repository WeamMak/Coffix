import appConfig from '../app.config';

const context = {
  config: { name: 'Coffix', slug: 'coffix' },
  projectRoot: '/tmp/coffix-config',
  staticConfigPath: null,
  packageJsonPath: '/tmp/coffix-config/package.json',
};

describe('signed build configuration', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = {
      ...original,
      EAS_BUILD_PROFILE: 'preview',
      EAS_PROJECT_ID: '12345678-1234-1234-1234-123456789abc',
      EXPO_OWNER: 'coffix-test',
      EXPO_PUBLIC_API_URL: 'https://preview.example.invalid',
      EXPO_PUBLIC_PAYMENT_PROVIDER: 'fake',
      COFFIX_BUILD_SHA: 'a'.repeat(40),
    };
  });
  afterEach(() => { process.env = original; });

  it('rejects a cloud build without an explicitly linked project', () => {
    delete process.env.EAS_PROJECT_ID;
    expect(() => appConfig(context)).toThrow('EAS_PROJECT_ID');
  });

  it('records source identity and uses distribution push entitlement', () => {
    const result = appConfig(context);
    expect(result.extra?.buildSha).toBe('a'.repeat(40));
    expect(result.extra?.eas.projectId).toBe(process.env.EAS_PROJECT_ID);
    expect(result.ios?.entitlements?.['aps-environment']).toBe('production');
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
    expect(() => appConfig(context)).toThrow('HTTPS');
  });

  it('rejects fake payments and test Stripe keys in production', () => {
    process.env.EAS_BUILD_PROFILE = 'production';
    expect(() => appConfig(context)).toThrow('Production requires Stripe');
    process.env.EXPO_PUBLIC_PAYMENT_PROVIDER = 'stripe';
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_example';
    expect(() => appConfig(context)).toThrow('pk_live_');
  });

  it('keeps local development independent of an Expo account', () => {
    delete process.env.EAS_BUILD_PROFILE;
    delete process.env.EAS_PROJECT_ID;
    delete process.env.EXPO_OWNER;
    delete process.env.COFFIX_BUILD_SHA;
    delete process.env.EAS_BUILD_GIT_COMMIT_HASH;
    const result = appConfig(context);
    expect(result.extra?.eas).toBeUndefined();
    expect(result.ios?.entitlements?.['aps-environment']).toBe('development');
  });
});
