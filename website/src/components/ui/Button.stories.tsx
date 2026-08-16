import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './Button';

const meta = {
  title: 'Actions/Button',
  component: Button,
  args: { children: 'Choose your setup' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {};
export const Lime: Story = { args: { variant: 'lime', children: 'Read the docs' } };
export const Outline: Story = { args: { variant: 'outline', children: 'View details' } };
export const Small: Story = { args: { size: 'small', children: 'See pricing' } };
