/* eslint-disable @kbn/eslint/require-license-header */
const fs = require('fs');

const paths = process.argv.slice(2);

const scores = paths.map(parseFile).flat();

const complexityByPath = {};
scores.forEach(({ path, complexity }) => {
  complexityByPath[path] = complexity;
});

const outputPaths = Object.keys(complexityByPath);

const joined = ['complexity,path'];
for (const path of outputPaths) {
  const row = `${complexityByPath[path]},${path}`;
  joined.push(row);
}

fs.writeFile('./complexity.csv', joined.join('\n'), (err) => {
  if (err) {
    console.error(err);
    return;
  }

  console.error('OK');
});

function parseFile(inputPath) {
  const input = fs.readFileSync(inputPath, { encoding: 'utf-8' });

  const fileChunks = input.split('\n\n');

  return fileChunks.map(parseChunk);
}

function parseChunk(chunk) {
  const [filePath, ...lines] = chunk.split('\n');

  const xPackIndex = filePath.indexOf('x-pack');
  const path = filePath.substr(xPackIndex);

  const complexity = getComplexityFromLines(lines);

  return {
    path,
    complexity,
  };
}

function getComplexityFromLines(lines) {
  const regex = /.+from (\d+) .+/;

  const scores = lines.map((line) => {
    const found = line.match(regex);
    return parseInt(found[1]);
  });

  return scores.reduce((acc, item) => acc + item, 0);
}
