// ============================================================
// OpenAPI 3.1 description of the public API (`/api/v1`).
//
// Single source of truth for the machine-readable spec served at
// `GET /api/v1/openapi.json` and for the human reference rendered at
// `/docs/api`. When an endpoint changes, update it here and both stay
// in sync. Prose docs live in `docs/public-api.md`.
// ============================================================

import { SITE_URL } from '@/lib/seo';
import { API_SCOPES, SCOPE_DESCRIPTIONS } from '@/lib/api-keys/scopes';
import { WEBHOOK_EVENTS } from '@/lib/webhooks/events';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const json = (schema: unknown, example?: unknown) => ({
  'application/json': example === undefined ? { schema } : { schema, example },
});

const dataEnvelope = (schema: unknown) => ({
  type: 'object',
  required: ['data'],
  properties: { data: schema },
});

const listEnvelope = (item: string) => ({
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: ref(item) },
    meta: ref('PageMeta'),
  },
});

const errorResponses = (...statuses: number[]) =>
  Object.fromEntries(
    statuses.map((s) => [String(s), { $ref: `#/components/responses/E${s}` }])
  );

const idParam = (description: string) => ({
  name: 'id',
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});

const paginationParams = [
  {
    name: 'limit',
    in: 'query',
    description: 'Page size (default 50, max 100).',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: 'cursor',
    in: 'query',
    description: 'Opaque `meta.next_cursor` from the previous page. Pass it back verbatim.',
    schema: { type: 'string' },
  },
];

const tagSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    color: { type: 'string', example: '#3b82f6' },
  },
};

