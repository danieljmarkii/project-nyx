// iOS Dynamic Type for the capture path's web build (CUL-1895). Loaded first by
// stubs/entry.ts, before any screen module, and only when NYX_WEB_CAPTURE=1.
//
// On iOS the text engine multiplies every Text's fontSize (and lineHeight and
// letterSpacing) by the OS text size, capped by the Text's own maxFontSizeMultiplier,
// and `fontScale` reports it to layout code (the FAB's fan budget reads it). A browser
// has no such setting, so this wraps react-native-web's Text and TextInput to apply the
// same multiplier, and reports it through Dimensions, before the first render and with
// no app change. The capture
// script sets `globalThis.__NYX_FONT_SCALE`; unset, it is 1 and nothing is swapped.
/* eslint-disable @typescript-eslint/no-var-requires */
const TextModule = require('react-native-web/dist/exports/Text');
const TextInputModule = require('react-native-web/dist/exports/TextInput');
const DimensionsModule = require('react-native-web/dist/exports/Dimensions');
const StyleSheetModule = require('react-native-web/dist/exports/StyleSheet');
/* eslint-enable @typescript-eslint/no-var-requires */

const SCALE = (() => {
  const s = (globalThis as { __NYX_FONT_SCALE?: unknown }).__NYX_FONT_SCALE;
  return typeof s === 'number' && s > 0 ? s : 1;
})();

type Scalable = {
  style?: unknown;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number | null;
};

function scaledStyle(props: Scalable): unknown {
  if (props.allowFontScaling === false) return props.style;
  const cap = props.maxFontSizeMultiplier;
  const m = cap != null && cap >= 1 ? Math.min(SCALE, cap) : SCALE;
  const flat = (StyleSheetModule.default.flatten(props.style) ?? {}) as Record<string, unknown>;
  const over: Record<string, number> = {};
  for (const k of ['fontSize', 'lineHeight', 'letterSpacing']) {
    if (typeof flat[k] === 'number') over[k] = (flat[k] as number) * m;
  }
  return [props.style, over];
}

// Text and TextInput are forwardRef objects, and every import of them is the same
// object, so wrapping its `render` reaches every screen (the module's export binding is
// a read-only getter and cannot be replaced).
function scaleRender(component: { render: (props: Scalable, ref: unknown) => unknown }): void {
  const render = component.render;
  component.render = (props: Scalable, ref: unknown) => render({ ...props, style: scaledStyle(props) }, ref);
}

if (SCALE !== 1) {
  scaleRender(TextModule.default);
  scaleRender(TextInputModule.default);
  const Dimensions = DimensionsModule.default;
  const get = Dimensions.get.bind(Dimensions);
  Dimensions.get = (dim: 'window' | 'screen') => ({ ...get(dim), fontScale: SCALE });
}
