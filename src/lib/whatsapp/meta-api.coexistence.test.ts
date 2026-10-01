import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkCoexistenceStatus,
  initiateSmbAppDataSync,
} from './meta-api';

const fetchMock = vi.fn();

// Stub global fetch for every test.
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('checkCoexistenceStatus', () => {
  it('GETs is_on_biz_app + platform_type and maps to camelCase', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ is_on_biz_app: true, platform_type: 'CLOUD_API', id: 'PN-1' }),
    );

    const result = await checkCoexistenceStatus({
      phoneNumberId: 'PN-1',
      accessToken: 'tok',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('graph.facebook.com');
    expect(url).toContain('/PN-1?fields=is_on_biz_app,platform_type');

    expect(result).toEqual({ isOnBizApp: true, platformType: 'CLOUD_API' });
  });

  it('maps a false is_on_biz_app to false (standard Cloud API number)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ is_on_biz_app: false, platform_type: 'CLOUD_API', id: 'PN-2' }),
    );

    const result = await checkCoexistenceStatus({
      phoneNumberId: 'PN-2',
      accessToken: 'tok',
    });
    expect(result.isOnBizApp).toBe(false);
  });

  it('treats a missing is_on_biz_app as false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'PN-3' }));
    const result = await checkCoexistenceStatus({
      phoneNumberId: 'PN-3',
      accessToken: 'tok',
    });
    expect(result.isOnBizApp).toBe(false);
  });

  it('throws with Meta\u2019s error message on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { message: 'Unsupported get request', code: 100 } },
        false,
        400,
      ),
    );

    await expect(
      checkCoexistenceStatus({ phoneNumberId: 'PN-4', accessToken: 'tok' }),
    ).rejects.toThrow('Unsupported get request');
  });
});

describe('initiateSmbAppDataSync', () => {
  it('POSTs messaging_product + sync_type and returns the request_id', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ messaging_product: 'whatsapp', request_id: 'REQ-123' }),
    );

    const result = await initiateSmbAppDataSync({
      phoneNumberId: 'PN-9',
      accessToken: 'tok',
      syncType: 'smb_app_state_sync',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/PN-9/smb_app_data');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      sync_type: 'smb_app_state_sync',
    });

    expect(result).toEqual({ requestId: 'REQ-123' });
  });

  it('sends sync_type "history" verbatim for history sync', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ request_id: 'REQ-456' }),
    );

    await initiateSmbAppDataSync({
      phoneNumberId: 'PN-9',
      accessToken: 'tok',
      syncType: 'history',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sync_type).toBe('history');
  });

  it('throws when Meta accepts but returns no request_id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messaging_product: 'whatsapp' }));

    await expect(
      initiateSmbAppDataSync({ phoneNumberId: 'PN-9', accessToken: 'tok', syncType: 'history' }),
    ).rejects.toThrow('no request_id');
  });

  it('surfaces Meta\u2019s duplicate-request error verbatim', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            message: '(#100) This sync type has already been requested for this phone number',
            code: 100,
          },
        },
        false,
        400,
      ),
    );

    await expect(
      initiateSmbAppDataSync({ phoneNumberId: 'PN-9', accessToken: 'tok', syncType: 'history' }),
    ).rejects.toThrow('already been requested');
  });
});
