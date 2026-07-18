# agent

Welcome to your new [Mastra](https://mastra.ai/) project! We're excited to see what you'll build.

## Getting Started

Start the development server:

```shell
pnpm run dev
```

Open [http://localhost:1333](http://localhost:1333) in your browser to access [Mastra Studio](https://mastra.ai/docs/getting-started/studio). It provides an interactive UI for building and testing your agents, along with a REST API that exposes your Mastra application as a local service. This lets you start building without worrying about integration right away.

You can start editing files inside the `src/mastra` directory. The development server will automatically reload whenever you make changes.

## Server authentication

Set `MASTRA_SERVER_API_KEY` to a random value of at least 32 characters before starting the server. Generate one with:

```shell
openssl rand -hex 32
```

Mastra's built-in API routes require this value as a bearer token:

```text
Authorization: Bearer <MASTRA_SERVER_API_KEY>
```

The Slack webhook is intentionally exempt from Mastra bearer authentication. Slack authenticates requests to that route using its request signature and `SLACK_SIGNING_SECRET` instead.

## Slack channel

The `agent` enables Mastra's Slack channel adapter only when both of these environment variables are set:

```shell
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
```

Configure both Slack Event Subscriptions and Interactivity to use this webhook:

```text
https://<YOUR-PUBLIC-URL>/api/agents/agent/channels/slack/webhook
```

Subscribe the bot to `app_mention`, `message.channels`, and `message.im`. Grant it the `app_mentions:read`, `channels:history`, `channels:read`, `chat:write`, `im:history`, `im:read`, `im:write`, and `users:read` bot scopes.

For local development, expose the Mastra server to Slack with a tunnel:

```shell
pnpm dlx cloudflared tunnel --url http://localhost:1333
```

## Learn more

To learn more about Mastra, visit our [documentation](https://mastra.ai/docs/). Your bootstrapped project includes example code for [agents](https://mastra.ai/docs/agents/overview), [tools](https://mastra.ai/docs/agents/using-tools), [workflows](https://mastra.ai/docs/workflows/overview), [scorers](https://mastra.ai/docs/evals/overview), and [observability](https://mastra.ai/docs/observability/overview).

If you're new to AI agents, check out our [course](https://mastra.ai/course) and [YouTube videos](https://youtube.com/@mastra-ai). You can also join our [Discord](https://discord.gg/BTYqqHKUrf) community to get help and share your projects.

## Deploy on Mastra Cloud

[Mastra Cloud](https://cloud.mastra.ai/) gives you a serverless agent environment with atomic deployments. Access your agents from anywhere and monitor performance. Make sure they don't go off the rails with evals and tracing.

Check out the [deployment guide](https://mastra.ai/docs/deployment/overview) for more details.
