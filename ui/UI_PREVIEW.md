# code-brain UI Preview

## 🎨 Visual Design Overview

### Main Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════════════════════════════╗  │
│  ║                     code-brain Header                         ║  │
│  ║  🌐 code-brain | Deterministic graph intelligence            ║  │
│  ╚═══════════════════════════════════════════════════════════════╝  │
├──────────────┬────────────────────────────────┬─────────────────────┤
│              │                                │                     │
│  Left Panel  │      3D Graph Canvas          │    Right Panel      │
│  (320px)     │      (Flexible)               │    (390px)          │
│              │                                │                     │
│  ┌────────┐  │  ╔══════════════════════════╗ │  ┌──────────────┐  │
│  │ Search │  │  ║                          ║ │  │ Live Node    │  │
│  └────────┘  │  ║    🌐 Graph Sphere      ║ │  └──────────────┘  │
│              │  ║                          ║ │                     │
│  ┌────────┐  │  ║   ●─────●─────●         ║ │  ┌──────────────┐  │
│  │Metrics │  │  ║   │  ╱  │  ╲  │         ║ │  │ Node Details │  │
│  └────────┘  │  ║   ● ─── ● ─── ●         ║ │  │              │  │
│              │  ║   │  ╲  │  ╱  │         ║ │  │ • Name       │  │
│  ┌────────┐  │  ║   ●─────●─────●         ║ │  │ • Type       │  │
│  │Filters │  │  ║                          ║ │  │ • Metrics    │  │
│  └────────┘  │  ║  [Zoom] [Reset] [3D]    ║ │  └──────────────┘  │
│              │  ╚══════════════════════════╝ │                     │
│  ┌────────┐  │                                │  ┌──────────────┐  │
│  │  Hubs  │  │                                │  │Relationships │  │
│  └────────┘  │                                │  └──────────────┘  │
│              │                                │                     │
│              │                                │  ┌──────────────┐  │
│              │                                │  │ Source Code  │  │
│              │                                │  └──────────────┘  │
└──────────────┴────────────────────────────────┴─────────────────────┘
                                                    
                                                    [⌨️] ← Shortcuts FAB
