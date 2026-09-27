// CUL-1275 — the iOS half of a live region. Every case drives the real hook against a
// spy on the one native call it makes; the platform is set per case and restored in a
// `finally`, because a leaked `Platform.OS` reds unrelated suites further down (the
// SignalZone mutation pass found that the hard way).
import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { useLiveRegionAnnouncement } from './useLiveRegionAnnouncement';

function onPlatform(os: 'ios' | 'android', body: (announce: jest.SpyInstance) => void) {
  const prev = Platform.OS;
  Platform.OS = os;
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
  // RN's jest preset already makes this a `jest.fn`, and `spyOn` over a mock returns THAT
  // mock with its calls — clear it, or a previous case's utterance counts here.
  announce.mockClear();
  try {
    body(announce);
  } finally {
    announce.mockRestore();
    Platform.OS = prev;
  }
}

type Props = { message: string | null; id?: string | null };

describe('useLiveRegionAnnouncement', () => {
  it('speaks a message on iOS the moment it appears', () => {
    onPlatform('ios', (announce) => {
      renderHook(({ message }: Props) => useLiveRegionAnnouncement(message), {
        initialProps: { message: 'Vomit logged. Saved to Nyx’s record' },
      });
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Vomit logged. Saved to Nyx’s record');
    });
  });

  it('is silent on Android — the paired live region already speaks there', () => {
    onPlatform('android', (announce) => {
      const view = renderHook(({ message }: Props) => useLiveRegionAnnouncement(message), {
        initialProps: { message: 'Removed. Taken out of Nyx’s record' },
      });
      view.rerender({ message: 'Something else' });
      expect(announce).not.toHaveBeenCalled();
    });
  });

  it('says nothing for null, and a re-render with the same message does not repeat it', () => {
    onPlatform('ios', (announce) => {
      const view = renderHook(({ message }: Props) => useLiveRegionAnnouncement(message), {
        initialProps: { message: null } as Props,
      });
      expect(announce).not.toHaveBeenCalled();
      view.rerender({ message: 'Dose logged' });
      view.rerender({ message: 'Dose logged' });
      expect(announce).toHaveBeenCalledTimes(1);
    });
  });

  it('re-arms through null — a card that hides and comes back speaks again', () => {
    onPlatform('ios', (announce) => {
      const view = renderHook(({ message }: Props) => useLiveRegionAnnouncement(message), {
        initialProps: { message: 'Dose logged' } as Props,
      });
      view.rerender({ message: null });
      view.rerender({ message: 'Dose logged' });
      expect(announce).toHaveBeenCalledTimes(2);
    });
  });

  it('speaks an identical sentence again when the KEY changes (a second save, same words)', () => {
    onPlatform('ios', (announce) => {
      const view = renderHook(
        ({ message, id }: Props) => useLiveRegionAnnouncement(message, id),
        { initialProps: { message: 'Vomit · today at 2:14', id: 'e1' } as Props },
      );
      view.rerender({ message: 'Vomit · today at 2:14', id: 'e2' });
      expect(announce).toHaveBeenCalledTimes(2);
    });
  });

  it('does not speak a key change with nothing to say', () => {
    onPlatform('ios', (announce) => {
      const view = renderHook(
        ({ message, id }: Props) => useLiveRegionAnnouncement(message, id),
        { initialProps: { message: null, id: 'e1' } as Props },
      );
      view.rerender({ message: null, id: 'e2' });
      expect(announce).not.toHaveBeenCalled();
    });
  });
});
