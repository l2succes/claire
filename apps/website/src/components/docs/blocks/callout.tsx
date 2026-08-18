// SPDX-License-Identifier: Apache-2.0
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LightBulbIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';

const kinds = {
  note: { icon: InformationCircleIcon, label: 'Note' },
  tip: { icon: LightBulbIcon, label: 'Tip' },
  warning: { icon: ExclamationTriangleIcon, label: 'Heads up' },
  danger: { icon: ShieldExclamationIcon, label: 'Careful' },
} as const;

export type CalloutKind = keyof typeof kinds;

export function Callout({
  kind = 'note',
  title,
  children,
}: {
  kind?: CalloutKind;
  title?: string;
  children: ReactNode;
}) {
  const { icon: Icon, label } = kinds[kind];
  return (
    <aside className="doc-callout" data-kind={kind}>
      <Icon className="doc-callout__icon" aria-hidden="true" />
      <div className="doc-callout__body">
        <p className="doc-callout__title">{title ?? label}</p>
        {children}
      </div>
    </aside>
  );
}
