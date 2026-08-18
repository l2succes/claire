// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';

/** Numbered procedure. Numbers come from a CSS counter, so reordering is free. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="doc-steps">{children}</ol>;
}

/** A step may be a bare instruction, so `children` is optional. */
export function Step({
  title,
  optional = false,
  children,
}: {
  title: string;
  optional?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="doc-step">
      <p className="doc-step__title">
        {title}
        {optional ? <span className="doc-step__optional">Optional</span> : null}
      </p>
      {children ? <div className="doc-step__body">{children}</div> : null}
    </li>
  );
}
