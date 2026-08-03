# ImageGen 完整提示词

## 方案 A：沉浸文物剧场

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web UI redesign concept
Primary request: Redesign this exact Heluo Digital Museum bronze ding 3D exhibit page as an immersive artifact theater.
Input image: the supplied screenshot is the edit target and structural reference.
Preserve: the Heluo Digital Museum brand and top navigation; the same central three-legged bronze ding; a left 3D tool rail; a right artifact information region; entity/point-cloud switch; bottom exhibit journey and five view presets. Preserve the source label "Cleveland Museum of Art · 1962.281". Do not invent a dynasty, excavation place, or museum claim.
Direction: make the artifact dramatically larger and clearer, with an asymmetric stage composition, restrained warm key light, subtle jade-green rim light, deep ink-black architecture, charcoal stone circular pedestal, and a thin aged-bronze accent. Convert the right panel into a quiet unframed information column with strong typographic hierarchy instead of a large floating card. Use progressive disclosure so only essential metadata and one primary action are prominent. Make controls compact, precise, and museum-grade.
Typography: refined Chinese serif for titles, clean sans-serif for UI/data, zero letter spacing, all text contained.
Palette: ink black, charcoal, bone white, muted jade, restrained bronze; no purple/blue gradients.
Avoid: excessive gold, glow, glassmorphism, decorative cards, nested cards, giant marketing headline, illegible dark object, fake extra controls, gradients, watermark.
Output: one polished 16:9 desktop screenshot, realistic browser UI, 2048x1152 composition.
```

## 方案 B：编辑式学术展陈

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web UI redesign concept
Primary request: Redesign this exact Heluo Digital Museum bronze ding 3D exhibit page as an editorial scholarly exhibition.
Input image: the supplied screenshot is the edit target and structural reference.
Preserve: the Heluo Digital Museum brand and top navigation; the same central three-legged bronze ding; 3D rotation/zoom/reset access; artifact information; entity/point-cloud switch; bottom journey and five view presets. Preserve "三足青铜鼎 · 1962.281" and "Cleveland Museum of Art · 1962.281". Do not invent historical facts.
Direction: use a split editorial composition with a generous moon-white paper field and deep ink-green 3D stage, strong vertical rhythm, fine rules, large artifact number 06, concise curatorial introduction, source/material metadata organized like a museum catalog, and a restrained cinnabar annotation under 5% of the screen. The bronze ding remains the visual anchor and is brightly legible. The right-side content becomes a readable catalog column integrated into the page, not a floating card. Bottom views look like an archival contact sheet. Keep one clear primary action and a quieter reservation action.
Typography: Noto Serif SC-like display, Noto Sans SC-like UI, calm Chinese editorial hierarchy, zero letter spacing.
Palette: cool rice paper, ink green, text black, muted jade, small cinnabar, aged bronze.
Avoid: beige-dominated palette, gold luxury styling, glassmorphism, rounded card grid, purple/blue gradients, marketing hero treatment, fake facts, watermark.
Output: one polished 16:9 desktop screenshot, realistic browser UI, 2048x1152 composition.
```

局部修正提示词：

```text
Edit only the masked lower-right area of this high-fidelity museum UI screenshot.
Remove the malformed duplicate model-source card and its garbled text entirely.
Continue the clean cool rice-paper background and fine editorial rules naturally.
Place one compact, clearly aligned two-option segmented control labeled exactly "实体" and "点云", with "实体" selected in deep ink green and "点云" unselected on white. Keep ample whitespace.
Preserve every unmasked pixel, all layout, artifact, navigation, metadata, and bottom thumbnails unchanged.
No new card, no invented text, no watermark.
```

## 方案 C：高效数字研究台

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web UI redesign concept
Primary request: Redesign this exact Heluo Digital Museum bronze ding 3D exhibit page as an efficient digital conservation and study workspace for museum visitors.
Input image: the supplied screenshot is the edit target and structural reference.
Preserve: the Heluo Digital Museum brand and navigation; the same three-legged bronze ding; left rotate/zoom/reset tools; artifact metadata; entity/point-cloud switching; six-stage exhibit journey; five view presets; "Cleveland Museum of Art · 1962.281". Do not invent facts or analysis values.
Direction: create a dense but calm three-zone work surface: a narrow left vertical mode rail, a large central 3D inspection canvas, and a compact right analysis sidebar with source/material/description plus clearly separated layers for surface, ornament, material, point cloud, and provenance. Use tabs or segmented controls instead of many cards. Move the five views into a stable thumbnail filmstrip directly below the canvas. Add restrained measurement guides and texture inspection cues without claiming real measurements. Improve contrast, alignment, keyboard focus, and scanning efficiency. Use minimal 4-6px corner radius and familiar icons.
Typography: compact Chinese serif title with clean sans-serif tools and tabular data, zero letter spacing.
Palette: neutral near-black, dark green, warm gray, bone white, bronze accent, small teal functional accent.
Avoid: sci-fi HUD clutter, neon, purple/blue gradients, glassmorphism, floating decorative cards, nested cards, excessive rounded pills, fake measurements, watermark.
Output: one polished 16:9 desktop screenshot, realistic browser UI, 2048x1152 composition.
```
