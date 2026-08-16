import type { Preview } from '@storybook/nextjs-vite';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'cream',
      values: [
        { name: 'cream', value: '#f4f1ea' },
        { name: 'paper', value: '#fffdf8' },
        { name: 'ink', value: '#10120f' },
      ],
    },
  },
};

export default preview;
