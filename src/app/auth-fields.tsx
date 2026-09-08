'use client';

import { useId, useState } from 'react';

/**
 * The two field shapes these three pages share.
 *
 * The label is above the row rather than inside it as a placeholder. The
 * reference composition placed it inside, and that reads well with two fields;
 * this product's change-password form has three password fields in a column,
 * and once they are filled a placeholder-as-label leaves three identical rows
 * of dots with nothing saying which is which.
 *
 * The reveal is the one control kept from the reference's extras, because it
 * is the only one that does real work: these passwords are at least ten
 * characters and are often typed from something an admin read out.
 */

type Common = { label: string; invalid?: boolean; describedBy?: string };

export function EmailField(
  { name = 'email', label, invalid, describedBy, ...rest }:
  { name?: string } & Common & React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <div className="auth-field-block">
      <label className="auth-label" htmlFor={name}>{label}</label>
      <div className={`auth-field-row${invalid ? ' is-bad' : ''}`}>
        <span className="glyph" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="1.6" y="3.2" width="12.8" height="9.6" rx="1.6" />
            <path d="M2 4.4l6 4.2 6-4.2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          id={name} name={name} type="email"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      </div>
    </div>
  );
}

export function PasswordField(
  { name, label, invalid, describedBy, ...rest }:
  { name: string } & Common & React.InputHTMLAttributes<HTMLInputElement>,
) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div className="auth-field-block">
      <label className="auth-label" htmlFor={`${id}-${name}`}>{label}</label>
      <div className={`auth-field-row${invalid ? ' is-bad' : ''}`}>
        <span className="glyph" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="2.6" y="7" width="10.8" height="7" rx="1.6" />
            <path d="M5.2 7V5.1a2.8 2.8 0 0 1 5.6 0V7" strokeLinecap="round" />
          </svg>
        </span>

        <input
          id={`${id}-${name}`} name={name}
          type={shown ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />

        <button
          type="button"
          className="auth-reveal"
          // The name states what pressing it does, not what is on screen now.
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          <span aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M1 8s2.6-4.2 7-4.2S15 8 15 8s-2.6 4.2-7 4.2S1 8 1 8z" />
              <circle cx="8" cy="8" r="1.9" />
              {shown && <path d="M2.4 13.6L13.6 2.4" strokeLinecap="round" />}
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * A refusal the visitor has to act on: name the problem, then the way out.
 *
 * `alert` interrupts, so it is reserved for a refusal that has already
 * happened. A hint that recomputes while somebody types — "seven more
 * characters", "six more characters" — is `status`, or a screen reader narrates
 * every keystroke.
 */
export function Errata(
  { id, live = 'assertive', children }:
  { id?: string; live?: 'assertive' | 'polite'; children: React.ReactNode },
) {
  return (
    <p
      className="auth-errata"
      id={id}
      role={live === 'assertive' ? 'alert' : 'status'}
      aria-live={live}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" />
        <path d="M8 4.8v3.9M8 11.1v.1" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
