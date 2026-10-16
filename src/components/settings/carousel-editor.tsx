'use client';

// Card editor for carousel templates (template manager → "Carousel").
// 2–10 cards; one media type and one button layout shared by every
// card (Meta rule), with per-card image/video, text, button labels and
// links. Media uploads go to the account's chat-media bucket; the
// submit pipeline turns each link into a Meta upload handle.

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageIcon, Loader2, Plus, Trash2, Upload, Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MEDIA_MAX_BYTES_BY_KIND, uploadAccountMedia } from '@/lib/storage/upload-media';
import { CAROUSEL_LIMITS } from '@/lib/whatsapp/carousel';
import type { CarouselCard, TemplateButton } from '@/types';

type ButtonKind = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

const BUTTON_KIND_LABEL: Record<ButtonKind, string> = {
  QUICK_REPLY: 'Quick reply',
  URL: 'Website',
  PHONE_NUMBER: 'Call',
};

function emptyButton(kind: ButtonKind): TemplateButton {
  if (kind === 'URL') return { type: 'URL', text: 'Shop now', url: '' };
  if (kind === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '' };
  return { type: 'QUICK_REPLY', text: 'Interested' };
}

export function emptyCarouselCard(layout: ButtonKind[] = ['URL'], header: 'image' | 'video' = 'image'): CarouselCard {
  return { header_type: header, media_url: null, body_text: '', sample_values: [], buttons: layout.map(emptyButton) };
}

function varCount(text: string): number {
  return new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
}

