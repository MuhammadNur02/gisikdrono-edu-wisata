const config = {
  // --no-warn-ignored: generated files such as src/db/types.ts are ignored by ESLint on purpose,
  // and without it that ignore becomes a warning that --max-warnings 0 turns into a failure.
  '*.{ts,tsx,js,mjs}': ['eslint --fix --max-warnings 0 --no-warn-ignored', 'prettier --write'],
  '*.{json,css,yml,yaml}': 'prettier --write',
  // gitleaks reads the staged diff on its own, so it ignores the file list lint-staged hands over.
  '*': () => 'gitleaks protect --staged --redact --verbose',
};

export default config;
