/**
 * Deterministic, constraint-satisfying value generation for form fields.
 *
 * Each field's value is derived from a stable salt — fnv1a(runId:formKey:name) —
 * so it never shifts when unrelated DOM reorders, and is reproducible for a
 * given seed (no Math.random, no wall-clock dates). Values are valid-by-contract
 * (type, pattern, min/max/step, min/maxlength, option sets) so submits succeed,
 * and "clean" (not hostile) — buttonmash's job here is to CONSTRUCT data; the
 * fuzz corpus is for destruction elsewhere. One free-text field per form gets a
 * reflected-input canary so the XSS oracle still fires on created records.
 */
import { fnv1a } from '../core/hash';
import { Rng } from '../core/rng';
import type { FieldDescriptor } from '../core/types';

export interface FieldValue {
  /** String to type / option value to select. */
  value: string;
  /** For checkbox/radio. */
  checked?: boolean;
  /** Reflected-input canary embedded in this value, if any. */
  canary?: string;
}

const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie'];
const LAST = ['Rivera', 'Chen', 'Patel', 'Nguyen', 'Garcia', 'Kim', 'Brooks', 'Okafor'];
const WORDS = ['summit', 'gala', 'launch', 'keynote', 'showcase', 'expo', 'session', 'review'];
const COMPANIES = ['Acme Productions', 'Northwind Events', 'Globex Live', 'Initech AV'];
const CITIES = ['Austin', 'Denver', 'Portland', 'Nashville', 'Chicago', 'Seattle'];
const STREETS = ['Main St', 'Oak Ave', 'Cedar Rd', 'Elm Blvd'];

const pick = (r: Rng, arr: readonly string[]): string => r.pick(arr);

/** Field names/labels that mean "confirm the password above". */
const CONFIRM_RE = /confirm|verify|again|repeat|re-?enter/i;

/** Build the per-field deterministic RNG. Password fields share one salt per
 *  form so a confirm-password matches the password. */
function fieldRng(runId: string, field: FieldDescriptor, attempt: number): Rng {
  const family =
    field.kind === 'password' ? `${field.formKey}:pw` : `${field.formKey}:${field.name || field.selector}`;
  return new Rng(`${runId}:${family}:${attempt}`);
}

function clamp(s: string, field: FieldDescriptor, r: Rng): string {
  if (field.maxLength && s.length > field.maxLength) s = s.slice(0, field.maxLength);
  if (field.minLength && s.length < field.minLength) {
    while (s.length < field.minLength) s += pick(r, ['x', 'y', 'z', '1', '2']);
  }
  return s;
}

function num(field: FieldDescriptor, r: Rng): string {
  const min = field.min !== undefined && field.min !== '' ? Number(field.min) : 1;
  const max = field.max !== undefined && field.max !== '' ? Number(field.max) : Math.max(min + 9, 10);
  const step = field.step && field.step !== 'any' ? Number(field.step) : 1;
  const lo = Number.isFinite(min) ? min : 1;
  const hi = Number.isFinite(max) && max >= lo ? max : lo + 9;
  let v = r.intBetween(Math.ceil(lo), Math.floor(hi));
  if (Number.isFinite(step) && step > 0) v = lo + Math.round((v - lo) / step) * step;
  return String(v);
}

/** Seed-derived date (NOT wall-clock) within [min,max] if given. */
function dateValue(field: FieldDescriptor, r: Rng): string {
  // Base epoch day for 2026-01-01, plus a seeded offset within a 2-year window.
  const baseDay = Math.floor(Date.parse('2026-01-01T00:00:00Z') / 86_400_000);
  let day = baseDay + r.intBetween(0, 729);
  const toIso = (d: number) => new Date(d * 86_400_000).toISOString();
  const minDay = field.min ? Math.floor(Date.parse(field.min) / 86_400_000) : null;
  const maxDay = field.max ? Math.floor(Date.parse(field.max) / 86_400_000) : null;
  if (minDay && Number.isFinite(minDay) && day < minDay) day = minDay;
  if (maxDay && Number.isFinite(maxDay) && day > maxDay) day = maxDay;
  const iso = toIso(day);
  switch (field.kind) {
    case 'date':
      return iso.slice(0, 10);
    default:
      // datetime-local style for any other date-ish text input
      return iso.slice(0, 16);
  }
}

