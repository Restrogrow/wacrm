'use client';

// Settings → QR & WhatsApp link: a wa.me link and printable QR code with
// a pre-filled first message, for shop counters, flyers, packaging and
// bios. Everything is generated in the browser; nothing is stored.

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Copy, Download, ExternalLink, Lightbulb, Loader2, QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  buildWaLink,
  normalizeWaNumber,
  qrFileName,
  WA_LINK_MAX_MESSAGE,
  WA_LINK_PRESETS,
} from '@/lib/wa-link';
import { SettingsPanelHead } from './settings-panel-head';

const COLORS = [
  { id: 'black', label: 'Black', value: '#111111' },
  { id: 'green', label: 'Green', value: '#087a4a' },
  { id: 'navy', label: 'Navy', value: '#1e3a5f' },
] as const;

const DEFAULT_CAPTION = 'Scan to chat with us on WhatsApp';

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function QrLinkSettings() {
  const [phone, setPhone] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(true);
  const [preset, setPreset] = useState<string>(WA_LINK_PRESETS[0].id);
  const [message, setMessage] = useState<string>(WA_LINK_PRESETS[0].message);
  const [color, setColor] = useState<(typeof COLORS)[number]['value']>(COLORS[0].value);
  const [caption, setCaption] = useState(DEFAULT_CAPTION);
  const [svg, setSvg] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Start from the connected WhatsApp number when there is one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/whatsapp/config', { method: 'GET' });
        const body = await res.json().catch(() => null);
        const display = body?.phone_info?.display_phone_number as string | undefined;
        if (!cancelled && display) setPhone(display);
      } catch {
        // not connected yet: the field stays empty for manual entry
      } finally {
        if (!cancelled) setPhoneLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const link = useMemo(() => buildWaLink(phone, message), [phone, message]);
  const numberValid = !!normalizeWaNumber(phone);
  const presetLabel = WA_LINK_PRESETS.find((p) => p.id === preset)?.label ?? 'custom';
  // Only show a QR for the current, valid link.
  const shownSvg = link ? svg : '';

  useEffect(() => {
    let cancelled = false;
    if (!link) return;
    QRCode.toString(link, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: color, light: '#ffffff' },
    })
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => {
        if (!cancelled) setSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [link, color]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  async function downloadPng() {
    if (!link) return;
    setDownloading(true);
    try {
      // Print-ready: 1200px wide, QR plus the caption underneath.
      const qrSize = 1000;
      const pad = 100;
      const captionText = caption.trim();
      const captionHeight = captionText ? 150 : 0;
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, link, {
        width: qrSize,
        margin: 0,
        errorCorrectionLevel: 'M',
        color: { dark: color, light: '#ffffff' },
      });
      const out = document.createElement('canvas');
      out.width = qrSize + pad * 2;
      out.height = qrSize + pad * 2 + captionHeight;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(qrCanvas, pad, pad);
      if (captionText) {
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let size = 56;
        ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        while (ctx.measureText(captionText).width > out.width - pad && size > 28) {
          size -= 2;
          ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        }
        ctx.fillText(captionText, out.width / 2, qrSize + pad + captionHeight / 2);
      }
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('png');
      downloadBlob(blob, `${qrFileName(presetLabel)}.png`);
    } catch {
      toast.error('Could not create the image. Try again.');
    } finally {
      setDownloading(false);
    }
  }

  function downloadSvg() {
    if (!shownSvg) return;
    downloadBlob(new Blob([shownSvg], { type: 'image/svg+xml' }), `${qrFileName(presetLabel)}.svg`);
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={QrCode}
        title="QR & WhatsApp link"
        description="Make a WhatsApp link and a printable QR code with a ready-typed first message. Customers scan it, tap send, and the chat lands in your inbox."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,380px)]">
        {/* ---------- Form ---------- */}
        <Card className="space-y-6 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <QrCode className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-bold tracking-tight text-foreground">Build your link</h3>
              <p className="text-xs text-muted-foreground">Number, first message and QR style.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qr-phone">WhatsApp number</Label>
            <div className="relative">
              <Input
                id="qr-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                inputMode="tel"
                aria-invalid={!!phone && !numberValid}
              />
              {phoneLoading && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className={cn('text-xs', phone && !numberValid ? 'text-destructive' : 'text-muted-foreground')}>
              {phone && !numberValid
                ? 'Enter a full WhatsApp number with country code.'
                : 'Filled in from your connected WhatsApp number. A 10-digit number is treated as Indian (+91).'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Where will people see it?</Label>
            <div className="flex flex-wrap gap-2">
              {WA_LINK_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPreset(p.id);
                    setMessage(p.message);
                  }}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                    preset === p.id
                      ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25'
                      : 'border-border bg-card text-muted-foreground hover:border-primary-soft-2 hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qr-message">Message the customer sends</Label>
            <Textarea
              id="qr-message"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value.slice(0, WA_LINK_MAX_MESSAGE));
                setPreset('custom');
              }}
              rows={3}
              maxLength={WA_LINK_MAX_MESSAGE}
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/{WA_LINK_MAX_MESSAGE}. Shorter messages make a simpler, easier-to-scan QR code.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>QR colour</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.value)}
                    aria-label={c.label}
                    title={c.label}
                    className={cn(
                      'size-9 rounded-full border-2 shadow-sm transition-transform',
                      color === c.value ? 'scale-110 border-primary ring-2 ring-primary-soft-2' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-caption">Text under the QR (PNG)</Label>
              <Input
                id="qr-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 60))}
                placeholder="Leave empty for no text"
              />
            </div>
          </div>

          <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Use a different message for each place (flyer, counter, packaging) to see where leads come from. Add a{' '}
              <b>keyword automation</b> on a word in the message to tag the lead or send your price list automatically.
            </p>
          </div>
        </Card>

        {/* ---------- Preview ---------- */}
        <Card className="flex h-fit flex-col items-center gap-5 p-6 lg:sticky lg:top-0">
          <div className="flex w-full items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <ExternalLink className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-bold tracking-tight text-foreground">Preview</h3>
              <p className="text-xs text-muted-foreground">What customers scan and see.</p>
            </div>
          </div>
          <div className="flex w-full flex-col items-center rounded-3xl bg-gradient-to-br from-[var(--rail)] via-primary to-emerald-400 p-6">
          <div className="flex w-full max-w-[240px] flex-col items-center rounded-2xl border border-border bg-white p-4 shadow-xl">
            {shownSvg ? (
              <div
                className="w-full [&>svg]:h-auto [&>svg]:w-full"
                aria-label="WhatsApp QR code"
                role="img"
                // The SVG comes from the qrcode library for our own link.
                dangerouslySetInnerHTML={{ __html: shownSvg }}
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center text-center text-xs text-gray-500">
                Enter a valid WhatsApp number to see the QR code
              </div>
            )}
            {shownSvg && caption.trim() && (
              <p className="mt-2 text-center text-xs font-semibold" style={{ color }}>
                {caption}
              </p>
            )}
          </div>
          <p className="mt-4 text-center text-xs font-semibold tracking-wide text-white/90 uppercase">Scan to chat on WhatsApp</p>
          </div>

          {message.trim() && (
            <div className="w-full rounded-2xl bg-primary-soft/50 p-3">
              <p className="mb-1.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Customer sends</p>
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm">{message}</p>
            </div>
          )}

          <div className="w-full space-y-2">
            <Label htmlFor="qr-link">Link</Label>
            <div className="flex gap-2">
              <Input id="qr-link" value={link ?? ''} readOnly placeholder="https://wa.me/…" className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => void copyLink()} disabled={!link} aria-label="Copy link">
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2">
            <Button onClick={() => void downloadPng()} disabled={!link || downloading} className="rounded-xl shadow-md shadow-primary/25">
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              PNG
            </Button>
            <Button variant="outline" onClick={downloadSvg} disabled={!shownSvg}>
              <Download className="size-4" />
              SVG
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full"
            disabled={!link}
            render={<a href={link ?? undefined} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="size-4" />
            Test the link
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            PNG is print-ready (1200 px). SVG stays sharp at any size for banners and packaging.
          </p>
        </Card>
      </div>
    </section>
  );
}
