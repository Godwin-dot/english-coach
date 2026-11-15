---
name: bento-ui-builder
description: Build responsive English Coach screens in its carbon Bento design system.
---

# English Coach Bento UI builder

Use this skill when creating or revising screens for English Coach. Preserve the existing product behavior and server/client boundaries; do not duplicate domain or API logic in UI code.

## Application shell
- Place authenticated screens inside `src/components/AppShell.tsx`.
- On desktop, keep the fixed, translucent sidebar, target-level badge, active navigation state, AI configuration access, and conditional lock action.
- On small screens, retain the compact top bar and fixed bottom navigation with safe-area padding.
- Keep content clear of fixed navigation and ensure touch targets are at least 44px.

## Bento composition
- Use the carbon canvas (`#09090B`) with modular `#111114` surfaces, subtle white borders, generous spacing, and restrained amber/coral/violet accents.
- Use a small colored edge or icon to distinguish metric cards without turning every card into a nested container.
- Prefer asymmetrical hero areas and varied card sizes over repetitive grids when the content supports it.
- Use white pill buttons for primary actions and translucent pills for secondary actions.

## Loading and interaction states
- Provide skeleton feedback for content that is being generated or loaded; use the shared `skeleton-shimmer` animation.
- Use `animate-fade-in-up` sparingly for entrances and small hover transitions for interactive cards.
- Respect `prefers-reduced-motion`, show disabled and error states clearly, and keep keyboard focus visible.
- Verify the screen at 375px and 1440px with no horizontal overflow.
