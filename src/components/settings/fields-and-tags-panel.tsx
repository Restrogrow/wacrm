'use client';

import { Tags } from 'lucide-react';

import { useCan } from '@/hooks/use-can';

import { CustomFieldsSettings } from './custom-fields-settings';
import { SettingsPanelHead } from './settings-panel-head';
import { TagManager } from './tag-manager';

/**
 * "Fields & tags" section — merges the former Tags and Custom Fields
 * tabs. Tags are visible to everyone; the custom-fields catalogue is
 * account-wide config, so the card is admin-gated (mirroring the old
 * hidden-tab behaviour). `custom_fields` RLS rejects non-admin writes
 * regardless.
 */
export function FieldsAndTagsPanel() {
  const canEditSettings = useCan('edit-settings');

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={Tags}
        title="Fields & tags"
        description="Two ways to organize contacts: colour-coded tags for quick grouping, and custom fields for structured data."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <TagManager />
        {canEditSettings ? <CustomFieldsSettings /> : null}
      </div>
    </section>
  );
}