```

## 🎯 Key UI Elements

### 1. Brand Header
```
╔═══════════════════════════════════════════════════════╗
║  ┌────┐                                               ║
║  │ 🌐 │  code-brain                                   ║
║  └────┘  Deterministic graph intelligence            ║
║          ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔          ║
╚═══════════════════════════════════════════════════════╝
```
- Floating animation on brand icon
- Gradient text effect
- Glassmorphism background
- Cyan → Purple gradient border

### 2. Search Panel
```
┌─────────────────────────────────────────┐
│ 🔍 Search graph                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────┬───────┐ │
│ │ Symbol, file, route, config │ [🎯] │ │
│ └─────────────────────────────┴───────┘ │
│                                         │
│ Results:                                │
│ ┌─────────────────────────────────────┐ │
│ │ ⚡ getUserData                      │ │
│ │ function - src/api/users.ts        │ │
│ ├─────────────────────────────────────┤ │
│ │ 📦 UserService                     │ │
│ │ class - src/services/user.ts       │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```
- Focus on `Ctrl+K`
- Real-time results
- Type icons
- Hover effects

### 3. Metrics Grid
```
┌─────────────────────────────────────────┐
│ ┌─────────────┬─────────────┐           │
│ │    1,247    │     3,891   │           │
│ │    Nodes    │    Edges    │           │
│ ├─────────────┼─────────────┤           │
│ │      42     │      18     │           │
│ │ Unresolved  │  Clusters   │           │
│ └─────────────┴─────────────┘           │
└─────────────────────────────────────────┘
```
- Gradient numbers
- Hover glow effect
- Top border accent
- Smooth transitions

### 4. Node Type Filters
```
┌─────────────────────────────────────────┐
│ 🔽 Node Types                           │
├─────────────────────────────────────────┤
│ ● file          247  [Active]           │
│ ● class         89   [Active]           │
│ ● function      412  [Active]           │
│ ○ test          156  [Inactive]         │
│ ● method        891  [Active]           │
└─────────────────────────────────────────┘
```
- Color-coded dots
- Toggle on/off
- Count badges
- Slide-in animation

### 5. 3D Graph Canvas
```
╔═══════════════════════════════════════════════╗
║                                               ║
║         ●────────●────────●                   ║
║        ╱│╲      ╱│╲      ╱│╲                  ║
║       ● │ ●────● │ ●────● │ ●                 ║
║        ╲│╱      ╲│╱      ╲│╱                  ║
║         ●────────●────────●                   ║
║                                               ║
║  Shift+Drag to rotate sphere                 ║
║                                               ║
║  ┌─────┬─────┬─────────┐                     ║
║  │ [+] │ [-] │ [Reset] │  ← Controls         ║
║  └─────┴─────┴─────────┘                     ║
╚═══════════════════════════════════════════════╝
```
- WebGL rendering
- 3D sphere layout
- Interactive rotation
- Zoom controls
- Radial gradient background

### 6. Node Inspector
```
┌─────────────────────────────────────────┐
│ ✨ Live Node                    [×]     │
├─────────────────────────────────────────┤
│ ┌───┐                                   │
│ │ █ │ getUserData                       │
│ └───┘ function - src/api/users.ts      │
│                                         │
│ Fetches user data from the database    │
│ and returns formatted user object.     │
│                                         │
│ ┌────┬────┬────┬────┐                  │
│ │ 12 │  8 │  4 │0.89│                  │
│ │deg │ in │out │rank│                  │
│ └────┴────┴────┴────┘                  │
│                                         │
│ [📂 Open exact source]                 │
└─────────────────────────────────────────┘
```
- Gradient border top
- Color-coded type indicator
- Metric cards
- Action buttons

### 7. Relationships Panel
```
┌─────────────────────────────────────────┐
│ 🌿 Relationships                        │
├─────────────────────────────────────────┤
│ CALLS      → validateUser    function   │
│ IMPORTS    → UserModel       class      │
│ CALLS      → logActivity     function   │
│ TESTS      ← getUserData.te… test       │
└─────────────────────────────────────────┘
```
- Color-coded edge types
- Clickable to navigate
- Truncated long names
- Hover effects

### 8. Source Code Viewer
```
┌─────────────────────────────────────────┐
│ 💻 src/api/users.ts      [Full] [Open] │
├─────────────────────────────────────────┤
│ Lines 42-58 with context                │
├─────────────────────────────────────────┤
│  42  export async function getUserData( │
│  43    userId: string                   │
│  44  ): Promise<User> {                 │
│→ 45    const user = await db.users.find│ ← Highlighted
│  46    if (!user) {                     │
│  47      throw new Error('Not found');  │
│  48    }                                │
│  49    return formatUser(user);         │
│  50  }                                  │
└─────────────────────────────────────────┘
```
- Line numbers
- Syntax highlighting
- Highlighted target line
- Scroll to view
- Full file option

### 9. Keyboard Shortcuts Panel
```
╔═══════════════════════════════════════════════╗
║ ⌨️  Keyboard Shortcuts              [×]      ║
╠═══════════════════════════════════════════════╣
║                                               ║
║  ┌──────────────────────────────────────┐    ║
║  │ [Ctrl] + [K]    Focus search         │    ║
║  ├──────────────────────────────────────┤    ║
║  │ [Ctrl] + [/]    Toggle shortcuts     │    ║
║  ├──────────────────────────────────────┤    ║
║  │ [Esc]           Clear selection      │    ║
║  ├──────────────────────────────────────┤    ║
║  │ [Enter]         Execute search       │    ║
║  ├──────────────────────────────────────┤    ║
║  │ [Shift]+[Drag]  Rotate 3D sphere    │    ║
║  └──────────────────────────────────────┘    ║
║                                               ║
╚═══════════════════════════════════════════════╝
```
- Modal overlay
- Styled keyboard keys
- Grouped by function
- Click outside to close

### 10. Floating Action Button
```
                                    ┌─────┐
                                    │  ⌨️  │ ← Shortcuts FAB
                                    └─────┘
                                    (Bottom-right)
