'use strict';
const Code = require('code');
const Lab = require('lab');
const Util = require('../lib/utils');

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

// Declare internals

const internals = {};

describe('Utils', () => {

    describe('forever()', () => {

        it('calls itself recursively asynchronously', (done) => {

            let count = 0;
            Util.recursiveAsync(0, (value, callback) => {

                value++;
                count = value;
                if (value === 10) {

                    // Do this to simulate async
                    setImmediate(() => {

                        callback(true);
                    });
                }
                else {
                    setImmediate(() => {

                        callback(null, value);
                    });
                }
            }, (error) => {

                expect(error).to.exist();
                expect(count).to.equal(10);
                done();
            });
        });

        it('throw an error if no callback supplied', (done) => {

            expect(() => {

                Util.recursiveAsync(0, (value, callback) => {

                    callback(new Error('no callback'));
                });
            }).to.throw('no callback');
            done();
        });
    });

    describe('series()', () => {

        it('calls a series of tasks in order', (done) => {

            const result = [];

            Util.series([
                function (callback) {

                    setTimeout(() => {

                        result.push(1);
                        callback(null);
                    }, 200);
                },
                function (callback) {

                    setTimeout(() => {

                        result.push(2);
                        callback(null);
                    }, 100);
                }
            ], (err) => {

                expect(err).to.not.exist();
                expect(result).to.equal([1, 2]);
                done();
            });
        });

        it('calls back with an error if one occurs', (done) => {

            Util.series([
                function (callback) {

                    setTimeout(() => {

                        callback(true);
                    }, 200);
                }
            ], (err) => {

                expect(err).to.be.true();
                done();
            });
        });
    });

    describe('batch()', () => {

        it('respects maxEvents', (done) => {

            const logs = [{ foo: 1 }, { bar: 2 }];
            const options = { maxEvents: 1 };
            const batch = Util.batch(logs, options);

            expect(batch).to.have.length(2);
            done();
        });

        it('respects maxSize', (done) => {

            const logs = [{ foo: 10 }, { bar: 20 }];
            const options = { maxSize: 10 };
            const batch = Util.batch(logs, options);

            expect(batch).to.have.length(2);
            done();
        });

        it('logs error when a single log exceeds maxSize', (done) => {

            const output = console.error;
            console.error = function (error) {

                expect(error).match(/eventSize 12 exceeds maxSize 10/);
            };

            const logs = [{ foo: 1000 }, { bar: 2 }];
            const options = { maxSize: 10 };
            const batch = Util.batch(logs, options);

            console.error = output;
            expect(batch).to.have.length(1);
            done();
        });
    });
});
