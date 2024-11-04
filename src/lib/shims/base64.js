
// Base64 encoding function
function encode(input) {
    if (typeof btoa === 'function') {
      return btoa(input);
    }
    // Fallback if btoa is not available
    return Buffer.from(input, 'binary').toString('base64');
  }
  
  // Base64 decoding function
  function decode(input) {
    if (typeof atob === 'function') {
      return atob(input);
    }
    // Fallback if atob is not available
    return Buffer.from(input, 'base64').toString('binary');
  }
  
  // Export functions for use in other parts of the project
  module.exports = {
    encode,
    decode,
  };
  