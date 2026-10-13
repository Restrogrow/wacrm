export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_CONTENT_TYPE = "image/png";

export function renderOgImage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #020617 0%, #0f172a 60%, #052e1e 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 28px",
          borderRadius: 999,
          border: "1px solid rgba(52, 211, 153, 0.4)",
          color: "#34d399",
          fontSize: 22,
          marginBottom: 40,
        }}
      >
        Official WhatsApp Business API
      </div>
      <div style={{ display: "flex", fontSize: 96, fontWeight: 700 }}>
        <span style={{ color: "#ffffff" }}>Repeat</span>
        <span style={{ color: "#34d399" }}>Grow</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#94a3b8",
          marginTop: 24,
          maxWidth: 900,
          textAlign: "center",
          justifyContent: "center",
        }}
      >
        WhatsApp CRM for sales &amp; support teams
      </div>
    </div>
  );
}

/** Share image for a blog post: category, title and the Repeat Grow mark. */
export function renderBlogOgImage(title: string, category: string) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background:
          "linear-gradient(135deg, #020617 0%, #0f172a 60%, #052e1e 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "8px 24px",
          borderRadius: 999,
          border: "1px solid rgba(52, 211, 153, 0.4)",
          color: "#34d399",
          fontSize: 24,
        }}
      >
        {category}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: title.length > 70 ? 56 : 64,
          fontWeight: 700,
          lineHeight: 1.15,
          color: "#ffffff",
          maxWidth: 1040,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", fontSize: 32, fontWeight: 700 }}>
        <span style={{ color: "#ffffff" }}>Repeat</span>
        <span style={{ color: "#34d399" }}>Grow</span>
        <span style={{ color: "#94a3b8", fontSize: 24, fontWeight: 400, marginLeft: 20 }}>
          repeatgrow.com/blog
        </span>
      </div>
    </div>
  );
}
