// Usage: node scripts/seed-demo.mjs   (needs .env.local with the service-role key)
// Seeds a clearly-labelled DEMO account (own isolated account_id) for UI preview.
// No WhatsApp sends, no real tokens, no connections to external services.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '');
const require = createRequire(ROOT + '/package.json');
const { createClient } = require('@supabase/supabase-js');

const env = Object.fromEntries(
  fs.readFileSync(ROOT + '/.env.local', 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = 'support.repeatgrow+demo@gmail.com';
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// ---- 1. user: create, or resume my own half-seeded demo user ----
const existing = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
const found = existing.data?.users?.find((u) => u.email?.toLowerCase() === EMAIL);
const password = crypto.randomBytes(9).toString('base64url') + 'Aa1!';
let userId;
if (found) {
  if (Date.now() - new Date(found.created_at).getTime() > 3600e3) { console.log('USER_EXISTS (old): not touching it.'); process.exit(2); }
  userId = found.id;
  const up = await db.auth.admin.updateUserById(userId, { password });
  if (up.error) throw new Error('updateUser: ' + up.error.message);
} else {
  const created = await db.auth.admin.createUser({
    email: EMAIL, password, email_confirm: true,
    user_metadata: { full_name: 'Demo Admin', business_name: 'Demo Store (test account)', mobile_number: '+919000000000', nature_of_business: 'E-commerce', team_size: '2-10' },
  });
  if (created.error) throw new Error('createUser: ' + created.error.message);
  userId = created.data.user.id;
}

const profile = must(await db.from('profiles').select('*').eq('user_id', userId).single(), 'profile');
const accountId = profile.account_id;
// resume safety: clear anything a previous partial run left in this demo account
for (const t of ['contacts', 'tags', 'saved_replies', 'message_templates', 'broadcasts', 'automations', 'whatsapp_forms', 'whatsapp_orders', 'notifications', 'deals', 'conversations']) {
  await db.from(t).delete().eq('account_id', accountId);
}

fs.writeFileSync(
  ROOT + '/.env.demo-login',
  `Demo login (testing only)\r\nEmail: ${EMAIL}\r\nPassword: ${password}\r\n`,
);

// plan: pro for a year so nothing is gated/trial-bannered
must(await db.from('accounts').update({
  plan: 'pro',
  plan_expires_at: new Date(Date.now() + 365 * 864e5).toISOString(),
  trial_ends_at: null,
  summary_enabled: true,
  summary_emails: [EMAIL],
}).eq('id', accountId), 'account');

const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
const A = { account_id: accountId };
const AU = { account_id: accountId, user_id: userId };

// ---- 2. tags ----
const tagDefs = [
  ['VIP', '#f59e0b'], ['New lead', '#3b82f6'], ['Repeat buyer', '#16a34a'],
  ['Wholesale', '#8b5cf6'], ['Needs follow-up', '#ef4444'],
];
const tags = must(await db.from('tags').insert(tagDefs.map(([name, color]) => ({ ...AU, name, color }))).select(), 'tags');
const tag = Object.fromEntries(tags.map((t) => [t.name, t.id]));

// ---- 3. contacts ----
const people = [
  ['Aarav Sharma', '919810000001', 'aarav@example.com', 'Sharma Traders', ['VIP', 'Repeat buyer']],
  ['Priya Nair', '919810000002', 'priya@example.com', 'Nair Boutique', ['New lead']],
  ['Rohan Mehta', '919810000003', 'rohan@example.com', 'Mehta & Co', ['Wholesale']],
  ['Sneha Kapoor', '919810000004', 'sneha@example.com', null, ['Repeat buyer']],
  ['Vikram Singh', '919810000005', 'vikram@example.com', 'Singh Electronics', ['Needs follow-up']],
  ['Ananya Iyer', '919810000006', 'ananya@example.com', null, ['New lead']],
  ['Karan Malhotra', '919810000007', 'karan@example.com', 'KM Foods', ['VIP']],
  ['Isha Reddy', '919810000008', 'isha@example.com', null, ['Repeat buyer', 'VIP']],
  ['Dev Patel', '919810000009', 'dev@example.com', 'Patel Hardware', ['Wholesale']],
  ['Meera Joshi', '919810000010', 'meera@example.com', null, ['New lead']],
  ['Arjun Das', '919810000011', 'arjun@example.com', 'Das Studio', ['Needs follow-up']],
  ['Neha Gupta', '919810000012', 'neha@example.com', null, []],
];
const contacts = must(await db.from('contacts').insert(
  people.map(([name, phone, email, company]) => ({ ...AU, name, phone: '+' + phone, email, company })),
).select(), 'contacts');
const byName = Object.fromEntries(contacts.map((c) => [c.name, c]));
const ctRows = [];
people.forEach(([name, , , , tl]) => tl.forEach((t) => ctRows.push({ contact_id: byName[name].id, tag_id: tag[t] })));
must(await db.from('contact_tags').insert(ctRows), 'contact_tags');
must(await db.from('contact_notes').insert([
  { ...AU, contact_id: byName['Aarav Sharma'].id, note_text: 'Prefers WhatsApp over calls. Orders monthly, usually 20+ units.' },
  { ...AU, contact_id: byName['Vikram Singh'].id, note_text: 'Asked for a bulk quote — follow up on Friday.' },
  { ...AU, contact_id: byName['Karan Malhotra'].id, note_text: 'Interested in the festive combo pack.' },
]), 'notes');

// ---- 4. conversations + messages ----
const convScripts = [
  ['Aarav Sharma', 'open', 2, [
    ['customer', 'Hi, is the festive combo still available?'],
    ['agent', 'Hello Aarav! Yes, it is. Shall I send you the details?'],
    ['customer', 'Please do. Also what is the delivery time to Delhi?'],
  ]],
  ['Priya Nair', 'open', 1, [
    ['customer', 'Hello, I saw your ad. Do you ship to Kochi?'],
    ['bot', 'Hi Priya! 👋 Yes, we deliver across India. What are you looking for?'],
    ['customer', 'Cotton kurtis, around 10 pieces.'],
  ]],
  ['Rohan Mehta', 'pending', 0, [
    ['customer', 'Can you share the wholesale price list?'],
    ['agent', 'Sure Rohan, sending it over in a minute.'],
    ['agent', 'Price list attached. Minimum order is 50 pieces.'],
  ]],
  ['Sneha Kapoor', 'closed', 0, [
    ['customer', 'My order arrived, thank you!'],
    ['agent', 'Glad to hear it Sneha! Enjoy 😊'],
  ]],
  ['Vikram Singh', 'open', 3, [
    ['customer', 'Any update on the bulk quote?'],
    ['customer', 'I need it by Friday please.'],
    ['customer', 'Hello?'],
  ]],
  ['Ananya Iyer', 'open', 1, [
    ['customer', 'Do you have this in blue?'],
  ]],
  ['Karan Malhotra', 'open', 0, [
    ['customer', 'Interested in the festive combo pack.'],
    ['agent', 'Great choice Karan! It is ₹1,499 with free delivery.'],
    ['customer', 'Okay, send me a payment link.'],
  ]],
];
const convs = {};
for (const [name, status, unread, msgs] of convScripts) {
  const last = msgs[msgs.length - 1][1];
  const c = must(await db.from('conversations').insert({
    ...AU, contact_id: byName[name].id, status, unread_count: unread,
    assigned_agent_id: status === 'closed' ? null : userId,
    last_message_text: last, last_message_at: ago(5 + Math.floor(Math.random() * 600)),
  }).select().single(), 'conversation');
  convs[name] = c;
  must(await db.from('messages').insert(msgs.map(([sender_type, content_text], i) => ({
    conversation_id: c.id, sender_type, sender_id: sender_type === 'agent' ? userId : null,
    content_type: 'text', content_text, status: sender_type === 'customer' ? 'delivered' : 'read',
    created_at: ago(600 - i * 20 - Math.floor(Math.random() * 10)),
  }))), 'messages');
}

// ---- 5. pipeline (reuse if the signup trigger created one) ----
let pipe = (await db.from('pipelines').select('*').eq('account_id', accountId).limit(1)).data?.[0];
if (!pipe) pipe = must(await db.from('pipelines').insert({ ...AU, name: 'Sales pipeline' }).select().single(), 'pipeline');
let stages = (await db.from('pipeline_stages').select('*').eq('pipeline_id', pipe.id).order('position')).data ?? [];
if (stages.length === 0) {
  stages = must(await db.from('pipeline_stages').insert([
    ['New Lead', '#3b82f6'], ['Qualified', '#8b5cf6'], ['Proposal Sent', '#f59e0b'], ['Negotiation', '#ec4899'], ['Won', '#16a34a'],
  ].map(([name, color], position) => ({ pipeline_id: pipe.id, name, color, position }))).select().order('position'), 'stages');
}
const st = (i) => stages[Math.min(i, stages.length - 1)].id;
const dealDefs = [
  ['Festive combo — Karan', 'Karan Malhotra', 2, 1499, 'open'],
  ['Bulk order — Vikram', 'Vikram Singh', 3, 85000, 'open'],
  ['Wholesale kurtis — Rohan', 'Rohan Mehta', 2, 42000, 'open'],
  ['Boutique restock — Priya', 'Priya Nair', 1, 18500, 'open'],
  ['Monthly supply — Aarav', 'Aarav Sharma', 4, 26000, 'won'],
  ['Hardware kit — Dev', 'Dev Patel', 0, 12500, 'open'],
  ['Studio merch — Arjun', 'Arjun Das', 1, 9800, 'open'],
  ['Gift hampers — Isha', 'Isha Reddy', 4, 15400, 'won'],
  ['Sample order — Ananya', 'Ananya Iyer', 0, 2200, 'open'],
];
must(await db.from('deals').insert(dealDefs.map(([title, who, s, value, status], i) => ({
  ...AU, pipeline_id: pipe.id, stage_id: st(s), contact_id: byName[who].id, title, value, currency: 'INR',
  status, assigned_to: profile.id, expected_close_date: new Date(Date.now() + (i + 3) * 864e5).toISOString().slice(0, 10),
}))), 'deals');

// ---- 6. saved replies ----
must(await db.from('saved_replies').insert([
  ['hi', 'Greeting', 'Hi {{name}}! 👋 Thanks for reaching out to Demo Store. How can we help?'],
  ['price', 'Price list', 'Our price list is attached. Prices include GST. Let us know what you would like to order!'],
  ['ship', 'Shipping', 'We ship across India in 3–5 working days. Delivery is free above ₹999.'],
  ['thanks', 'Thank you', 'Thank you for shopping with us! Please share a review if you liked it 🙏'],
].map(([shortcut, title, body]) => ({ ...A, shortcut, title, body, created_by: userId }))), 'saved_replies');

// ---- 7. message templates (local rows only, not submitted to Meta) ----
must(await db.from('message_templates').insert([
  ['festive_offer', 'Marketing', 'APPROVED', 'Hi {{1}}! 🎉 Our festive sale is live — flat 20% off on all orders till Sunday. Reply YES to get the catalog.', 'Reply STOP to opt out', 'GREEN'],
  ['order_confirmation', 'Utility', 'APPROVED', 'Hi {{1}}, your order {{2}} is confirmed! We will notify you once it ships. 📦', null, 'GREEN'],
  ['shipping_update', 'Utility', 'APPROVED', 'Good news {{1}}! Your order {{2}} is on the way. Track it here: {{3}}', null, 'GREEN'],
  ['cart_reminder', 'Marketing', 'PENDING', 'Hey {{1}}, you left something in your cart. Complete your order today and get free delivery! 🛒', null, null],
  ['feedback_request', 'Marketing', 'DRAFT', 'Hi {{1}}, how was your experience with us? Reply with a rating from 1 to 5. ⭐', null, null],
].map(([name, category, status, body_text, footer_text, quality_score]) => ({
  ...AU, name, category, status, body_text, footer_text, quality_score, language: 'en_US',
}))), 'templates');

// ---- 8. broadcasts ----
const bcDefs = [
  ['Diwali Sale Blast', 'festive_offer', 'sent', 12, 12, 11, 8, 3, 0],
  ['Order updates — October', 'shipping_update', 'sent', 8, 8, 8, 6, 1, 0],
  ['Cart recovery', 'cart_reminder', 'draft', 0, 0, 0, 0, 0, 0],
];
for (const [name, template_name, status, total, sent, delivered, read, replied, failed] of bcDefs) {
  const b = must(await db.from('broadcasts').insert({
    ...AU, name, template_name, template_language: 'en_US', status,
    total_recipients: total, sent_count: sent, delivered_count: delivered, read_count: read, replied_count: replied, failed_count: failed,
  }).select().single(), 'broadcast');
  if (total > 0) {
    must(await db.from('broadcast_recipients').insert(contacts.slice(0, total).map((c, i) => ({
      broadcast_id: b.id, contact_id: c.id, status: i < replied ? 'replied' : i < read ? 'read' : 'delivered',
      sent_at: ago(2000), delivered_at: ago(1990), read_at: i < read ? ago(1900) : null,
    }))), 'recipients');
  }
}

// ---- 9. automations (not wired to any real WhatsApp number) ----
const autos = [
  ['Welcome Message', 'Auto-reply to first-time contacts with a greeting.', 'first_inbound_message', {}, true, 41, [
    ['send_message', { text: 'Hi! 👋 Thanks for reaching out. We will get back to you shortly.' }],
    ['add_tag', { tag_id: tag['New lead'] }],
  ]],
  ['Out of Office', 'Auto-reply during off-hours so nobody is left waiting.', 'new_message_received', {}, true, 17, [
    ['send_message', { text: 'We are away right now and will reply first thing in the morning. 🌙' }],
  ]],
  ['VIP follow-up', 'Create a deal when a contact is tagged VIP.', 'tag_added', { tag_id: tag['VIP'] }, false, 6, [
    ['create_deal', { title: 'VIP opportunity', value: 0 }],
  ]],
];
for (const [name, description, trigger_type, trigger_config, is_active, execution_count, steps] of autos) {
  const a = must(await db.from('automations').insert({
    ...AU, name, description, trigger_type, trigger_config, is_active, execution_count, last_executed_at: ago(180),
  }).select().single(), 'automation');
  must(await db.from('automation_steps').insert(steps.map(([step_type, step_config], position) => ({
    automation_id: a.id, step_type, step_config, position,
  }))), 'steps');
  must(await db.from('automation_logs').insert([0, 1, 2].map((k) => ({
    ...AU, automation_id: a.id, contact_id: contacts[k].id, trigger_event: trigger_type,
    steps_executed: steps.map(([step_type]) => ({ step_id: 'demo', step_type, status: 'success' })),
    status: 'success', created_at: ago(300 + k * 120),
  }))), 'logs');
}

// ---- 10. forms ----
must(await db.from('whatsapp_forms').insert([
  { ...A, name: 'Lead capture', title: 'Tell us about you', intro: 'Takes less than a minute.', submit_label: 'Submit', category: 'LEAD_GENERATION', status: 'draft', created_by: userId,
    fields: [
      { key: 'full_name', label: 'Full name', type: 'text', required: true, save_to: 'name' },
      { key: 'email', label: 'Email', type: 'email', required: false, save_to: 'email' },
      { key: 'interest', label: 'What are you interested in?', type: 'dropdown', required: true, options: ['Retail', 'Wholesale', 'Gifting'] },
    ] },
  { ...A, name: 'Feedback', title: 'How did we do?', intro: 'Your feedback helps us improve.', submit_label: 'Send', category: 'SURVEY', status: 'draft', created_by: userId,
    fields: [
      { key: 'rating', label: 'Rating (1-5)', type: 'number', required: true },
      { key: 'comments', label: 'Comments', type: 'textarea', required: false },
    ] },
]), 'forms');

// ---- 11. orders + commerce + AI chatbot ----
must(await db.from('commerce_settings').upsert({ ...A, payment_mode: 'upi_id', upi_id: 'demostore@okaxis', upi_name: 'Demo Store', goods_type: 'physical-goods' }), 'commerce');
const orderDefs = [
  ['Aarav Sharma', [{ name: 'Festive combo', quantity: 2, price: 1499 }], 'completed', 'paid'],
  ['Karan Malhotra', [{ name: 'Festive combo', quantity: 1, price: 1499 }], 'pending', 'requested'],
  ['Sneha Kapoor', [{ name: 'Cotton kurti', quantity: 3, price: 799 }], 'shipped', 'paid'],
  ['Isha Reddy', [{ name: 'Gift hamper', quantity: 1, price: 2499 }], 'processing', 'paid'],
  ['Rohan Mehta', [{ name: 'Wholesale pack', quantity: 5, price: 3200 }], 'pending', 'unpaid'],
];
must(await db.from('whatsapp_orders').insert(orderDefs.map(([who, items, status, payment_status], i) => {
  const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
  return {
    ...A, reference_id: `ORD-${1001 + i}`, contact_id: byName[who].id, conversation_id: convs[who]?.id ?? null,
    source: 'agent', items, subtotal: total, total, currency: 'INR', status, payment_status, payment_mode: 'upi_id',
    created_by: userId, created_at: ago(3000 - i * 400), paid_at: payment_status === 'paid' ? ago(2800 - i * 400) : null,
  };
})), 'orders');
must(await db.from('ai_chatbot_settings').upsert({
  ...A, enabled: false, bot_name: 'Demo Assistant',
  knowledge_base: 'Demo Store sells cotton kurtis, festive combo packs and gift hampers. Free delivery above ₹999. Delivery takes 3–5 working days across India. Returns accepted within 7 days.',
  instructions: 'Be friendly and brief. Reply in the language the customer uses.',
}), 'chatbot');

// ---- 12. notifications ----
must(await db.from('notifications').insert([
  { ...A, user_id: userId, type: 'conversation_assigned', conversation_id: convs['Aarav Sharma'].id, contact_id: byName['Aarav Sharma'].id, title: 'New conversation assigned', body: 'Aarav Sharma: Please do. Also what is the delivery time to Delhi?' },
  { ...A, user_id: userId, type: 'conversation_assigned', conversation_id: convs['Vikram Singh'].id, contact_id: byName['Vikram Singh'].id, title: 'New conversation assigned', body: 'Vikram Singh: Hello?' },
]), 'notifications');

console.log('DONE. account', accountId);