function semanticText(field: FieldDescriptor, r: Rng, salt: string): { value: string; canary?: string } {
  const hay = `${field.name} ${field.label} ${field.placeholder} ${field.autocomplete ?? ''}`.toLowerCase();
  const has = (re: RegExp) => re.test(hay);
  if (has(/first.?name|given/)) return { value: pick(r, FIRST) };
  if (has(/last.?name|surname|family/)) return { value: pick(r, LAST) };
  if (has(/full.?name|^name$|\bname\b|display/)) return { value: `${pick(r, FIRST)} ${pick(r, LAST)}` };
  if (has(/user.?name|handle/)) return { value: `${pick(r, FIRST).toLowerCase()}${salt.slice(0, 4)}` };
  if (has(/e-?mail/)) return { value: `${pick(r, WORDS)}.${salt.slice(0, 6)}@example.com` };
  if (has(/phone|mobile|tel/)) return { value: `512${salt.replace(/\D/g, '').padEnd(7, '0').slice(0, 7)}` };
  if (has(/compan|organi[sz]ation|business|client/)) return { value: pick(r, COMPANIES) };
  if (has(/city|town/)) return { value: pick(r, CITIES) };
  if (has(/state|province|region/)) return { value: 'TX' };
  if (has(/zip|postal/)) return { value: `78${salt.replace(/\D/g, '').padEnd(3, '0').slice(0, 3)}` };
  if (has(/address|street/)) return { value: `${r.intBetween(100, 9999)} ${pick(r, STREETS)}` };
  if (has(/url|website|link/)) return { value: `https://example.com/${pick(r, WORDS)}` };
  if (has(/title|subject|event|project|show/)) return { value: `${pick(r, WORDS)} ${pick(r, ['2026', 'Live', 'Tour'])}` };
  if (has(/search|query|filter/)) return { value: pick(r, WORDS) };
  // Free-text / description / notes — embed a canary so reflected-XSS still fires.
  if (field.kind === 'textarea' || field.kind === 'contenteditable' || has(/desc|note|comment|message|bio|about/)) {
    const canary = `cnry${salt.slice(0, 8)}zz`;
    return { value: `${pick(r, WORDS)} seed ${canary}`, canary };
  }
  return { value: `Seed ${salt.slice(0, 6)}` };
}

function matchesPattern(value: string, pattern?: string): boolean {
  if (!pattern) return true;
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return true; // unparseable pattern → don't block
  }
}

/**
 * Produce a valid value for `field`. `attempt` (>0) escalates strategy when a
 * previous submit was rejected.
 */
export function valueForField(runId: string, field: FieldDescriptor, attempt = 0): FieldValue {
  const r = fieldRng(runId, field, attempt);
  const salt = fnv1a(`${runId}:${field.formKey}:${field.name || field.selector}`);

  switch (field.kind) {
    case 'checkbox':
      return { value: 'true', checked: field.required ? true : r.bool() };
    case 'radio':
      return { value: 'true', checked: true };
    case 'select': {
      const opts = (field.options ?? []).filter((o) => !o.disabled && o.value !== '');
      if (opts.length === 0) return { value: '' };
      return { value: r.pick(opts).value };
    }
    case 'number':
    case 'range':
      return { value: num(field, r) };
    case 'date':
      return { value: dateValue(field, r) };
    case 'color':
      return { value: `#${salt.slice(0, 6)}` };
    case 'tel':
      return { value: clamp(`512555${r.intBetween(1000, 9999)}`, field, r) };
    case 'url':
      return { value: clamp(`https://example.com/${pick(r, WORDS)}`, field, r) };
    case 'email':
      return { value: clamp(`${pick(r, WORDS)}.${salt.slice(0, 6)}@example.com`, field, r) };
    case 'password': {
      // Policy-satisfying and identical across ALL password fields in the form
      // (so a confirm/verify field matches) — keyed by the form, not the name.
      const pwSalt = fnv1a(`${runId}:${field.formKey}:pw`);
      const base = `Aa1!${pwSalt.slice(0, 8)}`;
      const min = Math.max(8, field.minLength ?? 0);
      let v = base;
      while (v.length < min) v += pwSalt.slice(0, 4);
      return { value: v.slice(0, Math.max(min, field.maxLength ?? min)) };
    }
    case 'file':
      return { value: '' }; // handled/skipped by the runner
    default: {
      // text / textarea / contenteditable
      const sem = semanticText(field, r, salt);
      let value = clamp(sem.value, field, r);
      // Honor an explicit pattern if the semantic value violates it.
      if (!matchesPattern(value, field.pattern)) {
        value = clamp(/\\d|\[0-9\]/.test(field.pattern ?? '') ? String(r.intBetween(10000, 99999)) : `seed${salt.slice(0, 6)}`, field, r);
      }
      return { value, canary: sem.canary };
    }
  }
}

export { CONFIRM_RE };
