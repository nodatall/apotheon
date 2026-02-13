function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertReadShape(label, read) {
  if (!isObject(read)) {
    throw new Error(`${label} must be an object.`);
  }

  if (typeof read.function !== 'string' || read.function.trim().length === 0) {
    throw new Error(`${label}.function must be a non-empty string.`);
  }

  if (!Array.isArray(read.args)) {
    throw new Error(`${label}.args must be an array.`);
  }

  if (typeof read.returns !== 'string' || read.returns.trim().length === 0) {
    throw new Error(`${label}.returns must be a non-empty string.`);
  }
}

export function validateAbiMappingSchema(abiMapping) {
  if (!isObject(abiMapping)) {
    throw new Error('abiMapping must be an object.');
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
    throw new Error('previewExecutor is required.');
  }

  const preview = await previewExecutor(abiMapping);
  if (!preview || preview.ok !== true) {
    throw new Error(preview?.error || 'ABI preview read failed.');
  }

  return true;
}
