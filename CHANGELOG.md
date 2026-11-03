# Changelog

## [1.2.8] - 2026-11-02

### Security
- Electron 43.4.0 -> 43.8.6 (patch release on the same major; fixes advisories against 43.4.0).
- Cleared the 2 critical and 12 high audit findings: concurrently 10.0.6, vite 8.3.5, zod 4.6.7, plus transitive fixes for shell-quote, axios, follow-redirects, joi, source-map-js, @xmldom/xmldom, brace-expansion, fast-uri, js-yaml and undici.
- `keyv` 4.5.4 and `cacheable-request` 7.0.4 overrides verified intact.

### Changed
- React / React DOM 19.3.1, @hookform/resolvers 7.0.1 (zod resolver verified against zod 4), react-hook-form 7.91.0, framer-motion 14.9.0, @daypicker/react 10.0.2, @tanstack/react-query 5.105.3, drizzle-orm 0.45.4, electron-builder 26.18.1, Tailwind CSS 4.3.4, all Radix UI packages, and related UI, type, test and build tooling.
- Verified: TypeScript check, production build, and all 29 unit tests pass.

### Notes
- Remaining 21 moderate findings are one minimatch denial-of-service advisory inside electron-builder's build-time toolchain and Vitest's development tooling; they do not ship in the installed app, and npm's only suggested "fix" is a downgrade.
