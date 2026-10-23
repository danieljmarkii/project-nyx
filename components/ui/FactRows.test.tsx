import { render } from '@testing-library/react-native';
import { FactRows } from './FactRows';

describe('FactRows', () => {
  // C-8: each fact is one element whose label is the pair, so a screen reader hears it
  // once, never a label and a value it has to rejoin.
  it('announces each fact as one label and value', () => {
    const view = render(
      <FactRows facts={[{ label: 'Brand', value: 'Hillside Kitchen' }, { label: 'Format', value: 'Dry kibble' }]} />,
    );
    const brand = view.getByLabelText('Brand, Hillside Kitchen');
    expect(brand.props.accessible).toBe(true);
    expect(view.getByLabelText('Format, Dry kibble')).toBeTruthy();
  });

  it('wraps a row, so the value drops under its label at large text instead of clipping', () => {
    const view = render(<FactRows facts={[{ label: 'Product', value: 'Sensitive Stomach Salmon & Rice' }]} />);
    const style = [view.getByLabelText('Product, Sensitive Stomach Salmon & Rice').props.style].flat(3);
    expect(style.some((s: { flexWrap?: string } | null) => s?.flexWrap === 'wrap')).toBe(true);
  });
});
