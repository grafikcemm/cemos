import type { CSSProperties } from "react";
import { safeNextPath, type AuthErrorCode } from "@/lib/auth/vercelOidc";

/**
 * Tek-operatör erişim ekranı (ADR-049: "Sign in with Vercel" OIDC). Parola YOK.
 * "Vercel ile giriş yap" → GET /api/auth/authorize (PKCE + state + nonce) →
 * Vercel consent → /api/auth/callback → allow-list → cemos_session. Saf server
 * component, JS gerektirmez. `?e=` hata kodu, `?next=` login sonrası hedef.
 */
type SearchParams = Promise<{ e?: string; next?: string }>;

const ERROR_TEXT: Partial<Record<AuthErrorCode, string>> = {
  forbidden: "Bu Vercel hesabı bu uygulamaya yetkili değil.",
  denied: "Giriş iptal edildi.",
  oauth: "Giriş tamamlanamadı. Lütfen tekrar dene.",
  state: "Oturum doğrulaması başarısız. Lütfen tekrar dene.",
  nonce: "Oturum doğrulaması başarısız. Lütfen tekrar dene.",
};

export default async function GirisPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const isConfig = sp.e === "config";
  const errorText =
    sp.e && !isConfig ? (ERROR_TEXT[sp.e as AuthErrorCode] ?? "Giriş başarısız. Lütfen tekrar dene.") : null;
  const authorizeHref = `/api/auth/authorize?next=${encodeURIComponent(next)}`;

  const cardStyle: CSSProperties = {
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

        {isConfig ? (
          <div style={{ ...cardStyle, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text-primary)" }}>Erişim yapılandırılmamış.</strong>
            <br />
            Prod ortamında <code>SESSION_SECRET</code>, <code>NEXT_PUBLIC_VERCEL_APP_CLIENT_ID</code>,{" "}
            <code>VERCEL_APP_CLIENT_SECRET</code> ve <code>AUTH_ALLOWED_VERCEL_USERS</code> tanımlı
            olmalı. Uygulama fail-closed.
          </div>
        ) : (
          <div style={cardStyle}>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                marginTop: 0,
                marginBottom: 16,
                lineHeight: 1.6,
              }}
            >
              CemOS tek-operatör erişimi. Yetkili Vercel hesabınla giriş yap — parola yok.
            </p>
            {errorText && (
              <div role="alert" style={{ color: "var(--status-error)", fontSize: 13, marginBottom: 12 }}>
                {errorText}
              </div>
            )}
            <a
              href={authorizeHref}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                height: 44,
                border: "none",
                borderRadius: "var(--radius-md)",
                background: "var(--accent)",
                color: "var(--accent-fg)",
                fontSize: 15,
                fontWeight: 500,
                fontFamily: "var(--font-sans)",
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>
                ▲
              </span>
              Vercel ile giriş yap
            </a>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
              Tek operatör erişimi
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
