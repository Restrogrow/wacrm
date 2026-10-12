// ============================================================
// GET /api/v1/openapi.json — the public API's OpenAPI 3.1 spec.
//
// Unauthenticated so integrators (and tools like Postman, Insomnia,
// or code generators) can fetch it directly. Content is static, so
// it is prerendered at build time.
// ============================================================

import { OPENAPI_SPEC } from '@/lib/api/v1/openapi';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(OPENAPI_SPEC, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
