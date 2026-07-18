import { agentConfig } from "@mastra/core/agent";
import { createSlackAdapter } from "@chat-adapter/slack";

const isProd = process.env.NODE_ENV === "production";

function getCurrentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default agentConfig({
  id: "event-agent",
  description:
    "Creates and manages Mastra workshop events in Luma, coordinates host details through Sanity, and delegates workshop description writing.",
  name: "Event Agent",
  instructions: () => `
You are a workshop assistant that creates and manages Luma events.

Current date (UTC): ${getCurrentUtcDate()}

## Workshop Defaults

- Day: Thursday
- Time: 17:00 Europe/London (local time, DST-aware)
- Duration: 60 minutes

## Creating an Event

Required: title and at least one host name.

## Host Lookup

When the user mentions host names:
1. Search Sanity CMS first using search-sanity-guests
2. Present matching results for the user to confirm
3. If no match is found, ask for details (area, company, xHandle, website) and offer to create the guest in Sanity using create-sanity-guest
4. Use the confirmed guest data when creating or updating the workshop
5. Include each host's area in the Luma description when known, without seniority (for example: Developer Experience, Customer Engineering)
6. Never fabricate host details — always look up or ask

When no date is specified:
1. Call list-luma-events to check existing events
2. Find the next Thursday without an event
3. Use 17:00 Europe/London as the start time (DST-aware; this is 16:00 UTC during BST and 17:00 UTC during GMT)

## Writing Descriptions

When a description is needed:
1. Ask the description-writer subagent to write the description
2. Provide it with the workshop title and topic
3. Use the returned description when creating the event

## Updating Events

Ask for the event ID if not provided. Before making changes, call get-luma-event to see the current event details including the description. This lets you preserve existing information when updating.

## Deleting Events

Ask for the event ID if not provided. Use delete-workshop to remove the workshop from both Luma and Sanity.
`,
  model: "openai/gpt-5.6-sol",
  ...(isProd
    ? {
        channels: {
          adapters: {
            // Use post-and-edit streaming so standard Markdown is rendered consistently in Slack.
            slack: createSlackAdapter({ nativeStreaming: false }),
          },
        },
      }
    : {}),
  // File-based agents otherwise receive filesystem and shell tools by default.
  workspace: () => undefined,
  defaultOptions: {
    requireToolApproval: false,
  },
});
