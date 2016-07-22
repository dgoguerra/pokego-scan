var async = require('async'),
    debug = require('debug')('pokego-scan'),
    geolib = require('geolib'),
    isFunction = require('is-function'),
    pokedex = require('./pokedex.json');
    cloudscraper = require('cloudscraper');

function get(url, next) {
    debug(url);
    cloudscraper.get(url, function(error, response, body) {
      if (error) {
        next(err);
      } else {
        if (debug.enabled) {
            try {
                var json = JSON.parse(body);
                debug(json);
            } catch (e) {
                debug('(non-json content)');
            }
        }
        next(null, body);
      }
    });
}

function secondsToString(sec) {
    var o = parseInt(sec, 10),
        n = Math.floor(o / 3600),
        i = Math.floor((o - (n * 3600)) / 60),
        t = o - (n * 3600) - (i * 60);
    if (n < 10) n = '0' + n;
    if (i < 10) i = '0' + i;
    if (t < 10) t = '0' + t;
    if (n > 0) {
        return n + ':' + i + ':' + t
    };
    return i + ':' + t
}

function createScanJob(coor, next) {
    var url = 'https://pokevision.com/map/scan/'+coor.latitude+'/'+coor.longitude;
    get(url, function(err, body) {
        if (err) return next(err);

        try {
            var json = JSON.parse(body);

            next(null, {
                latitude: coor.latitude,
                longitude: coor.longitude,
                jobId: json.jobId,
                jobUrl: 'https://pokevision.com/map/data/'+coor.latitude+'/'+coor.longitude+'/'+json.jobId
            });
        } catch (e) {
            if (body.indexOf('{disabled}') > -1) {
                return next(new Error('Scanning is currently disabled temporarily.'));
            } else if (body.indexOf('{scan-throttle}') > -1) {
                return next(new Error('You already scanned recently.'));
            } else if (body.indexOf('Maintenance') > -1) {
                return next(new Error('Pokevision API is undergoing maintentance. Everything should be completed shortly.'));
            }
        }
    });
}

function getJobResults(job, next) {
    var currentAttempt = 0,
        retryTimeout = 0,
        retryTimeoutIncr = 1500,
        maxRetryTimeout = 10000,
        retries = 10;

    async.forever(function(loop) {
        currentAttempt++;

        if (currentAttempt > retries) {
            return next(new Error('Too many retries. Either the Pokemon or Pokevision servers may be unstable or offline.'));
        }

        setTimeout(function() {
            get(job.jobUrl, function(err, body) {
                if (err) return next(err);

                var json = JSON.parse(body);

                if (json.jobStatus) {
                    if (json.jobStatus == 'failure' || json.jobStatus == 'unknown') {
                        next(new Error('Unable to scan for pokemon. If this continues to fail then the Pokemon servers are currently unstable or offline.'));
                    } else if (json.jobStatus == 'in_progress') {
                        debug('job in progress, retry in %sms (attempt %s of %s)', retryTimeout, currentAttempt+1, retries);
                        loop(null);
                    }
                    return;
                }

                next(null, json);
            });
        }, retryTimeout);

        retryTimeout = Math.min(retryTimeout+retryTimeoutIncr, maxRetryTimeout);
    });
}

function fillPokemonInfo(currentCoords, pokemon) {
    var distance = geolib.getDistance(currentCoords, pokemon),
        despawns = pokemon.expiration_time - Math.floor(+new Date() / 1000);

    pokemon.name = pokedex[pokemon.pokemonId] || 'Unknown';
    pokemon.map = 'https://pokevision.com/#/@'+pokemon.latitude+','+pokemon.longitude;
    pokemon.image = 'https://ugc.pokevision.com/images/pokemon/'+pokemon.pokemonId+'.png';
    pokemon.distance = distance;
    pokemon.distance_str = distance+'m';
    pokemon.despawns_in = despawns;
    pokemon.despawns_in_str = secondsToString(despawns);

    return pokemon;
}

module.exports = function(coords, opts, next) {
    if (isFunction(opts)) {
        next = opts;
        opts = {};
    }

    createScanJob(coords, function(err, job) {
        if (err) return next(err);

        getJobResults(job, function(err, res) {
            if (err) return next(err);

            var foundPokemon = [];

            res.pokemon.forEach(function(p) {
                p = fillPokemonInfo(coords, p);

                // filter by distance, if given as an option
                if (opts && opts.distance && p.distance > opts.distance) {
                    return;
                }

                // filter by specific pokemon, if given as an option
                if (opts && opts.filter && opts.filter.indexOf(p.name) == -1) {
                    return;
                }

                foundPokemon.push(p);
            });

            // sort pokemon by distance
            foundPokemon.sort(function(a, b) {
                return a.distance - b.distance;
            });

            next(null, foundPokemon);
        });
    });
}
