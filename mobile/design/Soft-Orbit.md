# Soft Orbit · 2.2.3

Selected post direction C, shared by the native Android app, native iPhone app, and website. Both pictures and quotes use white rounded cards, a subtle blue/lavender rim, inset rounded media, a small Kept close capsule, and a common action row. Quote text remains selectable/readable content, rather than being baked into an image.

Ten original background images were generated with the built-in image generation tool. The optimized 768 × 768 JPEGs ship under `dist/assets/quote-backgrounds/` and each app's `default/quote-backgrounds/` resource folder. These three copies must match. The complete set adds about 312 KiB to each app before package compression. Original PNG artwork and generation briefs are included in the separate background download.

Each quote's ID supplies stable pseudorandom variety. A collision with the previous quote chooses a different design; photos do not reset that comparison. Filtering recomputes the visible sequence to prevent neighboring saved quotes from matching too. Refreshing unchanged content keeps its artwork steady. The website carousel checks the last-to-first seam as well. Older quotes without IDs fall back to their text.

Hearts use display-timed drawing on both native platforms, with cached sprites and bounded particle counts. Android requests the fastest supported display mode at the current resolution. iPhone opts in to the display's supported frame rate. The website uses the browser's animation clock and compacts active particles without allocating a new array per frame. Actual FPS depends on hardware, power settings, and system load.
