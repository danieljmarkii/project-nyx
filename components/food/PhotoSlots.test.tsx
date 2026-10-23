import { render } from '@testing-library/react-native';
import { PhotoSlots } from './PhotoSlots';

describe('PhotoSlots', () => {
  // The slots show the plan; they are never buttons, because the consent sheet sits
  // before the first picker and a slot tapped out of order would walk around it.
  it('is one accessible summary, not three doors', () => {
    const view = render(
      <PhotoSlots
        testID="slots"
        slots={[
          { label: 'Front · needed', uri: null },
          { label: 'Ingredients · optional', uri: 'file:///i.jpg' },
          { label: 'Barcode · optional', uri: null },
        ]}
      />,
    );
    const row = view.getByTestId('slots');
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe(
      'Photos: Front, needed; Ingredients, optional, added; Barcode, optional',
    );
    expect(view.UNSAFE_queryAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  });
});
