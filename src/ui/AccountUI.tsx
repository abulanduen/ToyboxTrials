/**
 * Optional account UI: the Account sheet (sign in, create account, sign out, delete account), the
 * main-menu corner button and the row in Settings (main-menu Settings sheet and pause menu). Hidden
 * entirely when the server has no accounts. Playing never needs any of it.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAccount, closeAccountSheet, deleteAccount, openAccountSheet, signIn, signOut, type SyncStatus } from '../net/account';
import { PASSWORD_MAX, USERNAME_MAX, passwordProblem, usernameProblem } from '../net/accountProtocol';
import { CardboardSheet, ToyButton } from './common';

const SYNC_TEXT: Record<SyncStatus, string> = {
  idle: 'Your toy is saved to your account.',
  pending: 'Saving…',
  saving: 'Saving…',
  saved: 'Your toy is saved to your account.',
  offline: "Can't reach the server right now. Your changes are kept here and saved when it's back.",
  error: "The last change couldn't be saved. It will try again with your next change.",
};

/** Whether to show Account entries: accounts are on, or someone is signed in (so they can sign out). */
export function useAccountsShown(): boolean {
  const availability = useAccount((a) => a.availability);
  const username = useAccount((a) => a.username);
  return availability === 'on' || !!username;
}

/** Main menu: a corner button with the username, or "Sign in". */
export function MenuAccountButton() {
  const shown = useAccountsShown();
  const username = useAccount((a) => a.username);
  if (!shown) return null;
  return (
    <div className="menu-account">
      <ToyButton tone="ink" onClick={openAccountSheet} testId="menu-account" className="menu-account__btn">
        {username ? (
          <>
            <span className="menu-account__dot" aria-hidden />
            {username}
          </>
        ) : (
          'Sign in'
        )}
      </ToyButton>
    </div>
  );
}

/** Settings (main-menu sheet and pause menu): the account line and a way into the sheet. */
export function AccountSettingsRow() {
  const shown = useAccountsShown();
  const username = useAccount((a) => a.username);
  if (!shown) return null;
  return (
    <div className="pause__online account-row" data-testid="setting-account">
      <span>{username ? `Account: ${username}` : 'Account: playing as a guest'}</span>
      <ToyButton tone="sage" onClick={openAccountSheet} testId="setting-account-open" className="setting-account__btn">
        {username ? 'Account' : 'Sign in'}
      </ToyButton>
    </div>
  );
}

export function AccountSheet() {
  const availability = useAccount((a) => a.availability);
  const username = useAccount((a) => a.username);
  const notice = useAccount((a) => a.notice);
  const close = () => closeAccountSheet();
  return (
    <CardboardSheet title="Account" className="account-sheet" onBackdrop={close}>
      <div data-testid="account-sheet">
        {username ? <SignedIn username={username} /> : availability === 'on' ? <SignInForm /> : <p className="panel__lead">Accounts aren't switched on yet. You can keep playing as a guest.</p>}
        {notice && (
          <p className="online-status account-notice" aria-live="polite" data-testid="account-notice">
            {notice}
          </p>
        )}
      </div>
      <div className="pause__actions">
        <ToyButton tone="ink" onClick={close} testId="account-close">
          Back
        </ToyButton>
      </div>
    </CardboardSheet>
  );
}

function SignInForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Desktop: start typing straight away. Phones: don't pop the keyboard over the sheet.
    if (!window.matchMedia('(pointer: coarse)').matches) nameRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem = mode === 'register' ? (usernameProblem(name.trim()) ?? passwordProblem(password)) : !name.trim() || !password ? 'Enter your username and password.' : null;
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const err = await signIn(mode, name, password);
    setBusy(false);
    if (err) setError(err);
    else setPassword('');
  };
  const switchTo = (m: 'login' | 'register') => {
    setMode(m);
    setError(null);
  };

  return (
    <>
      <p className="panel__lead">An account is optional. It saves your cogs, items and look so they follow you to other devices and browsers. You can always play without one.</p>
      <div className="account-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => switchTo('login')} data-testid="account-tab-login">
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => switchTo('register')} data-testid="account-tab-register">
          Create account
        </button>
      </div>
      <form className="account-form" onSubmit={submit} noValidate>
        <label className="online-name account-field">
          <span>Username</span>
          <input
            ref={nameRef}
            data-testid="account-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
          />
        </label>
        <label className="online-name account-field">
          <span>Password</span>
          <input
            data-testid="account-password"
            type="password"
            name="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            maxLength={PASSWORD_MAX}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === 'register' && (
          <p className="account-small">
            3–20 letters, digits or _ for the username (others see it as your online name), and at least 8 characters for the password. We store only your username, a scrambled copy (hash)
            of your password and your toy's profile: no email, no real name. You can delete the account here at any time.
          </p>
        )}
        <ToyButton type="submit" onClick={() => {}} disabled={busy} testId="account-submit" className="account-submit">
          {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </ToyButton>
      </form>
      {error && (
        <p className="online-error" role="alert" data-testid="account-error">
          {error}
        </p>
      )}
    </>
  );
}

function SignedIn({ username }: { username: string }) {
  const sync = useAccount((a) => a.sync);
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!password) return setError('Enter your password to delete the account.');
    setBusy(true);
    setError(null);
    const err = await deleteAccount(password);
    setBusy(false);
    if (err) setError(err);
  };

  if (confirm)
    return (
      <form className="account-form" onSubmit={remove} noValidate data-testid="account-delete-form">
        <p className="panel__lead">
          Delete <strong>{username}</strong>? This removes your username, password hash, saved toy and sign-ins from the server. It can't be undone. This device keeps a guest copy of your toy.
        </p>
        {/* For password managers: which account this password belongs to. */}
        <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
        <label className="online-name account-field">
          <span>Password</span>
          <input data-testid="account-delete-password" type="password" name="password" autoComplete="current-password" maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="account-actions">
          <ToyButton type="submit" tone="coral" onClick={() => {}} disabled={busy} testId="account-delete-confirm">
            {busy ? 'Deleting…' : 'Delete for good'}
          </ToyButton>
          <ToyButton
            tone="ink"
            onClick={() => {
              setConfirm(false);
              setError(null);
            }}
            testId="account-delete-cancel"
          >
            Keep my account
          </ToyButton>
        </div>
        {error && (
          <p className="online-error" role="alert" data-testid="account-error">
            {error}
          </p>
        )}
      </form>
    );

  return (
    <>
      <p className="panel__lead" data-testid="account-signed-in">
        Signed in as <strong>{username}</strong>.
      </p>
      <p className="online-status" aria-live="polite" data-testid="account-sync">
        {SYNC_TEXT[sync]}
      </p>
      <div className="account-actions">
        <ToyButton tone="honey" onClick={() => void signOut()} testId="account-signout">
          Sign out
        </ToyButton>
        <ToyButton tone="coral" onClick={() => setConfirm(true)} testId="account-delete">
          Delete account
        </ToyButton>
      </div>
    </>
  );
}
