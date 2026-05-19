# workshop-helper-agent

Welcome to your new [Mastra](https://mastra.ai/) project! We're excited to see what you'll build.

## Getting Started

Start the development server:

```shell
pnpm run dev
```

Open [http://localhost:4111](http://localhost:4111) in your browser to access [Mastra Studio](https://mastra.ai/docs/getting-started/studio). It provides an interactive UI for building and testing your agents, along with a REST API that exposes your Mastra application as a local service. This lets you start building without worrying about integration right away.

You can start editing files inside the `src/mastra` directory. The development server will automatically reload whenever you make changes.

## Learn more

To learn more about Mastra, visit our [documentation](https://mastra.ai/docs/). Your bootstrapped project includes example code for [agents](https://mastra.ai/docs/agents/overview), [tools](https://mastra.ai/docs/agents/using-tools), [workflows](https://mastra.ai/docs/workflows/overview), [scorers](https://mastra.ai/docs/evals/overview), and [observability](https://mastra.ai/docs/observability/overview).

If you're new to AI agents, check out our [course](https://mastra.ai/course) and [YouTube videos](https://youtube.com/@mastra-ai). You can also join our [Discord](https://discord.gg/BTYqqHKUrf) community to get help and share your projects.

## Sync Luma events to Sanity

Use this script to mirror workshops from Luma into Sanity so Luma can be your source of truth:

```shell
pnpm run sync:luma-to-sanity
```

Optional flags:

```shell
pnpm run sync:luma-to-sanity -- --dry-run
pnpm run sync:luma-to-sanity -- --after=2026-01-01T00:00:00.000Z --limit=50
```

Required environment variables:

- `LUMA_API_KEY`
- `SANITY_PROJECT_ID`
- `SANITY_API_TOKEN`

Optional environment variables:

- `SANITY_DATASET` (default: `production`)
- `SANITY_WORKSHOP_DOC_TYPE` (default: `workshop`)
- `SANITY_WORKSHOP_PEOPLE_FIELD` (default: `hostReferences`)

## YouTube stream sync

Run the `sync-workshop-youtube-stream` workflow manually with no input. It finds the most recent workshop that has already happened, matches its title against the latest YouTube streams using `yt-dlp`, and writes the matched URL to Sanity's `youtubeUrl` field.

Deployment must provide `yt-dlp` on `PATH`, or set `YT_DLP_BINARY` to its location.

Optional environment variables:

- `YOUTUBE_STREAMS_URL` (default: `https://www.youtube.com/@mastra-ai/streams`)
- `YOUTUBE_STREAM_LIMIT` (default: `3`)
- `YOUTUBE_TITLE_MATCH_MIN_SCORE` (default: `0.82`)
- `YT_DLP_BINARY` (default: `yt-dlp`)

## Follow-up email copy

Run the `generate-follow-up-email` workflow manually with no input. It finds the most recent past workshop, finds the next upcoming workshop, and asks the follow-up email agent to output ready-to-copy Luma email text.

## Deploy on Mastra Cloud

[Mastra Cloud](https://cloud.mastra.ai/) gives you a serverless agent environment with atomic deployments. Access your agents from anywhere and monitor performance. Make sure they don't go off the rails with evals and tracing.

Check out the [deployment guide](https://mastra.ai/docs/deployment/overview) for more details.
