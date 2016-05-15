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
