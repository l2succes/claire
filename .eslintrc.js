module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2022,
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  // TypeScript linting is handled by server/.eslintrc.js and mobile/.eslintrc.js
  ignorePatterns: ['server/**/*', 'mobile/**/*'],
};