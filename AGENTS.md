## Development

When starting the dev server, use background mode:

```
npm run dev
```

Manage the background server with `npm run dev:stop`, `npm run dev:status`, and `npm run dev:logs`.

This project currently uses Astro 5, so background lifecycle management is provided by
`scripts/astro-dev.mjs`. Astro's native `astro dev --background` command requires Astro 7.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
