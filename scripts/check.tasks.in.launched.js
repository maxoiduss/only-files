/// Scans launch.json and tasks.json,
/// finds tasks in the first and check existence in the second.
/// Writes the result to TASKS.md
const fs = require('fs');

let strippedLines = 0;

const strip = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const normalized = raw.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  for (let i = 0; i < lines.length; ) {
    if (lines[i].trimStart().startsWith('/*')) {
      while (!lines[i].trimEnd().endsWith('*/')) {
        ++i;
      }
      ++i;
    } else if (lines[i].trimStart().startsWith('//')
            || lines[i].trimStart().startsWith('#!')) {
      ++i;
    } else {
      strippedLines = i;

      return lines.slice(i).join('\n');
    }
  }
};

const findLine = (jsonString, value) => {
  const escapedValue = value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const pattern = new RegExp(`"[^"]+"\\s*:\\s*"${escapedValue}"`);
  const match = jsonString.match(pattern);
  if (!match) { console.log(`${value} : not found`); return null; }

  const slice = jsonString.substring(0, match.index);
  const lineNum = slice.split(/\r?\n/).length;

  return lineNum;
};

const launchPath = '.vscode/launch.json';
const tasksPath = '.vscode/tasks.json';
const launch = JSON.parse(strip(launchPath));
const tasks = strip(tasksPath);
const tasky = JSON.parse(tasks);
const labels = new Set((tasky.tasks||[]).map((t) => t.label || t.taskName));

const entries = [];
(launch.configurations||[]).forEach((cfg) => {
  const task = cfg.preLaunchTask;
  if (!task) { return; }

  const found = labels.has(task);
  const line = found ? findLine(tasks, task) : 0;
  const args = [`/${tasksPath}#L${line + strippedLines}`];
  entries.push(`- **${task}** — ${found ? '✅' : '❌'}  [Open tasks.json](${args})`);
});

fs.writeFileSync('.vscode/TASKS.md', `# Task links\n\n${entries.join('\n')}\n`);
fs.appendFileSync('.vscode/TASKS.md', `## All Tasks\n\n- ${[...labels].join('\n- ')}\n`);