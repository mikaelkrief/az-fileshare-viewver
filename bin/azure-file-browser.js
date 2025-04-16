#!/usr/bin/env node

const { startApplication } = require('../src/index');

// Start the application
startApplication()
  .catch(error => {
    console.error('Error running application:', error);
    process.exit(1);
  });