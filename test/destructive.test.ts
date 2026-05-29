import { describe, it, expect } from 'vitest';
import { classifyControl, normalizeName } from '../src/guardrails/destructive';
import type { ElementDescriptor } from '../src/core/types';

function el(partial: Partial<ElementDescriptor>): ElementDescriptor {
  return {
    fp: 'x',
    tag: 'button',
    type: null,
    role: null,
    name: '',
    editable: false,
    path: '',
    selector: 'button',
    ...partial,
  };
}

describe('destructive classifier', () => {
  it('blocks delete / pay / logout by name', () => {
    expect(classifyControl(el({ name: 'Delete account' })).block).toBe(true);
    expect(classifyControl(el({ name: 'Pay now' })).block).toBe(true);
    expect(classifyControl(el({ name: 'Log out' })).block).toBe(true);
    expect(classifyControl(el({ name: 'Cancel subscription' })).block).toBe(true);
  });

  it('allows benign controls', () => {
    expect(classifyControl(el({ name: 'Save draft' })).block).toBe(false);
    expect(classifyControl(el({ name: 'Next' })).block).toBe(false);
    expect(classifyControl(el({ name: '' })).block).toBe(false);
  });

  it('blocks by dangerous href even with no text', () => {
    expect(classifyControl(el({ tag: 'a', name: '', href: '/account/delete' })).block).toBe(true);
    expect(classifyControl(el({ tag: 'a', name: '', href: '/logout' })).block).toBe(true);
  });

  it('honors extra verbs and multilingual matches', () => {
    expect(classifyControl(el({ name: 'Eliminar' })).block).toBe(true);
    expect(classifyControl(el({ name: 'Abmelden' })).block).toBe(true);
    expect(classifyControl(el({ name: 'Nuke it' }), ['nuke']).block).toBe(true);
  });

  it('normalizeName strips accents and punctuation', () => {
    expect(normalizeName('  Élïmïnär! ')).toBe('eliminar');
  });
});
