import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema, SITE_URL } from "@/lib/seo";
import { OPENAPI_SPEC } from "@/lib/api/v1/openapi";
import { API_SCOPES, SCOPE_DESCRIPTIONS } from "@/lib/api-keys/scopes";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_DESCRIPTIONS } from "@/lib/webhooks/events";
import { CodeBlock, CodeTabs, Toc } from "../docs-ui";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: "Docs", path: "/docs" },
  { name: "API reference", path: "/docs/api" },
]);

export const metadata: Metadata = {
  title: "API reference",
  description:
    "Repeat Grow REST API: send WhatsApp messages, manage contacts, read conversations, launch broadcasts, and receive webhooks. Includes an OpenAPI 3.1 spec.",
  alternates: { canonical: "/docs/api" },
  robots: { index: true, follow: true },
};

const BASE_URL = `${SITE_URL}/api/v1`;
const SPEC_URL = `${BASE_URL}/openapi.json`;
const SITE_HOST = new URL(SITE_URL).host;

const TOC = [
  { id: "quickstart", label: "Quickstart" },
  { id: "authentication", label: "Authentication" },
  { id: "errors", label: "Errors & limits" },
  { id: "pagination", label: "Pagination" },
  { id: "endpoints", label: "Endpoints" },
  { id: "webhooks", label: "Webhooks" },
  { id: "openapi", label: "OpenAPI spec" },
];

const METHODS = ["get", "post", "patch", "delete"] as const;
type Method = (typeof METHODS)[number];

type Param = { name: string; in: string; description?: string };
type Operation = {
  tags: readonly string[];
  operationId: string;
  summary: string;
  description?: string;
  "x-scope"?: string;
  security?: readonly unknown[];
  parameters?: readonly Param[];
  requestBody?: { content: { "application/json": { example?: unknown } } };
  responses: Record<
    string,
    { description?: string; content?: { "application/json"?: { example?: unknown } } } | { $ref: string }
  >;
};
type Endpoint = { method: Method; path: string; op: Operation; pathParams: readonly Param[] };

function collectEndpoints(): Endpoint[] {
  const out: Endpoint[] = [];
  for (const [path, item] of Object.entries(OPENAPI_SPEC.paths)) {
    const entry = item as Record<string, unknown>;
    const pathParams = (entry.parameters as readonly Param[] | undefined) ?? [];
    for (const method of METHODS) {
      const op = entry[method] as Operation | undefined;
      if (op) out.push({ method, path, op, pathParams });
    }
  }
  return out;
}

const slug = (e: Endpoint) => e.op.operationId.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function curlFor(e: Endpoint): string {
  const url = `${BASE_URL}${e.path}`;
  const lines = [`curl${e.method === "get" ? "" : ` -X ${e.method.toUpperCase()}`} "${url}"`];
  // Endpoints with `security: []` (Connect token exchange) take no API key.
  if (e.op.security?.length !== 0) lines.push(`  -H "Authorization: Bearer $REPEATGROW_API_KEY"`);
  const example = e.op.requestBody?.content["application/json"].example;
  if (example !== undefined) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${JSON.stringify(example, null, 2).replace(/\n/g, "\n  ")}'`);
  }
  return lines.join(" \\\n");
}

function successExample(e: Endpoint): { status: string; example: unknown } | null {
  for (const [status, res] of Object.entries(e.op.responses)) {
    if (!status.startsWith("2") || "$ref" in res) continue;
    const example = res.content?.["application/json"]?.example;
    if (example !== undefined) return { status, example };
  }
  return null;
}

/** Minimal inline markdown for spec descriptions: `code` and **bold**. */
function Md({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith("`") ? (
          <code key={i} className="ic">{p.slice(1, -1)}</code>
        ) : p.startsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          p
        )
      )}
    </>
  );
}

/** Drop the trailing "Scope: `x`." sentence — the scope is shown as a badge. */
const withoutScope = (text: string) => text.replace(/\s*Scope: `[^`]+`\.?\s*$/, "");

const Ic = ({ children }: { children: React.ReactNode }) => <code className="ic">{children}</code>;

const QUICKSTART_TABS = [
  {
    label: "cURL",
    code: `curl -X POST ${BASE_URL}/messages \\
  -H "Authorization: Bearer $REPEATGROW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "to": "+14155550123", "text": "Hi 👋 your order has shipped." }'`,
  },
  {
    label: "Node.js",
    code: `const res = await fetch("${BASE_URL}/messages", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.REPEATGROW_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ to: "+14155550123", text: "Hi 👋 your order has shipped." }),
});

const body = await res.json();
if (!res.ok) throw new Error(\`\${body.error.code}: \${body.error.message}\`);
console.log(body.data.message_id);`,
  },
  {
    label: "Python",
    code: `import os, requests

res = requests.post(
    "${BASE_URL}/messages",
    headers={"Authorization": f"Bearer {os.environ['REPEATGROW_API_KEY']}"},
    json={"to": "+14155550123", "text": "Hi 👋 your order has shipped."},
)
body = res.json()
if not res.ok:
    raise RuntimeError(f"{body['error']['code']}: {body['error']['message']}")
print(body["data"]["message_id"])`,
  },
  {
    label: "PHP",
    code: `<?php
$ch = curl_init("${BASE_URL}/messages");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("REPEATGROW_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode(["to" => "+14155550123", "text" => "Hi 👋 your order has shipped."]),
]);
$body = json_decode(curl_exec($ch), true);
echo $body["data"]["message_id"] ?? $body["error"]["message"];`,
  },
];

