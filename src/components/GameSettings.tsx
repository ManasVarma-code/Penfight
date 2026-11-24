import { Cloud, Settings, UserRound, Volume2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adService } from '../game/ads/adService';
import type { RankedProfile } from '../game/ranking';
import type { ProfileV1 } from '../game/types';
import type { useOfflineBackup } from '../game/useOfflineBackup';

export function GameSettings({ profile, account, signedIn, backup, signingOut, onClose, onMute, onMotion, onSignIn, onSignOut }: {
  profile: ProfileV1; account: RankedProfile | null; signedIn: boolean; signingOut: boolean;
  backup: ReturnType<typeof useOfflineBackup>; onClose: () => void; onMute: () => void; onMotion: () => void;
  onSignIn: () => void; onSignOut: () => void;
}) {
  const [privacy, setPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => adService.subscribePrivacyOptions(setPrivacy), []);
  const status = !signedIn ? 'Progress stays on this device until you sign in.'
    : backup.status === 'conflict' ? 'Choose a save in Progress → Cloud save.'
      : backup.status === 'saved' ? 'Progress is up to date.'
        : backup.status === 'offline' ? 'Saved on this device. Cloud backup will retry.' : 'Checking your save…';
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="settings-heading"
      className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-slate-700 bg-[#111b2a] p-5 text-white shadow-2xl">
      <header className="flex items-center justify-between">
        <h2 id="settings-heading" className="flex items-center gap-2 font-display text-2xl font-bold"><Settings className="size-5 text-cyan-200" /> Settings</h2>
        <button type="button" aria-label="Close settings" onClick={onClose} autoFocus
          className="grid size-10 place-items-center rounded-xl bg-slate-800"><X className="size-5" /></button>
      </header>
      <div className="mt-4 space-y-3">
        <section className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><UserRound className="size-4 text-cyan-200" /> Account</h3>
          <p className="mt-1 text-sm text-slate-300">{signedIn ? account?.username ?? account?.displayName ?? 'Signed in with Google' : 'Guest'}</p>
          {account?.fullName && <p className="text-xs text-slate-400">{account.fullName}</p>}
          <button type="button" disabled={signingOut} onClick={signedIn ? onSignOut : onSignIn}
            className="mt-2 min-h-10 rounded-lg bg-slate-800 px-3 text-sm font-bold text-cyan-100 disabled:opacity-60">
            {signingOut ? 'Signing out…' : signedIn ? 'Save and sign out' : 'Sign in or sign up'}
          </button>
        </section>
        <section className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Cloud className="size-4 text-cyan-200" /> Cloud save</h3>
          <p role="status" className="mt-1 text-sm text-slate-300">{status}</p>
          {signedIn && <button type="button" disabled={saving || signingOut || backup.status === 'conflict'}
            onClick={() => { setSaving(true); void backup.saveNow().finally(() => setSaving(false)); }}
            className="mt-2 min-h-10 rounded-lg bg-slate-800 px-3 text-sm font-bold text-cyan-100 disabled:opacity-60">{saving ? 'Saving…' : 'Save now'}</button>}
        </section>
        <section className="space-y-2 rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Volume2 className="size-4 text-cyan-200" /> Gameplay</h3>
          <button type="button" aria-pressed={!profile.muted} onClick={onMute} className="flex min-h-10 w-full items-center justify-between text-sm">
            Sound <span className="rounded-md bg-slate-800 px-2 py-1">{profile.muted ? 'Off' : 'On'}</span>
          </button>
          <button type="button" aria-pressed={profile.reducedMotion} onClick={onMotion} className="flex min-h-10 w-full items-center justify-between text-sm">
            Reduced motion <span className="rounded-md bg-slate-800 px-2 py-1">{profile.reducedMotion ? 'On' : 'Off'}</span>
          </button>
          {privacy && <button type="button" onClick={() => void adService.openPrivacyOptions()} className="min-h-10 text-sm font-semibold text-cyan-100">Ad privacy choices</button>}
        </section>
      </div>
    </section>
  </div>;
}
