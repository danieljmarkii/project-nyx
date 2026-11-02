// The visit's reports (Vet report v2 PR-22, CUL-2302): absent until answered and when none are
// filed, a failed read says so, and each row opens its copy.

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRead = jest.fn();
jest.mock('../../lib/reportVisitLink', () => ({
  ...jest.requireActual('../../lib/reportVisitLink'),
  readReportsForVisit: (...a: unknown[]) => mockRead(...a),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/vetVisits', () => ({ formatVisitDate: () => '' }));

import { VisitReports } from './VisitReports';

const thisYear = new Date().getFullYear();
const ROW = {
  id: 'r1', petId: 'pet-cooper', shortId: 'Q7K4', startDate: `${thisYear}-09-16`, endDate: `${thisYear}-10-29`,
  sharedVia: 'email', sharedAt: new Date(thisYear, 9, 30, 12).toISOString(),
};

beforeEach(() => jest.clearAllMocks());

it('lists the filed copies, read with the visit and its booking, and opens one', async () => {
  mockRead.mockResolvedValue([ROW]);
  const onOpen = jest.fn();
  const view = render(<VisitReports petId="pet-cooper" visitId="v1" appointmentId="a1" onOpenReport={onOpen} />);
  await waitFor(() => expect(view.getByTestId('visit-reports')).toBeTruthy());
  expect(mockRead).toHaveBeenCalledWith('pet-cooper', 'v1', 'a1');
  expect(view.getByText('Reports for this visit')).toBeTruthy();
  expect(view.getByText('Oct 30 report')).toBeTruthy();
  expect(view.getByText('Sep 16 – Oct 29 · Shared by email')).toBeTruthy();
  fireEvent.press(view.getByTestId('visit-report-r1'));
  expect(onOpen).toHaveBeenCalledWith(ROW);
});

it('a visit with nothing filed shows no section at all', async () => {
  mockRead.mockResolvedValue([]);
  const view = render(<VisitReports petId="pet-cooper" visitId="v1" appointmentId={null} onOpenReport={jest.fn()} />);
  await waitFor(() => expect(mockRead).toHaveBeenCalled());
  expect(view.queryByTestId('visit-reports')).toBeNull();
  expect(view.queryByTestId('visit-reports-failed')).toBeNull();
});

it('a failed read says so, never reads as a visit with no reports', async () => {
  mockRead.mockResolvedValue('failed');
  const view = render(<VisitReports petId="pet-cooper" visitId="v1" appointmentId={null} onOpenReport={jest.fn()} />);
  await waitFor(() => expect(view.getByTestId('visit-reports-failed')).toBeTruthy());
});
