"use client";

import { useEffect, useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`copy-btn${done ? " is-done" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // Clipboard blocked (e.g. insecure context) — nothing to do.
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/** Dark code block with a label and a copy button. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="code">
      <div className="code-head">
        <span>{label ?? ""}</span>
        <CopyButton text={code} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Code block with one tab per language. */
export function CodeTabs({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  const current = tabs[active];
  return (
    <div className="code">
      <div className="code-head">
        <div className="code-tabs" role="tablist">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onClick={() => setActive(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyButton text={current.code} />
      </div>
      <pre>
        <code>{current.code}</code>
      </pre>
    </div>
  );
}

/** Sticky "On this page" nav that highlights the section in view. */
export function Toc({
  items,
  switchTo,
}: {
  items: { id: string; label: string }[];
  switchTo: { href: string; title: string; text: string };
}) {
  const [activeId, setActiveId] = useState(items[0]?.id);

  useEffect(() => {
    const els = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-100px 0px -65% 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="docs-toc" aria-label="On this page">
      <div className="toc-title">On this page</div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className={item.id === activeId ? "is-active" : ""}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <a href={switchTo.href} className="toc-switch">
        <b>{switchTo.title} →</b>
        {switchTo.text}
      </a>
    </nav>
  );
}
