import { ChevronRight, Crown, Shield, Swords, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useState } from 'react';
import { AURA_DIVISIONS, getAuraRank, type RankedHistoryEntry, type RankedProfile } from '../game/ranking';
import type { OnlineStatus } from '../game/onlineProtocol';
import type { useRankedAccount } from '../game/useRankedAccount';

const tierColors = ['text-orange-300', 'text-slate-200', 'text-amber-300', 'text-sky-200', 'text-violet-200'];

export function RankName({ rating }: { rating: number }) {
  const rank = getAuraRank(rating);
  return <span className={`inline-flex items-center gap-1.5 font-bold ${tierColors[rank.tierIndex]}`}>
    {rank.tierIndex === 4 ? <Crown className="size-4 shrink-0" aria-hidden="true" />
      : <Shield className="size-4 shrink-0" aria-hidden="true" />}
    {rank.label}
  </span>;
}

export function RankedHome({ profile, onDetails, onQueue }: {
  profile: RankedProfile | null; onDetails: () => void; onQueue: () => void;
}) {
  const rank = profile && getAuraRank(profile.rating);
  return <section className="flex items-center gap-2 rounded-2xl border border-sky-800/80 bg-[#102137] p-2">
    <button type="button" onClick={onDetails} aria-label="View rank ladder"
      className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left">
      {profile && <span className="mb-0.5 block truncate text-sm font-extrabold text-white" title={profile.displayName}>
        {profile.displayName}
      </span>}
      <span className="block text-sm">{profile ? <RankName rating={profile.rating} /> : <span className="font-bold text-sky-100">Unranked</span>}</span>
      <span className="block text-[11px] text-slate-300">{profile && rank
        ? `${profile.rating.toLocaleString()} AR · ${rank.next ? `${rank.pointsToNext} to ${rank.next.label}` : 'Top division'}`
        : 'Bronze 1 → Aura Legend 3'}</span>
    </button>
    <button type="button" onClick={onQueue} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-cyan-300 px-3 text-xs font-extrabold text-slate-950">
      <Swords className="size-4" aria-hidden="true" /> Ranked 1v1
    </button>
  </section>;
}

