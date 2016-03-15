/*jslint node: true */
'use strict';
var q = require('q');
var fs = require('fs-extra');
var path = require('path');
var temp = require('temp');
var AdmZip = require('adm-zip');
var state = {};
var tests;

//all metadata tests are defined within the following array
//they should accept a metadata and base path param and return
//a promise. If the promise is rejected, the reasons for failure
//should be returned within an array of strings
tests = [
    function testRequiredFields(md, p) {
        var deferred = q.defer();

        deferred.reject(['sample error']);

        return deferred.promise;
    }
];

function processPath(p) {
    var deferred = q.defer(),
        metadataPath = path.resolve(p, 'metadata.json');

    fs.stat(metadataPath, function (err, stats) {
        if (err) {
            deferred.reject('Failed to find metadata.json file: ' + metadataPath);
        } else {
            state.path = p;
            deferred.resolve('Successfully loaded ' + p);
        }
    });

    return deferred.promise;
}

function processPackage(p) {
    var deferred = q.defer(),
        zip;

    try {
        zip = new AdmZip(p);

        //create a temporary folder to store the zip file
        temp.mkdir('vizlint', function (err, tmpPath) {
            var metadataPath;

            if (err) {
                deferred.reject('Failed to create temporary folder: ' + err);
                return;
            }

            console.log('Extracting visual package ...');
            zip.extractAllTo(tmpPath);

            //now that that we're extracted, process path
            processPath(tmpPath)
                .then(function (result) {
                    deferred.resolve(result);
                }, function (err) {
                    deferred.reject(err);
                });
        });
    } catch (e) {
        deferred.reject('Error while unzipping: ' + e);
    }

    return deferred.promise;
}

function parseMetadata(md, basePath, customTests) {
    var deferred = q.defer(),
        results = {
            msg: 'Valid package',
            errors: []
        },
        testsList = customTests || tests,
        //create new array of results of executed tests
        executedTests = testsList.map(function (curFunc) {
            return curFunc.call(null, md, basePath);
        });

    //run all tests and loop through the failed results to build
    //a list of all the errors found
    q.allSettled(executedTests).then(function (testResults) {
        testResults.forEach(function (curTestResult) {
            if (curTestResult.state === 'rejected') {
                var curErrors = curTestResult.reason,
                    errLen = results.errors.splice.length;
                //add to errors master array
                if (curErrors && Array.isArray(curErrors)) {
                    curErrors.forEach(function (err) {
                        results.errors.push(err);
                    });
                }
            }
        });

        //return results
        deferred.resolve(results);
    });

    return deferred.promise;
}

function load(suppliedPathName) {
    var deferred = q.defer(),
        pathName;

    //make sure a path is supplied
    if (!suppliedPathName) {
        deferred.reject('a path was not supplied!');
        return deferred.promise;
    }

    //expand path
    pathName = path.resolve(suppliedPathName);

    //check if file exists
    fs.stat(pathName, function (err, stats) {
        var promise;

        if (err) {
            deferred.reject('the supplied path does not exist: ' + pathName);
        } else {
            if (stats.isDirectory()) {
                promise = processPath(pathName);
            } else {
                promise = processPackage(pathName);
            }

            promise.then(function (result) {
                deferred.resolve(result);
            }, function (err) {
                deferred.reject(err);
            });
        }
    });

    return deferred.promise;
}

function lint(p, customTests) {
    var deferred = q.defer(),
        metadataObj,
        metadataFile;

    //derive path for metadata.json given supplied path
    metadataFile = path.resolve(p, 'metadata.json');
    fs.readFile(metadataFile, 'utf8', function (err, metadataStr) {
        if (err) {
            deferred.reject('Failed to open ' +
                            metadataFile + ': ' + err);
        } else {
            //attempt to parse metadata from string to obj
            try {
                metadataObj = JSON.parse(metadataStr);

                //run business logic on metadata and return results
                parseMetadata(metadataObj, path.dirname(metadataFile), customTests)
                    .then(function (results) {
                        deferred.resolve(results);
                    }, function (err) {
                        deferred.reject(err);
                    });
            } catch (e) {
                deferred.reject('Failed to parse JSON file ' +
                                metadataFile + ' ' + e);
            }
        }
    });

    //check for variables
    return deferred.promise;
}
exports.load = load;
exports.lint = lint;