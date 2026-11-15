# English Coach design system

## Visual language
- Use a deep carbon canvas (`#09090B`) and Bento surfaces (`#111114`).
- Keep borders quiet (`border-white/[0.08]`) and reserve stronger contrast for hover, focus, and active states.
- Create atmosphere with soft radial amber (`#F59E0B`), coral (`#F43F5E`), and violet (`#6366F1`) light; avoid hard, saturated gradients behind text.
- Primary actions are high-contrast white pills: `bg-white text-zinc-950 font-medium rounded-full`. Secondary actions use a translucent white fill and subtle border.
- Use Inter for interface text and Lora for editorial reading and display moments.
- Prefer readable zinc tones; do not use low-contrast gray for essential text.
- Keep product surfaces direct and useful: avoid decorative uppercase micro-labels and duplicate explanatory copy.
- Use tabular numerals for counts and short (`150ms`) state transitions with a subtle pressed scale on buttons.

## Motion and interaction
- Use short color transitions (`duration-150`) and a subtle pressed scale on buttons.
- Use `animate-fade-in-up` for progressive entrances, `ambient-glow` for slow background light, and `skeleton-shimmer` for loading placeholders.
- Keep motion purposeful and honor `prefers-reduced-motion`; never make essential information depend on animation.
- Every interactive target must have a visible keyboard focus state and a minimum 44px touch area.

## Responsive behavior
- Design mobile-first and verify at 375px without horizontal overflow.
- Use a glass sidebar on desktop and a fixed, safe-area-aware bottom navigation on mobile.
- Avoid fixed-width content that clips; allow text, controls, and Bento cards to wrap or stack cleanly.
