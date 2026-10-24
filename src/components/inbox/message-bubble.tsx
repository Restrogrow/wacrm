"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { isHttpUrl } from "@/lib/url";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  MousePointerClick,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import { VoiceNoteAi } from "./voice-note-ai";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeSendFailure } from "@/lib/whatsapp/send-errors";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  /** Teammate who sent this outbound message; shown subtly on team accounts. */
  senderLabel?: string | null;
}

/**
 * Only web URLs and our own media proxy become clickable links (never
 * javascript: or data:). Inbound customer files are stored as
 * /api/whatsapp/media/<id>, which is same-origin and safe.
 */
function isWebUrl(url: string): boolean {
  return isHttpUrl(url) || /^\/api\/whatsapp\/media\/\d+$/.test(url);
}

function StatusIcon({
  status,
  errorCode,
  errorDetail,
}: {
  status: Message["status"];
  errorCode?: number | null;
  errorDetail?: string | null;
}) {
  switch (status) {
    case "sending":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case "failed": {
      const reason = describeSendFailure(errorCode, errorDetail);
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Not delivered: ${reason}`}
                className="inline-flex cursor-help rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              />
            }
          >
            <XCircle className="h-3 w-3 text-red-400" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            <span className="font-medium">Not delivered.</span> {reason}
          </TooltipContent>
        </Tooltip>
      );
    }
    default:
      return null;
  }
}

/** A single short line ending in a file extension, e.g. "menu.pdf". */
function looksLikeFilename(text: string): boolean {
  return text.length <= 120 && !text.includes("\n") &&/\.[a-z0-9]{1,5}$/i.test(text);
}

function filenameFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const last = new URL(url).pathname.split("/").pop() ?? "";
    const name = decodeURIComponent(last);
    return looksLikeFilename(name) ? name : "";
  } catch {
    return "";
  }
}

/**
 * A Flow link-button message's text: the body, then the "Label: https://…"
 * line meta-send.ts appends from the Flow's own settings. Only that final
 * line becomes a link. The body can hold a customer's answers (Flow
 * variables), so a URL there stays plain text, like any customer message.
 */
function BotInteractiveText({ text }: { text: string }) {
  const cut = text.lastIndexOf("\n\n");
  const last = cut === -1 ? "" : text.slice(cut + 2);
  const m = /^([^\n]{1,60}): (https?:\/\/\S+)$/.exec(last);
  if (!m || !isHttpUrl(m[2])) return <>{text}</>;
  return (
    <>
      {text.slice(0, cut + 2)}
      {m[1]}:{" "}
      <a
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {m[2]}
      </a>
    </>
  );
}

function MediaUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{label} unavailable</span>
    </div>
  );
}

/**
 * Keyed by `url` so a new address starts from fresh state: no revoked blob
 * or earlier error carried over from the previous one.
 */
function MediaImage({ url, alt }: { url: string; alt: string }) {
  if (!url) return <MediaUnavailable label="Image" />;
  return <MediaImageLoader key={url} url={url} alt={alt} />;
}

function MediaImageLoader({ url, alt }: { url: string; alt: string }) {
  const isProxy = url.startsWith("/api/whatsapp/media/");
  // Only proxy URLs go through state; web URLs render straight from props.
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [blobLoading, setBlobLoading] = useState(true);
  const src = isProxy ? blobSrc : url;
  const loading = isProxy && blobLoading;

  useEffect(() => {
    if (!isProxy) return;

    // Proxy URLs need an authenticated fetch to create a blob URL. The blob
    // URL lives in this effect so the cleanup revokes the one it created
    // (state from the first render would always be null).
    let blobUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load media");
        const blob = await res.blob();
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setBlobSrc(blobUrl);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setBlobLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url, isProxy]);

  if (error) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-xl bg-muted">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (loading || !src) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-xl bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    // next/image needs a fixed width/height or `fill` + sized container;
    // this renders arbitrary WhatsApp media of unknown aspect ratio within
    // a max-size box, which `fill` would change the display behavior of.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="max-h-64 max-w-60 rounded-xl object-cover"
      onError={() => setError(true)}
    />
  );
}

/**
 * `onPrimary`: the bubble has the primary fill (our outbound messages), so
 * chips and labels use the on-primary colours to stay readable.
 */
function MessageContent({ message, onPrimary }: { message: Message; onPrimary: boolean }) {
  switch (message.content_type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
          {message.content_text}
        </p>
      );

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImage url={message.media_url} alt="Shared image" />
          ) : (
            <MediaUnavailable label="Image" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <video
              src={message.media_url}
              controls
              className="max-h-64 max-w-60 rounded-xl"
            />
          ) : (
            <MediaUnavailable label="Video" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            <audio src={message.media_url} controls className="max-w-60" />
          ) : (
            <MediaUnavailable label="Audio" />
          )}
          {/* Voice-note AI: customers only (agent voice notes need no transcript). */}
          {message.sender_type === "customer" && (message.media_url || message.ai_transcript) && (
            <VoiceNoteAi messageId={message.id} initial={message.ai_transcript} />
          )}
        </div>
      );

    case "document": {
      // content_text is the caption when there is one, else the filename.
      // A caption can be a whole paragraph, so it goes below the file chip
      // in full rather than truncated to one line inside it.
      const text = message.content_text?.trim() || "";
      const isFilename = !!text && looksLikeFilename(text);
      const name = (isFilename ? text : filenameFromUrl(message.media_url)) || "Document";
      const caption = isFilename ? "" : text;
      const chip =
        !message.media_url || !isWebUrl(message.media_url) ? (
          <MediaUnavailable label={name} />
        ) : (
          <a
            href={message.media_url}
            target="_blank"
            rel="noopener noreferrer"
            title={name}
            className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
          >
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="truncate">{name}</span>
          </a>
        );
      return (
        <div className="min-w-0">
          {chip}
          {caption && (
            <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
              {caption}
            </p>
          )}
        </div>
      );
    }

    case "template":
      return (
        <div>
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              onPrimary
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/20 text-primary",
            )}
          >
            <LayoutTemplate className="h-3 w-3" />
            Template
          </span>
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || "Location shared"}</span>
        </div>
      );

    case "interactive": {
      // Our own buttons / list / link-button message (agent via the API,
      // or a Flow bot): the photo header if any (API sends only), then the
      // body. Which kind it was isn't stored, so the label stays generic.
      if (message.sender_type !== "customer") {
        return (
          <div className="flex flex-col gap-0.5">
            {message.media_url && isWebUrl(message.media_url) && (
              <MediaImage url={message.media_url} alt="Message header" />
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide",
                onPrimary ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              <MousePointerClick className="h-3 w-3" />
              Interactive
            </span>
            {message.content_text && (
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
                {message.sender_type === "bot" ? (
                  <BotInteractiveText text={message.content_text} />
                ) : (
                  message.content_text
                )}
              </p>
            )}
          </div>
        );
      }
      // Customer tapped a reply button or list row on a message the bot
      // sent. We show the tapped option's title (already in content_text,
      // set by parseMessageContent in the webhook) with a small affordance
      // so agents reading the inbox can tell at a glance that this is a
      // tap rather than the customer typing the same words.
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <CornerDownLeft className="h-3 w-3" />
            Button reply
          </span>
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
            {message.content_text || "[Interactive reply]"}
          </p>
        </div>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
          {message.content_text || "[Unsupported message type]"}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
  senderLabel,
}: MessageBubbleProps) {
  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "HH:mm");

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-col",
        isAgent ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "relative min-w-0 max-w-full rounded-3xl px-4 py-2.5 shadow-sm",
          isAgent
            ? "rounded-br-lg bg-primary text-primary-foreground"
            : "rounded-bl-lg border border-border bg-card text-foreground",
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        <MessageContent message={message} onPrimary={isAgent} />
        <div
          className={cn(
            "mt-1 flex items-center gap-1",
            isAgent ? "justify-end" : "justify-start",
          )}
        >
          <span
            className={cn(
              "text-[10px]",
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              isAgent ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {time}
          </span>
          {isAgent && senderLabel && (
            <span className="max-w-[10rem] truncate text-[10px] text-primary-foreground/70">
              · {senderLabel}
            </span>
          )}
          {isAgent && (
            <StatusIcon
              status={message.status}
              errorCode={message.error_code}
              errorDetail={message.error_detail}
            />
          )}
        </div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
