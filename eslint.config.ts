import config from '@tsuk1ko/eslint-config';

export default config(
  {
    typescript: {
      overrides: {
        'ts/no-wrapper-object-types': 'off',
      },
    },
    ignores: ['**/*.js', './dist', './test', './lib'],
  },
  {
    rules: {
      'unicorn/new-for-builtins': 'off',
    },
  },
);
