const config = {
  '*.{ts,tsx,js,mjs}': ['eslint --fix --max-warnings 0', 'prettier --write'],
  '*.{json,css,yml,yaml}': 'prettier --write',
  // gitleaks reads the staged diff on its own, so it ignores the file list lint-staged hands over.
  '*': () => 'gitleaks protect --staged --redact --verbose',
};

export default config;
