import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { initI18n } from '../i18n/config';

beforeAll(async () => {
  await initI18n();
});

afterEach(() => {
  cleanup();
});
