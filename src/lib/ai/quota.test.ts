import { describe, expect, it } from 'vitest';

import { tierMessage } from './quota';

describe('tierMessage', () => {
  it('names the feature and the plan it unlocks at', () => {
    expect(tierMessage('chatbot', 'growth')).toBe(
      'The AI chatbot is included from the Growth plan — upgrade in Settings → Plan & billing to turn it on.'
    );
    expect(tierMessage('voice_call', 'pro')).toBe(
      'The AI voice agent is included from the Pro plan — upgrade in Settings → Plan & billing to turn it on.'
    );
  });
});
