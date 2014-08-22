var internals = {};

exports.recursiveAsync = function(initialValues, fn, callback) {
    var next = function () {

        var _arguments = [];
        for (var i = 0, il = arguments.length; i < il; ++i) {
            _arguments.push(arguments[i]);
        }

        var err = _arguments.shift();
        if (err) {
            if (callback) {
                return callback(err);
            }
            throw err;
        }
        _arguments.push(next);
        return fn.apply(null, _arguments);

    };
    next(null, initialValues);
};
