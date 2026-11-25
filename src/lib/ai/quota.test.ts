import { describe, expect, it } from 'vitest';

import { aiMonthlyCap, tierMessage } from './quota';

describe('tierMessage', () => {
  it('names the feature and the plan it unlocks at', () => {
    expect(tierMessage('voice_call', 'pro')).toBe(
      'The AI voice agent is included from the Pro plan — upgrade in Settings → Plan & billing to turn it on.'
    );
  });
});

describe('aiMonthlyCap', () => {
  it('chatbot replies: every plan gets some, Starter the least', () => {
    expect(aiMonthlyCap('starter', 'chatbot')).toBe(500);
    expect(aiMonthlyCap('growth', 'chatbot')).toBe(2000);
    expect(aiMonthlyCap('pro', 'chatbot')).toBe(5000);
    expect(aiMonthlyCap('enterprise', 'chatbot')).toBeNull();
  });

  it('voice minutes: zero below Pro, 300/month on Pro, uncapped on Enterprise', () => {
    expect(aiMonthlyCap('starter', 'voice_call')).toBe(0);
    expect(aiMonthlyCap('growth', 'voice_call')).toBe(0);
    expect(aiMonthlyCap('pro', 'voice_call')).toBe(300);
    expect(aiMonthlyCap('enterprise', 'voice_call')).toBeNull();
  });

  it('treats a missing plan like starter', () => {
    expect(aiMonthlyCap(null, 'chatbot')).toBe(500);
  });
});
