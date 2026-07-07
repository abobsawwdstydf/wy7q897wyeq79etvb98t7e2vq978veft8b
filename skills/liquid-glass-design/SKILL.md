---
name: liquid-glass-design
description: Use when creating or modifying UI/CSS code to implement modern Liquid Glass design with translucency, blur effects, and glassmorphism. Apply to any frontend, web app, or UI component work.
---

# Liquid Glass Design Skill

## Core Principles

Liquid Glass is a modern UI design language characterized by translucency, depth, and elegance. When implementing UI, follow these rules:

### 1. Translucency & Blur
```css
/* Base glass effect */
.glass {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Dark glass variant */
.glass-dark {
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Colored glass */
.glass-accent {
  background: hsla(var(--accent-h), 70%, 60%, 0.2);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid hsla(var(--accent-h), 70%, 60%, 0.3);
}
```

### 2. Layered Depth
```css
/* Shadow hierarchy */
.depth-1 { box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.depth-2 { box-shadow: 0 4px 8px rgba(0,0,0,0.12); }
.depth-3 { box-shadow: 0 8px 16px rgba(0,0,0,0.15); }
.depth-4 { box-shadow: 0 16px 32px rgba(0,0,0,0.18); }

/* Combined with glass */
.glass-depth {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
```

### 3. Color System (HSL)
```css
:root {
  /* Primary palette */
  --primary-h: 220;
  --primary-s: 80%;
  --primary-l: 55%;
  
  /* Accent */
  --accent-h: 260;
  --accent-s: 70%;
  --accent-l: 60%;
  
  /* Neutrals */
  --bg: hsl(220, 15%, 10%);
  --surface: hsla(220, 15%, 15%, 0.8);
  --text: hsl(0, 0%, 95%);
  --text-muted: hsla(0, 0%, 70%, 0.7);
}

/* Usage */
.primary { color: hsl(var(--primary-h), var(--primary-s), var(--primary-l)); }
.accent { background: hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.2); }
```

### 4. Transitions & Motion
```css
/* Base transition */
.glass {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Hover effects */
.glass:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}

/* Interactive feedback */
.button:active {
  transform: scale(0.98);
  transition: transform 0.1s ease;
}

/* Smooth appearance */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-in {
  animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
```

### 5. Typography
```css
/* Clear hierarchy */
h1 { font-size: 2.5rem; font-weight: 700; line-height: 1.2; }
h2 { font-size: 1.75rem; font-weight: 600; line-height: 1.3; }
h3 { font-size: 1.25rem; font-weight: 600; line-height: 1.4; }
body { font-size: 1rem; line-height: 1.6; }

/* Glass text effects */
.text-glass {
  background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### 6. Spacing Scale
```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}

/* Usage */
.card { padding: var(--space-6); margin-bottom: var(--space-4); }
.container { padding: var(--space-8) var(--space-12); }
```

### 7. Component Patterns

#### Card
```css
.card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: var(--space-6);
  transition: all 0.3s ease;
}

.card:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}
```

#### Button
```css
.button {
  background: linear-gradient(135deg, 
    hsla(var(--primary-h), var(--primary-s), var(--primary-l), 0.8) 0%,
    hsla(var(--primary-h), var(--primary-s), calc(var(--primary-l) - 10%), 0.9) 100%
  );
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: var(--space-3) var(--space-6);
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px hsla(var(--primary-h), var(--primary-s), var(--primary-l), 0.4);
}

.button:active {
  transform: translateY(0) scale(0.98);
}
```

#### Modal/Overlay
```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: rgba(30, 30, 40, 0.95);
  backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: var(--space-8);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
}
```

## Implementation Checklist

When implementing Liquid Glass design:
- [ ] Use HSL color model for easy manipulation
- [ ] Apply backdrop-filter: blur() to glass elements
- [ ] Use semi-transparent backgrounds (alpha < 1)
- [ ] Add subtle borders with rgba/hsla
- [ ] Implement smooth transitions (0.2-0.4s)
- [ ] Create depth with layered shadows
- [ ] Use CSS custom properties for theming
- [ ] Follow spacing scale (4/8/16/24/32/48)
- [ ] Ensure proper z-index layering
- [ ] Test across browsers (add -webkit- prefix)