export const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Repeat Grow API',
    version: '1.0.0',
    summary: 'Send WhatsApp messages, manage contacts, read conversations, launch broadcasts, and receive webhooks.',
    description:
      'The Repeat Grow public REST API. Authenticate every request with an API key created in ' +
      '**Settings → API keys** (`Authorization: Bearer wacrm_live_…`). Keys are scoped to one account ' +
      'and to the scopes granted at creation. Rate limit: 120 requests per minute per key.\n\n' +
      `Guides and examples: ${SITE_URL}/docs/api`,
    contact: { name: 'Repeat Grow support', email: 'support@repeatgrow.com', url: `${SITE_URL}/contact` },
    license: { name: 'MIT', identifier: 'MIT' },
  },
  servers: [{ url: `${SITE_URL}/api/v1`, description: 'Production' }],
  security: [{ apiKey: [] }],
  tags: [
    { name: 'Account', description: 'Verify a key and discover its scopes.' },
    { name: 'Messages', description: 'Send WhatsApp messages.' },
    { name: 'Contacts', description: 'Create, list, read, and update contacts.' },
    { name: 'Conversations', description: 'Read conversations and their messages.' },
    { name: 'Broadcasts', description: 'Launch template broadcasts and track progress.' },
    { name: 'Templates', description: 'Create WhatsApp message templates and follow their review by Meta.' },
    { name: 'Webhooks', description: 'Register endpoints that receive events from your account.' },
    { name: 'Connect', description: 'For partner apps: exchange a "Connect RepeatGrow" code for a key, and disconnect.' },
  ],
  paths: {
    '/me': {
      get: {
        tags: ['Account'],
        operationId: 'getMe',
        summary: 'Get the current key and account',
        description: 'Returns the account the key is bound to and its scopes. Needs no scope — use it to check a key works.',
        responses: {
          '200': {
            description: 'The key is valid.',
            content: json(dataEnvelope(ref('Me')), {
              data: {
                account: { id: '7d0c…', name: 'Acme Inc' },
                key: { id: '1f2a…', scopes: ['messages:send'] },
              },
            }),
          },
          ...errorResponses(401, 429),
        },
      },
    },
    '/messages': {
      post: {
        tags: ['Messages'],
        operationId: 'sendMessage',
        summary: 'Send a WhatsApp message',
        description:
          'Send a message to a phone number in E.164 format. The contact and conversation are found or created ' +
          'automatically. Free-form messages (text/media) only deliver inside WhatsApp\'s 24-hour customer-service ' +
          'window; outside it, send an approved `template`. Scope: `messages:send`.',
        'x-scope': 'messages:send',
        requestBody: {
          required: true,
          content: json(ref('SendMessageRequest'), {
            to: '+14155550123',
            type: 'text',
            text: 'Hi 👋 your order has shipped.',
          }),
        },
        responses: {
          '201': {
            description: 'Message accepted by WhatsApp.',
            content: json(dataEnvelope(ref('SendMessageResult')), {
              data: {
                message_id: '0b6e…',
                whatsapp_message_id: 'wamid.HBgM…',
                conversation_id: '5c1d…',
                contact_id: '9a3f…',
                contact_created: true,
              },
            }),
          },
          '502': {
            description: '`meta_error` — WhatsApp rejected the send.',
            content: json(ref('Error')),
          },
          '403': {
            description:
              '`forbidden` — the key lacks `messages:send`; or `opted_out` — a marketing template to a contact who replied STOP.',
            content: json(ref('Error')),
          },
          ...errorResponses(400, 401, 429, 500),
        },
      },
    },
    '/contacts': {
      get: {
        tags: ['Contacts'],
        operationId: 'listContacts',
        summary: 'List contacts',
        description: 'Newest first, paginated. Scope: `contacts:read`.',
        'x-scope': 'contacts:read',
        parameters: [
          ...paginationParams,
          { name: 'search', in: 'query', description: 'Match on name or phone.', schema: { type: 'string' } },
          { name: 'tag', in: 'query', description: 'Only contacts with this tag id.', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'A page of contacts.', content: json(listEnvelope('Contact')) },
          ...errorResponses(400, 401, 403, 429),
        },
      },
      post: {
        tags: ['Contacts'],
        operationId: 'createContact',
        summary: 'Create a contact',
        description:
          'Find-or-create by phone: an existing contact with the same number returns `200`, a new one `201`. ' +
          'Tags are given by name and created if missing. Scope: `contacts:write`.',
        'x-scope': 'contacts:write',
        requestBody: {
          required: true,
          content: json(ref('CreateContactRequest'), {
            phone: '+14155550123',
            name: 'Jane Doe',
            email: 'jane@example.com',
            company: 'Acme',
            tags: ['vip', 'website-lead'],
          }),
        },
        responses: {
          '200': { description: 'A contact with this phone already existed.', content: json(dataEnvelope(ref('Contact'))) },
          '201': { description: 'Contact created.', content: json(dataEnvelope(ref('Contact'))) },
          ...errorResponses(400, 401, 403, 429),
        },
      },
    },
    '/contacts/{id}': {
      parameters: [idParam('Contact id.')],
      get: {
        tags: ['Contacts'],
        operationId: 'getContact',
        summary: 'Get a contact',
        description: 'Scope: `contacts:read`.',
        'x-scope': 'contacts:read',
        responses: {
          '200': { description: 'The contact.', content: json(dataEnvelope(ref('Contact'))) },
          ...errorResponses(401, 403, 404, 429),
        },
      },
      patch: {
        tags: ['Contacts'],
        operationId: 'updateContact',
        summary: 'Update a contact',
        description:
          'Only the fields you send change. Sending `tags` replaces the contact\'s tags. Scope: `contacts:write`.',
        'x-scope': 'contacts:write',
        requestBody: {
          required: true,
          content: json(ref('UpdateContactRequest'), { company: 'Acme Ltd', tags: ['vip'] }),
        },
        responses: {
          '200': { description: 'The updated contact.', content: json(dataEnvelope(ref('Contact'))) },
          ...errorResponses(400, 401, 403, 404, 429),
        },
      },
    },
    '/conversations': {
      get: {
        tags: ['Conversations'],
        operationId: 'listConversations',
        summary: 'List conversations',
        description: 'Newest first, paginated. Each conversation embeds its contact. Scope: `conversations:read`.',
        'x-scope': 'conversations:read',
        parameters: [
          ...paginationParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'pending', 'closed'] } },
          { name: 'contact_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'A page of conversations.', content: json(listEnvelope('Conversation')) },
          ...errorResponses(400, 401, 403, 429),
        },
      },
    },
    '/conversations/{id}': {
      parameters: [idParam('Conversation id.')],
      get: {
        tags: ['Conversations'],
        operationId: 'getConversation',
        summary: 'Get a conversation',
        description: 'Scope: `conversations:read`.',
        'x-scope': 'conversations:read',
        responses: {
          '200': { description: 'The conversation.', content: json(dataEnvelope(ref('Conversation'))) },
          ...errorResponses(401, 403, 404, 429),
        },
      },
    },
    '/conversations/{id}/messages': {
      parameters: [idParam('Conversation id.')],
      get: {
        tags: ['Conversations'],
        operationId: 'listConversationMessages',
        summary: 'List messages in a conversation',
        description: 'Newest first, paginated. Scope: `messages:read`.',
        'x-scope': 'messages:read',
        parameters: paginationParams,
        responses: {
          '200': { description: 'A page of messages.', content: json(listEnvelope('Message')) },
          ...errorResponses(400, 401, 403, 404, 429),
        },
      },
    },
    '/broadcasts': {
      post: {
        tags: ['Broadcasts'],
        operationId: 'createBroadcast',
        summary: 'Launch a template broadcast',
        description:
          'Sends an approved template to up to 1,000 recipients per request. Returns immediately while sends ' +
          'run in the background — poll `GET /broadcasts/{id}` for progress. Invalid numbers and contacts who ' +
          'replied STOP (opted out) are dropped and counted as `rejected`. Scope: `broadcasts:send`.',
        'x-scope': 'broadcasts:send',
        requestBody: {
          required: true,
          content: json(ref('CreateBroadcastRequest'), {
            name: 'Diwali offer',
            template_name: 'festive_offer',
            template_language: 'en_US',
            recipients: [
              { to: '+919876543210', params: ['Priya'] },
              { to: '+919876543211', params: ['Rahul'] },
            ],
          }),
        },
        responses: {
          '202': {
            description: 'Broadcast accepted; sending in the background.',
            content: json(dataEnvelope(ref('BroadcastAccepted')), {
              data: { broadcast_id: '3e7b…', status: 'sending', total_recipients: 2, accepted: 2, rejected: 0 },
            }),
          },
          ...errorResponses(400, 401, 403, 429),
        },
      },
    },
    '/broadcasts/{id}': {
      parameters: [idParam('Broadcast id.')],
      get: {
        tags: ['Broadcasts'],
        operationId: 'getBroadcast',
        summary: 'Get broadcast progress',
        description:
          '`status` moves `sending` → `sent`; delivered/read counts keep rising as WhatsApp reports them. ' +
          'Scope: `broadcasts:send`.',
        'x-scope': 'broadcasts:send',
        responses: {
          '200': { description: 'The broadcast.', content: json(dataEnvelope(ref('Broadcast'))) },
          ...errorResponses(401, 403, 404, 429),
        },
      },
    },
    '/templates': {
      get: {
        tags: ['Templates'],
        operationId: 'listTemplates',
        summary: 'List message templates',
        description:
          'Your templates and their review status, optionally filtered by `names` (comma-separated, up to 50). ' +
          "Status is kept current by Meta's review webhook. Scope: `templates:read`.",
        'x-scope': 'templates:read',
        parameters: [
          {
            name: 'names',
            in: 'query',
            description: 'Comma-separated template names, up to 50.',
            schema: { type: 'string', example: 'order_update,birthday_gift' },
          },
        ],
        responses: {
          '200': {
            description: 'Matching templates.',
            content: json(dataEnvelope({ type: 'array', items: ref('TemplateDetail') }), {
              data: [
                {
                  id: '6f1e…',
                  name: 'birthday_gift',
                  language: 'en',
                  category: 'MARKETING',
                  status: 'APPROVED',
                  rejection_reason: null,
                  body_text: 'Happy birthday, {{1}}! Your treat: {{2}}.',
                  updated_at: '2026-10-12T10:00:00.000Z',
                },
              ],
            }),
          },
          ...errorResponses(400, 401, 403, 429),
        },
      },
      post: {
        tags: ['Templates'],
        operationId: 'createTemplate',
        summary: 'Create a template and submit it to Meta',
        description:
          'Submits the template to Meta for review. Safe to call again: the same name, language and wording returns ' +
          'the current template with `200` and nothing is resubmitted; a `REJECTED` or `DRAFT` template is resubmitted; ' +
          'an approved or pending template with different wording returns `409 conflict` (use a new name). ' +
          'AUTHENTICATION templates are not supported. Scope: `templates:write`.',
        'x-scope': 'templates:write',
        requestBody: {
          required: true,
          content: json(ref('CreateTemplateRequest'), {
            name: 'birthday_gift',
            category: 'MARKETING',
            language: 'en',
            body_text: 'Happy birthday, {{1}}! Your treat: {{2}}.',
            sample_values: { body: ['Priya', 'Free dessert'] },
          }),
        },
        responses: {
          '201': {
            description: 'Submitted (or resubmitted) to Meta for review.',
            content: json(dataEnvelope(ref('Template')), {
              data: { id: '6f1e…', name: 'birthday_gift', language: 'en', category: 'MARKETING', status: 'PENDING' },
            }),
          },
          '200': {
            description: 'Already exists with the same wording; nothing resubmitted.',
            content: json(dataEnvelope(ref('Template'))),
          },
          '409': {
            description: "`conflict` — exists with different wording and can't be changed. Use a new name.",
            content: json(ref('Error')),
          },
          '502': { description: '`meta_error` — Meta rejected the submission.', content: json(ref('Error')) },
          ...errorResponses(400, 401, 403, 429, 500),
        },
      },
    },
    '/connect/token': {
      post: {
        tags: ['Connect'],
        operationId: 'exchangeConnectCode',
        summary: 'Exchange a Connect code for an API key',
        description:
          'Server to server, for registered partner apps only. After the account owner clicks **Allow** on ' +
          '`/connect/{client}`, exchange the one-time code (valid 5 minutes, single use) for a scoped API key. ' +
          'Authenticates with the client secret, not an API key. The key is returned once and never shown again.',
        security: [],
        requestBody: {
          required: true,
          content: json(ref('ConnectTokenRequest'), {
            client_id: 'restrogrow',
            client_secret: 'rgcs_…',
            code: 'k3J…',
            redirect_uri: 'https://restrogrow.com/main/api/repeatgrow_connect.php',
          }),
        },
        responses: {
          '200': {
            description: 'A new API key for the account that approved.',
            content: json(dataEnvelope(ref('ConnectTokenResult')), {
              data: {
                api_key: 'wacrm_live_…',
                account: { id: '7d0c…', name: 'Spice Garden' },
                phone_number: '+91 98765 43210',
                scopes: ['messages:send', 'templates:read', 'templates:write'],
              },
            }),
          },
          '400': {
            description: '`invalid_request`, or `invalid_grant`: the code is invalid, expired, used, or for another redirect_uri.',
            content: json(ref('Error')),
          },
          '401': { description: '`invalid_client` — unknown client or wrong secret.', content: json(ref('Error')) },
          ...errorResponses(429),
        },
      },
    },
    '/keys/revoke-self': {
      post: {
        tags: ['Connect'],
        operationId: 'revokeSelf',
        summary: 'Revoke the calling API key',
        description: 'Any valid key can revoke itself, e.g. when a partner app disconnects. Needs no scope.',
        responses: {
          '200': {
            description: 'Revoked. The next request with this key gets `401`.',
            content: json(dataEnvelope({ type: 'object', properties: { revoked: { type: 'boolean' } } }), {
              data: { revoked: true },
            }),
          },
          ...errorResponses(401, 429),
        },
      },
    },
    '/webhooks': {
      get: {
        tags: ['Webhooks'],
        operationId: 'listWebhooks',
        summary: 'List webhook endpoints',
        description: 'Never returns signing secrets. Scope: `webhooks:manage`.',
        'x-scope': 'webhooks:manage',
        responses: {
          '200': {
            description: 'Your endpoints.',
            content: json(dataEnvelope({ type: 'array', items: ref('WebhookEndpoint') })),
          },
          ...errorResponses(401, 403, 429),
        },
      },
      post: {
        tags: ['Webhooks'],
        operationId: 'createWebhook',
        summary: 'Register a webhook endpoint',
        description:
          'The URL must be public `https://`. The response contains the signing `secret` **once** — store it ' +
          'to verify the `X-Wacrm-Signature` header on deliveries. Scope: `webhooks:manage`.',
        'x-scope': 'webhooks:manage',
        requestBody: {
          required: true,
          content: json(ref('CreateWebhookRequest'), {
            url: 'https://example.com/hooks/repeatgrow',
            events: ['message.received'],
          }),
        },
        responses: {
          '201': {
            description: 'Endpoint registered.',
            content: json(dataEnvelope(ref('WebhookEndpointWithSecret'))),
          },
          ...errorResponses(400, 401, 403, 429),
        },
      },
    },
    '/webhooks/{id}': {
      parameters: [idParam('Webhook endpoint id.')],
      get: {
        tags: ['Webhooks'],
        operationId: 'getWebhook',
        summary: 'Get a webhook endpoint',
        description: 'Scope: `webhooks:manage`.',
        'x-scope': 'webhooks:manage',
        responses: {
          '200': { description: 'The endpoint.', content: json(dataEnvelope(ref('WebhookEndpoint'))) },
          ...errorResponses(401, 403, 404, 429),
        },
      },
      patch: {
        tags: ['Webhooks'],
        operationId: 'updateWebhook',
        summary: 'Update a webhook endpoint',
        description:
          'Change `url`, `events`, or `is_active`. Re-enabling an endpoint resets its failure counter. ' +
          'Scope: `webhooks:manage`.',
        'x-scope': 'webhooks:manage',
        requestBody: { required: true, content: json(ref('UpdateWebhookRequest'), { is_active: true }) },
        responses: {
          '200': { description: 'The updated endpoint.', content: json(dataEnvelope(ref('WebhookEndpoint'))) },
          ...errorResponses(400, 401, 403, 404, 429),
        },
      },
      delete: {
        tags: ['Webhooks'],
        operationId: 'deleteWebhook',
        summary: 'Delete a webhook endpoint',
        description: 'Scope: `webhooks:manage`.',
        'x-scope': 'webhooks:manage',
        responses: {
          '200': {
            description: 'Deleted.',
            content: json(
              dataEnvelope({
                type: 'object',
                properties: { id: { type: 'string', format: 'uuid' }, deleted: { type: 'boolean' } },
              }),
              { data: { id: '2b9c…', deleted: true } }
            ),
          },
          ...errorResponses(401, 403, 404, 429),
        },
      },
    },
  },
  webhooks: {
    event: {
      post: {
        operationId: 'webhookEvent',
        summary: 'Event delivery to your endpoint',
        description:
          'Repeat Grow POSTs this envelope to each active endpoint subscribed to the event. Verify the ' +
          '`X-Wacrm-Signature` header (`t=<unix>,v1=<hex>`, where `v1 = HMAC-SHA256(secret, "${t}.${rawBody}")`) ' +
          'and dedupe on `id`. Delivery is a single best-effort attempt; redirects are not followed.',
        parameters: [
          { name: 'X-Wacrm-Event', in: 'header', schema: { type: 'string', enum: [...WEBHOOK_EVENTS] } },
          { name: 'X-Wacrm-Webhook-Id', in: 'header', schema: { type: 'string', format: 'uuid' } },
          { name: 'X-Wacrm-Signature', in: 'header', schema: { type: 'string', example: 't=1767225600,v1=5d41…' } },
        ],
        requestBody: { content: json(ref('WebhookDelivery')) },
        responses: { '2XX': { description: 'Return any 2xx to acknowledge.' } },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'wacrm_live_…',
        description:
          'Create a key in **Settings → API keys** (admins and owners only). The full key is shown once. ' +
          'Scopes:\n\n' +
          API_SCOPES.map((s) => `- \`${s}\` — ${SCOPE_DESCRIPTIONS[s]}`).join('\n'),
      },
    },
    responses: {
      E400: { description: '`bad_request` — malformed input.', content: json(ref('Error')) },
      E401: { description: '`unauthorized` — missing, invalid, revoked, or expired key.', content: json(ref('Error')) },
      E403: { description: '`forbidden` — the key lacks the required scope.', content: json(ref('Error')) },
      E404: { description: '`not_found` — no such resource in this account.', content: json(ref('Error')) },
      E429: {
        description: '`rate_limited` — over 120 requests/minute for this key. See `Retry-After`.',
        headers: {
          'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until you can retry.' },
          'X-RateLimit-Limit': { schema: { type: 'integer' } },
          'X-RateLimit-Remaining': { schema: { type: 'integer' } },
          'X-RateLimit-Reset': { schema: { type: 'integer' }, description: 'Unix seconds when the window resets.' },
        },
        content: json(ref('Error')),
      },
      E500: { description: '`internal` — server error.', content: json(ref('Error')) },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                description: 'Stable machine code — branch on this.',
                example: 'forbidden',
              },
              message: { type: 'string', description: 'Human-readable; may change.' },
            },
          },
        },
      },
      PageMeta: {
        type: 'object',
        properties: {
          next_cursor: {
            type: ['string', 'null'],
            description: 'Pass as `cursor` to get the next page. `null` on the last page.',
          },
        },
      },
      Me: {
        type: 'object',
        properties: {
          account: {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
          },
          key: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              scopes: { type: 'array', items: { type: 'string', enum: [...API_SCOPES] } },
            },
          },
        },
      },
      SendMessageRequest: {
        type: 'object',
        required: ['to'],
        properties: {
          to: { type: 'string', description: 'Recipient phone in E.164 format.', example: '+14155550123' },
          type: {
            type: 'string',
            enum: ['text', 'template', 'image', 'video', 'document', 'audio'],
            default: 'text',
          },
          text: { type: 'string', description: 'Message body, or the caption for media.' },
          media_url: { type: 'string', format: 'uri', description: 'Public file URL. Required for media types.' },
          filename: { type: 'string', description: 'Shown to the recipient for `document`.' },
          template: {
            type: 'object',
            description: 'Required when `type` is `template`.',
            required: ['name'],
            properties: {
              name: { type: 'string', example: 'order_update' },
              language: { type: 'string', example: 'en_US' },
              params: {
                description: 'Array of positional body variables, or a structured object for header/body/buttons.',
                oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'object' }],
              },
            },
          },
          reply_to_message_id: {
            type: 'string',
            format: 'uuid',
            description: 'Quote an earlier message in the same conversation.',
          },
          name: { type: 'string', description: 'Name for the contact if one is created.' },
        },
      },
      SendMessageResult: {
        type: 'object',
        properties: {
          message_id: { type: 'string', format: 'uuid' },
          whatsapp_message_id: { type: 'string' },
          conversation_id: { type: 'string', format: 'uuid' },
          contact_id: { type: 'string', format: 'uuid' },
          contact_created: { type: 'boolean' },
        },
      },
      Contact: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          phone: { type: 'string', example: '+14155550123' },
          name: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          company: { type: ['string', 'null'] },
          avatar_url: { type: ['string', 'null'] },
          tags: { type: 'array', items: tagSchema },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      CreateContactRequest: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', description: 'E.164 format.' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          company: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag names; created if missing.' },
        },
      },
      UpdateContactRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          company: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Replaces all tags.' },
        },
      },
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          contact_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['open', 'pending', 'closed'] },
          assigned_agent_id: { type: ['string', 'null'], format: 'uuid' },
          last_message_text: { type: ['string', 'null'] },
          last_message_at: { type: ['string', 'null'], format: 'date-time' },
          unread_count: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          contact: {
            type: ['object', 'null'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              phone: { type: 'string' },
              name: { type: ['string', 'null'] },
              email: { type: ['string', 'null'] },
              company: { type: ['string', 'null'] },
              tags: { type: 'array', items: tagSchema },
            },
          },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          conversation_id: { type: 'string', format: 'uuid' },
          direction: { type: 'string', enum: ['inbound', 'outbound'] },
          sender_type: { type: 'string' },
          content_type: { type: 'string', example: 'text' },
          content_text: { type: ['string', 'null'] },
          media_url: { type: ['string', 'null'] },
          template_name: { type: ['string', 'null'] },
          whatsapp_message_id: { type: ['string', 'null'] },
          status: { type: 'string', description: 'Delivery state, e.g. sent, delivered, read, failed.' },
          reply_to_message_id: { type: ['string', 'null'], format: 'uuid' },
          interactive_reply_id: { type: ['string', 'null'] },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      CreateBroadcastRequest: {
        type: 'object',
        required: ['template_name', 'recipients'],
        properties: {
          name: { type: 'string', description: 'Label shown in the dashboard.' },
          template_name: { type: 'string', description: 'An approved WhatsApp template.' },
          template_language: { type: 'string', default: 'en_US' },
          recipients: {
            type: 'array',
            minItems: 1,
            maxItems: 1000,
            items: {
              type: 'object',
              required: ['to'],
              properties: {
                to: { type: 'string', description: 'E.164 phone.' },
                params: { type: 'array', items: { type: 'string' }, description: 'Template body variables.' },
              },
            },
          },
        },
      },
      BroadcastAccepted: {
        type: 'object',
        properties: {
          broadcast_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', example: 'sending' },
          total_recipients: { type: 'integer' },
          accepted: { type: 'integer' },
          rejected: { type: 'integer' },
        },
      },
      Broadcast: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: ['string', 'null'] },
          template_name: { type: 'string' },
          template_language: { type: 'string' },
          status: { type: 'string', example: 'sent' },
          total_recipients: { type: 'integer' },
          sent_count: { type: 'integer' },
          delivered_count: { type: 'integer' },
          read_count: { type: 'integer' },
          replied_count: { type: 'integer' },
          failed_count: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      WebhookEndpoint: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string', enum: [...WEBHOOK_EVENTS] } },
          is_active: { type: 'boolean' },
          last_delivery_at: { type: ['string', 'null'], format: 'date-time' },
          failure_count: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      WebhookEndpointWithSecret: {
        allOf: [
          ref('WebhookEndpoint'),
          {
            type: 'object',
            properties: {
              secret: { type: 'string', description: 'Signing secret (`whsec_…`). Shown only once.' },
            },
          },
        ],
      },
      CreateWebhookRequest: {
        type: 'object',
        required: ['url', 'events'],
        properties: {
          url: { type: 'string', format: 'uri', description: 'Public `https://` URL.' },
          events: { type: 'array', items: { type: 'string', enum: [...WEBHOOK_EVENTS] } },
        },
      },
      UpdateWebhookRequest: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string', enum: [...WEBHOOK_EVENTS] } },
          is_active: { type: 'boolean' },
        },
      },
      Template: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          language: { type: 'string', example: 'en' },
          category: { type: 'string', enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] },
          status: {
            type: 'string',
            enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'PENDING_DELETION'],
          },
        },
      },
      TemplateDetail: {
        allOf: [
          ref('Template'),
          {
            type: 'object',
            properties: {
              rejection_reason: { type: ['string', 'null'] },
              body_text: { type: 'string' },
              updated_at: { type: ['string', 'null'], format: 'date-time' },
            },
          },
        ],
      },
      CreateTemplateRequest: {
        type: 'object',
        required: ['name', 'category', 'language', 'body_text'],
        properties: {
          name: { type: 'string', description: 'Lowercase letters, digits and underscores.', example: 'birthday_gift' },
          category: { type: 'string', description: 'MARKETING or UTILITY, any case.', example: 'MARKETING' },
          language: { type: 'string', example: 'en' },
          body_text: { type: 'string', description: 'Use {{1}}, {{2}}… for variables.' },
          sample_values: {
            type: 'object',
            description: 'One sample per variable, required by Meta for review.',
            properties: {
              body: { type: 'array', items: { type: 'string' } },
              header: { type: 'array', items: { type: 'string' } },
            },
          },
          header_type: { type: 'string', enum: ['text', 'image', 'video', 'document'] },
          header_content: { type: 'string' },
          header_media_url: { type: 'string', format: 'uri' },
          footer_text: { type: 'string' },
          buttons: { type: 'array', items: { type: 'object' } },
        },
      },
      ConnectTokenRequest: {
        type: 'object',
        required: ['client_id', 'client_secret', 'code', 'redirect_uri'],
        properties: {
          client_id: { type: 'string' },
          client_secret: { type: 'string' },
          code: { type: 'string', description: 'The one-time code from the redirect.' },
          redirect_uri: { type: 'string', description: 'Exactly the redirect_uri the code was issued for.' },
        },
      },
      ConnectTokenResult: {
        type: 'object',
        properties: {
          api_key: { type: 'string', description: 'Shown once. Store it securely.' },
          account: {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' }, name: { type: ['string', 'null'] } },
          },
          phone_number: { type: ['string', 'null'], description: 'The connected WhatsApp number, if known.' },
          scopes: { type: 'array', items: { type: 'string', enum: [...API_SCOPES] } },
        },
      },
      WebhookDelivery: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Unique per delivery — dedupe on this.' },
          event: { type: 'string', enum: [...WEBHOOK_EVENTS] },
          occurred_at: { type: 'string', format: 'date-time' },
          account_id: { type: 'string', format: 'uuid' },
          data: {
            type: 'object',
            description:
              '`message.received`: conversation_id, contact_id, whatsapp_message_id, content_type, text. ' +
              '`message.status_updated`: whatsapp_message_id, conversation_id, status. ' +
              '`conversation.created`: conversation_id, contact_id.',
          },
        },
      },
    },
  },
} as const;