const VERIFY_TABS = [
  {
    label: "Node.js",
    code: `import crypto from "node:crypto";

// Pass the RAW request body (a string), not re-serialized JSON.
export function verifyRepeatGrowSignature(rawBody, header, secret) {
  const match = /t=(\\d+),v1=([0-9a-f]+)/.exec(header ?? "");
  if (!match) return false;
  const [, t, v1] = match;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay guard
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`,
  },
  {
    label: "Python",
    code: `import hmac, hashlib, re, time

def verify_repeatgrow_signature(raw_body: bytes, header: str, secret: str) -> bool:
    m = re.match(r"t=(\\d+),v1=([0-9a-f]+)", header or "")
    if not m:
        return False
    t, v1 = m.groups()
    if abs(time.time() - int(t)) > 300:  # replay guard
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)`,
  },
];

const ERROR_ROWS: [string, string, string][] = [
  ["400", "bad_request", "Malformed input. The message says which field."],
  ["400", "whatsapp_not_configured", "Connect WhatsApp in Settings first."],
  ["401", "unauthorized", "Missing, invalid, revoked, or expired key."],
  ["403", "forbidden", "The key doesn't have the scope this endpoint needs."],
  ["404", "not_found", "No such resource in your account."],
  ["429", "rate_limited", "Over 120 requests a minute. Wait Retry-After seconds."],
  ["500", "internal", "Server error. Safe to retry with backoff."],
  ["502", "meta_error", "WhatsApp rejected the send, e.g. outside the 24-hour window."],
];

