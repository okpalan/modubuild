const ValidationError = class extends Error {
  constructor(message, path, value, schema) {
    super(message);
    this.name = 'ValidationError';
    this.path = path;
    this.value = value;
    this.schema = schema;
  }
};

/**
 * @usage
const SchemaValidator = require('./validator');
// Create validator instance with options
const validator = new SchemaValidator({
  strictAdditionalProperties: true,
  maxErrors: 100,
  customFormats: {
    'phone': (value) => /^\+?[\d\s-]{10,}$/.test(value)
  }
});

// Validate data against schema
const schema = require('./schema.json');
const data = require('./modubuild.json');

const result = validator.validateSchema(data, schema);

if (result.isValid) {
  console.log('Validation successful!');
} else {
  console.log('Validation failed with the following errors:');
  result.errors.forEach(error => {
    console.log(`- Path ${error.path}: ${error.message}`);
  });
}
 */
class SchemaValidator {
  constructor(options = {}) {
    this.options = {
      strictAdditionalProperties: true,
      maxErrors: 100,
      customFormats: {},
      ...options
    };
    
    this.errors = [];
    this.validationCache = new WeakMap();
  }

  // Type checking functions with detailed validation
  static typeCheckers = {
    string: (value) => typeof value === 'string',
    number: (value) => typeof value === 'number' && !isNaN(value),
    integer: (value) => Number.isInteger(value),
    boolean: (value) => typeof value === 'boolean',
    null: (value) => value === null,
    array: (value) => Array.isArray(value),
    object: (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  };

  // Format validators
  static formatValidators = {
    'date-time': (value) => {
      const timestamp = Date.parse(value);
      return !isNaN(timestamp);
    },
    'email': (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    'uri': (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    'ipv4': (value) => {
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4Regex.test(value)) return false;
      return value.split('.').every(num => parseInt(num) >= 0 && parseInt(num) <= 255);
    },
    'uuid': (value) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(value);
    }
  };

  addError(message, path, value, schema) {
    if (this.errors.length >= this.options.maxErrors) return false;
    this.errors.push(new ValidationError(message, path, value, schema));
    return true;
  }

  validateType(value, schema, path) {
    if (!schema.type) return true;

    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const valid = types.some(type => SchemaValidator.typeCheckers[type]?.(value));

    if (!valid) {
      this.addError(
        `Invalid type: expected ${types.join(' or ')} but got ${typeof value}`,
        path,
        value,
        schema
      );
      return false;
    }
    return true;
  }

  validateFormat(value, schema, path) {
    if (!schema.format) return true;

    const validator = this.options.customFormats[schema.format] || 
                     SchemaValidator.formatValidators[schema.format];

    if (!validator) {
      console.warn(`Unknown format: ${schema.format}`);
      return true;
    }

    if (!validator(value)) {
      this.addError(
        `Invalid format: ${value} does not match format ${schema.format}`,
        path,
        value,
        schema
      );
      return false;
    }
    return true;
  }

  validateNumber(value, schema, path) {
    if (typeof value !== 'number') return true;

    if (schema.minimum !== undefined && value < schema.minimum) {
      this.addError(
        `Value ${value} is less than minimum ${schema.minimum}`,
        path,
        value,
        schema
      );
      return false;
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      this.addError(
        `Value ${value} is greater than maximum ${schema.maximum}`,
        path,
        value,
        schema
      );
      return false;
    }

    if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
      this.addError(
        `Value ${value} is not a multiple of ${schema.multipleOf}`,
        path,
        value,
        schema
      );
      return false;
    }

    return true;
  }

  validateString(value, schema, path) {
    if (typeof value !== 'string') return true;

    if (schema.minLength !== undefined && value.length < schema.minLength) {
      this.addError(
        `String length ${value.length} is less than minimum length ${schema.minLength}`,
        path,
        value,
        schema
      );
      return false;
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      this.addError(
        `String length ${value.length} is greater than maximum length ${schema.maxLength}`,
        path,
        value,
        schema
      );
      return false;
    }

    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        this.addError(
          `String "${value}" does not match pattern ${schema.pattern}`,
          path,
          value,
          schema
        );
        return false;
      }
    }

    return true;
  }

  validateArray(value, schema, path) {
    if (!Array.isArray(value)) return true;

    if (schema.minItems !== undefined && value.length < schema.minItems) {
      this.addError(
        `Array length ${value.length} is less than minimum ${schema.minItems}`,
        path,
        value,
        schema
      );
      return false;
    }

    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      this.addError(
        `Array length ${value.length} is greater than maximum ${schema.maxItems}`,
        path,
        value,
        schema
      );
      return false;
    }

    if (schema.uniqueItems && new Set(value).size !== value.length) {
      this.addError(
        'Array items must be unique',
        path,
        value,
        schema
      );
      return false;
    }

    if (schema.items) {
      return value.every((item, index) =>
        this.validate(item, schema.items, `${path}[${index}]`)
      );
    }

    return true;
  }

  validateObject(value, schema, path) {
    if (typeof value !== 'object' || value === null) return true;

    // Required properties
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in value)) {
          this.addError(
            `Missing required property: ${required}`,
            path,
            value,
            schema
          );
          return false;
        }
      }
    }

    // Property validation
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (key in value) {
          if (!this.validate(value[key], prop, `${path}.${key}`)) {
            return false;
          }
        }
      }
    }

    // Additional properties
    if (this.options.strictAdditionalProperties && schema.additionalProperties === false) {
      const extraKeys = Object.keys(value).filter(
        key => !schema.properties || !(key in schema.properties)
      );
      if (extraKeys.length > 0) {
        this.addError(
          `Additional properties not allowed: ${extraKeys.join(', ')}`,
          path,
          value,
          schema
        );
        return false;
      }
    }

    // Pattern properties
    if (schema.patternProperties) {
      for (const [pattern, schema] of Object.entries(schema.patternProperties)) {
        const regex = new RegExp(pattern);
        for (const [key, value] of Object.entries(value)) {
          if (regex.test(key)) {
            if (!this.validate(value, schema, `${path}.${key}`)) {
              return false;
            }
          }
        }
      }
    }

    return true;
  }

  validateEnum(value, schema, path) {
    if (!schema.enum) return true;

    if (!schema.enum.includes(value)) {
      this.addError(
        `Value must be one of: ${schema.enum.join(', ')}`,
        path,
        value,
        schema
      );
      return false;
    }
    return true;
  }

  validate(value, schema, path = 'root') {
    // Reset errors if this is the root call
    if (path === 'root') {
      this.errors = [];
    }

    // Check cache for repeated validations
    const cacheKey = { value, schema };
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey);
    }

    // Perform all validations
    const isValid = 
      this.validateType(value, schema, path) &&
      this.validateFormat(value, schema, path) &&
      this.validateNumber(value, schema, path) &&
      this.validateString(value, schema, path) &&
      this.validateArray(value, schema, path) &&
      this.validateObject(value, schema, path) &&
      this.validateEnum(value, schema, path);

    // Cache the result
    this.validationCache.set(cacheKey, isValid);

    return isValid;
  }

  // Helper method to validate against a schema and get results
  validateSchema(data, schema) {
    const isValid = this.validate(data, schema);
    return {
      isValid,
      errors: this.errors,
      errorCount: this.errors.length
    };
  }
}

module.exports = SchemaValidator