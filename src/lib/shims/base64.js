// shims/base64.js

// Base64 encoding function
function encode(input) {
    // Convert the input to a binary string
    let binaryString = '';
    for (let i = 0; i < input.length; i++) {
      binaryString += String.fromCharCode(input.charCodeAt(i));
    }
  
    // Use btoa for encoding in browsers
    return typeof btoa === 'function' ? btoa(binaryString) : binaryString;
  }
  
  // Base64 decoding function
  function decode(input) {
    // Use atob for decoding in browsers
    const binaryString = typeof atob === 'function' ? atob(input) : input;
  
    // Convert binary string back to original string
    let result = '';
    for (let i = 0; i < binaryString.length; i++) {
      result += String.fromCharCode(binaryString.charCodeAt(i));
    }
    
    return result;
  }
  
  // Export functions for use in other parts of the project
  module.exports = {
    encode,
    decode,
  };
  