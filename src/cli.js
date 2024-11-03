#!/usr/bin/env node

const { runBootstrap } = require('./commands/bootstrap');
const { startBuildProcess } = require('./commands/build');
const { startTestProcess } = require('./commands/test');
const { startDeployProcess } = require('./commands/deploy');
const {Reporter} = require("./lib")
// Get command-line arguments
const [,, command, configPath, destination] = process.argv;

const run = async () => {
  try {
    switch (command) {
      case "bootstrap":
        await runBootstrap();
        break;
      case "build":
        await startBuildProcess(configPath);
        break;
      case "test":
        await startTestProcess(configPath);
        break;
      case "deploy":
        await startDeployProcess(configPath, destination);
        break;
      default:
        reporter.error("Unknown command. Use 'bootstrap', 'build', 'test', or 'deploy'.");
        process.exit(1);
    }
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

run();
