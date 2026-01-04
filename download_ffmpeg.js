const fs = require('fs');
const https = require('https');

const files = [
    'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
    'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.worker.js'
];

async function download() {
    for (const url of files) {
        const filename = url.split('/').pop();
        const dest = `public/${filename}`;
        console.log(`Downloading ${url} to ${dest}...`);

        await new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    // Handle redirect
                    if (res.statusCode === 302 || res.statusCode === 301) {
                        https.get(res.headers.location, (res2) => {
                            const file = fs.createWriteStream(dest);
                            res2.pipe(file);
                            file.on('finish', resolve);
                        });
                    } else {
                        reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
                    }
                } else {
                    const file = fs.createWriteStream(dest);
                    res.pipe(file);
                    file.on('finish', resolve);
                }
            }).on('error', reject);
        });
    }
}

download().then(() => console.log('Done!')).catch(console.error);