export function CarouselEditor({ cards, onChange }: { cards: CarouselCard[]; onChange: (cards: CarouselCard[]) => void }) {
  const [uploading, setUploading] = useState<number | null>(null);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const header = cards[0]?.header_type ?? 'image';
  const layout = useMemo(() => (cards[0]?.buttons ?? []).map((b) => b.type as ButtonKind), [cards]);

  const update = (i: number, patch: Partial<CarouselCard>) =>
    onChange(cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const updateButton = (cardIndex: number, buttonIndex: number, patch: Partial<TemplateButton>) =>
    update(cardIndex, {
      buttons: cards[cardIndex].buttons.map((b, j) => (j === buttonIndex ? ({ ...b, ...patch } as TemplateButton) : b)),
    });

  const setHeader = (type: 'image' | 'video') =>
    onChange(cards.map((c) => ({ ...c, header_type: type, media_url: c.header_type === type ? c.media_url : null, header_handle: null })));

  const addLayoutButton = (kind: ButtonKind) =>
    onChange(cards.map((c) => ({ ...c, buttons: [...c.buttons, emptyButton(kind)] })));

  const removeLayoutButton = (j: number) =>
    onChange(cards.map((c) => ({ ...c, buttons: c.buttons.filter((_, idx) => idx !== j) })));

  async function upload(i: number, file: File) {
    const allowed = header === 'image' ? ['image/jpeg', 'image/png'] : ['video/mp4'];
    if (!allowed.includes(file.type)) {
      toast.error(header === 'image' ? 'Use a JPEG or PNG image.' : 'Use an MP4 video.');
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND[header]) {
      toast.error(`File is too large — Meta's limit is ${MEDIA_MAX_BYTES_BY_KIND[header] / 1024 / 1024} MB.`);
      return;
    }
    setUploading(i);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      update(i, { media_url: publicUrl, header_handle: null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Card media</Label>
          <div className="flex gap-2">
            {(['image', 'video'] as const).map((t) => (
              <Button key={t} type="button" size="sm" variant={header === t ? 'default' : 'outline'} onClick={() => setHeader(t)}>
                {t === 'image' ? <ImageIcon className="size-4" /> : <Video className="size-4" />}
                {t === 'image' ? 'Images' : 'Videos'}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Buttons on every card (1–2)</Label>
          <div className="flex flex-wrap gap-2">
            {layout.map((kind, j) => (
              <span key={j} className="inline-flex items-center gap-1 rounded-xl border border-border px-2 py-1 text-xs">
                {BUTTON_KIND_LABEL[kind]}
                {layout.length > 1 && (
                  <button type="button" aria-label="Remove button" onClick={() => removeLayoutButton(j)} className="text-muted-foreground hover:text-foreground">
                    ×
                  </button>
                )}
              </span>
            ))}
            {layout.length < CAROUSEL_LIMITS.maxButtonsPerCard &&
              (['QUICK_REPLY', 'URL', 'PHONE_NUMBER'] as ButtonKind[]).map((kind) => (
                <Button key={kind} type="button" size="sm" variant="ghost" onClick={() => addLayoutButton(kind)}>
                  <Plus className="size-3.5" />
                  {BUTTON_KIND_LABEL[kind]}
                </Button>
              ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {cards.map((card, i) => {
          const vars = varCount(card.body_text);
          return (
            <div key={i} className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Card {i + 1}</p>
                {cards.length > CAROUSEL_LIMITS.minCards && (
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove card ${i + 1}`} onClick={() => onChange(cards.filter((_, idx) => idx !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                <div>
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                    {card.media_url ? (
                      header === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.media_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <video src={card.media_url} className="h-full w-full object-cover" muted />
                      )
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No {header}</span>
                    )}
                  </div>
                  <input
                    ref={(el) => {
                      fileRefs.current[i] = el;
                    }}
                    type="file"
                    accept={header === 'image' ? 'image/jpeg,image/png' : 'video/mp4'}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(i, f);
                      e.target.value = '';
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" className="mt-2 w-full" disabled={uploading === i} onClick={() => fileRefs.current[i]?.click()}>
                    {uploading === i ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    Upload
                  </Button>
                </div>
                <div className="space-y-2">
                  <Input
                    value={card.media_url ?? ''}
                    onChange={(e) => update(i, { media_url: e.target.value.trim() || null, header_handle: null })}
                    placeholder={`…or paste an https:// ${header} link`}
                    className="bg-muted border-border text-foreground"
                  />
                  <Textarea
                    value={card.body_text}
                    onChange={(e) => update(i, { body_text: e.target.value })}
                    placeholder="Card text, e.g. Cotton kurta — ₹899"
                    rows={2}
                    maxLength={CAROUSEL_LIMITS.cardBodyMax}
                    className="bg-muted border-border text-foreground"
                  />
                  <p className={cn('text-right text-[11px]', card.body_text.length > CAROUSEL_LIMITS.cardBodyMax - 10 ? 'text-amber-600' : 'text-muted-foreground')}>
                    {card.body_text.length}/{CAROUSEL_LIMITS.cardBodyMax}
                  </p>
                  {vars > 0 &&
                    Array.from({ length: vars }, (_, v) => (
                      <Input
                        key={v}
                        value={card.sample_values?.[v] ?? ''}
                        onChange={(e) => {
                          const next = [...(card.sample_values ?? [])];
                          next[v] = e.target.value;
                          update(i, { sample_values: next });
                        }}
                        placeholder={`Value for {{${v + 1}}} (sent to everyone)`}
                        className="bg-muted border-border text-foreground"
                      />
                    ))}
                  {card.buttons.map((b, j) => (
                    <div key={j} className="grid gap-2 sm:grid-cols-[1fr_1.5fr]">
                      <Input
                        value={b.text}
                        maxLength={CAROUSEL_LIMITS.buttonTextMax}
                        onChange={(e) => updateButton(i, j, { text: e.target.value })}
                        placeholder={`${BUTTON_KIND_LABEL[b.type as ButtonKind]} label`}
                        className="bg-muted border-border text-foreground"
                      />
                      {b.type === 'URL' && (
                        <Input
                          value={b.url}
                          onChange={(e) => updateButton(i, j, { url: e.target.value })}
                          placeholder="https://yourshop.com/product"
                          className="bg-muted border-border text-foreground"
                        />
                      )}
                      {b.type === 'PHONE_NUMBER' && (
                        <Input
                          value={b.phone_number}
                          onChange={(e) => updateButton(i, j, { phone_number: e.target.value })}
                          placeholder="+919876543210"
                          className="bg-muted border-border text-foreground"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {cards.length < CAROUSEL_LIMITS.maxCards && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...cards, emptyCarouselCard(layout, header)])}>
          <Plus className="size-4" />
          Add card ({cards.length}/{CAROUSEL_LIMITS.maxCards})
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Every card shows the same media type and buttons (WhatsApp rule). Once approved, the carousel is sent with exactly
        these {cards.length} cards; the main message above is personalised per customer.
      </p>
    </div>
  );
}
