import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-plugin-prettier'
import security from 'eslint-plugin-security'
import sonarjs from 'eslint-plugin-sonarjs'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.husky/**',
      'logs/**',
      '*.config.js',
      '*.config.mjs',
      'tests/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts'],
    plugins: {
      prettier,
      security,
      sonarjs,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],

      // General rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'warn',
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],

      // Security rules
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'warn',

      // SonarJS rules
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],

      // Prettier
      'prettier/prettier': 'error',
    },
  }
)
