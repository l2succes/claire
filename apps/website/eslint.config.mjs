import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [...nextVitals, { ignores: ['.next/**', '.source/**', 'storybook-static/**'] }];

export default config;
