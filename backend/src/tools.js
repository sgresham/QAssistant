import mongoose from 'mongoose';

// --- Tool Definitions ---
export const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_infrastructure_health",
      description: "Checks the health status of critical infrastructure components (Backend, Database).",
      parameters: {
        type: "object",
        properties: {
          component: {
            type: "string",
            enum: ["backend", "database", "all"],
            description: "Which component to check. Default is 'all'."
          }
        },
        required: ["component"]
      }
    }
  }
];

// --- Helper: Execute Tool Logic ---
export async function executeTool(toolName, toolArgs) {
  if (toolName === "get_infrastructure_health") {
    const component = toolArgs.component || "all";
    const results = {};

    try {
      // 1. Check Backend
      results.backend = {
        status: "online",
        message: "Express server is responding."
      };

      // 2. Check Database
      if (mongoose.connection.readyState !== 1) {
        results.database = {
          status: "disconnected",
          message: "MongoDB connection is not active."
        };
      } else {
        try {
          await mongoose.connection.db.admin().ping();
          results.database = {
            status: "healthy",
            message: "MongoDB is connected and responding to pings."
          };
        } catch (err) {
          results.database = {
            status: "error",
            message: `MongoDB ping failed: ${err.message}`
          };
        }
      }

      let finalOutput = (component === "all") ? results : { [component]: results[component] };
      return JSON.stringify(finalOutput, null, 2);

    } catch (error) {
      return `Error checking infrastructure: ${error.message}`;
    }
  } else {
    return `Error: Unknown tool '${toolName}'`;
  }
}
