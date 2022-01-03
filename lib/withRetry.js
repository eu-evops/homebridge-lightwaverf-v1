const debug = require('debug')('lightwaverf-v1::withRetry');

module.exports = function withRetry(fn, retries = 3, delay = 100, ...args) {
  debug("Calling LightwaveRF with retry", retries, "and delay", delay)
  return new Promise((resolve, reject) => {
    const argsWithCallback = args.slice();
    argsWithCallback.push((err, result) => {
      debug("Received response from function", result, "error", err);
      if (err) {
        if (retries === 0) {
          return reject(new Error(err));
        }

        debug("It was an error response, retrying", retries);
        return setTimeout(() => {
          debug("Retrying after delay", delay, "with arguments", args);
          withRetry(fn, retries - 1, delay, ...args)
            .then(resolve)
            .catch(reject);
        }, delay);
      }

      resolve(result);
    });

    fn(...argsWithCallback);
  })
}