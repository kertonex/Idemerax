import { render } from '@testing-library/react';

import Header from '../../../src/components/layout/Header';

describe('Header', () => {
  it('does not render a duplicate header because navigation is provided by Sidebar', () => {
    const { container } = render(<Header />);

    expect(container).toBeEmptyDOMElement();
  });
});
