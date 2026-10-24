import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/webhooks/ssrf', () => ({
  safeFetch: vi.fn(),
  readBodyCapped: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))

import { safeFetch } from '@/lib/webhooks/ssrf'
import { forgetHeaderMediaId, mediaTypeFor, resolveHeaderMediaId } from './header-media'

const URL_MP4 = 'https://cdn.example.com/offer.mp4'

function fileResponse(status = 200, type = 'video/mp4') {
  return new Response('x', { status, headers: { 'content-type': type } })
}

beforeEach(() => {
  forgetHeaderMediaId('pn1', 'video', URL_MP4)
  vi.mocked(safeFetch).mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('mediaTypeFor', () => {
  it('accepts the declared type or a clear extension', () => {
    expect(mediaTypeFor('video', 'video/mp4; charset=binary', URL_MP4)).toBe('video/mp4')
    expect(mediaTypeFor('video', 'application/octet-stream', URL_MP4)).toBe('video/mp4')
    expect(mediaTypeFor('video', 'text/html', 'https://drive.example.com/view')).toBeNull()
    expect(mediaTypeFor('image', 'application/octet-stream', URL_MP4)).toBeNull()
  })
})

describe('resolveHeaderMediaId', () => {
  it('uploads once and reuses the id', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fileResponse())
    const upload = vi.fn(async () => new Response(JSON.stringify({ id: 'media-1' }), { status: 200 }))
    vi.stubGlobal('fetch', upload)

    const args = { phoneNumberId: 'pn1', accessToken: 't', url: URL_MP4, kind: 'video' as const }
    const [a, b] = await Promise.all([resolveHeaderMediaId(args), resolveHeaderMediaId(args)])
    expect(a).toBe('media-1')
    expect(b).toBe('media-1')
    expect(await resolveHeaderMediaId(args)).toBe('media-1')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(String((upload.mock.calls[0] as unknown[])[0])).toContain('/pn1/media')
  })

  it('returns null (send the link) when the host fails', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fileResponse(503))
    const upload = vi.fn()
    vi.stubGlobal('fetch', upload)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const id = await resolveHeaderMediaId({ phoneNumberId: 'pn1', accessToken: 't', url: URL_MP4, kind: 'video' })
    expect(id).toBeNull()
    expect(upload).not.toHaveBeenCalled()
  })
})
