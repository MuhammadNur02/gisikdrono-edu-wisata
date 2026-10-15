// CLAUDE.md §7.6: a log line carries ids and hashes, never a whole bookings or booking_participants row,
// because redaction only knows the paths it was told about and a new PII column would slip through.
const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const LOGGER_NAME = /^(log|logger)$|Logger$/;
const WHOLE_RECORD_NAME = /^(bookings?|participants?|booking_?participants?)(rows?|records?)?$/i;

function nameOf(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return undefined;
}

function isLoggerCall(callee) {
  if (callee.type !== 'MemberExpression') return false;
  const method = nameOf(callee);
  const owner = nameOf(callee.object);
  return (
    method !== undefined &&
    LOG_METHODS.has(method) &&
    owner !== undefined &&
    LOGGER_NAME.test(owner)
  );
}

function looksLikeWholeRecord(node) {
  return node.type === 'Identifier' && WHOLE_RECORD_NAME.test(node.name);
}

function findWholeRecords(argument) {
  if (looksLikeWholeRecord(argument)) return [argument];
  if (argument.type !== 'ObjectExpression') return [];
  return argument.properties.filter((property) => {
    if (property.type === 'SpreadElement') return looksLikeWholeRecord(property.argument);
    const keyName = nameOf(property.key);
    const keyIsRecord = keyName !== undefined && WHOLE_RECORD_NAME.test(keyName);
    return (
      property.value.type === 'Identifier' && (keyIsRecord || looksLikeWholeRecord(property.value))
    );
  });
}

export const noLoggingWholeRecords = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow logging whole booking or participant records' },
    messages: {
      wholeRecord:
        'Log ids and hashes, never a whole booking or participant record (CLAUDE.md §7.6).',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isLoggerCall(node.callee)) return;
        for (const argument of node.arguments) {
          for (const offending of findWholeRecords(argument)) {
            context.report({ node: offending, messageId: 'wholeRecord' });
          }
        }
      },
    };
  },
};
