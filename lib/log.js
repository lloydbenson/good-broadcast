var Fs = require('fs');

//declare internals
var internals = {};

exports.get = function (logPath, start, callback) {

    var log = '';
    var stream = Fs.createReadStream(logPath, { start: start });

    stream.on('readable', function () {

        var read = stream.read();
        if (read) {
            log += read.toString('ascii');
        }
    });

    stream.on('error', function (err) {

        console.error(err);
        stream.removeAllListeners();
        callback(0, []);
    });

    stream.once('end', function () {

        if (!log) {
            return callback(0, []);
        }

        var events = log.split('\n');
        var lastEvent = events[events.length - 1];
        var bytesRead = log.length;

        if (lastEvent[lastEvent.length - 1] !== '}') {// Handle any incomplete events in the log
            events.pop();
            bytesRead -= Buffer.byteLength(lastEvent);
        }

        var result = [];
        for (var i = 0, il = events.length; i < il; ++i) {
            var event = events[i];
            if (event && event[0] === '{' && event[event.length - 1] === '}') {
                try {
                    result.push(JSON.parse(event));
                } catch (err) {
                    console.error(err);
                }
            }
        }

        callback(bytesRead, result);
    });
};