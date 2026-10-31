import { useState } from 'react';
import { useSession } from '../lib/session';
import { Button, Modal, Spinner } from './ui';

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const FRIENDLY: Record<string, string> = {
  'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/unauthorized-domain': 'This domain isn’t authorised in Firebase yet (Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'Google sign-in isn’t enabled in Firebase yet (Authentication → Sign-in method).',
};

export function SignInDialog({ onClose }: { onClose: () => void }) {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
      onClose();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(FRIENDLY[code] ?? 'Sign-in failed. Please try again.');
      }
      setBusy(false);
    }
  }

  return (
    <Modal title="Sign in" onClose={onClose}>
      <p className="text-[14.5px] leading-relaxed text-muted">
        Anyone can browse the list. Signing in lets the owner add films, rate them and use the AI helper.
      </p>
      <Button variant="secondary" size="lg" className="mt-5 w-full" onClick={go} disabled={busy}>
        {busy ? <Spinner /> : <GoogleLogo />} Continue with Google
      </Button>
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
