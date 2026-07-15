"use client";

/**
 * Tek-operatör erişim kapısı giriş ekranı (ADR-013/017). NATIVE form POST →
 * /api/auth/login → server 303 redirect (cookie ile). JS fetch/redirect YOK →
 * tarayıcı cookie'yi atomik taşır, dev Fast Refresh yarışı olmaz, JS'siz çalışır.
 * `?e=` hata kodu, `?next=` hedef, `?setup=1` prod yapılandırma-eksik.
 */
export default function GirisPage() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const setup = params?.get("setup") === "1" || params?.get("e") === "setup";
  const next = params?.get("next") || "/";
  const e = params?.get("e");
  const errorText =
    e === "invalid_password"
      ? "Parola hatalı."
      : e === "rate_limited"
        ? "Çok fazla deneme. Bir süre sonra tekrar dene."
        : null;

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    boxShadow: "var(--shadow-card)",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "center",
            marginBottom: 24,
            fontWeight: 600,
            fontSize: 20,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "var(--accent)",
              color: "var(--accent-fg)",
              display: "grid",
              placeItems: "center",
              fontSize: 15,
            }}
          >
            ◆
          </span>
          CemOS
        </div>

        {setup ? (
          <div style={{ ...cardStyle, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text-primary)" }}>Erişim yapılandırılmamış.</strong>
            <br />
            Prod ortamında <code>ACCESS_PASSWORD_HASH</code> ve <code>SESSION_SECRET</code> tanımlı
            değil. Uygulama fail-closed. Bu değerleri Vercel ortam değişkenlerine ekleyin
            (<code>scripts/hash-access-password.ts</code> hash üretir).
          </div>
        ) : (
          <form method="POST" action="/api/auth/login" style={cardStyle}>
            <input type="hidden" name="next" value={next} />
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}
            >
              Parola
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoFocus
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                height: 44,
                padding: "0 14px",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: 15,
                fontFamily: "var(--font-sans)",
              }}
            />
            {errorText && (
              <div role="alert" style={{ color: "var(--status-error)", fontSize: 13, marginTop: 10 }}>
                {errorText}
              </div>
            )}
            <button
              type="submit"
              style={{
                width: "100%",
                height: 44,
                marginTop: 16,
                border: "none",
                borderRadius: "var(--radius-md)",
                background: "var(--accent)",
                color: "var(--accent-fg)",
                fontSize: 15,
                fontWeight: 500,
                fontFamily: "var(--font-sans)",
                cursor: "pointer",
              }}
            >
              Giriş
            </button>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
              Tek operatör erişimi
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
