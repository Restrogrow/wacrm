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
