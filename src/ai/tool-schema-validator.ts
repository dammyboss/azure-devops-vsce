/**
 * Tool Schema Validator
 * Validates tool inputs against JSON Schema before execution
 */

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export interface JSONSchema {
    type?: string;
    properties?: Record<string, JSONSchema>;
    required?: string[];
    items?: JSONSchema;
    enum?: any[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    additionalProperties?: boolean | JSONSchema;
    oneOf?: JSONSchema[];
    anyOf?: JSONSchema[];
    allOf?: JSONSchema[];
}

export class ToolSchemaValidator {
    /**
     * Validate tool input against schema
     */
    static validate(input: any, schema: JSONSchema): ValidationResult {
        const errors: string[] = [];

        this.validateValue(input, schema, '', errors);

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate a value against a schema
     */
    private static validateValue(
        value: any,
        schema: JSONSchema,
        path: string,
        errors: string[]
    ): void {
        // Check type
        if (schema.type) {
            if (!this.checkType(value, schema.type)) {
                errors.push(`${path || 'root'}: Expected type '${schema.type}', got '${typeof value}'`);
                return; // Early return if type is wrong
            }
        }

        // Validate based on type
        switch (schema.type) {
            case 'object':
                this.validateObject(value, schema, path, errors);
                break;
            case 'array':
                this.validateArray(value, schema, path, errors);
                break;
            case 'string':
                this.validateString(value, schema, path, errors);
                break;
            case 'number':
            case 'integer':
                this.validateNumber(value, schema, path, errors);
                break;
        }

        // Validate enum
        if (schema.enum) {
            if (!schema.enum.includes(value)) {
                errors.push(`${path || 'root'}: Value must be one of: ${schema.enum.join(', ')}`);
            }
        }

        // Validate oneOf, anyOf, allOf
        if (schema.oneOf) {
            this.validateOneOf(value, schema.oneOf, path, errors);
        }
        if (schema.anyOf) {
            this.validateAnyOf(value, schema.anyOf, path, errors);
        }
        if (schema.allOf) {
            this.validateAllOf(value, schema.allOf, path, errors);
        }
    }

    /**
     * Check if value matches type
     */
    private static checkType(value: any, type: string): boolean {
        if (value === null) {
            return type === 'null';
        }

        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'integer':
                return typeof value === 'number' && Number.isInteger(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && !Array.isArray(value);
            case 'null':
                return value === null;
            default:
                return true;
        }
    }

    /**
     * Validate object
     */
    private static validateObject(
        value: any,
        schema: JSONSchema,
        path: string,
        errors: string[]
    ): void {
        if (typeof value !== 'object' || value === null) {
            return;
        }

        // Check required properties
        if (schema.required) {
            for (const required of schema.required) {
                if (!(required in value)) {
                    errors.push(`${path || 'root'}: Missing required property '${required}'`);
                }
            }
        }

        // Validate properties
        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in value) {
                    const propPath = path ? `${path}.${key}` : key;
                    this.validateValue(value[key], propSchema, propPath, errors);
                }
            }
        }

        // Check additional properties
        if (schema.additionalProperties === false && schema.properties) {
            const allowedKeys = Object.keys(schema.properties);
            for (const key of Object.keys(value)) {
                if (!allowedKeys.includes(key)) {
                    errors.push(`${path || 'root'}: Additional property '${key}' not allowed`);
                }
            }
        } else if (typeof schema.additionalProperties === 'object' && schema.properties) {
            const allowedKeys = Object.keys(schema.properties);
            for (const key of Object.keys(value)) {
                if (!allowedKeys.includes(key)) {
                    const propPath = path ? `${path}.${key}` : key;
                    this.validateValue(value[key], schema.additionalProperties, propPath, errors);
                }
            }
        }
    }

    /**
     * Validate array
     */
    private static validateArray(
        value: any,
        schema: JSONSchema,
        path: string,
        errors: string[]
    ): void {
        if (!Array.isArray(value)) {
            return;
        }

        // Validate items
        if (schema.items) {
            value.forEach((item, index) => {
                const itemPath = `${path}[${index}]`;
                this.validateValue(item, schema.items!, itemPath, errors);
            });
        }
    }

    /**
     * Validate string
     */
    private static validateString(
        value: any,
        schema: JSONSchema,
        path: string,
        errors: string[]
    ): void {
        if (typeof value !== 'string') {
            return;
        }

        // Check minLength
        if (schema.minLength !== undefined && value.length < schema.minLength) {
            errors.push(`${path || 'root'}: String length must be at least ${schema.minLength}, got ${value.length}`);
        }

        // Check maxLength
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
            errors.push(`${path || 'root'}: String length must be at most ${schema.maxLength}, got ${value.length}`);
        }

        // Check pattern
        if (schema.pattern) {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(value)) {
                errors.push(`${path || 'root'}: String does not match pattern '${schema.pattern}'`);
            }
        }
    }

    /**
     * Validate number
     */
    private static validateNumber(
        value: any,
        schema: JSONSchema,
        path: string,
        errors: string[]
    ): void {
        if (typeof value !== 'number' || isNaN(value)) {
            return;
        }

        // Check minimum
        if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push(`${path || 'root'}: Number must be at least ${schema.minimum}, got ${value}`);
        }

        // Check maximum
        if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push(`${path || 'root'}: Number must be at most ${schema.maximum}, got ${value}`);
        }
    }

    /**
     * Validate oneOf
     */
    private static validateOneOf(
        value: any,
        schemas: JSONSchema[],
        path: string,
        errors: string[]
    ): void {
        let validCount = 0;

        for (const schema of schemas) {
            const tempErrors: string[] = [];
            this.validateValue(value, schema, path, tempErrors);
            if (tempErrors.length === 0) {
                validCount++;
            }
        }

        if (validCount !== 1) {
            errors.push(`${path || 'root'}: Value must match exactly one schema (matched ${validCount})`);
        }
    }

    /**
     * Validate anyOf
     */
    private static validateAnyOf(
        value: any,
        schemas: JSONSchema[],
        path: string,
        errors: string[]
    ): void {
        let isValid = false;

        for (const schema of schemas) {
            const tempErrors: string[] = [];
            this.validateValue(value, schema, path, tempErrors);
            if (tempErrors.length === 0) {
                isValid = true;
                break;
            }
        }

        if (!isValid) {
            errors.push(`${path || 'root'}: Value must match at least one schema`);
        }
    }

    /**
     * Validate allOf
     */
    private static validateAllOf(
        value: any,
        schemas: JSONSchema[],
        path: string,
        errors: string[]
    ): void {
        for (const schema of schemas) {
            this.validateValue(value, schema, path, errors);
        }
    }

    /**
     * Get user-friendly error message
     */
    static getErrorMessage(result: ValidationResult): string {
        if (result.valid) {
            return 'Validation passed';
        }

        if (result.errors.length === 1) {
            return result.errors[0];
        }

        return `Validation failed with ${result.errors.length} errors:\n` +
               result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n');
    }

    /**
     * Validate and get user-friendly message
     */
    static validateAndGetMessage(input: any, schema: JSONSchema): { valid: boolean; message: string } {
        const result = this.validate(input, schema);
        return {
            valid: result.valid,
            message: this.getErrorMessage(result)
        };
    }
}