export default function ApiReferencePage() {
  const endpoints = collectEndpoints();
  const groups = OPENAPI_SPEC.tags.map((t) => ({
    ...t,
    endpoints: endpoints.filter((e) => e.op.tags.includes(t.name)),
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />

      <header className="docs-hero">
        <div className="container">
          <div className="docs-crumbs">
            <Link href="/docs">Docs</Link> / API reference
          </div>
          <span className="eyebrow">REST API · v1</span>
          <h1>Repeat Grow API</h1>
          <p className="lede">
            Send WhatsApp messages, sync contacts, read conversations, launch broadcasts, and
            get real-time events from your own apps and scripts.
          </p>
          <p className="docs-site">
            For your Repeat Grow account at <a href={SITE_URL}>{SITE_HOST}</a> · Manage keys at{" "}
            <a href={`${SITE_URL}/settings?tab=api`}>{SITE_HOST}/settings?tab=api</a>
          </p>
          <div className="hero-actions">
            <span className="docs-pill">
              <span className="k">Base URL</span> {BASE_URL}
            </span>
            <a href={SPEC_URL} className="btn btn-ghost">OpenAPI spec</a>
          </div>
        </div>
      </header>

      <div className="container docs-body">
        <Toc
          items={TOC}
          switchTo={{ href: "/docs", title: "Help Center", text: "Guides for using Repeat Grow day to day." }}
        />

        <div className="docs-content">
          <section id="quickstart" className="docs-section">
            <h2><span className="num">01</span>Quickstart</h2>
            <p className="intro">Send your first WhatsApp message through the API in about two minutes.</p>
            <div className="prose">
              <ol className="steps">
                <li>
                  <b className="step-title">Create an API key</b>
                  <span className="step-body">
                    Log in at <a href={`${SITE_URL}/login`}>{SITE_HOST}</a> and open{" "}
                    <a href={`${SITE_URL}/settings?tab=api`} className="ui-path ui-link">Settings → API keys</a>, then click <b>New API key</b>.
                    Only admins and owners can do this.
                  </span>
                </li>
                <li>
                  <b className="step-title">Choose scopes and copy the key</b>
                  <span className="step-body">
                    Tick <Ic>messages:send</Ic> for this example. The key is shown only once, so store it somewhere safe.
                  </span>
                </li>
                <li>
                  <b className="step-title">Send a message</b>
                  <span className="step-body">Set the key as an environment variable and make the request.</span>
                </li>
              </ol>
            </div>
            <CodeBlock label="Terminal" code={`export REPEATGROW_API_KEY="RG-XXXX-..."\n\n# Check the key works\ncurl ${BASE_URL}/me -H "Authorization: Bearer $REPEATGROW_API_KEY"`} />
            <CodeTabs tabs={QUICKSTART_TABS} />
            <div className="callout warn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
              <div>
                WhatsApp only delivers free-form text and media within 24 hours of the customer&apos;s
                last message. To start a new conversation, send an approved <Ic>template</Ic>.
              </div>
            </div>
          </section>

          <section id="authentication" className="docs-section">
            <h2><span className="num">02</span>Authentication</h2>
            <div className="prose">
              <p>
                Send your key as a bearer token on every request:{" "}
                <Ic>Authorization: Bearer RG-XXXX-…</Ic>
              </p>
              <ul className="bullets">
                <li>Each key belongs to one account and can only do what its scopes allow.</li>
                <li>Repeat Grow stores only a hash, so a lost key can&apos;t be shown again. Revoke it and create a new one in{" "}<a href={`${SITE_URL}/settings?tab=api`}>{SITE_HOST}/settings?tab=api</a>.</li>
                <li>Keep keys on your server. Never put them in a website or mobile app.</li>
              </ul>
            </div>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Scope</th><th>Allows</th></tr></thead>
                <tbody>
                  {API_SCOPES.map((s) => (
                    <tr key={s}><td><Ic>{s}</Ic></td><td>{SCOPE_DESCRIPTIONS[s]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="intro">A key with no scopes can still call <Ic>GET /me</Ic> to check it works.</p>
          </section>

          <section id="errors" className="docs-section">
            <h2><span className="num">03</span>Errors &amp; rate limits</h2>
            <div className="prose">
              <p>Every response uses one of two shapes. Branch on <Ic>error.code</Ic>; the message is for people and may change.</p>
            </div>
            <CodeBlock label="Response shapes" code={`// Success\n{ "data": { ... } }\n\n// Error\n{ "error": { "code": "forbidden", "message": "This API key is missing the 'messages:send' scope" } }`} />
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Status</th><th>Code</th><th>Meaning</th></tr></thead>
                <tbody>
                  {ERROR_ROWS.map(([status, code, meaning]) => (
                    <tr key={code}><td>{status}</td><td><Ic>{code}</Ic></td><td>{meaning}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="prose" style={{ marginTop: 18 }}>
              <p>
                Each key can make <b>120 requests per minute</b>. A 429 response includes{" "}
                <Ic>Retry-After</Ic>, <Ic>X-RateLimit-Limit</Ic>, <Ic>X-RateLimit-Remaining</Ic>, and{" "}
                <Ic>X-RateLimit-Reset</Ic>.
              </p>
            </div>
          </section>

          <section id="pagination" className="docs-section">
            <h2><span className="num">04</span>Pagination</h2>
            <div className="prose">
              <p>
                List endpoints return up to <Ic>limit</Ic> items (default 50, max 100) and a{" "}
                <Ic>meta.next_cursor</Ic>. Pass it back as <Ic>cursor</Ic> for the next page. When it&apos;s{" "}
                <Ic>null</Ic>, you&apos;ve reached the end.
              </p>
            </div>
            <CodeBlock label="Example" code={`GET /api/v1/contacts?limit=100\n→ { "data": [ ... ], "meta": { "next_cursor": "eyJ..." } }\n\nGET /api/v1/contacts?limit=100&cursor=eyJ...\n→ { "data": [ ... ], "meta": { "next_cursor": null } }`} />
          </section>

          <section id="endpoints" className="docs-section">
            <h2><span className="num">05</span>Endpoints</h2>
            <p className="intro">All paths are relative to <Ic>{BASE_URL}</Ic>.</p>
            <div className="ep-index">
              {endpoints.map((e) => (
                <a key={slug(e)} href={`#${slug(e)}`}>
                  <span className={`method ${e.method}`}>{e.method.toUpperCase()}</span>
                  <span className="path">{e.path}</span>
                  <span className="sum">{e.op.summary}</span>
                </a>
              ))}
            </div>

            {groups.map((g) => (
              <div key={g.name} className="ep-group">
                <h3>{g.name}</h3>
                <p>{g.description}</p>
                {g.endpoints.map((e) => {
                  const success = successExample(e);
                  const params = [...e.pathParams, ...(e.op.parameters ?? [])];
                  return (
                    <article key={slug(e)} id={slug(e)} className="endpoint">
                      <div className="ep-head">
                        <span className={`method ${e.method}`}>{e.method.toUpperCase()}</span>
                        <span className="path">/api/v1{e.path}</span>
                        {e.op["x-scope"] ? <span className="scope">{e.op["x-scope"]}</span> : null}
                      </div>
                      <h4>{e.op.summary}</h4>
                      {e.op.description ? (
                        <p className="desc"><Md text={withoutScope(e.op.description)} /></p>
                      ) : null}
                      {params.length > 0 ? (
                        <ul className="params">
                          {params.map((p) => (
                            <li key={p.name}>
                              <span>
                                <span className="pname">{p.name}</span>{" "}
                                <span className="pin">{p.in}</span>
                              </span>
                              <span className="pdesc">{p.description ? <Md text={p.description} /> : null}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <CodeBlock label="Request" code={curlFor(e)} />
                      {success ? (
                        <CodeBlock label={`Response · ${success.status}`} code={JSON.stringify(success.example, null, 2)} />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ))}
            <p className="intro" style={{ marginTop: 24 }}>
              Full request and response schemas are in the <a href={SPEC_URL} className="docs-link">OpenAPI spec</a>.
            </p>
          </section>

          <section id="webhooks" className="docs-section">
            <h2><span className="num">06</span>Webhooks</h2>
            <p className="intro">Get notified the moment something happens instead of polling.</p>
            <div className="prose">
              <p>
                Register an HTTPS endpoint with <Ic>POST /api/v1/webhooks</Ic> (scope{" "}
                <Ic>webhooks:manage</Ic>). Repeat Grow POSTs to it when these events happen:
              </p>
            </div>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Event</th><th>Fires when</th></tr></thead>
                <tbody>
                  {WEBHOOK_EVENTS.map((ev) => (
                    <tr key={ev}><td><Ic>{ev}</Ic></td><td>{WEBHOOK_EVENT_DESCRIPTIONS[ev]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CodeBlock
              label="Delivery body"
              code={`{
  "id": "8f3c…",               // unique per delivery: dedupe on this
  "event": "message.received",
  "occurred_at": "2026-07-01T12:00:00.000Z",
  "account_id": "…",
  "data": {
    "conversation_id": "…",
    "contact_id": "…",
    "whatsapp_message_id": "wamid.…",
    "content_type": "text",
    "text": "Hi 👋"
  }
}`}
            />
            <h3>Verify the signature</h3>
            <div className="prose">
              <p>
                Each delivery has an <Ic>X-Wacrm-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</Ic> header, where{" "}
                <Ic>v1</Ic> is an HMAC-SHA256 of <Ic>{"{t}.{raw body}"}</Ic> using the <Ic>whsec_…</Ic>{" "}
                secret you got when creating the endpoint. Events also carry <Ic>X-Wacrm-Event</Ic> and{" "}
                <Ic>X-Wacrm-Webhook-Id</Ic>.
              </p>
            </div>
            <CodeTabs tabs={VERIFY_TABS} />
            <div className="prose" style={{ marginTop: 18 }}>
              <ul className="bullets">
                <li>Reply with any 2xx within 5 seconds. Redirects aren&apos;t followed.</li>
                <li>If a delivery fails we send it again after 1 min, 5 min, 30 min, 2 h and 6 h (same body, same <Ic>id</Ic>).</li>
                <li>See what was sent and why something failed with <Ic>GET /api/v1/webhooks/{"{id}"}/deliveries</Ic> (last 14 days).</li>
                <li>Events can repeat or arrive out of order, so dedupe on <Ic>id</Ic>.</li>
                <li>After 15 deliveries in a row fail every retry, an endpoint is switched off. Turn it back on with <Ic>PATCH</Ic> and <Ic>{`{ "is_active": true }`}</Ic>.</li>
                <li>The URL must be public HTTPS. Private and local addresses are refused.</li>
              </ul>
            </div>
          </section>

          <section id="openapi" className="docs-section">
            <h2><span className="num">07</span>OpenAPI spec</h2>
            <div className="prose">
              <p>
                The full API is described in a public OpenAPI 3.1 file at{" "}
                <a href={SPEC_URL}>{SPEC_URL}</a>. Import it into Postman, Insomnia, or Swagger UI,
                or generate a typed client.
              </p>
            </div>
            <CodeBlock
              label="Terminal"
              code={`# Download the spec\ncurl -o repeatgrow-openapi.json ${SPEC_URL}\n\n# Generate TypeScript types\nnpx openapi-typescript ${SPEC_URL} -o repeatgrow.d.ts`}
            />
          </section>

          <div className="help-box">
            <div>
              <h3>Building something?</h3>
              <p>Tell us what you&apos;re integrating and we&apos;ll help you get it working.</p>
            </div>
            <div className="actions">
              <a href="mailto:support@repeatgrow.com?subject=Repeat%20Grow%20API" className="btn btn-primary">Email the team</a>
              <Link href="/docs" className="btn btn-ghost">Help Center</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
