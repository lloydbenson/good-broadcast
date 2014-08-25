var Lab = require('lab');
var Util = require('../lib/utils');

// Test shortcuts

var lab = exports.lab = Lab.script();
var expect = Lab.expect;
var before = lab.before;
var after = lab.after;
var describe = lab.describe;
var it = lab.it;

describe('Utils', function () {

    describe('forever', function(){

        it('calls itself recursively asynchonously', function (done) {

            var count = 0;
            Util.recursiveAsync(0, function (value, callback) {

                value++;
                count = value;
                if (value === 10) {

                    // Do this to simulate async
                    setImmediate(function() {

                        callback(true);
                    });
                }
                else {
                    setImmediate(function() {

                        callback(null, value);
                    });
                }
            }, function (error) {

                expect(error).to.exist;
                expect(count).to.equal(10);
                done();
            });
        });

        it('throw an error if no callback supplied', function (done) {

            expect(function () {

                Util.recursiveAsync(0, function (value, callback) {

                    callback(new Error('no callback'));
                });
            }).to.throw('no callback');
            done();
        });
    });
});