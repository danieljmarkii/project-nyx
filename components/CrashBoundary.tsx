import { Component, Fragment, ReactNode } from 'react';
import { useCrashStore } from '../store/crashStore';
import { handleCrash } from '../lib/crashHandlers';
import { CrashScreen } from './CrashScreen';

// The root of the app's crash handling (CUL-1841). It draws the one designed screen
// when any of three doors opens: a render error below it (caught here), a fatal global
// error, or an unhandled promise rejection (both set the flag from
// `lib/crashHandlers.ts`). Nothing about the error is kept or sent (D9 (a), CUL-1825).
//
// "Try again" clears the flag and remounts the whole tree under a new key, so every
// effect runs from the start: the auth listener, the sync, the cold-start routing. A
// remount is the closest thing to a relaunch the JS side can do without a reload. A
// crash that comes back soon after it really crashes the app (`handleCrash`), so the
// owner never loops on this screen and the phone files a crash report.

interface InnerProps {
  crashed: boolean;
  onRetry: (now: number) => void;
  children: ReactNode;
}

interface InnerState {
  caught: boolean;
  generation: number;
}

class CrashBoundaryInner extends Component<InnerProps, InnerState> {
  state: InnerState = { caught: false, generation: 0 };

  static getDerivedStateFromError(): Partial<InnerState> {
    return { caught: true };
  }

  componentDidCatch(error: unknown): void {
    // The error is passed on only to decide first-or-repeat, and on a repeat to the
    // native handler; nothing here keeps or sends it.
    handleCrash(error);
  }

  private retry = (): void => {
    this.props.onRetry(Date.now());
    this.setState((s) => ({ caught: false, generation: s.generation + 1 }));
  };

  render(): ReactNode {
    if (this.state.caught || this.props.crashed) {
      return <CrashScreen onRetry={this.retry} />;
    }
    return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
  }
}

export function CrashBoundary({ children }: { children: ReactNode }) {
  const crashed = useCrashStore((s) => s.crashed);
  const retry = useCrashStore((s) => s.retry);
  return (
    <CrashBoundaryInner crashed={crashed} onRetry={retry}>
      {children}
    </CrashBoundaryInner>
  );
}
