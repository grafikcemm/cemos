/**
 * Safely copies text to the clipboard using modern navigator.clipboard API
 * with a fallback to document.execCommand for older browsers/environments.
 * Returns true if copy succeeded, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("navigator.clipboard failed, trying fallback:", err);
    }
  }

  // 2. Try document.execCommand fallback
  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      // Prevent scrolling and keep it hidden
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.width = "2em";
      textarea.style.height = "2em";
      textarea.style.padding = "0";
      textarea.style.border = "none";
      textarea.style.outline = "none";
      textarea.style.boxShadow = "none";
      textarea.style.background = "transparent";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (success) return true;
    } catch (err) {
      console.error("document.execCommand fallback failed:", err);
    }
  }

  // 3. Last resort fallback: let user copy manually via prompt
  if (typeof window !== "undefined") {
    try {
      const msg = "Kopyalama başarısız oldu. Lütfen aşağıdaki metni manuel olarak kopyalayın (Ctrl+C):";
      const val = window.prompt(msg, text);
      return val !== null; // true if they didn't cancel
    } catch (err) {
      console.error("window.prompt fallback failed:", err);
    }
  }

  return false;
}
