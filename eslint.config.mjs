import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['node_modules/**', '.qa/**', 'vendor/**', 'dist/**', 'backups/**'] },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.node, ...globals.worker },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: globals.node } },
  { files: ['**/*.mjs', 'handwriting-worker.js'], languageOptions: { sourceType: 'module' } },
];
