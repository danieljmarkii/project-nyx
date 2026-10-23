// The log pickers' silhouette (CUL-2168): the shape of the food or medication tiles
// that are coming, while the picker's local read has not answered. Two section labels,
// each over a 2-up grid of tile blocks — the faithful column of the log form design
// pass, §04. Static by design: the read is local and answers inside a frame or two, so
// a loop would only flicker (the tick is for a request in flight, and this is not one).
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { Block, Line, SilhouetteFrame } from './Silhouette';

export const PICKER_SILHOUETTE_TEST_ID = 'picker-silhouette';

const TILE_ROWS = [0, 1];

function TileGrid() {
  return (
    <View style={styles.grid}>
      {TILE_ROWS.map((row) => (
        <View key={row} style={styles.gridRow}>
          <Block height={theme.space6} radius={theme.radiusMedium} style={styles.tile} />
          <Block height={theme.space6} radius={theme.radiusMedium} style={styles.tile} />
        </View>
      ))}
    </View>
  );
}

export function PickerSilhouette() {
  return (
    <SilhouetteFrame testID={PICKER_SILHOUETTE_TEST_ID} style={styles.zone}>
      <Line width="40%" />
      <TileGrid />
      <Line width="30%" />
      <TileGrid />
    </SilhouetteFrame>
  );
}

const styles = StyleSheet.create({
  zone: {
    gap: theme.space2,
  },
  grid: {
    gap: theme.space2,
  },
  gridRow: {
    flexDirection: 'row',
    gap: theme.space2,
  },
  tile: {
    flex: 1,
  },
});
