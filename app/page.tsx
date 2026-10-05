import type { Metadata } from 'next';

import { StationDashboard } from '@/components/station/StationDashboard';
import { getStationState } from '@/lib/services/state';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'תחנת עבודה',
  description: 'ניהול שתי אצוות פעילות במקביל — טיימר חי, רישום משטחים, השהיות וחלוקת נקודות.',
};

/**
 * Main station dashboard.
 *
 * Rendered on the server so the first paint already contains real numbers (no
 * spinner on a factory-floor screen), then handed to the client component which
 * keeps everything live and drives TV Mode.
 */
export default async function StationPage() {
  const state = await getStationState();

  return <StationDashboard initialState={state} />;
}
