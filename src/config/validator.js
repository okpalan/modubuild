const schema = require('../schema.json');
const fs = require('fs');

// Type checking functions
const isType = (type) => (data) => typeof data === type;
const isObject = (data) => isType('object')(data);
const isArray = (data) => Array.isArray(data);
const isString = (data) => isType('string')(data);

// Validation functions
const validateType = (data, schema, path, reporter) => {
  if (schema.type && !schema.type.includes(typeof data)) {
    reporter.log('error', `Invalid type at ${path}: expected ${schema.type} but got ${typeof data}`);
    return false;
  }
  return true;
};

const validateObject = (data, schema, path, reporter) => {
  if (!isObject(data) || !schema.properties) return false;
  for (let key in schema.properties) {
    const newPath = `${path}.${key}`;

    if (schema.required && schema.required.includes(key) && data[key] === undefined) {
      reporter.log('error', `Missing required field at ${newPath}`);
      return false;
    }

    if (data[key] !== undefined && !validate(data[key], schema.properties[key], newPath, reporter)) return false;
  }
  return true;
};

const validateArray = (data, schema, path, reporter) => {
  if (!isArray(data)) {
    reporter.log('error', `Invalid type at ${path}: expected array but got ${typeof data}`);
    return false;
  }
  return data.every((item, index) => validate(item, schema.items, `${path}[${index}]`, reporter));
};

const validatePattern = (data, schema, path, reporter) => {
  const regex = new RegExp(schema.pattern);
  if (!regex.test(data)) {
    reporter.log('error', `Pattern mismatch at ${path}: ${data} does not match ${schema.pattern}`);
    return false;
  }
  return true;
};

const validateEnum = (data, schema, path, reporter) => {
  if (schema.enum && !schema.enum.includes(data)) {
    reporter.log('error', `Value at ${path} is not in enum: ${schema.enum}`);
    return false;
  }
  return true;
};

// Main validation function using currying
const validate = (schema) => (data, path = 'root', reporter) => {
  if (!validateType(data, schema, path, reporter)) return false;

  switch (schema.type) {
    case 'object':
      return validateObject(data, schema, path, reporter);
    case 'array':
      return validateArray(data, schema, path, reporter);
    case 'string':
      if (schema.pattern && !validatePattern(data, schema, path, reporter)) return false;
      return true;
    default:
      return validateEnum(data, schema, path, reporter);
  }
};

module.exports = validate;
