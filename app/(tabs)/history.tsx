import { HistoryScreen } from '../../components/historyV2/HistoryScreen';

// The History tab is History v2 (History v2 · the record you can read; spec §5.1). The
// screen's drawing lives in `components/historyV2/`, whose composition root takes today's
// links into History (`useHistoryDoor`). The rollout flag and v1's screen retired at GA
// (HV-14 / CUL-1175).
export default function HistoryTab() {
  return <HistoryScreen />;
}
