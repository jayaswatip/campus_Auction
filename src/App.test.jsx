import { render, screen } from '@testing-library/react';
import App from './App';
import { MemoryRouter } from 'react-router-dom';

test('renders the CampusBid landing page', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );

  expect(screen.getAllByText(/CampusBid/i).length).toBeGreaterThan(0);
});