export function RankedProgress({ profile, onSignIn, onSignOut }: {
  profile: RankedProfile | null; onSignIn: () => void; onSignOut: () => void;
}) {
  const rank = profile && getAuraRank(profile.rating);
  return <div className="space-y-4">
    <section className="space-y-2 rounded-2xl border border-sky-800 bg-[#14263a] p-4">
      <h3 className="break-words font-display text-lg font-bold">{profile ? profile.displayName : 'Your online rank'}</h3>
      {profile ? <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <RankName rating={profile.rating} />
          <span className="font-mono-num text-cyan-100">{profile.rating.toLocaleString()} Aura Rating</span>
        </div>
        {rank?.next && <p className="text-xs text-slate-300">{rank.pointsToNext} rating to {rank.next.label}</p>}
        <p className="text-xs text-slate-300">Peak rank · {getAuraRank(profile.peakRating).label} ({profile.peakRating.toLocaleString()})</p>
        <button type="button" onClick={onSignOut} className="min-h-10 text-xs font-bold text-cyan-200 underline">Sign out</button>
      </> : <>
        <p className="text-sm text-slate-300">Sign in to play Ranked 1v1. Your first match starts at Bronze 1.</p>
        <button type="button" onClick={onSignIn} className="min-h-10 rounded-xl bg-cyan-300 px-3 text-xs font-extrabold text-slate-950">Sign in for Ranked</button>
      </>}
    </section>
    <section>
      <h3 className="mb-2 font-display text-lg font-bold">Aura Rating ladder</h3>
      <ol className="space-y-2">
        {[...AURA_DIVISIONS].reverse().map(division => <li key={division.label}
          aria-current={rank?.label === division.label ? 'step' : undefined}
          className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#101827] px-3 py-2 text-sm aria-[current=step]:border-cyan-400 aria-[current=step]:bg-cyan-950">
          <RankName rating={division.minimum} />
          <span className="font-mono-num text-xs text-slate-300">{division.minimum.toLocaleString()} AR</span>
        </li>)}
      </ol>
    </section>
    {!!profile?.history.length && <section>
      <h3 className="mb-2 font-display text-lg font-bold">Recent ranked matches</h3>
      <ol className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-[#101827]">
        {profile.history.map(result => <li key={result.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-bold">{result.opponent}</p>
            <p className="text-xs text-slate-400">{result.won ? 'Win' : 'Loss'}{!result.completed && ' · Forfeit'}</p>
          </div>
          <RatingChange result={result} />
        </li>)}
      </ol>
    </section>}
  </div>;
}

function RatingChange({ result }: { result: RankedHistoryEntry }) {
  const delta = result.after - result.before;
  return <span className={`shrink-0 font-mono-num font-bold ${delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-300'}`}>
    {delta > 0 ? '+' : ''}{delta} AR
  </span>;
}

export function RankedResult({ result }: { result: RankedHistoryEntry }) {
  const from = getAuraRank(result.before);
  const to = getAuraRank(result.after);
  const promoted = to.position > from.position;
  return <div className="mt-4 rounded-2xl border border-sky-900 bg-[#14263a] p-3">
    <div className={promoted ? 'motion-safe:animate-[rank-promotion_450ms_ease-out_both]' : undefined}>
      <RankName rating={result.after} />
    </div>
    <div className="mt-1 flex items-center justify-center gap-2 text-sm text-slate-100">
      {result.before.toLocaleString()} <ChevronRight className="size-4" aria-hidden="true" /> {result.after.toLocaleString()} <RatingChange result={result} />
    </div>
    <p className="mt-1 text-xs text-slate-300">{promoted ? `Promoted from ${from.label}`
      : to.position < from.position ? `Demoted from ${from.label}` : result.completed
        ? `vs. ${result.opponent} · ${result.opponentRating.toLocaleString()} AR`
        : result.won ? 'Opponent forfeited' : 'You forfeited'}</p>
  </div>;
}

export function RankedVersus({ match }: { match: Extract<OnlineStatus, { status: 'matched' }> }) {
  if (!match.ranked) return null;
  const players = match.ranked.players;
  const opponent = match.side === 'p1' ? 'p2' : 'p1';
  return <div role="status" className="absolute inset-0 z-30 grid place-items-center bg-[#070b14]/90 px-5 text-center">
    <section className="w-full max-w-sm rounded-3xl border border-sky-800 bg-[#101c2d] p-5">
      <h2 className="mb-4 font-display text-xl font-bold">Ranked matchup</h2>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {([match.side, opponent] as const).map((side, index) => <div key={side} className={index === 0 ? 'col-start-1 row-start-1' : 'col-start-3 row-start-1'}>
          <p className="truncate font-bold">{players[side].displayName}</p>
          <p className="mt-1 text-xs"><RankName rating={players[side].rating} /></p>
          <p className="text-xs text-slate-300">{players[side].rating.toLocaleString()} AR</p>
        </div>)}
        <Swords className="col-start-2 row-start-1 size-5 text-amber-300" aria-hidden="true" />
      </div>
    </section>
  </div>;
}

export function RankedSignIn({ account, onClose, startup = false }: {
  account: ReturnType<typeof useRankedAccount>; onClose: () => void; startup?: boolean;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const close = () => { account.cancel(); onClose(); };
  return <div className={`fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5 ${startup ? 'bg-[radial-gradient(ellipse_at_top,#203149,#0a111f_62%)]' : 'bg-black/80'}`}>
    <section role="dialog" aria-modal="true" aria-labelledby="ranked-signin-title" className="w-full max-w-sm rounded-3xl border border-slate-700 bg-[#101c2d] p-6 shadow-2xl">
      <header className="flex items-center justify-between gap-3">
        <h2 id="ranked-signin-title" className="font-display text-2xl font-bold">{startup ? 'Pen Fight Aura Wars' : 'Your fighter account'}</h2>
        {!startup && <button type="button" onClick={close} aria-label="Close sign-in" className="grid size-11 place-items-center rounded-xl bg-slate-800"><X className="size-5" /></button>}
      </header>
      {account.challenge ? <>
        {Capacitor.getPlatform() === 'android' ? <>
          <p role="status" className="mt-4 flex items-center gap-3 text-sm font-semibold text-cyan-100">
            <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300 motion-reduce:animate-none" />
            Waiting for Google…
          </p>
          <p className="mt-2 text-sm text-slate-300">Choose your account in the browser, then return here to finish.</p>
          <button type="button" onClick={account.cancel} className="mt-3 min-h-11 text-sm font-semibold text-slate-300">Cancel sign-in</button>
        </> : <>
          <p className="mt-3 text-sm text-slate-300">Finish in your browser, then come back to the game.</p>
          <a href={account.challenge.url} target="_blank" rel="noopener noreferrer"
            className="mt-4 grid min-h-11 place-items-center rounded-xl bg-cyan-300 text-sm font-bold text-slate-950">Open Google sign-in</a>
        </>}
      </> : <form onSubmit={event => {
        event.preventDefault();
        void account.start(mode, mode === 'signup' ? { fullName: name, displayName: username } : undefined);
      }} className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-950 p-1">
          {(['signin', 'signup'] as const).map(option => <button key={option} type="button" aria-pressed={mode === option}
            onClick={() => { account.cancel(); setMode(option); }} disabled={account.pending}
            className="min-h-10 rounded-lg text-sm font-bold text-slate-300 aria-pressed:bg-slate-800 aria-pressed:text-cyan-100">
            {option === 'signin' ? 'Sign in' : 'Sign up'}
          </button>)}
        </div>
        {mode === 'signup' ? <div className="space-y-3">
          <label className="block text-sm font-bold">Name
            <input value={name} onChange={event => setName(event.target.value)} required autoComplete="name" minLength={2} maxLength={50}
              className="mt-1 block min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-white" />
          </label>
          <label className="block text-sm font-bold">Username <span className="font-normal text-slate-400">· visible to other players</span>
            <input value={username} onChange={event => setUsername(event.target.value)} required autoComplete="username" minLength={2} maxLength={24}
              className="mt-1 block min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-white" />
          </label>
        </div> : <p className="text-sm text-slate-300">Use the Google account you played with to load your fighter and saved progress.</p>}
        <button type="submit" disabled={account.pending}
          className="min-h-11 w-full rounded-xl bg-cyan-300 text-sm font-bold text-slate-950 disabled:opacity-60">
          {account.pending ? 'Preparing sign-in…' : mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
        </button>
      </form>}
      {account.message && <p role="status" className="mt-3 text-sm text-amber-200">{account.message}</p>}
      {startup && <button type="button" onClick={close} className="mt-3 min-h-11 w-full text-sm font-bold text-slate-300">Continue as guest</button>}
    </section>
  </div>;
}
