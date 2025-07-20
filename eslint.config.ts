import antfu from '@antfu/eslint-config';
import type { Linter } from 'eslint';
import prettierConfig from 'eslint-config-prettier';

export default antfu(
  {
    typescript: {
      overrides: {
        'ts/ban-ts-comment': 'off',
        'ts/no-use-before-define': 'off',
        'ts/no-wrapper-object-types': 'off',
        'ts/member-ordering': 'warn',
        'ts/explicit-member-accessibility': ['warn', { accessibility: 'no-public' }],
        'ts/consistent-type-imports': [
          'warn',
          {
            prefer: 'type-imports',
            disallowTypeAnnotations: false,
            fixStyle: 'separate-type-imports',
          },
        ],
      },
    },
    jsonc: false,
    yaml: false,
    markdown: false,
    ignores: ['/dist', '/test', '**/*.js'],
  },
  prettierConfig as Linter.Config,
  {
    rules: {
      'array-callback-return': 'off',
      'unicorn/new-for-builtins': 'off',
      'node/prefer-global/buffer': 'off',
      'antfu/curly': 'off',
      'antfu/consistent-list-newline': 'off',
      'style/semi': 'off',
      'style/member-delimiter-style': 'off',
      'style/arrow-parens': ['warn', 'as-needed'],
      'style/brace-style': ['warn', '1tbs'],
      'style/indent': 'off',
      'style/operator-linebreak': 'off',
      'style/quote-props': 'off',
      'antfu/if-newline': 'off',
      'antfu/top-level-function': 'off',
      'no-console': 'off',
      'no-cond-assign': 'off',
      'no-useless-return': 'warn',
      'symbol-description': 'off',
      'unused-imports/no-unused-vars': 'warn',
      'perfectionist/sort-imports': [
        'warn',
        {
          ignoreCase: false,
          newlinesBetween: 'never',
          internalPattern: ['^#.*'],
          groups: [
            ['side-effect-style', 'side-effect'],
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
          ],
        },
      ],
    },
  },
);
