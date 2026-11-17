# English Coach design system

## Visual language
- Use a pure black canvas (`#000000`), `#0A0A0A` Bento surfaces, and `#111111` / `#171717` for nested or hovered elements.
- Keep borders precise and quiet (`border-white/[0.08]`); raise contrast on hover and focus without diffuse shadows or multicolor gradients.
- Use Geist for interface text and Geist Mono for numbers, technical values, and keyboard shortcuts.
- Main page headings use `text-2xl sm:text-3xl font-semibold tracking-tight text-[#EDEDED]`. Descriptions use `text-sm text-[#888888] leading-relaxed`.
- Primary actions use `bg-[#EDEDED] text-[#0A0A0A] font-medium rounded-full`; secondary actions use a dark surface and a fine white border.
- Use restrained emerald and amber only for meaningful status and progress states. Avoid decorative uppercase micro-labels and duplicate explanatory copy.
- Use `tabular-nums` for counts, scores, dates, and durations. Keep state transitions short (`150ms`) and buttons subtly pressed.

## Motion and interaction
- Use short color transitions (`duration-150`) and a subtle pressed scale on buttons.
- Use `animate-fade-in-up` for progressive entrances, `ambient-glow` for slow background light, and `skeleton-shimmer` for loading placeholders.
- Keep motion purposeful and honor `prefers-reduced-motion`; never make essential information depend on animation.
- Every interactive target must have a visible keyboard focus state and a minimum 44px touch area.

## Responsive behavior
- Design mobile-first and verify at 375px without horizontal overflow.
- Use a minimal black sidebar on desktop and a fixed, safe-area-aware bottom navigation on mobile. Show eight items as a 4-by-2 grid below 480px and one row above it.
- Avoid fixed-width content that clips; allow text, controls, and Bento cards to wrap or stack cleanly.
