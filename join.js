/* eslint-disable @kbn/eslint/require-license-header */
// Import the churn.csv
// Import the complexity.csv

// Make maps of both files, check that each has the same number of keys?
// Walk over each file and create new outputs that are CSV with a header
// Where we join the data to
// patch,churn,complexity

// I'll need to figure out how to add a header to the csv files

const createCsvParser = require('csv-parser');
const fs = require('fs');

Promise.all([readChurnData(), readComplexityData()]).then(([churn, complexity]) => {
  const churnByPath = makeChurnMap(churn);
  const complexityByPath = makeComplexityMap(complexity);

  const paths = Object.keys(churnByPath);

  const joined = ['path,churn,complexity'];
  for (const path of paths) {
    const row = `${path},${churnByPath[path]},${complexityByPath[path] || 0}`;
    joined.push(row);
  }

  fs.writeFile('./data.csv', joined.join('\n'), (err) => {
    if (err) {
      console.error(err);
      return;
    }

    console.error('OK');
  });
});

function readChurnData() {
  return new Promise((resolve) => {
    const churn = [];
    fs.createReadStream('churn.csv')
      .pipe(createCsvParser())
      .on('data', (data) => churn.push(data))
      .on('end', () => {
        resolve(churn);
      });
  });
}

function readComplexityData() {
  return new Promise((resolve) => {
    const complexity = [];
    fs.createReadStream('complexity.csv')
      .pipe(createCsvParser())
      .on('data', (data) => complexity.push(data))
      .on('end', () => {
        resolve(complexity);
      });
  });
}

function makeChurnMap(churn) {
  const map = {};

  for (const c of churn) {
    map[c.path] = c.churn;
  }

  return map;
}

function makeComplexityMap(complexity) {
  const map = {};

  for (const c of complexity) {
    map[c.path] = c.complexity;
  }

  return map;
}
