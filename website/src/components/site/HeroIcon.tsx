// SPDX-License-Identifier: Apache-2.0
import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  Bars3Icon,
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CloudIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  EllipsisHorizontalIcon,
  HomeIcon,
  InboxIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  PlusIcon,
  ServerStackIcon,
  SparklesIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/cn';

const icons = {
  home: HomeIcon,
  inbox: InboxIcon,
  chat: ChatBubbleLeftRightIcon,
  promises: CheckBadgeIcon,
  'check-circle': CheckCircleIcon,
  search: MagnifyingGlassIcon,
  plus: PlusIcon,
  compose: PencilSquareIcon,
  sparkles: SparklesIcon,
  send: PaperAirplaneIcon,
  settings: Cog6ToothIcon,
  people: UsersIcon,
  external: ArrowTopRightOnSquareIcon,
  'arrow-right': ArrowRightIcon,
  download: ArrowDownTrayIcon,
  desktop: ComputerDesktopIcon,
  phone: DevicePhoneMobileIcon,
  cloud: CloudIcon,
  server: ServerStackIcon,
  info: InformationCircleIcon,
  more: EllipsisHorizontalIcon,
  back: ChevronLeftIcon,
  'chevron-down': ChevronDownIcon,
  'bars-3': Bars3Icon,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type HeroIconName = keyof typeof icons;

export function HeroIcon({
  name,
  className,
  size = 'md',
}: {
  name: HeroIconName;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const Icon = icons[name];
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'hero-icon inline-block shrink-0 overflow-visible align-middle',
        size === 'sm' && 'size-5',
        size === 'md' && 'size-6',
        size === 'lg' && 'size-7',
        className,
      )}
    />
  );
}
