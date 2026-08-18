// SPDX-License-Identifier: Apache-2.0
export function LabFrame({ src, title }: { src: string; title: string }) {
  return <iframe className="mockup-frame" title={title} src={src} />;
}
