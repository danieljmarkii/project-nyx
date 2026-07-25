import { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ProteinSetPicker } from './ProteinSetPicker';
import { pickerProteinsToSet, pickerPrimaryProtein, seedPickerProteins, type PickerProteins } from '../../lib/protein';

function Host({ initial, onEmit }: { initial: PickerProteins; onEmit?: (n: PickerProteins) => void }) {
  const [set, setSet] = useState<PickerProteins>(initial);
  return <ProteinSetPicker main={set.main} alsoContains={set.alsoContains} onChange={(next) => { onEmit?.(next); setSet(next); }} />;
}
const persist = (s: PickerProteins) => ({ primary: pickerPrimaryProtein(s.main), proteins: pickerProteinsToSet(s.main, s.alsoContains) });

describe('WORKING-TREE re-probe', () => {
  it('A: keystroke junk partials', () => {
    let last: PickerProteins | null = null;
    const { getByRole, getByPlaceholderText } = render(<Host initial={{ main: 'chicken', alsoContains: [] }} onEmit={(n) => { last = n; }} />);
    fireEvent.press(getByRole('radio', { name: 'Other' }));
    const f = getByPlaceholderText('Name the protein');
    for (const t of ['b','bi','bis','biso','bison']) fireEvent.changeText(f, t);
    fireEvent(f, 'blur');
    console.log('A:', JSON.stringify(last), JSON.stringify(persist(last!)));
  });
  it('B: buffalo -> bison (single paste)', () => {
    let last: PickerProteins | null = null;
    const { getByRole, getByPlaceholderText } = render(<Host initial={{ main: null, alsoContains: [] }} onEmit={(n) => { last = n; }} />);
    fireEvent.press(getByRole('radio', { name: 'Other' }));
    const f = getByPlaceholderText('Name the protein');
    fireEvent.changeText(f, 'buffalo'); fireEvent(f, 'blur');
    console.log('B:', JSON.stringify(last), JSON.stringify(persist(last!)));
  });
  it('C: seeded ocean whitefish, focus+blur, no typing', () => {
    let last: PickerProteins | null = null;
    const { getByPlaceholderText } = render(<Host initial={{ main: 'ocean whitefish', alsoContains: ['chicken'] }} onEmit={(n) => { last = n; }} />);
    const f = getByPlaceholderText('Name the protein');
    fireEvent(f, 'focus'); fireEvent(f, 'blur');
    console.log('C:', JSON.stringify(last));
  });
  it('D: clear the main, round trip', () => {
    let last: PickerProteins | null = null;
    const { getByRole } = render(<Host initial={{ main: 'duck', alsoContains: ['chicken'] }} onEmit={(n) => { last = n; }} />);
    fireEvent.press(getByRole('radio', { name: 'Duck' }));
    const p = persist(last!);
    console.log('D: picker', JSON.stringify(last), 'persisted', JSON.stringify(p), 'reseed', JSON.stringify(seedPickerProteins(p.primary, p.proteins)));
  });
  it('E: retype the main over a SEEDED custom value (kangaroo -> emu)', () => {
    let last: PickerProteins | null = null;
    const { getByPlaceholderText } = render(<Host initial={{ main: 'kangaroo', alsoContains: ['chicken'] }} onEmit={(n) => { last = n; }} />);
    const f = getByPlaceholderText('Name the protein');
    fireEvent.changeText(f, 'emu'); fireEvent(f, 'blur');
    console.log('E:', JSON.stringify(last), JSON.stringify(persist(last!)));
  });
  it('F: backspace the Other field to empty (a clear by typing)', () => {
    let last: PickerProteins | null = null;
    const { getByPlaceholderText } = render(<Host initial={{ main: 'kangaroo', alsoContains: ['chicken'] }} onEmit={(n) => { last = n; }} />);
    const f = getByPlaceholderText('Name the protein');
    fireEvent.changeText(f, ''); fireEvent(f, 'blur');
    console.log('F:', JSON.stringify(last), JSON.stringify(persist(last!)));
  });
  it('G: chip main -> Other -> type, does the old main survive?', () => {
    let last: PickerProteins | null = null;
    const { getByRole, getByPlaceholderText } = render(<Host initial={{ main: 'duck', alsoContains: [] }} onEmit={(n) => { last = n; }} />);
    fireEvent.press(getByRole('radio', { name: 'Other' }));
    const f = getByPlaceholderText('Name the protein');
    fireEvent.changeText(f, 'emu'); fireEvent(f, 'blur');
    console.log('G:', JSON.stringify(last), JSON.stringify(persist(last!)));
  });
});
