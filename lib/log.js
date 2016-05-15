'use strict';

const Fs = require('fs');

const internals = {};

exports.get = function (logPath, start, callback) {

    let log = '';
    const stream = Fs.createReadStream(logPath, { start: start });

    stream.on('data', (chunk) => {

        log += chunk.toString('ascii');
    });

    stream.on('error', (err) => {

        console.error(err);
        stream.removeAllListeners();
        callback(0, []);
    });

    stream.once('end', () => {

        const events = log.split('\n');
        const lastEvent = events[events.length - 1];
        let bytesRead = log.length;

        // Handle any incomplete events in the log
        if (lastEvent[lastEvent.length - 1] !== '}') {
            events.pop();
            bytesRead -= Buffer.byteLength(lastEvent);
        }

        const result = [];
        for (let i = 0; i < events.length; ++i) {
            const event = events[i];
            if (event[0] === '{' && event[event.length - 1] === '}') {
                try {
                    result.push(JSON.parse(event));
                }
                catch (err) {
                    console.error(err);
                }
            }
        }

        callback(bytesRead, result);
    });
};
