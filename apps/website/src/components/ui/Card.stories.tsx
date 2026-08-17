import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Card } from './Card';

const meta = {
  title: 'Surfaces/Card',
  component: Card,
  args: {
    children: (
      <>
        <h3>Every network, one client.</h3>
        <p>Read and reply across connected platforms from one consistent inbox.</p>
      </>
    ),
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paper: Story = {};
export const Lime: Story = { args: { tint: 'lime' } };
export const Sky: Story = { args: { tint: 'sky' } };
export const Blush: Story = { args: { tint: 'blush' } };
