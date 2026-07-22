/**
 * İstemci-tarafı çıkış: session cookie'yi sunucuda temizler, /giris'e döner.
 * Popover (ProfileMenu) ve mobil sheet (MobileNav) paylaşır. Onay çağıranın
 * sorumluluğunda (bkz. confirmLogout).
 */
export async function logoutAndRedirect(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* Cookie client'ta kalsa bile /giris erişim kapısı yakalar. */
  }
  if (typeof window !== "undefined") window.location.href = "/giris";
}

/** Yıkıcı olmayan ama oturum-sonlandıran aksiyon: onay iste. */
export function confirmLogout(): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm("CemOS'tan çıkış yapılsın mı?");
}
