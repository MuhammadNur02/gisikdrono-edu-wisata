const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'booking',
        'payment',
        'qr',
        'scanner',
        'admin',
        'public',
        'db',
        'rls',
        'notify',
        'pdf',
        'seo',
        'infra',
        'docs',
        'deps',
      ],
    ],
  },
};

export default config;
