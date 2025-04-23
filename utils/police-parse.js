const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');

const url = 'https://www.police.govt.nz/stolenwanted/vehicles/csv/download?tid=&all=true&gzip=false';

const headers = [
  'Plate',
  'Colour',
  'Brand',
  'Model',
  'Year',
  'Type',
  'Date',
  'Place'
];

async function downloadAndParseCSV() {
  try {
    console.log('Downloading CSV data...');
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
    });

    const results = [];
    
    await new Promise((resolve, reject) => {
      response.data
        .pipe(csv({ 
          headers: headers,
          skipLines: 0
        }))
        .on('data', (data) => results.push(data))
        .on('end', () => {
          console.log(`CSV parsing complete. Processed ${results.length} records.`);
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    fs.writeFileSync('nz_stolen_vehicles.json', JSON.stringify(results, null, 2));
    console.log('Data saved to nz_stolen_vehicles.json');
    
    return results;
  } catch (error) {
    console.error('Error downloading or parsing CSV:', error.message);
    throw error;
  }
}

module.exports = downloadAndParseCSV;
