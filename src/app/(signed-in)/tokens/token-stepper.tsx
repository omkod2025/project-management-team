'use client';

import { useId, useState } from 'react';
import type { TokenRow } from '@/lib/access-tokens';
import type { VisibleProject } from '@/lib/project-access';
import type { WikiRole } from '@/lib/wiki-rules';
import {
  TOKEN_MODULES, scopeKindsInUse,
  type ModuleKey, type ScopeKind, type TokenGrants, type TokenModule,
} from '@/lib/token-modules';
import { createToken, problem, updateToken, type CreatedToken } from './token-api';
import { DatePicker } from '@/components/date-picker';

type Wiki = { id: string; title: string; role: WikiRole };
type Props = {
  projects: VisibleProject[];
  wikis: Wiki[];
  /** The token to edit; absent, the stepper makes a new one. */
  token?: TokenRow;
  /** Called after a create (with the secret), a save, or a cancel (with nothing). */
  onDone: (created?: CreatedToken) => void;
};

const STEPS = ['Modules', 'Permissions', 'Where', 'Name'] as const;
const MAX_LABEL = 100;

const PROJECT_ROLE: Record<VisibleProject['role'], string> = { admin: 'Admin', member: 'Member', viewer: 'Viewer' };
const WIKI_ROLE: Record<WikiRole, string> = { install: 'Install admin', owner: 'Owner', write: 'Editor', read: 'Reader' };

/** Today in Bangkok, as the `YYYY-MM-DD` a date input takes. */
const todayInBangkok = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

/** The end of the chosen day in Bangkok, which is the day the person picked. */
const endOfDay = (date: string) => (date ? `${date}T23:59:59+07:00` : null);

const modulesOfKind = (chosen: readonly ModuleKey[], kind: ScopeKind) =>
  TOKEN_MODULES.filter((m) => m.scope === kind && chosen.includes(m.key));

const joinNames = (names: string[]) =>
  (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The grants the request sends: every chosen module in registry order, its Create/Write list beside it. */
function grantsOf(chosen: readonly ModuleKey[], permissions: TokenGrants): TokenGrants {
  const grants: TokenGrants = {};
  for (const m of TOKEN_MODULES) if (chosen.includes(m.key)) grants[m.key] = permissions[m.key] ?? [];
  return grants;
}

/** Why a token will do less here than it was granted, or nothing when the role does not cap it. */
function projectNote(role: VisibleProject['role'], grants: TokenGrants): string | null {
  const writes = (grants.list?.length ?? 0) + (grants.docs?.length ?? 0);
  if (role === 'viewer' && writes > 0) return 'This token can only read here';
  if (role === 'member' && (grants.docs ?? []).some((p) => p === 'create_doc' || p === 'create_page')) {
    return 'Creating docs needs project Admin';
  }
  return null;
}
const wikiNote = (role: WikiRole, grants: TokenGrants) =>
  (role === 'read' && (grants.wiki?.length ?? 0) > 0 ? 'This token can only read here' : null);

function toggle<T>(list: readonly T[], item: T, on: boolean): T[] {
  return on ? (list.includes(item) ? [...list] : [...list, item]) : list.filter((x) => x !== item);
}

/* ------------------------------------------------------------------ parts */

function Steps({ at }: { at: number }) {
  return <ol className="tk-steps">
    {STEPS.map((name, i) => <li key={name} className={i === at ? 'on' : i < at ? 'done' : undefined}
      aria-current={i === at ? 'step' : undefined}>
      <span className="tk-step-n" aria-hidden="true">{i + 1}</span><span>{name}</span>
    </li>)}
  </ol>;
}

/** A checkbox row: the label names it, the hint describes it, so a test or a reader can find it by name alone. */
function Check({ label, hint, checked, disabled, locked, onChange, badge, note, all, indeterminate }: {
  label: string; hint?: string; checked: boolean; disabled?: boolean; locked?: boolean;
  onChange?: (on: boolean) => void; badge?: string; note?: string | null; all?: boolean; indeterminate?: boolean;
}) {
  const id = useId();
  return <label className={`tk-chk${all ? ' tk-all' : ''}${locked ? ' tk-locked' : ''}`}>
    <input type="checkbox" checked={checked} disabled={disabled || locked} readOnly={locked}
      aria-labelledby={`${id}-l`} aria-describedby={hint || note ? `${id}-h` : undefined}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate; }}
      onChange={(e) => onChange?.(e.target.checked)} />
    <span className="tk-chk-text">
      <span id={`${id}-l`} className="tk-chk-label">{label}</span>
      {badge && <span className="tk-role">{badge}</span>}
      {(hint || note) && <span id={`${id}-h`} className="tk-chk-hint">
        {hint}{note && <span className="tk-cap">{note}</span>}
      </span>}
    </span>
  </label>;
}

