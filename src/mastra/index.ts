import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from "@mastra/observability";
import { workshopHelperAgent } from "./agents/workshop-helper-agent";
import { descriptionWriterAgent } from "./agents/description-writer-agent";
import { syncWorkshopYoutubeStreamWorkflow } from "./workflows/sync-workshop-youtube-stream-workflow";

export const mastra = new Mastra({
  agents: { workshopHelperAgent, descriptionWriterAgent },
  workflows: { syncWorkshopYoutubeStreamWorkflow },
  storage: new LibSQLStore({
    id: "mastra-storage",
    // stores observability, scores, ... into persistent file storage
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends events to Mastra Platform when configured
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
