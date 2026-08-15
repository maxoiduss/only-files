const { execSync } = require('child_process');

const scripts = {
  check: {
    tasks: {
      in: { launched: "scripts/check.tasks.in.launched.js" }
    }
  }
};

execSync(`node "${scripts.check.tasks.in.launched}"`, { stdio: 'inherit' });