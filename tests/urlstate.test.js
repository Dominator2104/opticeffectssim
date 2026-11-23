import { describe, it, expect } from 'vitest';
import { encodeSettings, decodeSettings, urlKey } from '../src/urlstate.js';

const defaults = {
  'beta:input': '0',
  'accel:beta1': '0,99',
  'radio:accmode-sim': 'acceleration',
  'radio:star-model': 'screen',
  fov: '60',
  'cam-lens': false,
  'blur-tb': '1/48',
};

describe('urlstate', () => {
  it('maps internal keys to readable names', () => {
    expect(urlKey('beta:input')).toBe('beta');
    expect(urlKey('accel:a')).toBe('accel.a');
    expect(urlKey('radio:accmode-sim')).toBe('accel.mode');
    expect(urlKey('radio:spectrum')).toBe('spectrum');
    expect(urlKey('fov')).toBe('fov');
  });

  it('writes only values that differ from the defaults', () => {
    expect(encodeSettings({ ...defaults }, defaults)).toBe('');
    const s = encodeSettings({ ...defaults, fov: '90', 'cam-lens': true, 'beta:input': '0,9' }, defaults);
    expect(s).toBe('?beta=0,9&fov=90&cam-lens=1');
  });

  it('adds the view direction unless looking straight ahead', () => {
    expect(encodeSettings(defaults, defaults, { yawDeg: 0, pitchDeg: 0 })).toBe('');
    expect(encodeSettings(defaults, defaults, { yawDeg: 12.3456, pitchDeg: -3 })).toBe('?view=12.35,-3');
  });

  it('round-trips values, booleans, radios and the view', () => {
    const values = { ...defaults, 'accel:beta1': '0,5', 'radio:accmode-sim': 'duration', 'radio:star-model': 'camera', 'cam-lens': true, 'blur-tb': '1/24' };
    const search = encodeSettings(values, defaults, { yawDeg: 45, pitchDeg: 10 });
    const r = decodeSettings(search, defaults);
    expect(r.found).toBe(true);
    expect({ ...defaults, ...r.values }).toEqual(values);
    expect(r.view).toEqual({ yawDeg: 45, pitchDeg: 10 });
  });

  it('ignores unknown parameters and reports nothing found', () => {
    const r = decodeSettings('?utm_source=x&foo=1', defaults);
    expect(r.found).toBe(false);
    expect(r.values).toEqual({});
    expect(r.view).toBeNull();
  });

  it('reads booleans written as 0/1 and decodes escaped text', () => {
    const r = decodeSettings('?cam-lens=0&fov=75&blur-tb=1%2F48', defaults);
    expect(r.values).toEqual({ 'cam-lens': false, fov: '75', 'blur-tb': '1/48' });
  });
});
