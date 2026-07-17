import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { createWorkshopTool } from "../tools/create-workshop-tool";
import { updateWorkshopTool } from "../tools/update-workshop-tool";
import { deleteWorkshopTool } from "../tools/delete-workshop-tool";
import { listLumaEventsTool } from "../tools/list-luma-events-tool";
import { getLumaEventTool } from "../tools/get-luma-event-tool";
import { uploadLumaImageTool } from "../tools/upload-luma-image-tool";
import { searchSanityGuestsTool } from "../tools/search-sanity-guests-tool";
import { createSanityGuestTool } from "../tools/create-sanity-guest-tool";
import { descriptionWriterAgent } from "./description-writer-agent";

function getCurrentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const workshopHelperAgent = new Agent({
  id: "workshop-helper-agent",
  description: "foobar",
  name: "Workshop Helper Agent",
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
1. Ask the description-writer agent to write the description
2. Provide it with the workshop title and topic
3. Use the returned description when creating the event

## Updating Events

Ask for the event ID if not provided. Before making changes, call get-luma-event to see the current event details including the description. This lets you preserve existing information when updating.

## Deleting Events

Ask for the event ID if not provided. Use delete-workshop to remove the workshop from both Luma and Sanity.
`,
  model: "openai/gpt-5.4",
  agents: {
    descriptionWriterAgent,
  },
  tools: {
    createWorkshop: createWorkshopTool,
    updateWorkshop: updateWorkshopTool,
    deleteWorkshop: deleteWorkshopTool,
    listLumaEvents: listLumaEventsTool,
    getLumaEvent: getLumaEventTool,
    uploadLumaImage: uploadLumaImageTool,
    searchSanityGuests: searchSanityGuestsTool,
    createSanityGuest: createSanityGuestTool,
  },
  defaultOptions: {
    requireToolApproval: false,
  },
  memory: new Memory({
    options: {
      observationalMemory: {
        model: "openai/gpt-5.4",
        scope: "thread",
        observation: {
          messageTokens: 15000,
        },
        reflection: {
          observationTokens: 20000,
        },
      },
    },
  }),
});
