'use strict';

const internals = {};

exports.recursiveAsync = function (initialValues, fn, callback) {

    const next = function () {

        const args = [];
        for (let i = 0; i < arguments.length; ++i) {
            args.push(arguments[i]);
        }

        const err = args.shift();
        if (err) {
            if (callback) {
                return callback(err);
            }
            throw err;
        }
        args.push(next);
        return fn.apply(null, args);

    };
    next(null, initialValues);
};

exports.series = function (tasks, callback) {

    const executeTask = function (task) {

        task((err) => {

            if (err) {
                return callback(err);
            }
            const next = tasks.shift();
            if (next) {
                return executeTask(next);
            }
            return callback(null);
        });
    };

    executeTask(tasks.shift());
};


exports.batch = function (logs, options) {

    const batch = [];
    let events = [];
    let size = 0;

    for (let i = 0; i < logs.length; ++i) {
        const event = logs[i];
        const eventSize = JSON.stringify(event).length;

        // Skip logs that exceed maxSize
        if (eventSize > options.maxSize) {
            console.error(new Error(JSON.stringify({ msg: `eventSize ${eventSize} exceeds maxSize ${options.maxSize}`, data: event })));
            continue;
        }

        const maxEvents = (events.length === options.maxEvents);
        const maxSize = ((size + eventSize) > options.maxSize);


        if (maxEvents || maxSize) {
            batch.push(events);
            events = [];
            size = 0;
        }

        size += eventSize;
        events.push(event);
    }

    batch.push(events);
    return batch;
};