```
- Circular button
- Glowing effect
- Hover animation
- Always accessible

## 🎨 Color Palette

### Primary Colors
```
Cyan:        ████ #06b6d4  (Primary accent)
Cyan Bright: ████ #22d3ee  (Highlights)
Purple:      ████ #8b5cf6  (Secondary)
Amber:       ████ #f59e0b  (Warnings)
```

### Semantic Colors
```
Success:     ████ #10b981  (Confirmations)
Danger:      ████ #ef4444  (Errors)
Muted:       ████ #94a3b8  (Secondary text)
Text:        ████ #f1f5f9  (Primary text)
```

### Node Type Colors
```
Project:     ████ #f5c542  (Yellow)
File:        ████ #4cc9f0  (Cyan)
Class:       ████ #ff9f1c  (Orange)
Function:    ████ #4ade80  (Green)
Method:      ████ #a78bfa  (Purple)
Route:       ████ #fb7185  (Pink)
Test:        ████ #f472b6  (Magenta)
```

## ✨ Animation Examples

### 1. Fade In
```
Opacity: 0 ──────────────────────> 1
         |                         |
         0ms                    400ms
```

### 2. Slide In Left
```
Position: -20px ──────────────────> 0px
Opacity:  0     ──────────────────> 1
          |                         |
          0ms                    400ms
```

### 3. Pulse
```
Opacity: 1 ──> 0.6 ──> 1 ──> 0.6 ──> 1
         |     |      |     |      |
         0ms  500ms  1s   1.5s    2s
         └──────────────────────────┘
                  Infinite
```

### 4. Glow
```
Shadow: 20px ──> 40px ──> 20px ──> 40px
        |        |        |        |
        0ms     1s       2s       3s
        └────────────────────────────┘
                 Infinite
```

## 📱 Responsive Breakpoints

### Desktop (> 1180px)
```
┌────────┬──────────────┬────────┐
│ Left   │   Graph      │ Right  │
│ 320px  │   Flexible   │ 390px  │
└────────┴──────────────┴────────┘
```

### Tablet (768px - 1180px)
```
┌────────┬──────────────┐
│ Left   │   Graph      │  ┌────────┐
│ 300px  │   Flexible   │  │ Right  │ (Floating)
└────────┴──────────────┘  │ 420px  │
                           └────────┘
```

### Mobile (< 768px)
```
┌──────────────────┐
│      Left        │
├──────────────────┤
│      Graph       │
│    (60vh min)    │
├──────────────────┤
│      Right       │
└──────────────────┘
```

## 🎭 Interaction States

### Button States
```
Default:  [Button]
Hover:    [Button] ↑ (lift + glow)
Active:   [Button] ↓ (press)
Focus:    [Button] (outline)
Disabled: [Button] (faded)
```

### Node States
```
Default:   ● (base color)
Hover:     ● (larger + glow)
Selected:  ● (largest + bright)
Neighbor:  ● (highlighted)
Hidden:    ○ (transparent)
```

## 🔮 Future UI Concepts

### Command Palette (Planned)
```
╔═══════════════════════════════════════════════╗
║ > Search commands...                          ║
╠═══════════════════════════════════════════════╣
║ 🔍 Search for node                            ║
║ 📊 Show graph statistics                      ║
║ 🎨 Change theme                               ║
║ 📤 Export graph                               ║
║ ⚙️  Open settings                             ║
╚═══════════════════════════════════════════════╝
```

### Graph Minimap (Planned)
```
┌─────────────┐
│ ┌─────────┐ │
│ │ ●   ●   │ │
│ │  ● ● ●  │ │
│ │ ●   ●   │ │
│ └─────────┘ │
│   Minimap   │
└─────────────┘
```

### Theme Switcher (Planned)
```
┌─────────────────┐
│ 🌙 Dark  [●]    │
│ ☀️  Light [ ]    │
│ 🌈 Auto  [ ]    │
└─────────────────┘
```

---

**This preview shows the enhanced code-brain UI with modern design, smooth animations, and powerful features!** 🎨✨
