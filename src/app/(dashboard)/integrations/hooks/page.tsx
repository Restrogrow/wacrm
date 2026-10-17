import { AlertChannelsSettings } from '@/components/settings/alert-channels-settings';
import { InboundHooksSettings } from '@/components/settings/inbound-hooks-settings';

export default function Page() {
  return (
    <div className="space-y-10">
      <InboundHooksSettings />
      <AlertChannelsSettings />
    </div>
  );
}
