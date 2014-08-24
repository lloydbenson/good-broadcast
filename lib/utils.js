var internals = {};

exports.recursiveAsync = function (initialValues, fn, callback) {

    var next = function () {

        var args = [];
        for (var i = 0, il = arguments.length; i < il; ++i) {
            args.push(arguments[i]);
        }

        var err = args.shift();
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