function ModuleCard({ mod, checked, onChange }: { mod: TokenModule; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return <label className={`tk-mod${checked ? ' sel' : ''}`}>
    <input type="checkbox" checked={checked} aria-labelledby={`${id}-l`} aria-describedby={`${id}-h`}
      onChange={(e) => onChange(e.target.checked)} />
    <span id={`${id}-l`} className="tk-mod-name">{mod.label}</span>
    <span id={`${id}-h`} className="tk-mod-hint">{mod.hint}</span>
  </label>;
}

/** One scope kind's list: Select all with its count, then every item the owner can see. */
function ScopeGroup({ title, usedBy, items, chosen, onChange, empty }: {
  title: string; usedBy: string;
  items: Array<{ id: string; name: string; badge: string; note: string | null }>;
  chosen: string[]; onChange: (ids: string[]) => void; empty: string;
}) {
  const picked = items.filter((i) => chosen.includes(i.id)).length;
  return <fieldset className="tk-grp">
    <legend><span>{title}</span> <span className="tk-grp-for">for {usedBy}</span></legend>
    {items.length ? <>
      <div className="tk-all-row">
        <Check all label="Select all" checked={picked === items.length} indeterminate={picked > 0 && picked < items.length}
          onChange={(on) => onChange(on ? items.map((i) => i.id) : [])} />
        <span className="tk-count">{picked} of {items.length} selected</span>
      </div>
      {items.map((i) => <Check key={i.id} label={i.name} badge={i.badge} note={i.note} checked={chosen.includes(i.id)}
        onChange={(on) => onChange(toggle(chosen, i.id, on))} />)}
    </> : <p className="tk-empty-line">{empty}</p>}
  </fieldset>;
}

/* ---------------------------------------------------------------- stepper */

/**
 * Make or edit a token in four steps: which modules, what each may do,
 * where, and a name. Back keeps every choice; unticking a module drops its
 * grants, and a scope kind no remaining module uses is hidden and cleared,
 * so nothing unreachable is ever sent.
 */
export default function TokenStepper({ projects, wikis, token, onDone }: Props) {
  const editing = token !== undefined;
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<ModuleKey[]>(() =>
    (token ? TOKEN_MODULES.filter((m) => Object.hasOwn(token.grants, m.key)).map((m) => m.key) : []));
  const [permissions, setPermissions] = useState<TokenGrants>(() => ({ ...token?.grants }));
  const [projectIds, setProjectIds] = useState<string[]>(() => token?.projects.map((p) => p.id) ?? []);
  const [wikiIds, setWikiIds] = useState<string[]>(() => token?.wikis.map((w) => w.id) ?? []);
  const [label, setLabel] = useState(token?.label ?? '');
  const [expiry, setExpiry] = useState('');
  const [today] = useState(todayInBangkok);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const headId = useId();

  const grants = grantsOf(chosen, permissions);
  const kinds = scopeKindsInUse(grants);

  function chooseModule(key: ModuleKey, on: boolean) {
    const next = toggle(chosen, key, on);
    setChosen(next);
    if (!on) {
      setPermissions((p) => { const next = { ...p }; delete next[key]; return next; });
      const left = scopeKindsInUse(grantsOf(next, {}));
      if (!left.has('project')) setProjectIds([]);
      if (!left.has('wiki')) setWikiIds([]);
    }
  }

  function choosePermission(key: ModuleKey, permission: string, on: boolean) {
    setPermissions((p) => ({ ...p, [key]: toggle(p[key] ?? [], permission, on) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    setBusy(true); setFailure('');
    const scope = {
      projectIds: kinds.has('project') ? projectIds.filter((id) => projects.some((p) => p.id === id)) : [],
      wikiIds: kinds.has('wiki') ? wikiIds.filter((id) => wikis.some((w) => w.id === id)) : [],
    };
    try {
      if (token) {
        await updateToken(token.id, { label, grants, scope });
        onDone();
      } else {
        onDone(await createToken({ label, expiresAt: endOfDay(expiry), grants, scope }));
      }
    } catch (err) {
      setFailure(problem(err, 'That did not save. Reload and try again.'));
      setBusy(false);
    }
  }

  const canNext = step === 0 ? chosen.length > 0 : step === 3 ? label.trim().length > 0 : true;
  const usedBy = (kind: ScopeKind) => joinNames(modulesOfKind(chosen, kind).map((m) => m.label));
  const scopeCount = (kind: ScopeKind) => {
    const n = kind === 'project' ? projectIds.length : wikiIds.length;
    const noun = kind === 'project' ? 'project' : 'wiki';
    return n === 0 ? `no ${noun} yet` : `${n} ${noun}${n === 1 ? '' : 's'}`;
  };

  return <form className="tk-stepper" aria-label={token ? `Edit ${token.label}` : 'New token'} onSubmit={(e) => void submit(e)}>
    <Steps at={step} />

    {step === 0 && <fieldset className="tk-step" aria-describedby={`${headId}-0`}>
      <legend className="tk-step-head">Which modules can this token use?</legend>
      <p id={`${headId}-0`} className="tk-step-hint">Choose one or more.</p>
      <div className="tk-mods">
        {TOKEN_MODULES.map((m) => <ModuleCard key={m.key} mod={m} checked={chosen.includes(m.key)}
          onChange={(on) => chooseModule(m.key, on)} />)}
      </div>
    </fieldset>}

    {step === 1 && <div className="tk-step">
      <h3 className="tk-step-head">What can it do in each module?</h3>
      <p className="tk-step-hint">Read is always on. Create and Write are chosen per module, and never exceed your own access.</p>
      {TOKEN_MODULES.filter((m) => chosen.includes(m.key)).map((m) => <fieldset key={m.key} className="tk-grp">
        <legend>{m.label}</legend>
        <Check locked label="Read" hint={m.readHint} checked />
        {m.permissions.map((p) => <Check key={p.key} label={p.label} hint={p.hint}
          checked={(permissions[m.key] ?? []).includes(p.key)} onChange={(on) => choosePermission(m.key, p.key, on)} />)}
      </fieldset>)}
    </div>}

    {step === 2 && <div className="tk-step">
      <h3 className="tk-step-head">Where can it be used?</h3>
      <p className="tk-step-hint">Only what you can see is offered. Select all chooses what is listed now; a project or wiki made later is not added.</p>
      {kinds.has('project') && <ScopeGroup title="Projects" usedBy={usedBy('project')}
        items={projects.map((p) => ({ id: p.id, name: p.name, badge: PROJECT_ROLE[p.role], note: projectNote(p.role, grants) }))}
        chosen={projectIds} onChange={setProjectIds} empty="You are not in any project, so this token reaches none." />}
      {kinds.has('wiki') && <ScopeGroup title="Wikis" usedBy={usedBy('wiki')}
        items={wikis.map((w) => ({ id: w.id, name: w.title, badge: WIKI_ROLE[w.role], note: wikiNote(w.role, grants) }))}
        chosen={wikiIds} onChange={setWikiIds} empty="You cannot see any wiki yet, so this token reaches none." />}
    </div>}

    {step === 3 && <div className="tk-step">
      <h3 className="tk-step-head">Name it and check</h3>
      <div className="tk-fields">
        <label className="tk-field"><span className="tk-field-label">Label</span>
          <input value={label} required maxLength={MAX_LABEL} disabled={busy} placeholder="e.g. Work laptop"
            onChange={(e) => setLabel(e.target.value)} /></label>
        {!editing && <label className="tk-field"><span className="tk-field-label" id="tk-expiry-label">Expires <span className="tk-opt">(optional)</span></span>
          <DatePicker aria-labelledby="tk-expiry-label" className="h-9" placeholder="Never" value={expiry || null} min={today} disabled={busy}
            onChange={(next) => setExpiry(next ?? '')} /></label>}
      </div>
      <dl className="tk-summary">
        {TOKEN_MODULES.filter((m) => chosen.includes(m.key)).map((m) => {
          const extra = m.permissions.filter((p) => (permissions[m.key] ?? []).includes(p.key)).map((p) => p.label);
          return <div key={m.key}>
            <dt>{m.label}</dt>
            <dd>{['Read', ...extra].join(', ')}<span className="tk-summary-where"> · {scopeCount(m.scope)}</span></dd>
          </div>;
        })}
      </dl>
    </div>}

    {failure && <p className="tk-errata" role="alert">{failure}</p>}

    <div className="tk-foot">
      <div className="tk-foot-start">
        {step > 0 && <button type="button" className="tk-btn" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
        <button type="button" className="tk-quiet" disabled={busy} onClick={() => onDone()}>Cancel</button>
      </div>
      <button type="submit" className="tk-primary" disabled={!canNext || busy} aria-busy={busy}>
        {step < STEPS.length - 1 ? 'Next' : editing ? 'Save' : 'Create token'}
      </button>
    </div>
  </form>;
}
