export class AbiMappingValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbiMappingValidationError';
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertReadShape(label, read) {
  if (!isObject(read)) {
    throw new AbiMappingValidationError(`${label} must be an object.`);
  }

  if (typeof read.function !== 'string' || read.function.trim().length === 0) {
    throw new AbiMappingValidationError(`${label}.function must be a non-empty string.`);
  }

  if (!Array.isArray(read.args)) {
    throw new AbiMappingValidationError(`${label}.args must be an array.`);
  }

  if (typeof read.returns !== 'string' || read.returns.trim().length === 0) {
    throw new AbiMappingValidationError(`${label}.returns must be a non-empty string.`);
  }
}

export function validateAbiMappingSchema(abiMapping) {
  if (!isObject(abiMapping)) {
    throw new AbiMappingValidationError('abiMapping must be an object.');
  }

  assertReadShape('abiMapping.positionRead', abiMapping.positionRead);

  if (abiMapping.decimalsRead !== undefined) {
    assertReadShape('abiMapping.decimalsRead', abiMapping.decimalsRead);
  }

  return true;
}

export async function validateAbiMappingWithPreview({ abiMapping, previewExecutor }) {
  validateAbiMappingSchema(abiMapping);

  if (typeof previewExecutor !== 'function') {
    throw new AbiMappingValidationError('previewExecutor is required.');
  }

  const preview = await previewExecutor(abiMapping);
  if (!preview || preview.ok !== true) {
    throw new AbiMappingValidationError(preview?.error || 'ABI preview read failed.');
  }

  return true;
}
