export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'subject-case': [2, 'never', ['upper-case']],
    'header-max-length': [2, 'always', 72],
  },
  // Allow "Initial Commit" for compatibility with npx-create-project CLI tool
  ignores: [
    (message) => message === 'Initial Commit',
    (message) => message.includes('Initial Commit'),
  ],
  helpUrl: 'https://github.com/conventional-changelog/commitlint/#what-is-commitlint',
}
