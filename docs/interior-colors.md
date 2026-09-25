# Interior colors

`interior-theme.css` owns the interior palette. Primary actions use slate blue `#465775`, with `#EEF1F7` for soft surfaces, `#35413D` for body text, and `#596579` for secondary text. Hover and pressed states use darker blue or tinted surfaces.

The existing `--green`, `--deep` and `--mint` aliases resolve to the interior tokens for compatibility with existing components. New components should use the `--ui-*` tokens directly.

Brand header, navigation and login wordmark keep green. Success, warning, rejection, emergency, gate decisions, household presence modes, air quality, and pass categories keep their semantic colors. Do not replace status colors with action colors.
