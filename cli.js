#!/usr/bin/env node

var minimist = require('minimist'),
    pokegoScan = require('./index.js');

function printUsage() {
    console.log('usage: pokego-scan -- latitude,longitude');
}

var argv = minimist(process.argv.slice(2));

if (argv.help) {
    printUsage();
    process.exit();
}

var coords = {latitude: null, longitude: null},
    opts = {distance: null};

if (argv._.length === 1) {
    var arr = argv._[0].split(',');
    coords.latitude = arr[0];
    coords.longitude = arr[1];
} else {
    printUsage();
    process.exit(1);
}

if (argv.distance) {
    opts.distance = argv.distance;
}

pokegoScan(coords, opts, function(err, pokemon) {
    if (err) {
        console.error('error: '+err.message);
        return;
    }
    console.log(pokemon);
});
