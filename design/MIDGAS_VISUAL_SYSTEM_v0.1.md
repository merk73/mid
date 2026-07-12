# THE MIDGAS - Visual System v0.1

Status: working foundation. The system is intentionally strict and incomplete: it fixes the visual grammar before individual pages and cards are designed.

## 1. Character

THE MIDGAS should look like an active scientific registry, not a mystical archive, entertainment project, startup dashboard, or government imitation.

Core properties:

- sterile;
- direct;
- technical;
- modular;
- documentary;
- calm under pressure.

## 2. Non-negotiable rules

- Corner radius is always `0`.
- No pills, capsules, rounded cards, soft badges, or circular UI controls.
- No drop shadows, glass effects, gradients, glow, blur, or fake paper texture.
- No decorative occult symbols, glitch effects, or redacted-document theatre.
- Information hierarchy is created with scale, weight, spacing, rules, and alignment.
- Every block aligns to the grid.
- The base identity is monochrome. Color never replaces a written status or label.

## 3. Typography

Primary and only brand family: PT Mono.

- `PT Mono Bold` - wordmark, identifiers, page titles, section labels, key values.
- `PT Mono Regular` - body copy, descriptions, metadata, tables, captions.

Typography rules:

- `THE MIDGAS` is always uppercase.
- Registry identifiers are always uppercase: `MID-C-0001`, `MID-A-0001`.
- System labels may be uppercase: `STATUS`, `LOCATION`, `ACCESS`.
- Names use normal capitalization in long-form text and uppercase only in identity headers.
- Body copy is never set in all caps.
- Underlining is reserved for links.
- Italics are not part of the core system.

Suggested digital scale:

| Role | Size / line height | Weight |
|---|---:|---|
| Display | 64 / 64 px | Bold |
| H1 | 40 / 44 px | Bold |
| H2 | 28 / 32 px | Bold |
| H3 | 20 / 24 px | Bold |
| Body large | 18 / 28 px | Regular |
| Body | 15 / 24 px | Regular |
| Data | 13 / 20 px | Regular |
| Label | 11 / 16 px | Bold |

## 4. Color

The base identity has no brand color. Interface, typography, rules, identifiers, and navigation are monochrome. Documentary photographs may remain in color.

| Token | Value | Purpose |
|---|---|---|
| `paper` | `#FFFFFF` | Primary background |
| `surface` | `#FFFFFF` | Data surfaces and print |
| `ink` | `#000000` | Primary text and strong rules |
| `muted` | `#5C5C5C` | Secondary information |
| `grid` | `#D8D8D8` | Dividers and inactive cells |

Future color markers are a semantic data layer, not part of the identity. A marker may represent status, threat, access, or another approved scale, but it must be attached to a specific record and accompanied by a written or numeric value. Marker colors are never used in the wordmark, general navigation, page titles, or decoration.

## 5. Geometry and grid

- Base spacing unit: `4 px` digital / `1 mm` print.
- Preferred spacing sequence: `4, 8, 12, 16, 24, 32, 48, 64`.
- Desktop layout: 12 columns, 24 px gutters, 32 px outer margins.
- Mobile layout: 4 columns, 16 px gutters and margins.
- Card and table borders: 1 px.
- Emphasis rules: 2 px.
- Identity markers: 4 px black rule by default, never a rounded badge. A record-specific semantic marker may replace black later.
- All images are rectangular and flush with their frame.

## 6. Identity block

The primary wordmark is a text lockup:

```text
THE MIDGAS
RESEARCH DATA SYSTEM
```

The second line is optional and contextual. It is not part of the legal name.

Do not place the wordmark inside a rounded container. Preferred placement is top-left, aligned to the page or screen grid.

## 7. Registry identifiers

Identifiers are functional elements, not decorative badges.

```text
MID-C-0001 / CLIENT
MID-A-0001 / ANOMALY
```

Preferred treatment:

- PT Mono Bold;
- square 1 px border or no container;
- optional 4 px black bar on the left;
- no filled capsule;
- no color coding by faction.

## 8. Client cards

Required visual order:

1. Identifier.
2. Name and alternate designation.
3. Documentary photograph.
4. Type, status, state, access, threat, and location.
5. Short description.
6. Connections and incidents when space allows.

Coalitions are not a primary classification. Associations are displayed as links or plain rectangular tags.

## 9. Anomaly cards

Required visual order:

1. Identifier.
2. Official name and local name.
3. Geographic image, plan, or photograph.
4. Place type, status, coordinates, radius, and threat.
5. Short description.
6. Linked clients and incidents.

## 10. Photography

- Documentary source images are preferred.
- Preserve natural proportions and recognizable context.
- No beauty retouching, cinematic grading, vignettes, glow, or artificial grain.
- Use color when it carries information; grayscale is allowed for inconsistent archival material.
- Captions and source dates align to the same rectangular grid as the image.

## 11. Interface behavior

- Hover and focus states use border, underline, inversion, or the signal color.
- Motion is linear and brief: 120-180 ms.
- No spring, bounce, floating cards, or parallax.
- Tables and filters are primary navigation tools for large registries.

## 12. Next decisions

Before the system becomes v1.0, approve:

- semantic marker palette and its meanings;
- permanent wordmark lockup;
- Russian and English naming conventions;
- photographic rules for private individuals;
- final threat and access scales;
- desktop and mobile card prototypes.
