#!/usr/bin/env bun
const App = require(__dirname + '/module.js');

if (require.main === module) {
  (async () => {
    try {
      const app = new App();
      await app.run();
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  })();
}
