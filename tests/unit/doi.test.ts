import { describe, expect, it } from 'vitest';
import { doiKey, extractDoi, isValidDoi, normalizeDoi } from '../../shared/doi.ts';

describe('normalizeDoi', () => {
  it.each([
    ['10.1038/nature14539', '10.1038/nature14539'],
    ['doi:10.1038/nature14539', '10.1038/nature14539'],
    ['DOI: 10.1038/nature14539', '10.1038/nature14539'],
    ['https://doi.org/10.1038/nature14539', '10.1038/nature14539'],
    ['http://dx.doi.org/10.1038/nature14539', '10.1038/nature14539'],
    ['  10.1038/nature14539.  ', '10.1038/nature14539'],
    ['https://doi.org/10.1002%2Fasi.4', '10.1002/asi.4'],
  ])('%s', (input, out) => expect(normalizeDoi(input)).toBe(out));

  it('keeps a balanced trailing parenthesis that belongs to the DOI', () => {
    expect(normalizeDoi('10.1016/S0006-3495(76)85000-1')).toBe('10.1016/S0006-3495(76)85000-1');
    expect(normalizeDoi('10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O')).toBe('10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O');
    expect(normalizeDoi('10.1000/abc(1)')).toBe('10.1000/abc(1)');
  });

  it('strips an unbalanced closing parenthesis from surrounding prose', () => {
    expect(normalizeDoi('10.1000/abc)')).toBe('10.1000/abc');
    expect(normalizeDoi('10.1000/abc(1)).')).toBe('10.1000/abc(1)');
  });

  it('compares case-insensitively', () => {
    expect(doiKey('10.1162/NECO.1997.9.8.1735')).toBe(doiKey('doi:10.1162/neco.1997.9.8.1735'));
  });
});

describe('isValidDoi / extractDoi', () => {
  it('validates the 10.<4-9 digits>/suffix shape', () => {
    expect(isValidDoi('10.1038/x')).toBe(true);
    expect(isValidDoi('10.12/x')).toBe(false);
    expect(isValidDoi('10.1038/')).toBe(false);
    expect(isValidDoi('11.1038/x')).toBe(false);
    expect(isValidDoi('10.1038/a b')).toBe(false);
  });
  it('extracts from bibliography lines', () => {
    expect(extractDoi('LeCun et al. Deep learning. Nature 2015. doi:10.1038/nature14539.')).toBe('10.1038/nature14539');
    expect(extractDoi('see (https://doi.org/10.1016/S0006-3495(76)85000-1)')).toBe('10.1016/S0006-3495(76)85000-1');
    expect(extractDoi('no identifier here')).toBeUndefined();
  });
});
