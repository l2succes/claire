import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Badge } from './Badge';

const meta = {
  title: 'Status/Badge',
  component: Badge,
  args: { children: 'Available' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = { args: { tone: 'available' } };
export const Planned: Story = { args: { tone: 'planned', children: 'Planned' } };
export const Builder: Story = { args: { tone: 'builder', children: 'For builders' } };
export const Neutral: Story = { args: { tone: 'neutral', children: 'Current' } };
