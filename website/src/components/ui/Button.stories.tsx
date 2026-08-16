import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './Button';

const meta = { title: 'Actions/Button', component: Button, args: { href: '#', children: 'Choose your setup' } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {};
export const Secondary: Story = { args: { tone: 'secondary', children: 'Read the docs' } };
export const Quiet: Story = { args: { tone: 'quiet', children: 'View details' } };
