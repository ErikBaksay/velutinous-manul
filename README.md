# VelutinousManul

[▶ Play Velutinous Manul on GitHub Pages](https://erikbaksay.github.io/velutinous-manul/)

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.33.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Camera controls

After selecting **Explore Map**:

- Use **WASD** or the **arrow keys** to move across the map.
- Drag with the **middle mouse button** to orbit and the **right mouse button** to pan.
- Use the **mouse wheel** to zoom toward the cursor. Left-clicking does not change the camera.

The camera intentionally stays between 40° and 88° elevation and uses a map-safe zoom range. Its orbit pivot follows the generated sea surface, keeping the framing aligned with the active world.

The world-settings dock can be hidden while exploring and reopened with the **World settings** button.

## Construction and town founding

The Construction palette includes Mine, Warehouse, Church, Residence, and Road.
Place a church on strict-buildable land, then place a residence within its
inclusive 8-cell edge-to-edge Chebyshev influence area. Select the church or
residence and choose **Found Town** to name the settlement. Each residence adds
10 population capacity and 10 worker capacity; connected residences can extend
the town's influence. Roads and services are not required for this first slice,
overlapping town placement is rejected, and a founded church is protected from
demolition.

## Rendering quality

The default renderer uses the balanced performance preset: direct rendering, capped device pixel ratio, terrain-only shadows, bounded environment density, and distance-based environment LODs. Optional presets can be selected with the query string:

- `?quality=low` disables shadows and uses the smallest environment budget.
- `?quality=balanced` uses the default playable settings.
- `?quality=high` enables reduced-sample GTAO and environment canopy shadows.

Use `?debug=chunks&metrics=only` to inspect FPS, frame time, scene/shadow/GTAO CPU timings, draw calls, triangles, environment instance count, and chunk build timings. Chunk debug mode intentionally raises the streaming budget and disables shadows, so use the quality presets for clean FPS comparisons.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Deploying to GitHub Pages

The repository includes a GitHub Actions workflow that builds and deploys the game to GitHub Pages whenever changes are pushed to `main`. It can also be started manually from the repository's **Actions** tab.

Before the first deployment, set the repository's Pages publishing source to **GitHub Actions** under **Settings → Pages → Build and deployment**. The workflow publishes the game at:

`https://erikbaksay.github.io/velutinous-manul/`

## Running unit tests

To execute the fast application and rendering unit tests with Angular's Vitest-based browser builder, use the following command:

```bash
ng test
```

The browser unit-test command excludes the six full-resolution map-generation suites. GitHub Pages runs the same fast profile, and the workflow installs Chromium before running it:

```bash
npm run test:ci
```

The full-resolution map-generation tests are pure Node/Vitest tests and can be run separately when needed. They have a longer per-test timeout because production-size generation is intentionally expensive:

```bash
npm run test:map
```

## Running end-to-end tests

Install the bundled Chromium browser once, then run the Playwright browser suite. This is the primary local end-to-end validation for the application:

```bash
npx playwright install chromium
npm run e2e
```

The suite starts or reuses the Angular development server at `http://127.0.0.1:4200` and uses a fixed 1440×900 viewport. To watch the tests in a browser, run `npm run e2e:headed`. Automated chunk investigation uses `?debug=chunks&metrics=only` for machine-readable diagnostics without rebuilding wireframe boxes during every camera sweep; use plain `?debug=chunks` for the full manual wireframe review. Screenshots, traces, videos, and metric attachments are written to ignored Playwright test artifacts.

To type-check the Playwright configuration and tests without running them:

```bash
npm run typecheck:e2e
```

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
