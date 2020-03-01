const debug = require('debug')('lightwaverfv1::withRetry');

module.exports = function withRetry(fn, retries=3, delay=100, ...args) {
  return new Promise((resolve, reject) => {
    const argsWithCallback = args.slice();
    argsWithCallback.push((err, result) => {
      debug("Received response from function", err, result);
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