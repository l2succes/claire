import { Suspense } from 'react';
import { MobileAppPreview } from '@/components/mockups/MobileAppPreview';

export default function MobileAppPreviewFrame() {
  return <Suspense fallback={null}><MobileAppPreview /></Suspense>;
}
