import Script from "next/script";
import { LANDING_CSS } from "@/lib/landing-css";
import { LANDING_SCRIPT } from "@/lib/landing-script";
import {
  LANDING_NAV_HTML,
  LANDING_FOOTER_HTML,
  LANDING_WHATSAPP_FLOAT_HTML,
} from "@/lib/landing-chrome";
import { DOCS_CSS } from "./docs-css";

// Docs share the marketing site's nav, footer, and stylesheet so they
// feel like part of repeatgrow.com rather than a separate app.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + DOCS_CSS }} />
      <div className="lp-page">
        {/* display:contents keeps the sticky nav sticky against .lp-page. */}
        <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: LANDING_NAV_HTML }} />
        <main className="docs">{children}</main>
        <div
          style={{ display: "contents" }}
          dangerouslySetInnerHTML={{
            __html: LANDING_FOOTER_HTML + LANDING_WHATSAPP_FLOAT_HTML,
          }}
        />
      </div>
      <Script
        id="docs-page-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: LANDING_SCRIPT }}
      />
    </>
  );
}
