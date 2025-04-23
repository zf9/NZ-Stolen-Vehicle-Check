const whatsapp = require('whatsapp-web.js');
const fsp = require('fs').promises;
const qrcode = require('qrcode-terminal');
const PlateRecognizer = require('./utils/platerecognizer');
const downloadAndParseCSV = require('./utils/police-parse');
const config = require('./config.json');

const plateReader = new PlateRecognizer({
    apiKey: config.apiKey,
    regions: config.regions
});

let lastUpdateTime = null;

function getRelativeTimeString() { 
    // stolen from chatgpt...
    if (!lastUpdateTime) return 'Never';
    
    const now = new Date();
    const diffMs = now - lastUpdateTime;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec} seconds ago`;
    
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
    
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
}

async function checkIfPlateIsStolen(plate) {
    try {
        const normalizedPlate = plate.replace(/\s+/g, '').toUpperCase();
        const stolenVehiclesData = await fsp.readFile('nz_stolen_vehicles.json', 'utf8');
        const stolenVehicles = JSON.parse(stolenVehiclesData);
        
        return stolenVehicles.find(vehicle => 
            vehicle.Plate.replace(/\s+/g, '').toUpperCase() === normalizedPlate
        ) || null;
    } catch (error) {
        console.error('Error checking if plate is stolen:', error);
        return null;
    }
}

const clientConfig = {
    usePairingCode: true,
    phoneNumber: config.phoneNumber,
    headless: true
};

const client = new whatsapp.Client({
    authStrategy: new whatsapp.LocalAuth(),
    puppeteer: { 
        headless: clientConfig.headless,
    }
});

function updateStolenVehiclesDatabase() {
    console.log('Updating stolen vehicles database...');
    return downloadAndParseCSV()
        .then(data => {
            lastUpdateTime = new Date();
            console.log(`Successfully processed ${data.length} vehicle records`);
        })
        .catch(error => {
            console.error('Failed to process data:', error);
        });
}

updateStolenVehiclesDatabase();
const UPDATE_INTERVAL = 15 * 60 * 1000;
setInterval(updateStolenVehiclesDatabase, UPDATE_INTERVAL);

let pairingCodeRequested = false;

client.on('qr', async (qr) => {
    if (clientConfig.usePairingCode && !pairingCodeRequested) {
        try {
            const pairingCode = await client.requestPairingCode(clientConfig.phoneNumber);
            console.log('\nPairing code: ' + pairingCode);
            pairingCodeRequested = true;
        } catch (error) {
            console.error('Failed to request pairing code:', error);
            console.log('Falling back to QR code');
            qrcode.generate(qr, {small: true});
        }
    } else {
        console.log('Scan the QR code below to login:');
        qrcode.generate(qr, {small: true});
    }
});

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('ready', async () => {
    console.log('READY');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});

client.on('message_reaction', async (reaction) => {
    console.log('REACTION RECEIVED', reaction);
});

client.on('change_state', state => {
    console.log('CHANGE STATE', state);
});

client.on('message', async (msg) => {
    if (msg.body) {
        //console.log(msg.body);
    }
    //console.log(msg._data.notifyName);
    //console.log(msg.from);
    
    const number = msg.from.split('@')[0];
    console.log("Messaged Recived From: " + number);

    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            const filename = `${number}_image.png`;
            const buffer = Buffer.from(media.data, 'base64');
            await fsp.writeFile(filename, buffer);

            const result = await plateReader.recognizePlate({
                imagePath: filename
            });

            if (result.results && result.results.length > 0) {
                const plateNumber = result.results[0].plate;
                const stolenInfo = await checkIfPlateIsStolen(plateNumber);
                const lastUpdated = getRelativeTimeString();
                
                if (stolenInfo) {
                    const replyMessage = `STOLEN\nPlate detected: ${plateNumber}\nVehicle: ${stolenInfo.Brand} ${stolenInfo.Model} (${stolenInfo.Year})\nColor: ${stolenInfo.Colour}\nStolen from: ${stolenInfo.Place}\nDate: ${stolenInfo.Date}\n\nVehicle list last updated: ${lastUpdated}`;
                    await msg.reply(replyMessage);
                } else {
                    await msg.reply(`Plate detected: ${plateNumber} - Not reported stolen\n\nVehicle list last updated: ${lastUpdated}`);
                }
            } else {
                await msg.reply('No license plate detected in the image.');
            }
            
            try {
                await fsp.unlink(filename);
                console.log(`Deleted temporary image: ${filename}`);
            } catch (error) {
                console.error(`Error deleting image ${filename}:`, error);
            }
        } catch (err) {
            console.error('An error occurred:', err);
        }
    }
});

client.initialize();