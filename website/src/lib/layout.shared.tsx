// SPDX-License-Identifier: Apache-2.0
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src="/assets/brand/claire-app-icon-lime.svg" alt="" width={28} height={28} />
          Claire Docs
        </>
      ),
      url: '/docs',
    },
    githubUrl: 'https://github.com/l2succes/claire',
    links: [
      { text: 'Product', url: '/' },
      { text: 'Pricing', url: '/pricing' },
      { text: 'Security', url: '/security' },
      { text: 'Developers', url: '/developers' },
      { text: 'FAQ', url: '/faq' },
    ],
  };
}
