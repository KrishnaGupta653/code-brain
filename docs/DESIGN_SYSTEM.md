# Stitch Design System Reference

## Project Information
- **Project Name:** code-brain Graph Visualization UI
- **Project ID:** `17518073622440352674`
- **Design System:** Cypher Mesh
- **Status:** Complete

## Accessing the Designs

### Option 1: Via Stitch Web
Visit: https://stitch.googleapis.com/mcp
- Workspace: Your Stitch account
- Project: "code-brain Graph Visualization UI"
- Project ID: `17518073622440352674`

### Option 2: MCP Integration
The project is connected via MongoDB VS Code extension's MCP server. API calls automatically use your configured API key from `mcp.json`.

## Design System: Cypher Mesh

### Core Philosophy
**"The Kinetic Blueprint"** for high-density technical interfaces:
- Removes visual noise through tonal layering
- Uses glassmorphism for floating panels
- Implements editorial typography hierarchy
- Optimized for long-form code analysis sessions

### Design Tokens

#### Surface Hierarchy
```
surface (#0b1326)
├── surface-container-low (#131b2e) — Secondary panels, backgrounds
├── surface-container-high (#222a3d) — Active focus areas, cards
└── surface-container-highest (#2d3449) — Input fields, dropdowns
```

#### Colors
- **Primary:** `#4cd7f6` (Cyan) — Main accent, active states
- **Primary Container:** `#06b6d4` (Cyan dark) — Button fills, highlights
- **Tertiary:** `#ffb873` (Orange) — Attention, warnings, important nodes
- **On Surface:** `#daa2fd` (Light text) — Primary text
- **On Surface Variant:** `#bcc9cd` (Secondary text) — Helper text, metadata
- **Outline Variant:** `#3d494c` (Ghost borders) — 15% opacity for accessibility

#### Typography
- **Headlines:** Space Grotesk (geometric sans-serif)
- **Body/Labels:** Inter (maximum readability)
- **Sizes:** display-lg (2rem) down to label-sm (0.6875rem)
- **Special:** Uppercase labels with 0.05em letter-spacing = "Instrument Data"

### Component Library

#### Buttons
| Type | Style |
|------|-------|
| Primary | Gradient (`primary` → `primary-container`), 0.25rem radius |
| Secondary | Transparent with ghost border (outline-variant @15%) |
| Tertiary | Text-only, no background |

#### Panels (The HUD)
- No visible borders → use tonal background shifts
- 8-16px vertical whitespace between sections
- 12px backdrop-blur for floating modals
- Soft shadows (24px blur, 6% opacity) for depth

#### Input Fields
- Minimalist underline OR subtle fill (`surface-container-highest`)
- Label placed above (not inside)
- Never use four-sided box design

#### Graph Nodes
- **Active:** `primary` (#4cd7f6)
- **Attention:** `tertiary` (#ffb873)
- **Edges:** `outline-variant` at 40% opacity

### Implementation Rules (CSS)

#### No-Line Rule
```css
/* ❌ FORBIDDEN */
.panel { border: 1px solid #rgba(...); }

/* ✅ CORRECT */
.panel { background: var(--surface-container-high); }
```

#### Ghost Border (Accessibility Fallback)
```css
/* For high-density data grids */
.cell { 
  border: 1px solid var(--outline-variant);
  opacity: 0.15;
}
```

#### Glassmorphism
```css
.floating-modal {
  background: var(--surface-container-highest);
  backdrop-filter: blur(12px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.06);
}
```

## Screens Designed

### 1. Control Panel & Search Interface
**Purpose:** Main hub for graph navigation and filtering

**Components:**
- Header with "code-brain" branding
- Zoom level indicator (📍 Far / 🔍 Medium / 🔎 Close)
- Search bar with autocomplete
- Node type toggles (Project, Class, Interface, Module, File, Method)
- Advanced filters: Centrality slider, file type picker, depth range
- Quick action buttons
- Stats panel (visible nodes, edges, density)

**Layout:** Left sidebar, 320px wide, scrollable
**Interactions:** Click to select, drag to filter range

### 2. Node Detail Inspector
**Purpose:** Deep inspection of selected node

**Components:**
- Node header (icon + name + type badge)
- Metadata section (rank percentile, connections)
- Complexity scores
- Related nodes preview (5-node grid)
- Action buttons (Focus, Path To, Expand, Copy ID)

**Layout:** Right sidebar, 390px wide, scrollable
**Interactions:** Click related nodes to navigate

### 3. Source Code Panel
**Purpose:** View exact source code with line highlighting

**Components:**
- File path header with "Open" link
- Line-numbered code viewer
- Hot-line highlighting (current node source)
- Syntax coloring

**Layout:** Below node details, max 340px height, scrollable

## Design Quality Metrics

### WCAG Compliance
- ✅ AAA contrast ratios (all text pairs)
- ✅ Keyboard navigation support
- ✅ Screen reader friendly labels
- ✅ Focus indicators visible

### Performance
- ✅ No heavy shadows on small elements
- ✅ Minimal backdrop-blur usage (GPU load)
- ✅ CSS custom properties for theme switching
- ✅ Zero font-weight animations

### Accessibility
- ✅ Never rely on color alone for meaning
- ✅ Ghost borders for visual separation (not mandatory for meaning)
- ✅ Large touch targets (38x38px minimum for buttons)
- ✅ Clear focus states

## Maintenance

### Updating the Design System
If you need to modify colors or tokens:

1. Update CSS custom properties in `ui/src/styles.css`:
   ```css
   :root {
     --primary: #4cd7f6; /* Change here */
   }
   ```

2. Keep Stitch project in sync (optional):
   - Visit Stitch project
   - Edit design tokens
   - Export and regenerate component code

### Applying Design Updates
After any design change:
```bash
npm run build:ui
# Verify colors updated in browser
```

## References

- **Stitch Project:** https://stitch.googleapis.com/mcp
- **Material Design 3:** https://m3.material.io/
- **CSS Custom Properties:** https://developer.mozilla.org/en-US/docs/Web/CSS/--*
- **Glassmorphism:** https://css-tricks.com/glassmorphism/

## Support

For design system questions:
1. Check Cypher Mesh design tokens in Stitch
2. Review CSS variables in `ui/src/styles.css`
3. See UI_ENHANCEMENTS.md for implementation details
